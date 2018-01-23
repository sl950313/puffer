if (process.argv.length != 4) {
  console.log('Usage: node index.js <port-number> <video-dir>');
  process.exit(-1);
}

const port_num = Number(process.argv[2]);
const video_dir = process.argv[3];

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const encoder = require('text-encoding');

Array.prototype.randomElement = function () {
    return this[Math.floor(Math.random() * this.length)]
}

const app = express();
app.use(express.static(path.join(__dirname, '/static')));
const server = http.createServer(app);

function create_frame(header, data) {
  console.log(header);
  var header_enc = new encoder.TextEncoder().encode(JSON.stringify(header));
  var frame = new ArrayBuffer(4 + header_enc.length + data.length);
  new DataView(frame, 0, 4).setUint32(0, header_enc.length);
  new Uint8Array(frame, 4).set(header_enc);
  new Uint8Array(frame, 4 + header_enc.length).set(data);
  return frame;
}

const VIDEO_SEGMENT_LEN = 180180;
const AUDIO_SEGMENT_LEN = 432000;

const MEDIA_DIR = video_dir;
const START_SEGMENT_OFFSET = 10;

VIDEO_QUALITIES = ['1280x720-23', '640x360-23'];
AUDIO_QUALITIES = ['128k', '32k'];

function get_newest_video_segment() {
  var video_dir = path.join(MEDIA_DIR, VIDEO_QUALITIES[0]);
  var available_segments = fs.readdirSync(video_dir).filter(
    file => file.endsWith('m4s')).map(
      file => Number(file.split('.', 1)[0]) / VIDEO_SEGMENT_LEN);
  return Math.max.apply(null, available_segments);
}

function send_channel_init(ws, audioOffset) {
  var header = {
    type: 'channel-init',
    videoCodec: 'video/mp4; codecs="avc1.42E0FF"',
    // this works, avc1.42E0FF works too 20 is AVC-level
    audioCodec: 'audio/webm; codecs="opus"',
    audioOffset: audioOffset
  }
  try {
    ws.send(create_frame(header, ''))
  } catch(e) {
    console.log(e);
  }
}

function send_video_init(ws, vq, cb) {
  fs.readFile(path.join(MEDIA_DIR, vq, 'init.mp4'),
    function(err, data) {
      if (err) {
        console.log(err);
      } else {
        try {
          var header = {
            type: 'video-init',
            quality: vq
          }
          ws.send(create_frame(header, data));
          if (cb) cb();
        } catch (e) {
          console.log(e);
        }
      }
    });
}

function get_video_filepath(vq, idx) {
  var begin_time = idx * VIDEO_SEGMENT_LEN;
  return path.join(MEDIA_DIR, vq, String(begin_time) + '.m4s');
}

function send_video_segment(ws, vq, video_path) {
  fs.readFile(video_path, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      var header = {
        type: 'video-chunk',
        quality: vq
      }
      try {
        ws.send(create_frame(header, data));
      } catch (e) {
        console.log(e);
      }
    }
  })
}

function send_audio_init(ws, aq, cb) {
  fs.readFile(path.join(MEDIA_DIR, aq, 'init.webm'),
    function(err, data) {
      if (err) {
        console.log(err);
      } else {
        try {
          var header = {
            type: 'audio-init',
            quality: aq
          }
          ws.send(create_frame(header, data));
          if (cb) cb();
        } catch (e) {
          console.log(e);
        }
      }
    });
}

function get_audio_filepath(aq, idx) {
  var begin_time = idx * AUDIO_SEGMENT_LEN;
  return path.join(MEDIA_DIR, aq, String(begin_time) + '.chk');
}

function send_audio_segment(ws, aq, audio_path) {
  fs.readFile(audio_path, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      var header = {
        type: 'audio-chunk',
        quality: aq
      }
      try {
        ws.send(create_frame(header, data));
      } catch (e) {
        console.log(e);
      }
    }
  });
}

const VQ_SWITCH_PROB = 0.5;
const AQ_SWITCH_PROB = 0.3;

function select_video_quality(prev_vq) {
  if (!prev_vq || Math.random() > VQ_SWITCH_PROB) {
    return VIDEO_QUALITIES.randomElement();
  } else {
    return prev_vq;
  }
}

function select_audio_quality(prev_aq) {
  if (!prev_aq || Math.random() > AQ_SWITCH_PROB) {
    return AUDIO_QUALITIES.randomElement();
  } else {
    return prev_aq;
  }
}

function StreamingSession(ws) {
  this.ws = ws;
  
  var video_idx, audio_idx;
  var prev_aq, prev_vq;

  this.set_channel = function() {
    prev_vq = undefined;
    prev_aq = undefined;

    video_idx = get_newest_video_segment() - START_SEGMENT_OFFSET;
    console.log('Starting at video segment', video_idx);
    
    audio_idx = Math.floor(video_idx * VIDEO_SEGMENT_LEN / AUDIO_SEGMENT_LEN);

    // Compute offset of the first audio segment w.r.t. the first video segment
    init_audio_offset = - (video_idx * VIDEO_SEGMENT_LEN - audio_idx
      * AUDIO_SEGMENT_LEN) / 100000;

    send_channel_init(ws, init_audio_offset);
  }

  this.send_video = function() {
    var vq = select_video_quality(prev_vq);
    var video_path = get_video_filepath(vq, video_idx);
    fs.stat(video_path, function(err, stat) {
      if (err == null) {
        try {
          var cb = function() { send_video_segment(ws, vq, video_path); };
          if (prev_vq != vq) {
            send_video_init(ws, vq, cb);
          } else {
            cb();
          }
        } catch (e) {
          console.log(e);
        }
        video_idx += 1;
        prev_vq = vq;     
      } else if (err.code == 'ENOENT') {
        console.log(video_path, 'not found')
      } else {
        console.log('Error stat:', video_path, err.code);
      }
    });
  }

  this.send_audio = function() {
    var aq = select_audio_quality(prev_aq);
    var audio_path = get_audio_filepath(aq, audio_idx);
    fs.stat(audio_path, function(err, stat) {
      if (err == null) {
        try {
          var cb = function() { send_audio_segment(ws, aq, audio_path); };
          if (prev_aq != aq) {
            send_audio_init(ws, aq, cb);
          } else {
            cb();
          }
        } catch (e) {
          console.log(e);
        }
        audio_idx += 1;
        prev_aq = aq;
      } else if (err.code == 'ENOENT') {
        console.log(audio_path, 'not found')
      } else {
        console.log('Error stat:', audio_path, err.code);
      }
    });
  }
}

const ws_server = new WebSocket.Server({server});
ws_server.on('connection', function(ws, req) {
  ws.binaryType = 'arraybuffer';

  var session = new StreamingSession(ws);

  ws.on('message', function(data) {
    var message = JSON.parse(data);
    console.log(message);
    if (message.type == 'client-hello' || 
        message.type == 'client-channel') {
      session.set_channel();
      session.send_video();
      session.send_audio();
    } else if (message.type == 'client-vbuf') {
      if (message.bufferLength < 10) {
        session.send_video();
      }
    } else if (message.type == 'client-abuf') {
      if (message.bufferLength < 10) {
        session.send_audio();
      }
    }
  });

  ws.on('error', function (e) {
    console.log(e);
  });
});

ws_server.on('error', function (e) {
  console.log(e);
});

app.get('/', function(req, res) {
  res.sendFile('index.html');
});

server.listen(port_num, function() {
  console.log('Listening on %d', server.address().port);
});
