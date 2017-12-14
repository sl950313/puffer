
#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <unistd.h>
#include <string.h>
#include <fcntl.h>

#define BUFFER_SIZE 1024
#define FIFO_NAME "/tmp/controller"

#define on_error(...) { fprintf(stderr, __VA_ARGS__); fflush(stderr); exit(1); }

struct ctl_msg {
        unsigned short port;
        unsigned short cwnd;
};

int main (int argc, char *argv[]) {
        if (argc < 2) on_error("Usage: %s [port]\n", argv[0]);

        if (access(FIFO_NAME, F_OK) == -1)
                on_error("joint controller is not running\n");

        int port = atoi(argv[1]);

        int server_fd, client_fd, fifo_fd, err;
        struct sockaddr_in server, client;
        char buf[BUFFER_SIZE];

        server_fd = socket(AF_INET, SOCK_STREAM, 0);
        fifo_fd = open(FIFO_NAME, O_WRONLY);
        if (server_fd < 0) on_error("Could not create socket\n");
        if (fifo_fd < 0) on_error("Could not open fifo pipe\n");

        server.sin_family = AF_INET;
        server.sin_port = htons(port);
        server.sin_addr.s_addr = htonl(INADDR_ANY);

        int opt_val = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt_val, sizeof opt_val);
        err = bind(server_fd, (struct sockaddr *) &server, sizeof(server));
        if (err < 0) on_error("Could not bind socket\n");

        err = listen(server_fd, 128);
        if (err < 0) on_error("Could not listen on socket\n");

        printf("Server is listening on %d\n", port);

        while (1) {
                socklen_t client_len = sizeof(client);
                client_fd = accept(server_fd, (struct sockaddr *) &client, &client_len);

                if (client_fd < 0) on_error("Could not establish new connection\n");
                char optval[BUFFER_SIZE];
                strcpy(optval, "tcp_dumb");
                int optlen = strlen(optval);
                optlen = strlen(optval);
                if (setsockopt(client_fd, IPPROTO_TCP, TCP_CONGESTION, optval, optlen) < 0) {
                        perror("setsockopt");
                        return 1;
                }
                unsigned short port = client.sin_port;
                // print out port number
                printf("client port number: %d\n", port);

                while (1) {
                        int read = recv(client_fd, buf, BUFFER_SIZE, 0);

                        if (!read) break; // done reading
                        if (read < 0) on_error("Client read failed\n");

                        /* send message to named pipe */
                        buf[read] = 0;
                        int cwnd = atoi(buf);
                        struct ctl_msg msg = {
                                .cwnd = cwnd,
                                .port = port,
                        };

                        write(fifo_fd, &msg, sizeof msg);

                        err = send(client_fd, buf, read, 0);
                        if (err < 0) on_error("Client write failed\n");
                        struct tcp_info tcp_info;
                        unsigned int tcp_info_length = sizeof(tcp_info);
                        if (getsockopt(client_fd, SOL_TCP, TCP_INFO, (void *)&tcp_info, &tcp_info_length ) == 0 ) {
                                printf("cwnd: %d\n", tcp_info.tcpi_snd_cwnd);
                        }
                }
        }

        return 0;
}
