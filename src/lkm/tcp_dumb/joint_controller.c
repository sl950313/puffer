/* simple prototype in C using kernel style.
 * will be converted into C++ once the design is finalized
 */
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>

#define FIFO_NAME "/tmp/controller"
#define PROC_NAME "/proc/tcp_dumb"
#define BUFFER_SIZE 4

struct tcp_tuple {
        unsigned int saddr;
        unsigned int iaddr;
        unsigned short sport;
        unsigned short iport;
};

struct ctl_msg {
        unsigned short cwnd;
        struct tcp_tuple tcp;
};

int main(void)
{
        int pipe_fd, proc_fd;
        struct ctl_msg msg;

        if (access(FIFO_NAME, F_OK ) == -1)
                if (mkfifo(FIFO_NAME,  00644) < 0) {
                        fprintf(stderr, "unable to make fifo file");
                        return 1;
                }
        if (access(PROC_NAME, F_OK) == -1) {
                fprintf(stderr, "tcp_dump module is not running\n");
                return 1;
        }

        pipe_fd = open(FIFO_NAME, O_RDONLY);
        proc_fd = open(PROC_NAME, O_WRONLY);

        while (1) {
                if (read(pipe_fd, &msg, sizeof msg)) {
                        /* very dumb now. just pass the msg as is */
                        write(proc_fd, &msg, sizeof msg);
                }
        }
}
