const WS_OPEN = 1;

const SEND_INFO_INTERVAL = 1000; // 1s

// If the video offset causes the start of the first chunk
// to go negative, the first video segment may get dropped,
// causing the video to not play.
// This ensures that videoOffset - adjustment > 0
const VIDEO_OFFSET_ADJUSTMENT = 0.05;

const DEBUG = false;

const HTML_MEDIA_READY_STATES = [
  'HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA',
  'HAVE_ENOUGH_DATA'
];

function AVSource(video, audio, options) {
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
      console.log('vbuf error:', e);
      that.close();
    });
    vbuf.addEventListener('abort', function(e) {
      console.log('vbuf abort:', e);
      that.close();
    });

    abuf = ms.addSourceBuffer(options.audioCodec);
    abuf.timestampOffset = options.audioOffset + VIDEO_OFFSET_ADJUSTMENT;
    abuf.addEventListener('updateend', that.update);
    abuf.addEventListener('error', function(e) {
      console.log('abuf error:', e);
      that.close();
    });
    abuf.addEventListener('abort', function(e) {
      console.log('abuf abort:', e);
      that.close();
    });
  };

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
    that.close();
  });

  this.isOpen = function() {
    return abuf != undefined && vbuf != undefined;
  }

  this.close = function() {
    console.log('Closing AV source');
    pending_audio_chunks = [];
    pending_video_chunks = [];
    abuf = undefined;
    vbuf = undefined;
  };

  this.appendVideo = function(data) {
    pending_video_chunks.push(data);
  };

  this.appendAudio = function(data) {
    pending_audio_chunks.push(data);
  };

  this.logBufferInfo = function() {
    if (vbuf) {
      for (var i = 0; i < vbuf.buffered.length; i++) {
        // There should only be one range if the server is
        // sending segments in order
        console.log('video range:',
                    vbuf.buffered.start(i), '-', vbuf.buffered.end(i));
      }
    }
    if (abuf) {
      for (var i = 0; i < abuf.buffered.length; i++) {
        // Same comment as above
        console.log('audio range:',
                    abuf.buffered.start(i), '-', abuf.buffered.end(i));
      }
    }
  };

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
  };

  this.update = function() {
    if (vbuf && !vbuf.updating
      && pending_video_chunks.length > 0) {
      vbuf.appendBuffer(pending_video_chunks.shift());
    }
    if (abuf && !abuf.updating
      && pending_audio_chunks.length > 0) {
      abuf.appendBuffer(pending_audio_chunks.shift());
    }
  };
};

function WebSocketClient(video, audio, channel_select) {
  var ws;
  var av_source;

  // Statistics
  var init_time = new Date();
  var video_chunks_received = 0;
  var video_bytes_received = 0;
  var current_video_quality = null;
  var audio_chunks_received = 0;
  var audio_bytes_received = 0;
  var current_audio_quality = null;

  var that = this;

  function update_channel_select(channels) {
    for (var i = 0; i < channels.length; i++) {
      var option = document.createElement('option');
      option.value = channels[i];
      option.text = channels[i].toUpperCase();
      channel_select.appendChild(option);
    }
  };

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
    if (message.header.type == 'channel-list') {
      console.log(message.header.type, message.header.channels);
      update_channel_select(message.header.channels);
      that.set_channel(message.header.channels[0]);

    } else if (message.header.type == 'channel-init') {
      console.log(message.header.type);
      if (av_source) {
        // Close any existing source
        av_source.close();
      }
      av_source = new AVSource(video, audio, message.header);

    } else if (message.header.type == 'audio-init') {
      console.log(message.header.type, message.header.quality);
      current_audio_quality = message.header.quality;
      console.log('received', message.header.type);
      av_source.appendAudio(message.data);

    } else if (message.header.type == 'audio-chunk') {
      audio_chunks_received += 1;
      audio_bytes_received += message.data.byteLength;
      console.log('received', message.header.type);
      av_source.appendAudio(message.data);

    } else if (message.header.type == 'video-init') {
      current_video_quality = message.header.quality;
      console.log('received', message.header.type, message.header.quality);
      av_source.appendVideo(message.data);

    } else if (message.header.type == 'video-chunk') {
      video_chunks_received += 1;
      video_bytes_received += message.data.byteLength;
      console.log('received', message.header.type);
      av_source.appendVideo(message.data);
    }

    if (av_source) {
      av_source.update();
    }
  };

  function send_client_hello(ws) {
    const client_hello = JSON.stringify({
      type: 'client-hello'
    });
    try {
      ws.send(client_hello);
    } catch (e) {
      console.log(e);
    }
  };

  function get_client_stats() {
    return {
      initTime: init_time,
      video: {
        chunks: video_chunks_received,
        bytes: video_bytes_received,
        currentQuality: current_video_quality
      },
      audio: {
        chunks: audio_chunks_received,
        bytes: audio_bytes_received,
        currentQuality: current_audio_quality
      }
    }
  };

  function send_client_info(trigger) {
    if (DEBUG && av_source && av_source.isOpen()) {
      av_source.logBufferInfo();
    }
    if (ws && ws.readyState == WS_OPEN && av_source && av_source.isOpen()) {
      try {
        ws.send(JSON.stringify({
          type: 'client-info',
          trigger: trigger,
          videoBufferLen: av_source.getVideoBufferLen(),
          audioBufferLen: av_source.getAudioBufferLen(),
          clientStats: get_client_stats(),
          playerStats: {
            width: video.videoWidth,
            height: video.videoHeight,
            readyState: video.readyState, // audioState does not contain info
            readyStateMsg: HTML_MEDIA_READY_STATES[video.readyState],
          }
        }));
      } catch (e) {
        console.log('Failed to send client info', e);
      }
    }
  };

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
      if (av_source && av_source.isOpen()) {
        av_source.close();
      }
      alert('WebSocket closed. Refresh the page to reconnect.');
    };
    ws.onerror = function (e) {
      console.log('WebSocket error:', e);
    };
  };

  this.set_channel = function(channel) {
    if (ws && ws.readyState == WS_OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'client-channel',
          channel: channel
        }));
      } catch (e) {
        console.log(e);
      }
    }
  };

  video.oncanplay = function() {
    console.log('canplay');
    send_client_info('canplay');
  };

  video.onwaiting = function() {
    console.log('rebuffer');
    send_client_info('rebuffer');
  };

  // Start sending status updates to the server
  function timer_helper() {
    send_client_info('timer');
    setTimeout(timer_helper, SEND_INFO_INTERVAL);
  }
  setTimeout(timer_helper, SEND_INFO_INTERVAL);
}

window.onload = function() {
  const video = document.getElementById('tv-player');
  const audio = document.getElementById('tv-audio');

  const mute_button = document.getElementById('mute-button');
  const full_screen_button = document.getElementById('full-screen-button');
  const volume_bar = document.getElementById('volume-bar');
  const channel_select = document.getElementById('channel-select');

  const client = new WebSocketClient(video, audio, channel_select);

  mute_button.onclick = function() {
    video.volume = 0;
    volume_bar.value = 0;
  };

  full_screen_button.onclick = function() {
    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.mozRequestFullScreen) {
      video.mozRequestFullScreen();
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen();
    }
  };

  volume_bar.value = video.volume;
  volume_bar.onchange = function() {
    video.volume = volume_bar.value;
  };

  channel_select.onchange = function() {
    console.log('set channel:', channel_select.value);
    client.set_channel(channel_select.value);
  };

  client.connect();
};
