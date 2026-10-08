/**
 * UOOC 的【AI 作答】标签页。
 *
 * 版面（用户 m04879 第 1–3 条拍板，**顺序是需求，不是随意排的**）：
 *
 * ```
 * 【开始作答】按钮           ← 置顶：最常用的动作最先看到
 * 自动答题开启（复选框）      ← TOGGLE.AI_ANSWER，连播走到测验时要不要自动答
 * 其余 5 项配置              ← 接口地址 / API Key / 模型名 / 单次超时 / 并发
 * ```
 *
 * 这三段由「先渲染按钮 + 再整体渲染 `GROUP.AI`」自然得到 —— `renderSiteSettings`
 * 内部就是「先开关、后配置项」，所以不用改共享组件去拆组。
 *
 * 【测试连接】与【开始作答】并排：接口填错了只会在答题时以「这道题没答出来」的形式
 * 暴露，那种失败最难查，得有个按钮把话说清楚。
 *
 * ⚠️ 本页**不提供「直接提交」**：提交永远走「先回填 DOM → 二次确认 → 点站点按钮」那条路
 * （`ai/index.ts`），这里只负责把用户送进去。
 */

import { el } from '../../../common/utils/dom.ts';
import { scoped } from '../../../common/core/log.ts';
import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { quizTidOnPage, runQuizAnswer } from '../ai/index.ts';
import { testConnection } from '../ai/llm.ts';
import { GROUP, SITE_ID, aiConfig } from '../settings.ts';

const log = scoped('uooc/ai-tab');

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_AI_TAB: TabRegistration = {
  id: `${SITE_ID}:ai`,
  title: 'AI 作答',
  order: 220,
  mount(root: HTMLElement, ctx: TabContext): void {
    const status = el('div', { class: 'sztb-field-desc', text: '' });

    const runBtn = el('button', {
      class: 'sztb-btn',
      text: '开始作答',
      attrs: { type: 'button', 'data-variant': 'primary' },
      on: {
        click: () => {
          void (async () => {
            // 旧版测验是**页内同源 iframe**（§A.4）⇒ 先扫答题 iframe 的 src 取 tid
            const tid = quizTidOnPage();
            if (tid === null) {
              status.textContent = '这个页面上没找到试卷：请先在目录里点开一个测验。';
              ctx.host.toast('没找到试卷', 'warn');
              return;
            }
            runBtn.disabled = true;
            status.textContent = `正在作答（tid=${tid}）…进度看【监视】标签页`;
            try {
              const r = await runQuizAnswer(tid, ctx.host);
              status.textContent =
                r === null
                  ? '作答没跑完，详见【监视】页与日志'
                  : `已填入 ${r.filled} 题，页面已有答案跳过 ${r.alreadyAnswered} 题${
                      r.submitted ? '，已点提交' : '（未提交）'
                    }`;
            } finally {
              runBtn.disabled = false;
            }
          })();
        },
      },
    });

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

    // 第 1 段：按钮置顶 + 状态行
    root.appendChild(
      el(
        'div',
        { class: 'sztb-field' },
        el('div', { class: 'sztb-group-title', text: '操作' }),
        el('div', {
          class: 'sztb-field-desc',
          text: '答完不会自动交卷：会先弹确认框，你点了才会提交（还要你手动点一下人机验证码）。',
        }),
        el('div', { class: 'sztb-modal-foot' }, runBtn, testBtn),
        status,
      ),
    );

    // 第 2、3 段：AI_ANSWER 复选框 → 其余 5 项配置（`renderSiteSettings` 天然是这个顺序）
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AI] }));
  },
};
