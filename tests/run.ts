/**
 * 测试入口：`npm test`
 *
 * 因为 Node 24 原生支持类型擦除，这里直接 import src 下的 .ts 源码，
 * 不需要先构建。新增测试套件时在下面加一行 import 即可
 * （import 的副作用就是向 harness 注册用例）。
 */

import { run } from './harness.ts';

// 纯函数冒烟（档1）—— 秒级，每次改完必跑
import './suites/url.test.ts';
import './suites/registry.test.ts';
import './suites/sites-registered.test.ts';
import './suites/storage.test.ts';
import './suites/settings.test.ts';
import './suites/log.test.ts';
import './suites/http.test.ts';
import './suites/limits.test.ts';
import './suites/tab-order.test.ts';
import './suites/panel-geometry.test.ts';
import './suites/bkxk-api.test.ts';
import './suites/bkxk-session.test.ts';
import './suites/bkxk-migrate.test.ts';
import './suites/bkxk-settings.test.ts';
import './suites/bkxk-list.test.ts';

await run();
