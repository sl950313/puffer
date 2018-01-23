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

function send_video(ws, vq, initChunk, numChunks) {
  // send init segment
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

          // send media segments
          for (var i = initChunk; i < initChunk + numChunks; i++) {
            var beginTime = i * VIDEO_SEGMENT_LEN;
            var data2 = fs.readFileSync(
              path.join(MEDIA_DIR, vq, String(beginTime) + '.m4s'))
            var header = {
              type: 'video-chunk',
              quality: vq
            }
            ws.send(create_frame(header, data2));
          }
        } catch (e) {
          console.log(e);
        }
      }
    });
}

function send_audio(ws, aq, initChunk, numChunks) {
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

          for (var i = initChunk; i < initChunk + numChunks; i++) {
            var beginTime = i * AUDIO_SEGMENT_LEN;
            var data2 = fs.readFileSync(path.join(MEDIA_DIR,
              aq, String(beginTime) + '.chk'));
            var header = {
              type: 'audio-chunk',
              quality: aq
            }
            ws.send(create_frame(header, data2));
          }
        } catch (e) {
          console.log(e);
        }
      }
    });
}

const ws_server = new WebSocket.Server({server});
ws_server.on('connection', function(ws, req) {
  ws.binaryType = 'arraybuffer';

  var increment = 1;

  var i = get_newest_video_segment() - START_SEGMENT_OFFSET;
  console.log('Starting from', i);
  function send_video_wrapper() {
    var vq = VIDEO_QUALITIES[i % VIDEO_QUALITIES.length];
    try {
      send_video(ws, vq, i, increment);
    } catch (e) {
      console.log(e);
    }
    i += increment;
  }

  var j = 0;
  j = Math.floor(i * VIDEO_SEGMENT_LEN / AUDIO_SEGMENT_LEN);
  var audio_offset = - (i * VIDEO_SEGMENT_LEN  - j * AUDIO_SEGMENT_LEN) / 100000;
  function send_audio_wrapper() {
    var aq = AUDIO_QUALITIES[j % AUDIO_QUALITIES.length];
    try {
      send_audio(ws, aq, j, increment);
    } catch (e) {
      console.log(e);
    }
    j += increment;
  }

  ws.on('message', function(data) {
    var message = JSON.parse(data);
    console.log(message);
    if (message.type == 'client-hello') {
      send_channel_init(ws, audio_offset);
      send_video_wrapper();
      send_audio_wrapper();
    } else if (message.type == 'client-vbuf') {
      if (message.bufferLength < 10) {
        send_video_wrapper();
      }
    } else if (message.type == 'client-abuf') {
      if (message.bufferLength < 10) {
        send_audio_wrapper();
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
