AM_CPPFLAGS = $(CXX17_FLAGS) -I$(srcdir)/../util -I$(srcdir)/../net
AM_CXXFLAGS = $(PICKY_CXXFLAGS) $(EXTRA_CXXFLAGS)

bin_PROGRAMS = forwarder

forwarder_SOURCES = forwarder.cc
forwarder_LDADD = ../util/libutil.a ../net/libnet.a $(SSL_LIBS)
