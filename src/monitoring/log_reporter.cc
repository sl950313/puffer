#include <cstdlib>
#include <fcntl.h>

#include <iostream>
#include <vector>
#include <string>
#include <fstream>

#include "util.hh"
#include "inotify.hh"
#include "poller.hh"
#include "file_descriptor.hh"
#include "filesystem.hh"
#include "tokenize.hh"
#include "exception.hh"
#include "formatter.hh"
#include "influxdb_client.hh"

using namespace std;
using namespace PollerShortNames;

/* payload data format to post to DB (a "format string" in a vector) */
static Formatter formatter;

void print_usage(const string & program_name)
{
  cerr << "Usage: " << program_name << " <log format> <log path>" << endl;
}

int tail_loop(const string & log_path)
{
  Poller poller;
  Inotify inotify(poller);
  InfluxDBClient influxdb_client(poller, {"127.0.0.1", 8086}, "collectd",
                                 "puffer", safe_getenv("INFLUXDB_PASSWORD"));

  bool log_rotated = false;  /* whether log rotation happened */
  string buf;  /* used to assemble content read from the log into lines */

  for (;;) {
    FileDescriptor fd(CheckSystemCall("open (" + log_path + ")",
                                      open(log_path.c_str(), O_RDONLY)));
    fd.seek(0, SEEK_END);

    int wd = inotify.add_watch(log_path, IN_MODIFY | IN_CLOSE_WRITE,
      [&log_rotated, &buf, &fd, &influxdb_client]
      (const inotify_event & event, const string &) {
        if (event.mask & IN_MODIFY) {
          string new_content = fd.read();
          if (new_content.empty()) {
            /* return if nothing more to read */
            return;
          }
          buf += new_content;

          /* find new lines iteratively */
          size_t pos = 0;
          while ((pos = buf.find("\n")) != string::npos) {
            const string & line = buf.substr(0, pos);
            vector<string> values = split(line, " ");
            influxdb_client.post(formatter.format(values));

            buf = buf.substr(pos + 1);
          }
        } else if (event.mask & IN_CLOSE_WRITE) {
          /* old log was closed; open and watch new log in next loop */
          log_rotated = true;
        }
      }
    );

    while (not log_rotated) {
      auto ret = poller.poll(-1);
      if (ret.result != Poller::Result::Type::Success) {
        return ret.exit_status;
      }
    }

    inotify.rm_watch(wd);
    log_rotated = false;
  }

  return EXIT_SUCCESS;
}

int main(int argc, char * argv[])
{
  if (argc < 1) {
    abort();
  }

  if (argc != 3) {
    print_usage(argv[0]);
    return EXIT_FAILURE;
  }

  string log_format(argv[1]);
  string log_path(argv[2]);

  /* create an empty log if it does not exist */
  FileDescriptor touch(CheckSystemCall("open (" + log_path + ")",
                       open(log_path.c_str(), O_WRONLY | O_CREAT, 0644)));
  touch.close();

  /* read a line specifying log format and pass into string formatter */
  ifstream format_ifstream(log_format);
  string format_string;
  getline(format_ifstream, format_string);
  formatter.parse(format_string);

  /* read new lines from logs and post to InfluxDB */
  return tail_loop(log_path);
}
