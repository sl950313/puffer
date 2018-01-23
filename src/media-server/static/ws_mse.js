// media sources
const ms = new MediaSource();
const video = document.getElementById('tv-player');
video.src = window.URL.createObjectURL(ms);
const audio = document.getElementById('tv-audio');
audio.src = window.URL.createObjectURL(ms);

const SEND_BUF_INTERVAL = 1000; // 1s

function WebSocketClient(ms, video, audio) {
  var ws;

  var vbuf;
  var abuf;

  var pending_video_chunks;
  var pending_audio_chunks;

  function parse_mesg(data) {
    var header_len = new DataView(data, 0, 4).getUint32();
    return {
      header: JSON.parse(new TextDecoder().decode(
          data.slice(4, 4 + header_len))),
      data: data.slice(4 + header_len)
    };
  };

  function init_channel(options) {
    pending_video_chunks = [];
    pending_audio_chunks = [];
    if (vbuf) {
      ms.removeSourceBuffer(vbuf);
    }
    if (abuf) {
      ms.removeSourceBuffer(abuf);
    }

    vbuf = ms.addSourceBuffer(options.videoCodec);
    vbuf.timestampOffset = options.videoOffset;
    vbuf.addEventListener('updateend', function(e) {
      if (!vbuf.updating && pending_video_chunks.length > 0) {
        vbuf.appendBuffer(pending_video_chunks.shift());
      }
    });
    vbuf.addEventListener('error', function(e) {
      console.log('error', e);
    });
    vbuf.addEventListener('abort', function(e) {
      console.log('abort', e);
    });

    abuf = ms.addSourceBuffer(options.audioCodec);
    abuf.timestampOffset = options.audioOffset;
    abuf.addEventListener('updateend', function(e) {
      if (!abuf.updating && pending_audio_chunks.length > 0) {
        abuf.appendBuffer(pending_audio_chunks.shift());
      }
    });
    abuf.addEventListener('error', function(e) {
      console.log('error', e);
    });
    abuf.addEventListener('abort', function(e) {
      console.log('abort', e);
    });
  }

  function handle_mesg(e) {
    var message = parse_mesg(e.data);
    if (message.header.type == 'channel-init') {
      console.log(message.header.type);
      init_channel(message.header);
    } else if (message.header.type == 'audio-init' || 
               message.header.type == 'audio-chunk') {
      console.log(message.header.type, message.header.quality);
      pending_audio_chunks.push(message.data);
    } else if (message.header.type == 'video-init' || 
               message.header.type == 'video-chunk') {
      console.log(message.header.type, message.header.quality);
      pending_video_chunks.push(message.data);
    }

    if (vbuf && !vbuf.updating
        && pending_video_chunks.length > 0) {
      vbuf.appendBuffer(pending_video_chunks.shift());
    }

    if (abuf && !abuf.updating
        && pending_audio_chunks.length > 0) {
      abuf.appendBuffer(pending_audio_chunks.shift());
    }
  }

  const client_hello = JSON.stringify({
    type: 'client-hello'
  });

  function send_client_hello(ws) {
    console.log('Sending client hello');
    try {
      ws.send(client_hello);
    } catch (e) {
      // Retry if the websocket is not ready
      setTimeout(function() { send_client_hello(ws); }, 100);
    }
  }

  function send_buf_info() {
    var vbuf_len = 0;
    var vbuf_start = 0;
    if (vbuf && vbuf.buffered.length > 0) {
      console.log('vbuf:', vbuf.buffered.start(0), '-', vbuf.buffered.end(0));
      vbuf_len = vbuf.buffered.end(0) - video.currentTime;
    }
    var abuf_len = 0;
    if (abuf && abuf.buffered.length > 0) {
      console.log('abuf:', abuf.buffered.start(0), '-', abuf.buffered.end(0));
      abuf_len = abuf.buffered.end(0) - video.currentTime;
    }
    if (ws) {
      console.log('Sending vbuf info');
      try {
        ws.send(JSON.stringify({
          type: 'client-buf',
          vlen: vbuf_len,
          alen: abuf_len
        }));
      } catch (e) {
        console.log('Failed to send avbuf info', e);
      }
    }
    setTimeout(send_buf_info, SEND_BUF_INTERVAL);
  }

  this.connect = function() {
    ws = new WebSocket('ws://' + location.host);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = handle_mesg;
    send_client_hello(ws);
  };

  this.set_channel = function(channel) {
    if (ws) {
      try {
        ws.send(JSON.stringify({
          type: 'client-channel',
          channel: channel
        }));
      } catch (e) {
        console.log(e);
      }
    } else {
      alert('Error: client not connected');
    }
  };

  // Start sending status updates to the server
  setTimeout(function() { send_buf_info(); }, 1000);
}

video.onclick = function () {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

const client = new WebSocketClient(ms, video, audio);

ms.addEventListener('sourceopen', function(e) {
  console.log('sourceopen: ' + ms.readyState);
  client.connect();
  // TODO: changing the sourcebuffers does not work yet
  // setTimeout(function() { client.set_channel(''); }, 5000);
});

// other media source event listeners for debugging
ms.addEventListener('sourceended', function(e) {
  console.log('sourceended: ' + ms.readyState);
});

ms.addEventListener('sourceclose', function(e) {
  console.log('sourceclose: ' + ms.readyState);
});

ms.addEventListener('error', function(e) {
  console.log('media source error: ' + ms.readyState);
});
