#include <linux/module.h>
#include <net/tcp.h>

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

static int __init tcp_dumb_register(void)
{
		tcp_register_congestion_control(&tcp_dumb);
		return 0;
}

static void __exit tcp_dumb_unregister(void)
{
        tcp_unregister_congestion_control(&tcp_dumb);
}


module_init(tcp_dumb_register);
module_exit(tcp_dumb_unregister);
MODULE_LICENSE("GPL");
