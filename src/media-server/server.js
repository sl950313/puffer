if (process.argv.length != 3) {
  console.log('Usage: node index.js <port-number>');
  process.exit(-1);
}

const port_num = Number(process.argv[2]);

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

const MEDIA_DIR = path.join(__dirname, '/media')

VIDEO_QUALITIES = ['1280x720-23', '854x480-23', '640x360-23'];
AUDIO_QUALITIES = ['128k', '64k', '32k'];

// TODO: this should be less magical and come from current time
const START_VIDEO_SEGMENT = 174;

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

  var i = 0;
  i = START_VIDEO_SEGMENT;
  function send_video_wrapper() {
    var vq = VIDEO_QUALITIES[i % VIDEO_QUALITIES.length];
    try {
      send_video(ws, vq, i, 1);
    } catch (e) {
      console.log(e);
    }
    i++;
  }

  var j = 0;
  j = Math.floor(START_VIDEO_SEGMENT * VIDEO_SEGMENT_LEN / AUDIO_SEGMENT_LEN);
  var audio_offset = - (START_VIDEO_SEGMENT * VIDEO_SEGMENT_LEN  - j * AUDIO_SEGMENT_LEN) / 100000;
  function send_audio_wrapper() {
    var aq = AUDIO_QUALITIES[j % AUDIO_QUALITIES.length];
    try {
      send_audio(ws, aq, j, 1);
    } catch (e) {
      console.log(e);
    }
    j++;
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
