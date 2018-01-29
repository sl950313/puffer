// media sources
const video = document.getElementById('tv-player');
const audio = document.getElementById('tv-audio');

const WS_OPEN = 1;

const SEND_BUF_INTERVAL = 1000; // 1s

// If the video offset causes the start of the first chunk
// to go negative, the first video segment may get dropped,
// causing the video to not play.
// This ensures that videoOffset - adjustment > 0
const VIDEO_OFFSET_ADJUSTMENT = 0.05;

function AVSource(options) {
  // SourceBuffers for audio and video
  var vbuf, abuf;

  // Lists to store segments not yet added to the SourceBuffers
  // because they may be in the updating state
  var pending_video_chunks = [];
  var pending_audio_chunks = [];

  var that = this;

  var ms = new MediaSource();
  video.src = window.URL.createObjectURL(ms);
  audio.src = window.URL.createObjectURL(ms);

  function init_source_buffers() {
    vbuf = ms.addSourceBuffer(options.videoCodec);
    vbuf.timestampOffset = options.videoOffset + VIDEO_OFFSET_ADJUSTMENT;
    vbuf.addEventListener('updateend', that.update);
    vbuf.addEventListener('error', function(e) {
      console.log('error', e);
    });
    vbuf.addEventListener('abort', function(e) {
      console.log('abort', e);
    });

    abuf = ms.addSourceBuffer(options.audioCodec);
    abuf.timestampOffset = options.audioOffset + VIDEO_OFFSET_ADJUSTMENT;
    abuf.addEventListener('updateend', that.update);
    abuf.addEventListener('error', function(e) {
      console.log('error', e);
    });
    abuf.addEventListener('abort', function(e) {
      console.log('abort', e);
    });
  }

  ms.addEventListener('sourceopen', function(e) {
    console.log('sourceopen: ' + ms.readyState);
    init_source_buffers();
  });
  ms.addEventListener('sourceended', function(e) {
    console.log('sourceended: ' + ms.readyState);
  });
  ms.addEventListener('sourceclose', function(e) {
    console.log('sourceclose: ' + ms.readyState);
    that.close();
  });
  ms.addEventListener('error', function(e) {
    console.log('media source error: ' + ms.readyState);
  });

  this.close = function() {
    console.log('Closing AV source');
    pending_audio_chunks = [];
    pending_video_chunks = [];
    abuf = undefined;
    vbuf = undefined;
  };

  this.appendVideo = function(data) {
    pending_video_chunks.push(data);
  }

  this.appendAudio = function(data) {
    pending_audio_chunks.push(data);
  }

  this.logBufferInfo = function() {
    if (vbuf) {
      for (var i = 0; i < vbuf.buffered.length; i++) {
        // There should only be one range if the server is
        // sending segments in order
        console.log('vbuf range:', vbuf.buffered.start(i), '-', vbuf.buffered.end(i));
      }
    }
    if (abuf) {
      for (var i = 0; i < abuf.buffered.length; i++) {
        // Same comment as above
        console.log('abuf range:', abuf.buffered.start(i), '-', abuf.buffered.end(i));
      }
    }
  }

  this.getVideoBufferLen = function() {
    if (vbuf && vbuf.buffered.length > 0) {
      return vbuf.buffered.end(0) - video.currentTime;
    } else {
      return -1;
    }
  };

  this.getAudioBufferLen = function() {
    if (abuf && abuf.buffered.length > 0) {
      return abuf.buffered.end(0) - video.currentTime;
    } else {
      return -1;
    }
  }

  this.update = function() {
    if (vbuf && !vbuf.updating
      && pending_video_chunks.length > 0) {
      console.log('appending video');
      vbuf.appendBuffer(pending_video_chunks.shift());
    }
    if (abuf && !abuf.updating
      && pending_audio_chunks.length > 0) {
      console.log('appending audio');
      abuf.appendBuffer(pending_audio_chunks.shift());
    }
  };
};

function WebSocketClient(video, audio) {
  var ws;
  var av_source;

  function parse_mesg(data) {
    var header_len = new DataView(data, 0, 4).getUint32();
    return {
      header: JSON.parse(new TextDecoder().decode(
          data.slice(4, 4 + header_len))),
      data: data.slice(4 + header_len)
    };
  };

  function handle_mesg(e) {
    var message = parse_mesg(e.data);
    if (message.header.type == 'channel-init') {
      console.log(message.header.type);
      if (av_source) {
        // Close any existing source
        av_source.close();
      }
      av_source = new AVSource(message.header);
    } else if (message.header.type == 'audio-init' || 
               message.header.type == 'audio-chunk') {
      console.log(message.header.type, message.header.quality);
      av_source.appendAudio(message.data);
    } else if (message.header.type == 'video-init' || 
               message.header.type == 'video-chunk') {
      console.log(message.header.type, message.header.quality);
      av_source.appendVideo(message.data);
    }
    av_source.update();
  }

  function send_client_hello(ws) {
    const client_hello = JSON.stringify({
      type: 'client-hello'
    });
    try {
      ws.send(client_hello);
    } catch (e) {
      console.log(e);
    }
  }

  function send_buf_info() {
    if (av_source) {
      av_source.logBufferInfo();
    }
    if (ws && ws.readyState == WS_OPEN && av_source) {
      console.log('Sending vbuf info');
      try {
        ws.send(JSON.stringify({
          type: 'client-buf',
          vlen: av_source.getVideoBufferLen(),
          alen: av_source.getAudioBufferLen(),
          readyState: video.readyState, // audioState does not contain info
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
    ws.onopen = function (e) {
      console.log('WebSocket open, sending client-hello');
      send_client_hello(ws);
    };
    ws.onclose = function (e) {
      console.log('WebSocket closed');
      av_source.close();
      alert('WebSocket closed. Refresh the page to reconnect');
    };
    ws.onerror = function (e) {
      console.log('WebSocket error:', e);
    };
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
  setTimeout(function() { send_buf_info(); }, SEND_BUF_INTERVAL);
}

video.onclick = function () {
  // Change channel demo
  client.set_channel('');
}

const client = new WebSocketClient(video, audio);
client.connect();
