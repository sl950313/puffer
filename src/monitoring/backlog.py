#!/usr/bin/env python3

import os
from os import path
import sys
import time
import argparse
import sched
import math

from datetime import datetime
from influxdb import InfluxDBClient


INFLUX_PWD = os.environ['INFLUXDB_PASSWORD']
PERIOD = 60  # seconds

scheduler = sched.scheduler(time.time)
influxdb_client = InfluxDBClient('localhost', 8086, 'puffer', INFLUX_PWD)


def count_backlog(target_dir):
    curr_time = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

    json_body = []
    for channel_name in os.listdir(target_dir):
        channel_path = path.join(target_dir, channel_name)
        working_path = path.join(channel_path, 'working')
        canonical_path = path.join(working_path, 'video-canonical')

        working_cnt = sum([len(files) for _, _, files in os.walk(working_path)])
        canonical_cnt = len([name for name in os.listdir(canonical_path)
                            if path.join(canonical_path, name)])

        json_body.append({
            'measurement': 'backlog',
            'tags': {'channel': channel_name},
            'time': curr_time,
            'fields': {'working_cnt': working_cnt,
                       'canonical_cnt': canonical_cnt}
        })

        sys.stderr.write(
            'channel {}, working file count {}, canonical file count {}\n'
            .format(channel_name, working_cnt, canonical_cnt))

    influxdb_client.write_points(json_body, time_precision='s',
                                 database='collectd')

    # run count_backlog every 60 seconds without drifting
    scheduler.enterabs(PERIOD * math.ceil(time.time() / PERIOD), 1, # priority
                       count_backlog, argument=(target_dir,))
    scheduler.run()


def sanity_check(target_dir):
    for channel_name in os.listdir(target_dir):
        channel_path = path.join(target_dir, channel_name)
        if not path.isdir(channel_path):
            sys.exit('{} does not exist'.format(channel_path))

        working_path = path.join(channel_path, 'working')
        if not path.isdir(working_path):
            sys.exit('{} does not exist'.format(working_path))

        canonical_path = path.join(working_path, 'video-canonical')
        if not path.isdir(canonical_path):
            sys.exit('{} does not exist'.format(canonical_path))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('target_dir',
                        help='directory to count files recursively')
    target_dir = parser.parse_args().target_dir
    sanity_check(target_dir)

    # schedule the first run
    scheduler.enterabs(PERIOD * math.ceil(time.time() / PERIOD), 1, # priority
                       count_backlog, argument=(target_dir,))
    scheduler.run()


if __name__ == '__main__':
    main()
