#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""flow_probe.py —— 确认 mitmproxy .flow 文件可读，并打印极简统计。

用法:
    python tools/flow_probe.py local/capture/xxx.flow [yyy.flow ...]

只把「计数 / 主机 / 方法分布」这类极小结果打到 stdout，
绝不把请求正文打进上下文。
"""
import sys
import os
from collections import Counter

try:
    from mitmproxy.io import FlowReader
except ImportError as exc:  # pragma: no cover
    print("FATAL: 无法 import mitmproxy.io —— %s" % exc)
    sys.exit(2)


def probe(path):
    if not os.path.exists(path):
        print("MISSING  %s" % path)
        return
    n = 0
    hosts = Counter()
    methods = Counter()
    codes = Counter()
    err = None
    try:
        with open(path, "rb") as fh:
            for flow in FlowReader(fh).stream():
                n += 1
                req = getattr(flow, "request", None)
                if req is not None:
                    hosts[req.host] += 1
                    methods[req.method] += 1
                resp = getattr(flow, "response", None)
                if resp is not None:
                    codes[resp.status_code] += 1
                if n % 2000 == 0:
                    print("  ...%d flows" % n)
    except Exception as exc:  # noqa: BLE001
        err = "%s: %s" % (type(exc).__name__, exc)

    print("=" * 60)
    print("FILE    %s" % path)
    print("BYTES   %d" % os.path.getsize(path))
    print("FLOWS   %d" % n)
    print("METHODS %s" % dict(methods))
    print("CODES   %s" % dict(codes.most_common(12)))
    print("HOSTS   %d 个" % len(hosts))
    for h, c in hosts.most_common(20):
        print("        %6d  %s" % (c, h))
    if err:
        print("ERROR   %s" % err)
        print("=> 文件可能不是 mitmproxy 12 原生 .flow（或为 HAR/损坏）")
    print()


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    for p in argv[1:]:
        probe(p)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
