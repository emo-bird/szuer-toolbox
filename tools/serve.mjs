/**
 * 手动测试台的静态服务器（档 3 辅助）。
 *
 * 为什么需要它：油猴脚本的 `@match`/`@include` 在 `file://` 下要么不生效、
 * 要么拿不到正常的 `location.origin`，GM 存储也会退化成不落盘的内存后端 ——
 * 测出来的东西不算数。所以测试台必须从 http 起。
 *
 * 用法：
 *   node tools/serve.mjs            # 默认 8080
 *   node tools/serve.mjs 9999       # 换端口
 * 然后访问 http://localhost:<port>/manual.html#sztb-demo
 *
 * 只服务 `local/manual/` 目录，不做目录穿越，不监听外网地址。
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', 'local', 'manual');
const PORT = Number(process.argv[2] ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = url.pathname === '/' ? '/manual.html' : url.pathname;
  const target = normalize(join(ROOT, rel));

  // 目录穿越防护：解析后必须仍在 ROOT 之内
  if (!target.startsWith(ROOT + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  readFile(target)
    .then((buf) => {
      res.writeHead(200, {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + rel);
    });
});

server.listen(PORT, '127.0.0.1', () => {
  const base = `http://localhost:${PORT}`;
  console.log(`手动测试台已启动：${base}/manual.html#sztb-demo`);
  console.log(`（只服务 ${ROOT}，Ctrl+C 停止）`);
});
