/**
 * UOOC 的【AI 作答】标签页 —— 答题开关、接口配置，以及两个手动按钮。
 *
 * 只渲染 `GROUP.AI` 那一组（用户 m01877 分区口径）。
 *
 * 两个按钮是**故意放在这里**的：
 *  - 【测试连接】—— 接口填错了只会在答题时以「这道题没答出来」的形式暴露，
 *    那种失败最难查；有一个按钮能把话说清楚；
 *  - 【现在开始作答】—— 连播是自动触发，但用户完全可能想手动补做一份
 *    （比如不连播的时候单独打开某章测验）。这也是唯一一个**不需要连播开关**的入口。
 *
 * ⚠️ 本页**不提供「直接提交」**：提交永远走「先回填 DOM → 二次确认 → 点站点按钮」那条路
 * （`ai/index.ts`），这里只负责把用户送进去。
 */

import { el } from '../../../common/utils/dom.ts';
import { scoped } from '../../../common/core/log.ts';
import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { GROUP, SITE_ID, aiConfig } from '../settings.ts';
import { runQuizAnswer, tidFromLocation } from '../ai/index.ts';
import { testConnection } from '../ai/llm.ts';

const log = scoped('uooc/ai-tab');

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_AI_TAB: TabRegistration = {
  id: `${SITE_ID}:ai`,
  title: 'AI 作答',
  order: 220,
  mount(root: HTMLElement, ctx: TabContext): void {
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AI] }));

    const status = el('div', { class: 'sztb-field-desc', text: '' });

    const testBtn = el('button', {
      class: 'sztb-btn',
      text: '测试连接',
      attrs: { type: 'button' },
      on: {
        click: () => {
          void (async () => {
            const cfg = aiConfig();
            if (cfg === null) {
              status.textContent = '请先填「接口地址」与「模型名」';
              ctx.host.toast('配置不完整', 'warn');
              return;
            }
            testBtn.disabled = true;
            status.textContent = '正在测试…';
            const r = await testConnection(cfg);
            status.textContent = r.detail;
            log.info(`测试连接：${r.ok ? 'OK' : '失败'} — ${r.detail}`);
            ctx.host.toast(r.ok ? '连接正常' : '连接失败，详见下方说明', r.ok ? 'success' : 'error');
            testBtn.disabled = false;
          })();
        },
      },
    });

    const runBtn = el('button', {
      class: 'sztb-btn',
      text: '现在开始作答（当前试卷）',
      attrs: { type: 'button', 'data-variant': 'primary' },
      on: {
        click: () => {
          void (async () => {
            const tid = tidFromLocation();
            if (tid === null) {
              status.textContent = '当前页面不是一份试卷（地址里找不到 tid）';
              ctx.host.toast('请先打开一份试卷', 'warn');
              return;
            }
            runBtn.disabled = true;
            status.textContent = '正在作答…（进度看【日志】标签页）';
            try {
              const r = await runQuizAnswer(tid, ctx.host);
              status.textContent =
                r === null ? '作答未完成，详见日志' : `已填入 ${r.filled} 题${r.submitted ? '，已点提交' : '（未提交）'}`;
            } finally {
              runBtn.disabled = false;
            }
          })();
        },
      },
    });

    root.appendChild(
      el(
        'div',
        { class: 'sztb-field' },
        el('div', { class: 'sztb-group-title', text: '操作' }),
        el('div', { class: 'sztb-field-desc', text: '答完不会自动交卷：会先弹确认框，你点了才会提交。' }),
        el('div', { class: 'sztb-modal-foot' }, testBtn, runBtn),
        status,
      ),
    );
  },
};
