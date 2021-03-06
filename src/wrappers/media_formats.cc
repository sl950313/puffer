#include "media_formats.hh"

#include <string>
#include <vector>

using namespace std;

string VideoFormat::resolution() const
{
  return ::to_string(width) + "x" + ::to_string(height);
}

string VideoFormat::to_string() const
{
  return resolution() + "-" + ::to_string(crf);
}

bool VideoFormat::operator<(const VideoFormat & o) const
{
  return tie(width, height, crf) < tie(o.width, o.height, o.crf);
}

bool VideoFormat::operator==(const VideoFormat & o) const
{
  return tie(width, height, crf) == tie(o.width, o.height, o.crf);
}

bool VideoFormat::operator!=(const VideoFormat & o) const
{
  return tie(width, height, crf) != tie(o.width, o.height, o.crf);
}

ostream &operator<<(ostream & os, const VideoFormat & o)
{
  return os << o.to_string();
}

string AudioFormat::to_string() const
{
  return ::to_string(bitrate / 1000) + "k";
}

bool AudioFormat::operator<(const AudioFormat & o) const
{
  return bitrate < o.bitrate;
}

bool AudioFormat::operator==(const AudioFormat & o) const
{
  return bitrate == o.bitrate;
}

bool AudioFormat::operator!=(const AudioFormat & o) const
{
  return bitrate != o.bitrate;
}

ostream &operator<<(ostream & os, const AudioFormat & o)
{
  return os << o.to_string();
}

vector<VideoFormat> get_video_formats(const YAML::Node & config)
{
  vector<VideoFormat> vformats;

  const YAML::Node & res_map = config["video"];
  for (const auto & res_node : res_map) {
    const string & res = res_node.first.as<string>();

    auto pos = res.find('x');
    if (pos == string::npos) {
      throw runtime_error("video resolution must be <width>x<height>");
    }

    int width = stoi(res.substr(0, pos));
    int height = stoi(res.substr(pos + 1));

    const YAML::Node & crf_list = res_node.second;
    for (const auto & crf_node : crf_list) {
      int crf = crf_node.as<int>();
      vformats.push_back({width, height, crf});
    }
  }

  return vformats;
}

vector<AudioFormat> get_audio_formats(const YAML::Node & config)
{
  vector<AudioFormat> aformats;

  const YAML::Node & bitrate_list = config["audio"];
  for (const auto & bitrate_node : bitrate_list) {
    const string & bitrate_str = bitrate_node.as<string>();
    int bitrate;

    auto pos = bitrate_str.find('k');
    if (pos != string::npos) {
      bitrate = stoi(bitrate_str.substr(0, pos)) * 1000;
    } else {
      throw runtime_error("audio bitrate must be <integer>k");
    }

    aformats.push_back({bitrate});
  }

  return aformats;
}
