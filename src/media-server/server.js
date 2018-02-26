
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const encoder = require('text-encoding');
const argparse = require('argparse')

Array.prototype.randomElement = function () {
  return this[Math.floor(Math.random() * this.length)]
}

function get_args() {
  var parser = new argparse.ArgumentParser({
    version: '0.0.1',
    addHelp:true,
    description: 'Run the nodejs test server'
  });
  parser.addArgument(
    [ 'media_dir' ],
    {
      help: 'Directory containing channels'
    }
  );
  parser.addArgument(
    [ '-p', '--port' ],
    {
      dest: 'port',
      defaultValue: 8080,
      type: Number,
      help: 'Port number'
    }
  );
  parser.addArgument(
    [ '-i', '--start-idx' ],
    {
      dest: 'start_idx',
      type: Number,
      help: 'Start index of the video'
    }
  );
  parser.addArgument(
    [ '-c', '--channels' ],
    {
      dest: 'channels',
      defaultValue: [ 'nbc' ],
      nargs: '+',
      help: 'List of available channels'
    }
  );
  parser.addArgument(
    [ '--timescale' ],
    {
      dest: 'timescale',
      type: Number,
      defaultValue: [ 90000, 180180, 432000 ],
      nargs: 3,
      help: 'Timescale, Video Length, Audio Length'
    }
  );
  var args = parser.parseArgs();
  console.log(args);
  return args;
}

const ARGS = get_args();
const PORT = ARGS.port;

const GLOBAL_TIMESCALE = ARGS.timescale[0];
const VIDEO_SEGMENT_LEN = ARGS.timescale[1];
const AUDIO_SEGMENT_LEN = ARGS.timescale[2];

const MEDIA_DIR = ARGS.media_dir;
if (!fs.existsSync(MEDIA_DIR)) {
  throw Error(MEDIA_DIR + ' does not exist');
}

const START_SEGMENT_IDX = ARGS.start_idx;
const START_SEGMENT_OFFSET = 10;

const CHANNELS = ARGS.channels

function get_video_qualities(channels) {
  vqs = {};
  channels.forEach(function (channel) {
    var channel_dir = path.join(MEDIA_DIR, channel);
    vqs[channel] = fs.readdirSync(channel_dir).filter(
      entry => entry.match(/^\d+x\d+-\d+$/)
    );
  });
  return vqs;
};

function get_audio_qualities(channels) {
  aqs = {};
  channels.forEach(function (channel) {
    var channel_dir = path.join(MEDIA_DIR, channel);
    aqs[channel] = fs.readdirSync(channel_dir).filter(
      entry => entry.match(/^\d+k$/)
    );
  });
  return aqs;
};

const VIDEO_QUALITIES = get_video_qualities(CHANNELS);
const AUDIO_QUALITIES = get_audio_qualities(CHANNELS);

console.log('Video:', VIDEO_QUALITIES);
console.log('Audio:', AUDIO_QUALITIES);

const MAX_BUFFER_LEN = 30;

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

function get_newest_video_segment(channel) {
  var video_dir = path.join(MEDIA_DIR, channel, VIDEO_QUALITIES[channel][0]);
  var available_segments = fs.readdirSync(video_dir).filter(
    file => file.endsWith('m4s')).map(
      file => Number(file.split('.', 1)[0]) / VIDEO_SEGMENT_LEN);
  if (available_segments.length == 0) {
    throw Error('No video segments available');
  }
  return Math.max.apply(null, available_segments);
}

function send_channel_init(ws, videoOffset) {
  var header = {
    type: 'channel-init',
    videoCodec: 'video/mp4; codecs="avc1.42E0FF"',
    // this works, avc1.42E0FF works on chrome but not firefox ("avc1.42E020")
    audioCodec: 'audio/webm; codecs="opus"',
    videoOffset: videoOffset,
    audioOffset: videoOffset
    // FIXME: should be the same as video offset if not for sync issue
  }
  try {
    ws.send(create_frame(header, ''))
  } catch(e) {
    console.log(e);
  }
}

function send_video_init(ws, channel, vq, cb) {
  fs.readFile(path.join(MEDIA_DIR, channel, vq, 'init.mp4'),
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

function get_video_filepath(channel, vq, idx) {
  var begin_time = idx * VIDEO_SEGMENT_LEN;
  return path.join(MEDIA_DIR, channel, vq, String(begin_time) + '.m4s');
}

function send_video_segment(ws, video_path) {
  fs.readFile(video_path, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      try {
        ws.send(create_frame({ type: 'video-chunk' }, data));
      } catch (e) {
        console.log(e);
      }
    }
  })
}

function send_audio_init(ws, channel, aq, cb) {
  fs.readFile(path.join(MEDIA_DIR, channel, aq, 'init.webm'),
    function(err, data) {
      if (err) {
        console.log(err);
      } else {
        try {
          var header = {
            type: 'audio-init',
            quality: aq,
            channel: channel
          }
          ws.send(create_frame(header, data));
          if (cb) cb();
        } catch (e) {
          console.log(e);
        }
      }
    });
}

function get_audio_filepath(channel, aq, idx) {
  var begin_time = idx * AUDIO_SEGMENT_LEN;
  return path.join(MEDIA_DIR, channel, aq, String(begin_time) + '.chk');
}

function send_audio_segment(ws, audio_path) {
  fs.readFile(audio_path, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      try {
        ws.send(create_frame({ type: 'audio-chunk' }, data));
      } catch (e) {
        console.log(e);
      }
    }
  });
}

RESERVOIR_LEN = 4.0;
CUSHION_LEN = 15.0;

function index_of_min(arr) {
  return arr.reduce(
    (i_min, x, i) => x < arr[i_min] ? i : i_min, 0
  );
};

function index_of_max(arr) {
  return arr.reduce(
    (i_max, x, i) => x > arr[i_max] ? i : i_max, 0
  );
};

function index_of_nth(arr, n) {
  var x = arr.slice(0).sort()[n];
  return arr.indexOf(x);
};

function select_video_quality(client_info, channel, idx) {
  var chunk_sizes = VIDEO_QUALITIES[channel].map(
    vq => get_video_filepath(channel, vq, idx)
  ).map(
    file => fs.statSync(file).size
  );

  if (client_info.videoBufferLen == undefined) {
    return VIDEO_QUALITIES[channel][index_of_min(chunk_sizes)];
  } else {
    var vq;
    if (client_info.videoBufferLen >= CUSHION_LEN) {
      vq = VIDEO_QUALITIES[channel][index_of_max(chunk_sizes)];
    } else if (client_info.videoBufferLen <= RESERVOIR_LEN) {
      vq = VIDEO_QUALITIES[channel][index_of_min(chunk_sizes)];
    } else {
      var n = Math.floor(
        (client_info.videoBufferLen - RESERVOIR_LEN) /
        (CUSHION_LEN - RESERVOIR_LEN) * VIDEO_QUALITIES[channel].length
      );
      vq = VIDEO_QUALITIES[channel][index_of_nth(chunk_sizes, n)];
    }
    return vq;
  }
}

function select_audio_quality(client_info, channel, idx) {
  var chunk_sizes = AUDIO_QUALITIES[channel].map(
    vq => get_audio_filepath(channel, vq, idx)).map(
    file => fs.statSync(file).size)

  return AUDIO_QUALITIES[channel][0];
}

function StreamingSession(ws) {
  this.ws = ws;

  var channel;
  var video_idx, audio_idx;
  var curr_aq, curr_vq;

  this.send_available_channels = function() {
    var header = {
      type: 'channel-list',
      channels: CHANNELS
    };
    ws.send(create_frame(header, ''));
  };

  this.set_channel = function(new_channel) {
    if (CHANNELS.indexOf(new_channel) == -1) {
      throw Error('channel does not exist');
    }
    channel = new_channel;

    curr_vq = undefined;
    curr_aq = undefined;

    if (START_SEGMENT_IDX == null) {
      video_idx = get_newest_video_segment(channel) - START_SEGMENT_OFFSET;
    } else {
      video_idx = START_SEGMENT_IDX;
    }
    console.log('Starting at video segment', video_idx);

    audio_idx = Math.floor(video_idx * VIDEO_SEGMENT_LEN / AUDIO_SEGMENT_LEN);

    send_channel_init(ws, - (video_idx * VIDEO_SEGMENT_LEN / GLOBAL_TIMESCALE));

    /* FIXME: audio timestamps are off, send extra audio to ensure the
     * browser has audio to play at the start */
    if (START_SEGMENT_IDX == null) {
      audio_idx -= 3;
    }
  };

  this.send_video = function(client_info) {
    var vq;
    try {
      vq = select_video_quality(client_info, channel, video_idx);
    } catch (e) {
      if (e.code == 'ENOENT') {
        console.log('Video not ready:', video_idx);
        return;
      }
      throw e;
    }
    var video_path = get_video_filepath(channel, vq, video_idx);

    console.log('Sending video:', video_idx);
    try {
      var cb = function() { send_video_segment(ws, video_path); };
      if (curr_vq != vq) {
        send_video_init(ws, channel, vq, cb);
      } else {
        cb();
      }
    } catch (e) {
      console.log(e);
    }
    video_idx += 1;
    curr_vq = vq;
  };

  this.send_audio = function(client_info) {
    var aq;
    try {
      aq = select_audio_quality(client_info, channel, audio_idx);
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log('Audio not ready:', audio_idx);
        return;
      }
      throw e;
    }
    var audio_path = get_audio_filepath(channel, aq, audio_idx);

    console.log('Sending audio:', audio_idx);
    try {
      var cb = function() { send_audio_segment(ws, audio_path); };
      if (curr_aq != aq) {
        send_audio_init(ws, channel, aq, cb);
      } else {
        cb();
      }
    } catch (e) {
      console.log(e);
    }
    audio_idx += 1;
    curr_aq = aq;
  };
}

const ws_server = new WebSocket.Server({server});
ws_server.on('connection', function(ws, req) {
  ws.binaryType = 'arraybuffer';

  var session = new StreamingSession(ws);

  ws.on('message', function(data) {
    var message = JSON.parse(data);
    console.log(message);
    try {
      if (message.type == 'client-hello') {
        session.send_available_channels();
      } else if (message.type == 'client-channel') {
        session.set_channel(message.channel);
        session.send_video(message);
        session.send_audio(message);
      } else if (message.type == 'client-info') {
        console.log(message);
        if (message.videoBufferLen < MAX_BUFFER_LEN) {
          session.send_video(message);
        }
        if (message.audioBufferLen < MAX_BUFFER_LEN) {
          session.send_audio(message);
        }
      }
    } catch (e) {
      console.log(e);
      ws.close();
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

server.listen(PORT, function() {
  console.log('Listening on %d', server.address().port);
});
