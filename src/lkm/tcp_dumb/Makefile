obj-m += tcp_dumb.o

all: kernel user

kernel:
		make -C /lib/modules/$(shell uname -r)/build M=$(PWD) modules

user:
		make -f user.mk

clean:
		make -C /lib/modules/$(shell uname -r)/build M=$(PWD) clean
		make -f user.mk clean
