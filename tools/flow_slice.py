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
  * --redact (默认开) 会把 cookie / set-cookie / authorization / xsrf 的值抹成 <REDACTED>，
    并**额外**把 URL query 里 SECRET_QUERY_KEYS 列出的键（phone / username / idcard …）
    的值抹掉，键名保留 —— 实测抓包里有 `?username=胡桃&phone=13825709090` 这种明文。
  * --host 可按主机正则过滤（不传则不按主机过滤）；--match 只作用于 "METHOD path"。
  * 正文按 --body-limit 截断（默认 20000 字符），并在 JSON 里标注 truncated。
    二进制正文（mp4 等）会被替换成 `<binary N bytes>`，不会把媒体塞进切片。
  * 输出是 UTF-8 无 BOM 的 JSON 数组，一条 request = 一个对象。
  * 只打印一行统计 + 每条一行摘要，不把正文打到 stdout。

隐私: 即使开了 --redact，响应正文里仍可能含真实姓名/学号（如 exam/view 的 data.task.student）。
      交给**云端**模型前务必确认这一点已被用户显式授权；未授权时只交给本地模型（lean_agent）。
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

# URL query / 表单里会夹带个人信息的键。实测 UOOC 的 Dify 分享链接是
#   /chatbot/xxx?username=胡桃&phone=13825709090
# —— 明文手机号，且 header 脱敏根本盖不住它，必须单独处理。
SECRET_QUERY_KEYS = {
    "phone", "mobile", "mobileno", "mobilephone", "tel", "telephone",
    "username", "user_name", "user", "realname", "real_name", "name",
    "idcard", "id_card", "idno", "studentno", "student_no", "stuno",
    "email", "mail", "account", "uid", "userid", "user_id",
}

DEFAULT_MATCH = r"/exam/|/home/learn/get|markVideoLearn|cheatrecord|getDifyToken"


def redact_headers(headers):
    out = []
    for k, v in headers.items():
        if k.lower() in SECRET_HEADERS:
            out.append([k, "<REDACTED len=%d>" % len(v)])
        else:
            out.append([k, v])
    return out


def redact_query(query):
    """把 query 里敏感键的值抹掉，**保留键名**（否则读的人不知道这里少了个字段）。"""
    if not query:
        return query
    parts = []
    for seg in query.split("&"):
        if not seg:
            continue
        k, sep, v = seg.partition("=")
        if sep and k.lower() in SECRET_QUERY_KEYS:
            parts.append("%s=<REDACTED len=%d>" % (k, len(v)))
        else:
            parts.append(seg)
    return "&".join(parts)


def redact_url_query(url):
    """url 里已经拼好 query 的情形，只重写 ? 之后那段。"""
    head, sep, tail = url.partition("?")
    if not sep:
        return url
    return head + sep + redact_query(tail)


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
    ap.add_argument("--host", default=None,
                    help="对 host 做 re.search 的正则；不传则不按主机过滤")
    ap.add_argument("--body-limit", type=int, default=20000)
    ap.add_argument("--no-redact", action="store_true")
    ap.add_argument("flows", nargs="+")
    args = ap.parse_args(argv[1:])

    pat = re.compile(args.match, re.I)
    hostpat = re.compile(args.host, re.I) if args.host else None
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
                    if hostpat is not None and not hostpat.search(req.host):
                        continue
                    sig = "%s %s" % (req.method, req.path)
                    if not pat.search(sig):
                        continue
                    resp = flow.response
                    req_body, req_tr = body_text(req.content, args.body_limit)
                    resp_body, resp_tr = body_text(
                        resp.content if resp is not None else None, args.body_limit)
                    query = req.path.partition("?")[2]
                    url = "%s://%s%s" % (req.scheme, req.host, req.path)
                    if not args.no_redact:
                        query = redact_query(query)
                        url = redact_url_query(url)
                    items.append({
                        "file": base,
                        "seq": seq,
                        "method": req.method,
                        "host": req.host,
                        "url": url,
                        "path": req.path.split("?", 1)[0],
                        "query": query,
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
