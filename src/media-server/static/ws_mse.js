// create websocket
const ws = new WebSocket('ws://' + location.host);
ws.binaryType = 'arraybuffer';

// media sources
const ms = new MediaSource();
const video = document.getElementById('tv-player');
video.src = window.URL.createObjectURL(ms);
const audio = document.getElementById('tv-audio');
audio.src = window.URL.createObjectURL(ms);

var video_buffer;
var pending_video_chunks = [];

var audio_buffer;
var pending_audio_chunks = [];

function parse_message(data) {
  var header_len = new DataView(data, 0, 4).getUint32();
  return {
    header: JSON.parse(new TextDecoder().decode(
        data.slice(4, 4 + header_len))),
    data: data.slice(4 + header_len)
  };
}

function handle_message(e) {
  var message = parse_message(e.data);
  console.log(message.header.type, message.header.quality);
  if (message.header.type == 'channel-init') {
    video_buffer = ms.addSourceBuffer(message.header.videoCodec);
    video_buffer.mode = 'sequence';
    video_buffer.addEventListener('updateend', function(e) {
      if (!video_buffer.updating && pending_video_chunks.length > 0) {
        video_buffer.appendBuffer(pending_video_chunks.shift());
      }
    });
    video_buffer.addEventListener('error', function(e) {
      console.log('error', e);
    });
    video_buffer.addEventListener('abort', function(e) {
      console.log('abort', e);
    });

    audio_buffer = ms.addSourceBuffer(message.header.audioCodec);
    audio_buffer.mode = 'sequence';
    audio_buffer.timestampOffset = message.header.audioOffset;
    audio_buffer.addEventListener('updateend', function(e) {
      if (!audio_buffer.updating && pending_audio_chunks.length > 0) {
        audio_buffer.appendBuffer(pending_audio_chunks.shift());
      }
    });
    audio_buffer.addEventListener('error', function(e) {
      console.log('error', e);
    });
    audio_buffer.addEventListener('abort', function(e) {
      console.log('abort', e);
    });
  } else if (message.header.type == 'audio-init' || message.header.type == 'audio-chunk') {
    pending_audio_chunks.push(message.data);
  } else if (message.header.type == 'video-init' || message.header.type == 'video-chunk') {
    pending_video_chunks.push(message.data);
  }

  if (video_buffer && !video_buffer.updating
      && pending_video_chunks.length > 0) {
    video_buffer.appendBuffer(pending_video_chunks.shift());
  }

  if (audio_buffer && !audio_buffer.updating
      && pending_audio_chunks.length > 0) {
    audio_buffer.appendBuffer(pending_audio_chunks.shift());
  }
}

video.onclick = function () {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

ms.addEventListener('sourceopen', function(e) {
  console.log('sourceopen: ' + ms.readyState);

  ws.onmessage = handle_message

  const client_hello = JSON.stringify({
    type: 'client-hello'
  });
  function send_client_hello() {
    try {
      ws.send(client_hello);
    } catch (e) {
      setTimeout(function() { send_client_hello(); }, 100);
    }
  }
  
  function send_vbuf_info() {
    if (video_buffer.buffered.length > 0) {
      ws.send(JSON.stringify({
        type: 'client-vbuf',
        bufferLength: video_buffer.buffered.end(0) - video.currentTime
      }))
    }
    setTimeout(send_vbuf_info, 1000);
  }

  function send_abuf_info() {
    if (audio_buffer.buffered.length > 0) {
      ws.send(JSON.stringify({
        type: 'client-abuf',
        bufferLength: audio_buffer.buffered.end(0) - video.currentTime
      }))
    }
    setTimeout(send_abuf_info, 2000);
  }

  send_client_hello();
  setTimeout(function() {
    send_vbuf_info();
    send_abuf_info();
  }, 200);
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
