#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""flow_index.py —— 把 .flow 变成「请求总表」。

用法:
    python tools/flow_index.py --out local/uooc-flow-index.txt <flow> [<flow> ...]

行为:
  1. 把所有请求按「出现顺序」写成一张 TSV 总表，落盘到 --out（**不**打进上下文）。
  2. stdout 只打印一份「按 method+path 归并」的压缩视图（路径去 query），
     供人/主代理用来和用户确认目标接口。

隐私: 总表里的 query 会被截断到 --qlen（默认 120 字符），避免把长 token 铺开。
"""
import argparse
import os
import sys
from collections import OrderedDict

try:
    from mitmproxy.io import FlowReader
except ImportError as exc:  # pragma: no cover
    print("FATAL: 无法 import mitmproxy.io —— %s" % exc)
    sys.exit(2)


def truncate(s, n):
    s = s or ""
    s = s.replace("\t", " ").replace("\r", " ").replace("\n", " ")
    if len(s) <= n:
        return s
    return s[:n] + "...(%d)" % len(s)


def iter_flows(paths):
    """yield (file_basename, seq_in_file, flow)"""
    for p in paths:
        base = os.path.basename(p)
        try:
            with open(p, "rb") as fh:
                seq = 0
                for flow in FlowReader(fh).stream():
                    seq += 1
                    yield base, seq, flow
        except Exception as exc:  # noqa: BLE001
            print("WARN 读取失败 %s —— %s: %s" % (p, type(exc).__name__, exc), file=sys.stderr)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="local/flow-index.txt")
    ap.add_argument("--qlen", type=int, default=120)
    ap.add_argument("--full", action="store_true",
                    help="打印完整总表到 stdout（默认只打印归并视图）")
    ap.add_argument("flows", nargs="+")
    args = ap.parse_args(argv[1:])

    rows = []
    groups = OrderedDict()  # (method, path) -> [count, methods seen, statuses, files]

    for base, seq, flow in iter_flows(args.flows):
        req = getattr(flow, "request", None)
        resp = getattr(flow, "response", None)
        method = req.method if req else "-"
        host = req.host if req else "-"
        path = req.path.split("?", 1)[0] if req else "-"
        query = ""
        if req is not None:
            _, _, query = req.path.partition("?")
        status = resp.status_code if resp else "-"
        rlen = len(resp.raw_content) if (resp and resp.raw_content) else 0
        blen = len(resp.content) if (resp and resp.content) else 0
        req_ct = ""
        resp_ct = ""
        if req is not None:
            req_ct = req.headers.get("content-type", "")
        if resp is not None:
            resp_ct = resp.headers.get("content-type", "")
        rows.append([base, str(seq), method, host, path,
                     truncate(query, args.qlen), str(status), str(rlen),
                     truncate(req_ct, 40), truncate(resp_ct, 40)])

        key = (method, path)
        g = groups.get(key)
        if g is None:
            g = {"count": 0, "status": OrderedDict(), "files": OrderedDict(),
                 "rlen": 0, "max": 0}
            groups[key] = g
        g["count"] += 1
        g["status"][str(status)] = g["status"].get(str(status), 0) + 1
        g["files"][base] = g["files"].get(base, 0) + 1
        g["rlen"] += rlen
        g["max"] = max(g["max"], rlen)

    header = ["file", "seq", "method", "host", "path", "query",
              "status", "resp_bytes", "req_ct", "resp_ct"]
    outdir = os.path.dirname(os.path.abspath(args.out))
    if outdir:
        os.makedirs(outdir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\t".join(header) + "\n")
        for r in rows:
            fh.write("\t".join(r) + "\n")

    print("总表已落盘: %s  (%d 行)" % (args.out, len(rows)))
    print("")
    if args.full:
        print("\t".join(header))
        for r in rows:
            print("\t".join(r))
        return 0

    print("== 归并视图  method path  [次数 | 状态 | 响应字节合计/最大] ==")
    print("%-6s %-8s %-52s %4s  %-14s %10s %10s  %s" %
          ("#", "METHOD", "PATH", "N", "STATUS", "BYTES_SUM", "BYTES_MAX", "FILES"))
    for i, ((method, path), g) in enumerate(groups.items(), 1):
        files = ",".join("%s:%d" % (k[:22], v) for k, v in g["files"].items())
        print("%-6d %-8s %-52s %4d  %-14s %10d %10d  %s" %
              (i, method, path[:52], g["count"],
               ",".join("%s:%d" % kv for kv in g["status"].items()),
               g["rlen"], g["max"], files))
    print("")
    print("归并后 %d 条 endpoint，原始 %d 条请求。" % (len(groups), len(rows)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
