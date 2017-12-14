CC=gcc
CFLAGS=-Wall -Werror
ALL=server joint_controller

all: $(ALL)

server: server.c
	$(CC) $(CFLAGS) $< -o $@

joint_controller: joint_controller.c
	$(CC) $(CFLAGS) $< -o $@

clean:
	rm -rf $(ALL)
