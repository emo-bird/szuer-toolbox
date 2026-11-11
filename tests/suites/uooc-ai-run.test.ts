import { assertEqual, describe, it } from '../harness.ts';
import type { PanelApi } from '../../src/sites/types.ts';
import { isQuizRunning, runQuizAnswer, stopQuizAnswer } from '../../src/sites/uooc/ai/index.ts';
import { monitorState } from '../../src/sites/uooc/ai/monitor.ts';
import { read, remove, write } from '../../src/common/core/storage.ts';
import { registerUoocSettings } from '../../src/sites/uooc/settings.ts';

describe('uooc/ai · 作答运行控制', () => {
  it('禁止重复启动，停止和切页都能释放试卷等待', async () => {
    const g = globalThis as Record<string, unknown>;
    const oldDocument = Object.getOwnPropertyDescriptor(g, 'document');
    const oldLocation = Object.getOwnPropertyDescriptor(g, 'location');
    const location = { href: 'https://www.uooc.net.cn/exam/123456' };
    const doc = { URL: location.href, querySelectorAll: () => [] };
    registerUoocSettings();
    const config = new Map([
      ['value:uooc:ai-base-url', 'https://example.invalid/v1'],
      ['value:uooc:ai-model', 'test-model'],
    ]);
    const oldConfig = new Map([...config.keys()].map((key) => [key, read<string | null>(key, null)]));
    for (const [key, value] of config) write(key, value);
    Object.defineProperty(g, 'document', { value: doc, configurable: true });
    Object.defineProperty(g, 'location', { value: location, configurable: true });
    const host = {} as PanelApi;
    try {
      const first = runQuizAnswer('123456', host);
      assertEqual(isQuizRunning(), true);
      assertEqual(await runQuizAnswer('123456', host), null);
      stopQuizAnswer();
      assertEqual((await first)?.cancelled, true);
      assertEqual(isQuizRunning(), false);

      const second = runQuizAnswer('123456', host);
      location.href = 'https://www.uooc.net.cn/exam/123457';
      assertEqual((await second)?.cancelled, true);
      assertEqual(isQuizRunning(), false);
      assertEqual(monitorState().quiz?.message, '试卷页面已切换，AI 作答已停止');
    } finally {
      stopQuizAnswer();
      for (const [key, value] of oldConfig) {
        if (value === null) remove(key);
        else write(key, value);
      }
      if (oldDocument === undefined) delete g['document'];
      else Object.defineProperty(g, 'document', oldDocument);
      if (oldLocation === undefined) delete g['location'];
      else Object.defineProperty(g, 'location', oldLocation);
    }
  });
});
