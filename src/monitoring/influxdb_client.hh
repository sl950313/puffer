#include <string>

#include "socket.hh"
#include "poller.hh"

class InfluxDBClient
{
public:
  InfluxDBClient(Poller & poller,
                 const Address & address,
                 const std::string & database,
                 const std::string & user,
                 const std::string & password);

  void post(const std::string & payload);

private:
  Address influxdb_addr_ {};
  TCPSocket sock_ {};

  std::string http_request_line_ {};
  std::string payload_ {};
};
