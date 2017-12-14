#include <linux/module.h>
#include <net/tcp.h>
#include <linux/proc_fs.h>
#include <linux/seq_file.h>
#include <linux/stat.h>
#include <linux/string.h>

#define TABLE_SIZE 65536
#define PROC_NAME "tcp_dumb"

/* hold cwnd info indexed by port number
*/
static u16 cwnd_table[TABLE_SIZE];
static const u32 default_cwnd = 10;

/* proc */
static ssize_t dumb_write(struct file *filp, const char *buf, size_t count,
                loff_t *offp)
{
        /* beware of the null terminator */
        char msg[sizeof(u32) + 1];
        u16 port, cwnd;
        memset(msg, 0, sizeof(msg));
        if (count > sizeof(msg)) {
                printk(KERN_ERR "write size %ld exceeds u16 size %ld", count,
                                sizeof(u16));
        } else {
                copy_from_user(msg, buf, count);
                msg[count - 1] = 0;
                cwnd = *((u16 *)msg);
                port = *((u16 *)msg + 1);
                cwnd_table[port] = cwnd;
                printk(KERN_INFO "port %d cwnd set to %d\n", port, cwnd);
                printk(KERN_INFO "message %s %ld\n", msg, count);
        }
        return count;
}


/* TCP */
static void dumb_cong_avoid(struct sock *sk, u32 ack, u32 acked)
{
}

static u32 dumb_ssthresh(struct sock *sk)
{
        struct tcp_sock *tp = tcp_sk(sk);
        return tp->snd_ssthresh;
}

static struct tcp_congestion_ops tcp_dumb = {
        .name           = "tcp_dumb",
        .ssthresh       = dumb_ssthresh,
        .owner          = THIS_MODULE,
        .cong_avoid     = dumb_cong_avoid,
};

static const struct file_operations dumb_proc_fops = {
        .owner = THIS_MODULE,
        .write = dumb_write,
};

static int __init tcp_dumb_register(void)
{
        int i;
        /* initialize cwnd table */
        for (i = 0; i < TABLE_SIZE; i++) {
                cwnd_table[i] = default_cwnd;
        }
        /* register TCP */
        // tcp_register_congestion_control(&tcp_dumb);
        /* create proc file */
        proc_create(PROC_NAME, S_IRWXUGO, NULL, &dumb_proc_fops);
        return 0;
}

static void __exit tcp_dumb_unregister(void)
{
        // tcp_unregister_congestion_control(&tcp_dumb);
        remove_proc_entry(PROC_NAME, NULL);
}


module_init(tcp_dumb_register);
module_exit(tcp_dumb_unregister);
MODULE_LICENSE("GPL");
