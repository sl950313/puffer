// create websocket
const ws = new WebSocket('ws://localhost:8080');
ws.binaryType = 'arraybuffer';

// media sources
const video_ms = new MediaSource();
const video = document.getElementById('tv-player');
video.src = window.URL.createObjectURL(video_ms);

const audio_ms = new MediaSource();
const audio = document.getElementById('tv-audio');
audio.src = window.URL.createObjectURL(audio_ms);

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
  if (message.header.type == 'audio-init') {
    if (!audio_buffer) {
      audio_buffer = audio_ms.addSourceBuffer(message.header.mimeCodec);
      audio_buffer.mode = 'sequence';
      audio_buffer.addEventListener('updateend', function(e) {
        if (!audio_buffer.updating && pending_audio_chunks.length > 0) {
          audio_buffer.appendBuffer(pending_audio_chunks.shift());
        }
      });
      // audio_buffer.addEventListener('updatestart', function(e) {});
      audio_buffer.addEventListener('error', function(e) {
        console.log('error', e);
      });
      audio_buffer.addEventListener('abort', function(e) {
        console.log('abort', e);
      });
      // audio_buffer.addEventListener('update', function(e) {});
    }
    pending_audio_chunks.push(message.data);
  } else if (message.header.type == 'audio-chunk') {
    pending_audio_chunks.push(message.data);
  } else if (message.header.type == 'video-init') {
    if (!video_buffer) {
      video_buffer = video_ms.addSourceBuffer(message.header.mimeCodec);
      video_buffer.mode = 'sequence';
      video_buffer.addEventListener('updateend', function(e) {
        if (!video_buffer.updating && pending_video_chunks.length > 0) {
          video_buffer.appendBuffer(pending_video_chunks.shift());
        }
      });
      // video_buffer.addEventListener('updatestart', function(e) {});
      video_buffer.addEventListener('error', function(e) {
        console.log('error', e);
      });
      video_buffer.addEventListener('abort', function(e) {
        console.log('abort', e);
      });
      // video_buffer.addEventListener('update', function(e) {});
    }
    pending_video_chunks.push(message.data);
  } else if (message.header.type == 'video-chunk') {
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

video.onpause = function() {
  audio.pause();
}

video.onplay = function() {
  audio.play();
}

video.onclick = function () {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

video.onvolumechange = function () {
  audio.volume = video.volume;
}

video_ms.addEventListener('sourceopen', function(e) {
  console.log('sourceopen: ' + video_ms.readyState);

  ws.onmessage = handle_message

  try {
    ws.send(JSON.stringify({type: 'client-hello'}));
  } catch (e) {
    // hack since ws may not be open
    setTimeout(function() {
      ws.send(JSON.stringify({type: 'client-hello'}));
    }, 100);
  }

  function send_vbuf_info() {
    if (video_buffer.buffered.length > 0) {
      ws.send(JSON.stringify({
        type: 'client-vbuf',
        bufferLength: video_buffer.buffered.end(0) - video.currentTime,
        avTimeSync: video.currentTime - audio.currentTime
      }))
    }
    setTimeout(send_vbuf_info, 1000);
  }

  function send_abuf_info() {
    if (audio_buffer.buffered.length > 0) {
      ws.send(JSON.stringify({
        type: 'client-abuf',
        bufferLength: audio_buffer.buffered.end(0) - audio.currentTime,
        avTimeSync: video.currentTime - audio.currentTime
      }))
    }
    setTimeout(send_abuf_info, 2000);
  }

  setTimeout(function() {
    video.play();
    audio.play();
    send_vbuf_info();
    send_abuf_info();
  }, 200);
});

// other media source event listeners for debugging
video_ms.addEventListener('sourceended', function(e) {
  console.log('sourceended: ' + video_ms.readyState);
});

video_ms.addEventListener('sourceclose', function(e) {
  console.log('sourceclose: ' + video_ms.readyState);
});

video_ms.addEventListener('error', function(e) {
  console.log('media source error: ' + video_ms.readyState);
});

audio_ms.addEventListener('sourceended', function(e) {
  console.log('sourceended: ' + audio_ms.readyState);
});

audio_ms.addEventListener('sourceclose', function(e) {
  console.log('sourceclose: ' + audio_ms.readyState);
});

audio_ms.addEventListener('error', function(e) {
  console.log('media source error: ' + audio_ms.readyState);
});
