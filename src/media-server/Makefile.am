AM_CPPFLAGS = $(CXX17_FLAGS) $(SSL_CFLAGS) -I$(srcdir)/../util \
	-I$(srcdir)/../net -I$(srcdir)/../notifier -I$(srcdir)/../wrappers \
	-I$(srcdir)/../monitoring \
	-isystem$(srcdir)/../../third_party/json.upstream/single_include/nlohmann $(POSTGRES_CFLAGS)
AM_CXXFLAGS = $(PICKY_CXXFLAGS) $(EXTRA_CXXFLAGS)

bin_PROGRAMS = ws_media_server run_servers

ws_media_server_SOURCES = \
  ws_media_server.cc ws_client.hh ws_client.cc channel.hh channel.cc \
  client_message.hh client_message.cc server_message.hh server_message.cc \
	../wrappers/media_formats.hh ../wrappers/media_formats.cc \
	../notifier/inotify.hh ../notifier/inotify.cc \
	../../third_party/json.upstream/single_include/nlohmann/json.hpp
ws_media_server_LDADD = ../net/libnet.a ../util/libutil.a ../net/libnet.a \
	$(POSTGRES_LIBS) $(SSL_LIBS) $(CRYPTO_LIBS) $(YAML_LIBS) -lstdc++fs

run_servers_SOURCES = run_servers.cc \
  ../monitoring/influxdb_client.hh ../monitoring/influxdb_client.cc
run_servers_LDADD = ../util/libutil.a ../net/libnet.a \
	$(SSL_LIBS) $(YAML_LIBS) -lstdc++fs
