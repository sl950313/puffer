// create websocket
const ws = new WebSocket('ws://localhost:8080');
ws.binaryType = 'arraybuffer';

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
  // console.log(ms.activeSourceBuffers);
  var message = parse_message(e.data);
  console.log(message.header);
  if (message.header.type == 'audio-init') {
    // audio_buffer = ms.addSourceBuffer(message.header.mimeCodec);
    // audio_buffer.appendBuffer(message.data);
  } else if (message.header.type == 'audio-chunk') {
    // if (!audio_buffer.updating) {
    //   audio_buffer.appendBuffer(message.data);
    // } else {
    //   pending_audio_chunks.push(message.data);
    // }
    // audio_buffer.addEventListener('updateend', function() {
    //   if (pending_audio_chunks.length > 0) {
    //     audio_buffer.appendBuffer(pending_audio_chunks.shift());
    //   }
    // });
  } else if (message.header.type == 'video-init') {
    if (!video_buffer) {
      video_buffer = ms.addSourceBuffer(message.header.mimeCodec);
      video_buffer.mode = 'sequence';

      video_buffer.addEventListener('updateend', function(e) {
        if (pending_video_chunks.length > 0) {
          video_buffer.appendBuffer(pending_video_chunks.shift());
        }
      });
      video_buffer.addEventListener('updatestart', function(e) {});
      video_buffer.addEventListener('error', function(e) {
        console.log('error', e);
      });
      video_buffer.addEventListener('abort', function(e) {
        console.log('abort', e);
      });
      video_buffer.addEventListener('update', function(e) {});
    }
    pending_video_chunks.push(message.data);
  } else if (message.header.type == 'video-chunk') {
    pending_video_chunks.push(message.data);
  }

  if (video_buffer && !video_buffer.updating
      && pending_video_chunks.length > 0) {
    video_buffer.appendBuffer(pending_video_chunks.shift());
  }
}

// media source
const ms = new MediaSource();

const video = document.getElementById('tv-player');
video.src = window.URL.createObjectURL(ms);

ms.addEventListener('sourceopen', function(e) {
  console.log('sourceopen: ' + ms.readyState);

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
        buffered: video_buffer.buffered.end(0) - video.currentTime
      }))
    }
    setTimeout(send_vbuf_info, 1000);
  }

  setTimeout(function() {
    video.play();
    send_vbuf_info();
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
