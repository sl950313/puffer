#ifndef CLIENT_MESSAGE_HH
#define CLIENT_MESSAGE_HH

#include <cstdint>
#include <string>
#include <optional>
#include <exception>
#include <memory>

#include "json.hpp"
using json = nlohmann::json;

class ClientInitMsg
{
public:
  std::string session_key {};
  std::string username {};

  uint16_t player_width {};
  uint16_t player_height {};

  std::string channel {};

  std::string os {};
  std::string browser {};
  uint16_t screen_height {};
  uint16_t screen_width {};

  std::optional<uint64_t> next_vts {};
  std::optional<uint64_t> next_ats {};
};

class ClientInfoMsg
{
public:
  enum class PlayerEvent {
    Unknown = 0,
    Timer = 1,
    Rebuffer = 2,
    CanPlay = 3,
    AudioAck = 4,
    VideoAck = 5
  };

  enum class PlayerReadyState {
    HaveNothing = 0,
    HaveMetadata = 1,
    HaveCurrentData = 2,
    HaveFutureData = 3,
    HaveEnoughData = 4
  };

  PlayerEvent event {PlayerEvent::Unknown};

  /* Length of client's buffer in seconds */
  double video_buffer_len {};
  double audio_buffer_len {};

  /* Next segment the client is expecting */
  uint64_t next_video_timestamp {};
  uint64_t next_audio_timestamp {};

  PlayerReadyState player_ready_state {PlayerReadyState::HaveNothing};

  unsigned int init_id {};

  /* Current screen size */
  uint16_t screen_height {};
  uint16_t screen_width {};

  /* extra metadata payload */
  std::optional<std::string> type {};
  std::optional<std::string> quality {};
  std::optional<uint64_t> timestamp {};
  std::optional<unsigned int> duration {};
  std::optional<unsigned int> byte_offset {};
  std::optional<unsigned int> total_byte_length {};
  std::optional<double> ssim {};
  std::optional<unsigned int> receiving_time_ms {};
  std::optional<unsigned int> received_bytes {};
};

class ClientMsgParser
{
public:
  enum class Type {
    Unknown,
    Init,
    Info
  };

  ClientMsgParser(const std::string & data);

  Type msg_type() { return type_; }

  ClientInitMsg parse_init_msg();
  ClientInfoMsg parse_info_msg();

private:
  json msg_ {};
  Type type_ {Type::Unknown};
};

#endif /* CLIENT_MESSAGE_HH */
