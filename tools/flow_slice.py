#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""flow_slice.py —— 按域名/路径把 .flow 切成小片，交给本地模型提炼。

用法示例:
    python tools/flow_slice.py \
        --matches default --out local/slices/uooc-exam.json \
        local/capture/uooc-A+D-旧版学习页+旧版看答案.flow \
        local/capture/uooc-C-全流程（数据量极大）+测验做题.flow

    # 自定义匹配
    python tools/flow_slice.py --match "/exam/(view|paper)" --out local/slices/x.json <flows>

行为:
  * --redact (默认开) 会把 cookie / set-cookie / authorization / xsrf 的值抹成 <REDACTED>。
  * 正文按 --body-limit 截断（默认 20000 字符），并在 JSON 里标注 truncated。
  * 输出是 UTF-8 无 BOM 的 JSON 数组，一条 request = 一个对象。
  * 只打印一行统计，不把正文打到 stdout。

隐私: 输出文件仍可能含真实姓名/学号（响应正文里）。
      **不要**把 slice 文件内容粘进云端模型；只交给本地模型（lean_agent）。
"""
import argparse
import json
import os
import re
import sys

try:
    from mitmproxy.io import FlowReader
except ImportError as exc:  # pragma: no cover
    print("FATAL: 无法 import mitmproxy.io —— %s" % exc)
    sys.exit(2)

SECRET_HEADERS = {"cookie", "set-cookie", "authorization", "xsrf",
                  "x-xsrf-token", "x-csrf-token", "token"}

DEFAULT_MATCH = r"/exam/|/home/learn/get|markVideoLearn|cheatrecord|getDifyToken"


def redact_headers(headers):
    out = []
    for k, v in headers.items():
        if k.lower() in SECRET_HEADERS:
            out.append([k, "<REDACTED len=%d>" % len(v)])
        else:
            out.append([k, v])
    return out


def body_text(content, limit):
    if content is None:
        return "", False
    if isinstance(content, bytes):
        try:
            s = content.decode("utf-8")
        except UnicodeDecodeError:
            return "<binary %d bytes>" % len(content), False
    else:
        s = content
    if len(s) > limit:
        return s[:limit], True
    return s, False


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--match", default=DEFAULT_MATCH,
                    help="对 'METHOD path' 做 re.search 的正则")
    ap.add_argument("--body-limit", type=int, default=20000)
    ap.add_argument("--no-redact", action="store_true")
    ap.add_argument("flows", nargs="+")
    args = ap.parse_args(argv[1:])

    pat = re.compile(args.match, re.I)
    items = []
    for p in args.flows:
        base = os.path.basename(p)
        try:
            with open(p, "rb") as fh:
                seq = 0
                for flow in FlowReader(fh).stream():
                    seq += 1
                    req = flow.request
                    if req is None:
                        continue
                    sig = "%s %s" % (req.method, req.path)
                    if not pat.search(sig):
                        continue
                    resp = flow.response
                    req_body, req_tr = body_text(req.content, args.body_limit)
                    resp_body, resp_tr = body_text(
                        resp.content if resp is not None else None, args.body_limit)
                    items.append({
                        "file": base,
                        "seq": seq,
                        "method": req.method,
                        "url": "%s://%s%s" % (req.scheme, req.host, req.path),
                        "path": req.path.split("?", 1)[0],
                        "query": req.path.partition("?")[2],
                        "req_ct": req.headers.get("content-type", ""),
                        "req_headers": ([] if args.no_redact
                                        else redact_headers(req.headers)),
                        "req_body": req_body,
                        "req_body_truncated": req_tr,
                        "status": resp.status_code if resp is not None else None,
                        "resp_ct": (resp.headers.get("content-type", "")
                                    if resp is not None else ""),
                        "resp_body": resp_body,
                        "resp_body_truncated": resp_tr,
                    })
        except Exception as exc:  # noqa: BLE001
            print("WARN 读取失败 %s —— %s: %s" % (p, type(exc).__name__, exc),
                  file=sys.stderr)

    outdir = os.path.dirname(os.path.abspath(args.out))
    if outdir:
        os.makedirs(outdir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=1)

    size = os.path.getsize(args.out)
    print("落盘 %s | 命中 %d 条 | %d 字节" % (args.out, len(items), size))
    for it in items:
        print("   %-6s %-46s %s  resp=%s" %
              (it["method"], it["path"][:46], it["status"], len(it["resp_body"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
