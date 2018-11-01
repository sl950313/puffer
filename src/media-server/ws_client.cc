#include "ws_client.hh"

using namespace std;

MediaSegment::MediaSegment(mmap_t & data, optional<mmap_t> init)
  : init_(init), data_(data), offset_(0), length_()
{
  length_ = get<1>(data_);
  if (init_) {
    length_ += get<1>(init_.value());
  }
}

void MediaSegment::read(string & dst, const size_t n)
{
  assert(offset_ < length_);
  const size_t init_size = init_ ? get<1>(init_.value()) : 0;
  const size_t orig_dst_len = dst.length();

  if (init_ and offset_ < init_size) {
    const size_t to_read = init_size - offset_ > n ? n : init_size - offset_;
    dst.append(get<0>(init_.value()).get() + offset_, to_read);
    offset_ += to_read;
    if (dst.length() - orig_dst_len >= n) {
      return;
    }
  }

  const auto & [seg_data, seg_size] = data_;
  const size_t offset_into_data = offset_ - init_size;

  size_t to_read = n - (dst.length() - orig_dst_len);
  to_read = seg_size - offset_into_data > to_read ?
            to_read : seg_size - offset_into_data;

  dst.append(seg_data.get() + offset_into_data, to_read);
  offset_ += to_read;

  assert(dst.length() - orig_dst_len <= n);
}

VideoSegment::VideoSegment(const VideoFormat & format, mmap_t & data,
                           optional<mmap_t> init)
  : MediaSegment(data, init), format_(format)
{}

AudioSegment::AudioSegment(const AudioFormat & format, mmap_t & data,
                           optional<mmap_t> init)
  : MediaSegment(data, init), format_(format)
{}

WebSocketClient::WebSocketClient(const uint64_t connection_id,
                                 const size_t horizon_length)
{
  connection_id_ = connection_id;
  horizon_length_ = horizon_length;
}

void WebSocketClient::init(const string & channel,
                           const uint64_t vts, const uint64_t ats)
{
  channel_ = channel;
  init_id_++;

  next_vts_ = vts;
  next_ats_ = ats;
  next_vsegment_.reset();
  next_asegment_.reset();

  curr_vq_.reset();
  curr_aq_.reset();

  video_playback_buf_ = 0;
  audio_playback_buf_ = 0;

  client_next_vts_ = vts;
  client_next_ats_ = ats;

  rebuffering_ = false;
}

void WebSocketClient::set_next_vsegment(const VideoFormat & format,
                                        mmap_t & data, optional<mmap_t> & init)
{
  next_vsegment_ = {format, data, init};
}

void WebSocketClient::set_next_asegment(const AudioFormat & format,
                                        mmap_t & data, optional<mmap_t> & init)
{
  next_asegment_ = {format, data, init};
}

void WebSocketClient::set_max_video_size(const std::vector<VideoFormat> & vfs)
{
  max_video_height_ = 0;
  max_video_width_ = 0;

  for (auto & vf : vfs) {
    /* set max video height and width according to the given video formats */
    if (screen_height_ and vf.height >= screen_height_ and
        (not max_video_height_ or vf.height < max_video_height_) ) {
        max_video_height_ = vf.height;
    }

    if (screen_width_ and vf.width >= screen_width_ and
        (not max_video_width_ or vf.width < max_video_width_) ) {
        max_video_width_ = vf.width;
    }
  }
}

bool WebSocketClient::is_format_capable(const VideoFormat & format) const
{
  return (not max_video_width_ or format.width <= max_video_width_) and
         (not max_video_height_ or format.height <= max_video_height_);
}

optional<uint64_t> WebSocketClient::video_in_flight() const
{
  if (not next_vts_ or not client_next_vts_ or
      *next_vts_ < *client_next_vts_) {
    return nullopt;
  }

  return *next_vts_ - *client_next_vts_;
}

optional<uint64_t> WebSocketClient::audio_in_flight() const
{
  if (not next_ats_ or not client_next_ats_ or
      *next_ats_ < *client_next_ats_) {
    return nullopt;
  }

  return *next_ats_ - *client_next_ats_;
}

void WebSocketClient::update_last_dltimes(const uint64_t dl_time,
                                          const int64_t dl_size)
{
  last_dltimes_.push_back({dl_time, dl_size});
  if (last_dltimes_.size() > horizon_length_) {
    last_dltimes_.pop_front();
  }
}
