// ==UserScript==
// @name         深大人工具箱
// @name:en      SZUer Toolbox
// @namespace    https://github.com/emo-bird/szuer-toolbox
// @version      0.1.0
// @description  深大校园站工具箱：UOOC 课程助手 + 本科选课助手。完全自研 UI，无外部运行时依赖。
// @description:en  Toolbox for SZU campus sites: UOOC course helper + undergraduate course-selection helper.
// @author       一门鸽鸽 (emo_bird) & DeepSeek
// @homepageURL  https://github.com/emo-bird/szuer-toolbox
// @supportURL   https://github.com/emo-bird/szuer-toolbox/issues
// @updateURL    https://raw.githubusercontent.com/emo-bird/szuer-toolbox/master/dist/szuer-toolbox.user.js
// @downloadURL  https://raw.githubusercontent.com/emo-bird/szuer-toolbox/master/dist/szuer-toolbox.user.js
// @match        *://*.szu.edu.cn/*
// @match        *://*.uooc.net.cn/*
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNyIgZmlsbD0iIzFlNmZmZiIvPjxyZWN0IHg9IjciIHk9IjkiIHdpZHRoPSIxOCIgaGVpZ2h0PSIzIiByeD0iMS4yIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNyIgeT0iMTUiIHdpZHRoPSIxOCIgaGVpZ2h0PSIzIiByeD0iMS4yIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNyIgeT0iMjEiIHdpZHRoPSIxMCIgaGVpZ2h0PSIzIiByeD0iMS4yIiBmaWxsPSIjZmZmIi8+PC9zdmc+
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// @noframes
// ==/UserScript==

/*
 * ============================================================================
 *  深大人工具箱 —— 免责声明
 * ============================================================================
 *
 *  1. 本脚本仅供学习与研究使用，使用者应自行承担使用风险。
 *  2. 作者不对使用本脚本造成的任何直接或间接后果负责，包括但不限于
 *     课程成绩、选课结果、账号状态、学业处分等。
 *  3. 本脚本不会自动执行任何不可逆操作（提交选课 / 提交答案 / 交卷）。
 *     所有此类功能默认关闭，必须由使用者在设置面板中显式勾选，
 *     且每次执行前都会弹出二次确认。
 *  4. 本脚本不会上传、不落盘任何凭证（cookie / token / 学号 / 密码）。
 *     配置的第三方大模型 API Key 仅保存在你本机的油猴脚本存储中。
 *  5. 请遵守深圳大学及各站点的用户协议。若站点明令禁止自动化访问，
 *     请立即停止使用并卸载本脚本。
 *
 *  项目地址：https://github.com/emo-bird/szuer-toolbox
 *  开源许可：见仓库 README（当前未附带 LICENSE 文件，保留所有权利）
 * ============================================================================
 */

/* 构建信息：2026-10-09T14:06:55.250Z（构建号 97） */

"use strict";
(() => {
  // src/common/ui/style.css
  var style_default = '/* ============================================================\n   深大人工具箱 —— 悬浮窗基础样式\n   本文件被 esbuild 以 --loader:.css=text 打成字符串，\n   运行时整段塞进 shadow root 的 <style>。\n   因为处在 Shadow DOM 内，天然不受宿主页面 CSS 影响，\n   反向也绝不会污染宿主页面。\n   ============================================================ */\n\n:host,\n.sztb-root {\n  --sztb-accent: #1e6fff;\n  --sztb-accent-hover: #175be0;\n  --sztb-bg: #ffffff;\n  --sztb-bg-alt: #f5f6f8;\n  --sztb-border: #e3e5e9;\n  --sztb-text: #1f2329;\n  --sztb-text-dim: #8a9099;\n  --sztb-danger: #e5484d;\n  --sztb-warn: #f5a623;\n  --sztb-ok: #30a46c;\n\n  all: initial;\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--sztb-text);\n  box-sizing: border-box;\n}\n\n.sztb-root *,\n.sztb-root *::before,\n.sztb-root *::after {\n  box-sizing: border-box;\n}\n\n/* ---------------------------------------------------------- 悬浮球 */\n.sztb-ball {\n  position: fixed;\n  z-index: 2147483000;\n  width: 44px;\n  height: 44px;\n  border-radius: 50%;\n  background: var(--sztb-accent);\n  color: #fff;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  font-size: 15px;\n  font-weight: 600;\n  cursor: grab;\n  user-select: none;\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);\n  transition: transform 0.15s ease, background 0.15s ease;\n}\n\n.sztb-root[data-collapsed="true"] .sztb-ball {\n  display: flex;\n}\n\n.sztb-ball:hover {\n  background: var(--sztb-accent-hover);\n  transform: scale(1.06);\n}\n\n.sztb-ball:active {\n  cursor: grabbing;\n}\n\n/* ---------------------------------------------------------- 面板 */\n.sztb-panel {\n  position: fixed;\n  z-index: 2147483001;\n  display: flex;\n  flex-direction: column;\n  background: var(--sztb-bg);\n  border: 1px solid var(--sztb-border);\n  border-radius: 10px;\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);\n  overflow: hidden;\n  min-width: 260px;\n  min-height: 180px;\n}\n\n.sztb-root[data-collapsed="true"] .sztb-panel {\n  display: none;\n}\n\n/* ---------------------------------------------------------- 标题栏 */\n.sztb-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  background: var(--sztb-bg-alt);\n  border-bottom: 1px solid var(--sztb-border);\n  cursor: move;\n  user-select: none;\n  flex: 0 0 auto;\n}\n\n.sztb-title {\n  flex: 1 1 auto;\n  font-weight: 600;\n  font-size: 13px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.sztb-site {\n  color: var(--sztb-text-dim);\n  font-weight: 400;\n}\n\n.sztb-iconbtn {\n  flex: 0 0 auto;\n  width: 22px;\n  height: 22px;\n  padding: 0;\n  border: none;\n  border-radius: 5px;\n  background: transparent;\n  color: var(--sztb-text-dim);\n  font-size: 14px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.sztb-iconbtn:hover {\n  background: rgba(0, 0, 0, 0.07);\n  color: var(--sztb-text);\n}\n\n/* ---------------------------------------------------------- 标签栏 */\n.sztb-tabbar {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 2px;\n  padding: 6px 8px 0;\n  border-bottom: 1px solid var(--sztb-border);\n  background: var(--sztb-bg);\n  flex: 0 0 auto;\n}\n\n.sztb-tab {\n  padding: 5px 10px;\n  border: none;\n  border-bottom: 2px solid transparent;\n  background: transparent;\n  color: var(--sztb-text-dim);\n  font-size: 12.5px;\n  cursor: pointer;\n  border-radius: 6px 6px 0 0;\n  white-space: nowrap;\n}\n\n.sztb-tab:hover {\n  color: var(--sztb-text);\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-tab[aria-selected="true"] {\n  color: var(--sztb-accent);\n  border-bottom-color: var(--sztb-accent);\n  font-weight: 600;\n}\n\n/**\n * 站点组与公共组之间的分组竖线。\n *\n * - `align-self: center` 而不是 `stretch`：标签按钮自带上下内边距，\n *   竖线只有它们高度的一部分才像「分组线」而不是「分割框」。\n * - 用固定 px 高度（约标签按钮高度的 60%）而不是百分比：\n *   `flex-wrap` 换行后每行的行高由内容决定，百分比会跟着抖。\n * - `flex: 0 0 auto` 防止它在窄面板里被压扁。\n * - 标签栏本身有 `gap: 2px`，所以左右各留 4px 即可得到 6px 的视觉间距。\n */\n.sztb-tab-sep {\n  align-self: center;\n  flex: 0 0 auto;\n  width: 1px;\n  height: 14px;\n  margin: 0 4px;\n  background: var(--sztb-border);\n}\n\n/* ---------------------------------------------------------- 内容区 */\n.sztb-body {\n  flex: 1 1 auto;\n  overflow: auto;\n  padding: 10px;\n}\n\n.sztb-pane {\n  display: none;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.sztb-pane[data-active="true"] {\n  display: flex;\n}\n\n/* ---------------------------------------------------------- 表单控件 */\n.sztb-row {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 7px 8px;\n  border-radius: 6px;\n}\n\n.sztb-row:hover {\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-row input[type="checkbox"] {\n  flex: 0 0 auto;\n  margin: 2px 0 0;\n  width: 15px;\n  height: 15px;\n  accent-color: var(--sztb-accent);\n  cursor: pointer;\n}\n\n.sztb-row-main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.sztb-row-label {\n  display: block;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.sztb-row-desc {\n  display: block;\n  color: var(--sztb-text-dim);\n  font-size: 12px;\n  margin-top: 1px;\n  word-break: break-word;\n}\n\n.sztb-risk {\n  display: inline-block;\n  margin-left: 6px;\n  padding: 0 5px;\n  border-radius: 4px;\n  font-size: 11px;\n  font-weight: 600;\n  vertical-align: 1px;\n}\n\n.sztb-risk[data-risk="trace"] {\n  background: rgba(245, 166, 35, 0.16);\n  color: #b3730a;\n}\n\n.sztb-risk[data-risk="irreversible"] {\n  background: rgba(229, 72, 77, 0.14);\n  color: var(--sztb-danger);\n}\n\n.sztb-field {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  margin-bottom: 10px;\n  padding: 0 8px;\n}\n\n.sztb-field-label {\n  font-size: 13px;\n  color: var(--sztb-text);\n}\n\n/* 配置项提示：单独一行，紧跟在标签下面（不塞进输入框里） */\n.sztb-field-desc {\n  font-size: 12px;\n  line-height: 1.45;\n  color: var(--sztb-text-dim);\n  word-break: break-word;\n}\n\n.sztb-input,\n.sztb-select {\n  width: 100%;\n  padding: 5px 8px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 6px;\n  font-size: 13px;\n  font-family: inherit;\n  color: var(--sztb-text);\n  background: var(--sztb-bg);\n  box-sizing: border-box;\n}\n\n.sztb-input:focus,\n.sztb-select:focus {\n  outline: none;\n  border-color: var(--sztb-accent);\n}\n\n/* 空值时显示的灰色默认值 */\n.sztb-input::placeholder {\n  color: var(--sztb-text-dim);\n  opacity: 0.8;\n}\n\n.sztb-select {\n  cursor: pointer;\n}\n\n/* 校验提示：校验通过时用 hidden 收起来，不占高度 */\n.sztb-field-hint {\n  font-size: 12px;\n  line-height: 1.45;\n  color: #b3730a;\n}\n\n.sztb-field-hint[hidden] {\n  display: none;\n}\n\n.sztb-field[data-invalid="true"] .sztb-input,\n.sztb-field[data-invalid="true"] .sztb-select {\n  border-color: #d9a340;\n}\n\n.sztb-btn {\n  padding: 5px 12px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 6px;\n  background: var(--sztb-bg);\n  color: var(--sztb-text);\n  font-size: 12.5px;\n  font-family: inherit;\n  cursor: pointer;\n}\n\n.sztb-btn:hover {\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-btn[data-variant="primary"] {\n  background: var(--sztb-accent);\n  border-color: var(--sztb-accent);\n  color: #fff;\n}\n\n.sztb-btn[data-variant="primary"]:hover {\n  background: var(--sztb-accent-hover);\n}\n\n.sztb-btn[data-variant="danger"] {\n  background: var(--sztb-danger);\n  border-color: var(--sztb-danger);\n  color: #fff;\n}\n\n.sztb-group-title {\n  margin: 10px 0 2px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--sztb-text-dim);\n}\n\n.sztb-group-title:first-child {\n  margin-top: 0;\n}\n\n.sztb-empty {\n  padding: 16px 8px;\n  text-align: center;\n  color: var(--sztb-text-dim);\n  font-size: 12.5px;\n}\n\n/* 段首说明文字：站点自己的设置标签页用它交代门禁规则 */\n.sztb-note {\n  margin: 0 0 8px;\n  padding: 7px 9px;\n  border-left: 2px solid var(--sztb-border);\n  border-radius: 0 5px 5px 0;\n  background: var(--sztb-bg-alt);\n  color: var(--sztb-text-dim);\n  font-size: 12px;\n  line-height: 1.6;\n}\n\n/* ---------------------------------------------------------- 日志面板 */\n.sztb-log {\n  font-family: Consolas, "Cascadia Mono", monospace;\n  font-size: 11.5px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n  word-break: break-all;\n  margin: 0;\n  flex: 1 1 auto;\n}\n\n.sztb-log-line[data-level="warn"] {\n  color: #b3730a;\n}\n\n.sztb-log-line[data-level="error"] {\n  color: var(--sztb-danger);\n}\n\n.sztb-log-line[data-level="debug"] {\n  color: var(--sztb-text-dim);\n}\n\n.sztb-toolbar {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n  align-items: center;\n}\n\n/* ---------------------------------------------------------- Toast */\n.sztb-toasts {\n  position: fixed;\n  z-index: 2147483003;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  align-items: flex-end;\n  pointer-events: none;\n}\n\n.sztb-toast {\n  max-width: 260px;\n  padding: 7px 11px;\n  border-radius: 7px;\n  background: rgba(31, 35, 41, 0.94);\n  color: #fff;\n  font-size: 12.5px;\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);\n  animation: sztb-toast-in 0.16s ease;\n  word-break: break-word;\n}\n\n.sztb-toast[data-kind="error"] {\n  background: var(--sztb-danger);\n}\n\n.sztb-toast[data-kind="warn"] {\n  background: #b3730a;\n}\n\n.sztb-toast[data-kind="success"] {\n  background: var(--sztb-ok);\n}\n\n@keyframes sztb-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n/* ---------------------------------------------------------- 确认框 */\n.sztb-modal-mask {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483002;\n  background: rgba(0, 0, 0, 0.35);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.sztb-modal {\n  width: 300px;\n  max-width: calc(100vw - 32px);\n  background: var(--sztb-bg);\n  border-radius: 10px;\n  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);\n  overflow: hidden;\n}\n\n.sztb-modal-title {\n  padding: 12px 14px 0;\n  font-weight: 600;\n  font-size: 13.5px;\n}\n\n.sztb-modal-title[data-danger="true"] {\n  color: var(--sztb-danger);\n}\n\n.sztb-modal-body {\n  padding: 8px 14px 14px;\n  font-size: 12.5px;\n  color: var(--sztb-text-dim);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.sztb-modal-foot {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  padding: 10px 14px;\n  background: var(--sztb-bg-alt);\n  border-top: 1px solid var(--sztb-border);\n}\n\n/* ------------------------------------------ 登录态失效（全屏提示） */\n/* 比确认框更重：遮罩再深一点、层级再高一点（万一确认框正开着） */\n.sztb-auth-mask {\n  z-index: 2147483003;\n  background: rgba(0, 0, 0, 0.45);\n}\n\n/* 正文比确认框长，放宽一行；窄屏仍受 max-width 约束 */\n.sztb-auth-box {\n  width: 360px;\n}\n\n/* ---------------------------------------------------------- 缩放手柄 */\n.sztb-resize {\n  position: absolute;\n  right: 0;\n  bottom: 0;\n  width: 14px;\n  height: 14px;\n  cursor: nwse-resize;\n  background: linear-gradient(\n    135deg,\n    transparent 0 50%,\n    var(--sztb-border) 50% 60%,\n    transparent 60% 72%,\n    var(--sztb-border) 72% 82%,\n    transparent 82%\n  );\n}\n\n/* ---- 监视页（UOOC【监视】标签页）：进度条 + 逐题表格 ---- */\n\n.sztb-bar {\n  height: 8px;\n  border-radius: 4px;\n  background: var(--sztb-bg-alt);\n  border: 1px solid var(--sztb-border);\n  overflow: hidden;\n}\n\n.sztb-bar-fill {\n  height: 100%;\n  background: var(--sztb-accent);\n  transition: width 0.2s ease;\n}\n\n.sztb-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12px;\n}\n\n.sztb-table th,\n.sztb-table td {\n  padding: 3px 6px;\n  border-bottom: 1px solid var(--sztb-border);\n  text-align: left;\n  vertical-align: top;\n  word-break: break-all;\n}\n\n.sztb-table th {\n  color: var(--sztb-text-dim);\n  font-weight: 600;\n  white-space: nowrap;\n}\n\n/* ---- 课程任务点分层列表（UOOC【监视】页 §E.2）---- */\n\n.sztb-tree {\n  max-height: 240px;\n  overflow-y: auto;\n  font-size: 12px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 4px;\n  padding: 2px 0;\n}\n\n.sztb-tree-row {\n  display: flex;\n  gap: 4px;\n  padding: 1px 4px;\n  line-height: 1.5;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.sztb-tree-row[data-current="true"] {\n  background: var(--sztb-bg-alt);\n  box-shadow: inset 2px 0 0 var(--sztb-accent);\n  font-weight: 600;\n}\n\n.sztb-tree-mark {\n  flex: none;\n  width: 1.1em;\n}\n\n/* ---- 提示流与接管状态（UOOC【监视】页第一块 / 右上角 Toast，用户 m02281）---- */\n\n.sztb-status-line {\n  font-size: 12.5px;\n  font-weight: 600;\n  line-height: 1.5;\n  word-break: break-word;\n}\n\n.sztb-notices {\n  max-height: 200px;\n  overflow-y: auto;\n  font-size: 12px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 4px;\n  padding: 2px 4px;\n}\n\n.sztb-notice-row {\n  display: flex;\n  gap: 5px;\n  line-height: 1.6;\n}\n\n.sztb-notice-time {\n  flex: none;\n  color: var(--sztb-text-dim);\n  font-variant-numeric: tabular-nums;\n}\n\n.sztb-notice-kind {\n  flex: none;\n  width: 1em;\n  text-align: center;\n}\n\n.sztb-notice-row[data-kind="warn"] .sztb-notice-kind {\n  color: #b3730a;\n}\n\n.sztb-notice-row[data-kind="error"] .sztb-notice-kind {\n  color: var(--sztb-danger);\n}\n\n.sztb-notice-row[data-kind="success"] .sztb-notice-kind {\n  color: var(--sztb-ok);\n}\n\n.sztb-notice-text {\n  word-break: break-word;\n}\n\n/* sticky Toast：多一个「×」，点掉才走 */\n.sztb-toast {\n  display: flex;\n  align-items: flex-start;\n  gap: 6px;\n}\n\n.sztb-toast-text {\n  flex: 1;\n}\n\n.sztb-toast-close {\n  flex: none;\n  cursor: pointer;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font-size: 14px;\n  line-height: 1;\n  padding: 0 0 0 2px;\n  opacity: 0.75;\n}\n\n.sztb-toast-close:hover {\n  opacity: 1;\n}';

  // src/common/core/log.ts
  var LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };
  var CAPACITY = 500;
  var seq = 0;
  var buffer = [];
  var minLevel = "info";
  var listeners = /* @__PURE__ */ new Set();
  function push(level, scope, message, detail) {
    const entry = { seq: seq += 1, time: Date.now(), level, scope, message, detail };
    buffer.push(entry);
    if (buffer.length > CAPACITY) buffer = buffer.slice(buffer.length - CAPACITY);
    for (const listener of [...listeners]) {
      try {
        listener(entry);
      } catch {
      }
    }
  }
  function setLevel(level) {
    minLevel = level;
  }
  function getLevel() {
    return minLevel;
  }
  function passesLevel(level) {
    return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
  }
  function entries() {
    return buffer.filter((e) => passesLevel(e.level));
  }
  function rawCount() {
    return buffer.length;
  }
  function clear() {
    buffer = [];
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function scoped(scope) {
    return {
      debug: (message, detail) => push("debug", scope, message, detail),
      info: (message, detail) => push("info", scope, message, detail),
      warn: (message, detail) => push("warn", scope, message, detail),
      error: (message, detail) => push("error", scope, message, detail)
    };
  }
  var EMPTY_TIME = "";
  function pad(n, width = 2) {
    return String(n).padStart(width, "0");
  }
  function formatTime(ms) {
    if (ms === 0) return EMPTY_TIME;
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  function formatEntry(entry) {
    const level = entry.level.toUpperCase().padEnd(5);
    const head = `${formatTime(entry.time)} ${level} [${entry.scope}] ${entry.message}`;
    if (entry.detail === void 0) return head;
    return `${head} ${safeStringify(entry.detail)}`;
  }
  function safeStringify(value) {
    if (value === void 0) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    const seen = /* @__PURE__ */ new WeakSet();
    try {
      return JSON.stringify(value, (_k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        if (typeof v === "function") return "[Function]";
        return v;
      }) ?? String(value);
    } catch {
      return "[Unserializable]";
    }
  }

  // src/common/utils/dom.ts
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    if (props.class !== void 0) {
      for (const cls of props.class.split(/\s+/)) {
        if (cls !== "") node.classList.add(cls);
      }
    }
    if (props.text !== void 0) node.textContent = props.text;
    if (props.attrs !== void 0) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v === null || v === void 0 || v === false) continue;
        node.setAttribute(k, v === true ? "" : String(v));
      }
    }
    if (props.style !== void 0) {
      for (const [k, v] of Object.entries(props.style)) {
        if (v === void 0 || v === null) continue;
        node.style.setProperty(kebab(k), String(v));
      }
    }
    if (props.data !== void 0) {
      for (const [k, v] of Object.entries(props.data)) node.dataset[k] = v;
    }
    if (props.on !== void 0) {
      for (const [k, fn] of Object.entries(props.on)) {
        if (typeof fn !== "function") continue;
        node.addEventListener(k, fn);
      }
    }
    append(node, children);
    return node;
  }
  function append(parent, children) {
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  function clear2(node) {
    while (node.firstChild !== null) node.removeChild(node.firstChild);
  }
  function kebab(prop) {
    return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  }
  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
  }
  function readyStateAllowsMount(state2) {
    return state2 === "interactive" || state2 === "complete";
  }
  function isDomReady() {
    return readyStateAllowsMount(document.readyState);
  }
  function whenDomReady(fn) {
    if (isDomReady()) {
      fn();
      return;
    }
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  // src/common/core/storage.ts
  var NS_PREFIX = "sztb:";
  function nsKey(key) {
    return key.startsWith(NS_PREFIX) ? key : NS_PREFIX + key;
  }
  var MemoryBackend = class {
    name = "memory";
    map = /* @__PURE__ */ new Map();
    get(key) {
      return this.map.get(key);
    }
    set(key, value) {
      this.map.set(key, value);
    }
    delete(key) {
      this.map.delete(key);
    }
    keys() {
      return [...this.map.keys()];
    }
  };
  var LocalStorageBackend = class {
    name = "localStorage";
    get(key) {
      const raw = localStorage.getItem(key);
      if (raw === null) return void 0;
      try {
        return JSON.parse(raw);
      } catch {
        return void 0;
      }
    }
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    delete(key) {
      localStorage.removeItem(key);
    }
    keys() {
      const out = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    }
  };
  var GmBackend = class {
    name = "GM";
    get(key) {
      return GM_getValue(key, void 0);
    }
    set(key, value) {
      GM_setValue(key, value);
    }
    delete(key) {
      GM_deleteValue(key);
    }
    keys() {
      return GM_listValues().filter((k) => k.startsWith(NS_PREFIX));
    }
  };
  function hasGmStorage() {
    const g = globalThis;
    return typeof g["GM_getValue"] === "function" && typeof g["GM_setValue"] === "function" && typeof g["GM_deleteValue"] === "function" && typeof g["GM_listValues"] === "function";
  }
  function pickBackend() {
    if (hasGmStorage()) return new GmBackend();
    if (typeof localStorage !== "undefined") return new LocalStorageBackend();
    return new MemoryBackend();
  }
  var backend = pickBackend();
  function backendName() {
    return backend.name;
  }
  function read(key, fallback) {
    const raw = backend.get(nsKey(key));
    if (raw === void 0) return fallback;
    if (typeof raw !== typeof fallback && fallback !== null) {
      return fallback;
    }
    return raw;
  }
  function write(key, value) {
    backend.set(nsKey(key), value);
  }
  function remove(key) {
    backend.delete(nsKey(key));
  }

  // src/common/ui/tab-order.ts
  var COMMON_SITE_ID = "common";
  var DEFAULT_ORDER = 1e3;
  function planTabOrder(entries2) {
    const site = [];
    const common = [];
    for (const entry of entries2) {
      (entry.siteId === COMMON_SITE_ID ? common : site).push(entry);
    }
    const siteOrdered = byOrder(site);
    const commonOrdered = byOrder(common);
    const ordered = [...siteOrdered, ...commonOrdered];
    const wantsDivider = siteOrdered.length > 0 && commonOrdered.length > 0;
    return ordered.map((entry, index) => ({
      entry,
      dividerBefore: wantsDivider && index === siteOrdered.length
    }));
  }
  function byOrder(entries2) {
    return [...entries2].sort((a, b) => orderOf(a) - orderOf(b));
  }
  function orderOf(entry) {
    return entry.tab.order ?? DEFAULT_ORDER;
  }
  function activeTabKey(scope) {
    return `ui:active-tab:${scope}`;
  }
  function pageScopeOf(entries2) {
    for (const item of planTabOrder(entries2)) {
      if (item.entry.siteId !== COMMON_SITE_ID) return item.entry.siteId;
    }
    return COMMON_SITE_ID;
  }
  function resolveActiveTab(entries2, stored) {
    const id = stored(activeTabKey(pageScopeOf(entries2)));
    if (id === null) return null;
    for (const item of planTabOrder(entries2)) {
      if (item.entry.tab.id === id) return id;
    }
    return null;
  }

  // src/common/ui/tabs.ts
  var log = scoped("ui/tabs");
  var TabView = class {
    tabbar;
    body;
    shadowRoot;
    options;
    /** tabId → { tab, pane, dispose } */
    mounted = /* @__PURE__ */ new Map();
    current = null;
    constructor(shadowRoot, options = {}) {
      this.shadowRoot = shadowRoot;
      this.options = options;
      this.tabbar = el("nav", { class: "sztb-tabbar", attrs: { role: "tablist" } });
      this.body = el("div", { class: "sztb-body" });
    }
    /**
     * 重建全部标签页。先卸载旧的（调用其 dispose），再挂新的。
     * 骨架阶段沿用「整批重建」策略 —— 标签页数量是个位数，不值得做 diff。
     *
     * 入参是「标签页 + 它归属的站点 id」而不是裸的 `TabRegistration`：
     * 分组要靠 `siteId` 区分站点组与公共组（见 ./tab-order.ts）。
     *
     * @param preferredTabId 初始选中的标签页 id（「上次停留的标签」）。
     *   **本模块不读 storage** —— 记忆的读取与写回都在 panel 里，这里只负责
     *   「优先选它；它不在本批标签集里就退回首屏第一个」。传 null / 省略即传统行为。
     */
    setTabs(entries2, ctx, preferredTabId = null) {
      this.destroyTabs();
      const planned = planTabOrder(entries2);
      for (const item of planned) {
        if (item.dividerBefore) this.tabbar.appendChild(makeSeparator());
        this.mountTab(item.entry.tab, ctx);
      }
      const first = planned[0];
      if (first !== void 0) {
        const keep = preferredTabId !== null && this.mounted.has(preferredTabId) ? preferredTabId : first.entry.tab.id;
        this.activate(keep);
      }
    }
    mountTab(tab, ctx) {
      const style = document.createElement("style");
      style.dataset["tab"] = tab.id;
      style.textContent = tab.css ?? "";
      this.shadowRoot.appendChild(style);
      const button2 = el("button", {
        class: "sztb-tab",
        text: tab.title,
        attrs: { type: "button", role: "tab", "aria-selected": "false", "data-tab": tab.id },
        on: { click: () => this.activate(tab.id) }
      });
      this.tabbar.appendChild(button2);
      const pane = el("div", { class: "sztb-pane", attrs: { role: "tabpanel" }, data: { tab: tab.id } });
      this.body.appendChild(pane);
      let dispose;
      try {
        const result = tab.mount(pane, ctx);
        if (typeof result === "function") dispose = result;
      } catch (err) {
        log.error(`标签页 ${tab.id} 挂载失败`, err);
        pane.appendChild(el("div", { class: "sztb-empty", text: `该标签页加载失败：${String(err)}` }));
      }
      this.mounted.set(tab.id, { tab, style, pane, ...dispose !== void 0 ? { dispose } : {} });
    }
    /** 切到某个标签页 */
    activate(tabId) {
      if (!this.mounted.has(tabId)) {
        log.warn(`激活了不存在的标签页 ${tabId}`);
        return;
      }
      this.current = tabId;
      for (const button2 of this.tabbar.querySelectorAll(".sztb-tab")) {
        button2.setAttribute("aria-selected", String(button2.dataset["tab"] === tabId));
      }
      for (const pane of this.body.querySelectorAll(".sztb-pane")) {
        pane.dataset["active"] = String(pane.dataset["tab"] === tabId);
      }
      this.options.onActivate?.(tabId);
    }
    activeTabId() {
      return this.current;
    }
    has(tabId) {
      return this.mounted.has(tabId);
    }
    destroyTabs() {
      for (const item of this.mounted.values()) {
        try {
          item.dispose?.();
        } catch (err) {
          log.warn(`标签页 ${item.tab.id} 卸载时抛错`, err);
        }
      }
      this.mounted.clear();
      this.current = null;
      clear2(this.tabbar);
      clear2(this.body);
      for (const style of this.shadowRoot.querySelectorAll("style[data-tab]")) style.remove();
    }
    destroy() {
      this.destroyTabs();
      this.tabbar.remove();
      this.body.remove();
    }
  };
  function makeSeparator() {
    return el("span", {
      class: "sztb-tab-sep",
      attrs: { role: "separator", "aria-orientation": "vertical" }
    });
  }

  // src/common/ui/panel-geometry.ts
  var BALL_SIZE = 44;
  var VIEWPORT_MARGIN = 8;
  var DEFAULT_SIZE = { width: 344, height: 430 };
  var MIN_SIZE = { width: 260, height: 180 };
  var HEAD_HEIGHT = 37;
  var COLLAPSE_BTN_INSET = 21;
  function isPos(v) {
    return typeof v === "object" && v !== null && typeof v.left === "number" && typeof v.top === "number";
  }
  function ballPosFromPanel(panelPos, size) {
    return {
      left: panelPos.left + size.width - COLLAPSE_BTN_INSET - BALL_SIZE / 2,
      top: panelPos.top + HEAD_HEIGHT / 2 - BALL_SIZE / 2
    };
  }
  function panelPosFromBall(ballPos, size) {
    return {
      left: ballPos.left + BALL_SIZE / 2 + COLLAPSE_BTN_INSET - size.width,
      top: ballPos.top + BALL_SIZE / 2 - HEAD_HEIGHT / 2
    };
  }
  function clampToViewport(pos, width, height, viewportWidth, viewportHeight) {
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
    return {
      left: Math.min(Math.max(pos.left, VIEWPORT_MARGIN), maxLeft),
      top: Math.min(Math.max(pos.top, VIEWPORT_MARGIN), maxTop)
    };
  }

  // src/common/ui/widgets/toast.ts
  var DEFAULT_DURATION = 2600;
  var MAX_STICKY = 3;
  var ToastStack = class {
    host;
    root;
    timers = /* @__PURE__ */ new Set();
    /** 当前还留着的 sticky 节点，按出现顺序 */
    sticky = [];
    /** @param shadowRoot 悬浮窗所在的 shadow root */
    constructor(shadowRoot) {
      this.root = el("div", { class: "sztb-toasts" });
      this.host = el("div", { class: "sztb-root" }, this.root);
      shadowRoot.appendChild(this.host);
      this.reposition();
    }
    show(message, kind = "info", options = {}) {
      const isSticky = options.sticky === true;
      const node = el("div", {
        class: "sztb-toast",
        data: { kind, sticky: isSticky ? "true" : "false" }
      });
      node.appendChild(el("span", { class: "sztb-toast-text", text: message }));
      if (isSticky) {
        const close = el("button", {
          class: "sztb-toast-close",
          text: "×",
          attrs: { type: "button", title: "关闭" }
        });
        close.addEventListener("click", () => {
          this.dismiss(node);
        });
        node.appendChild(close);
      }
      this.root.appendChild(node);
      this.reposition();
      if (isSticky) {
        this.sticky.push(node);
        while (this.sticky.length > MAX_STICKY) {
          const oldest = this.sticky[0];
          if (oldest === void 0 || oldest === node) break;
          this.dismiss(oldest);
        }
        return;
      }
      const timer3 = window.setTimeout(() => {
        this.timers.delete(timer3);
        node.remove();
        this.reposition();
      }, options.durationMs ?? DEFAULT_DURATION);
      this.timers.add(timer3);
    }
    /** 手动关掉一条（sticky 的「×」按钮走这里） */
    dismiss(node) {
      const i = this.sticky.indexOf(node);
      if (i >= 0) this.sticky.splice(i, 1);
      node.remove();
      this.reposition();
    }
    /** 跟随悬浮球/面板位置显示（简化：固定右上角，避让面板宽度） */
    reposition() {
      this.root.style.setProperty("top", "10px");
      this.root.style.setProperty("right", "10px");
    }
    destroy() {
      for (const t of this.timers) window.clearTimeout(t);
      this.timers.clear();
      this.sticky.length = 0;
      clear2(this.root);
      this.host.remove();
    }
  };

  // src/common/ui/widgets/modal.ts
  var ESC_KEY = "Escape";
  function showModalAlert(shadowRoot, options) {
    return new Promise((resolve2) => {
      const danger = options.danger === true;
      const cancelKey = options.cancelKey;
      const dedupeClass = options.dedupeClass ?? "";
      const boxClass = options.boxClass ?? "";
      if (dedupeClass !== "" && shadowRoot.querySelector(`.${dedupeClass}`) !== null) {
        resolve2(null);
        return;
      }
      let settled = false;
      const finish2 = (key) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeyDown, true);
        mask.remove();
        resolve2(key);
      };
      const onKeyDown = (ev) => {
        if (cancelKey === void 0 || ev.key !== ESC_KEY) return;
        ev.stopPropagation();
        finish2(cancelKey);
      };
      const buttons = options.actions.map(
        (action) => el("button", {
          class: "sztb-btn",
          text: action.label,
          attrs: { type: "button", "data-variant": action.variant },
          on: { click: () => finish2(action.key) }
        })
      );
      const modal = el(
        "div",
        { class: boxClass === "" ? "sztb-modal" : `sztb-modal ${boxClass}` },
        el("div", {
          class: "sztb-modal-title",
          text: options.title,
          data: { danger: String(danger) }
        }),
        el("div", { class: "sztb-modal-body", text: options.body }),
        el("div", { class: "sztb-modal-foot" }, ...buttons)
      );
      const mask = el(
        "div",
        {
          class: dedupeClass === "" ? "sztb-modal-mask" : `sztb-modal-mask ${dedupeClass}`,
          on: {
            click: (ev) => {
              if (cancelKey === void 0) return;
              if (ev.target === mask) finish2(cancelKey);
            }
          }
        },
        modal
      );
      shadowRoot.appendChild(mask);
      if (cancelKey !== void 0) document.addEventListener("keydown", onKeyDown, true);
      buttons[buttons.length - 1]?.focus();
    });
  }

  // src/common/ui/widgets/confirm.ts
  var CANCEL_KEY = "cancel";
  var OK_KEY = "ok";
  function showConfirm(shadowRoot, options) {
    const danger = options.danger === true;
    return showModalAlert(shadowRoot, {
      title: options.title,
      body: options.body,
      danger,
      cancelKey: CANCEL_KEY,
      actions: [
        { key: CANCEL_KEY, label: options.cancelText ?? "取消" },
        {
          key: OK_KEY,
          label: options.confirmText ?? (danger ? "我确认，执行" : "确定"),
          variant: danger ? "danger" : "primary"
        }
      ]
    }).then((key) => key === OK_KEY);
  }

  // src/common/ui/widgets/auth-alert.ts
  var AUTH_MASK_CLASS = "sztb-auth-mask";
  var AUTH_BOX_CLASS = "sztb-auth-box";
  var TITLE = "登录态已失效";
  var BODY = "选课站点已经把本次会话踢下线，继续抢课 / 监控不会成功。\n请刷新网页并重新登录，然后回到【任务】页点【开始抢课】继续。";
  var LATER_KEY = "later";
  var RELOAD_KEY = "reload";
  function showAuthAlert(shadowRoot) {
    void showModalAlert(shadowRoot, {
      title: TITLE,
      body: BODY,
      danger: true,
      dedupeClass: AUTH_MASK_CLASS,
      boxClass: AUTH_BOX_CLASS,
      actions: [
        { key: LATER_KEY, label: "稍后" },
        { key: RELOAD_KEY, label: "刷新网页重新登录", variant: "primary" }
      ]
    }).then((key) => {
      if (key === RELOAD_KEY) location.reload();
    });
  }

  // src/common/ui/panel.ts
  var log2 = scoped("ui/panel");
  var SIZE_KEY = "ui:size";
  var COLLAPSED_KEY = "ui:collapsed";
  var PANEL_POS_KEY = "ui:panel-pos";
  function readPos(key) {
    const raw = read(key, null);
    return isPos(raw) ? raw : null;
  }
  function defaultPanelPos() {
    return {
      left: Math.max(VIEWPORT_MARGIN, window.innerWidth - DEFAULT_SIZE.width - 16),
      top: 84
    };
  }
  function readSize() {
    const raw = read(SIZE_KEY, null);
    if (raw === null || typeof raw.width !== "number" || typeof raw.height !== "number") {
      return { ...DEFAULT_SIZE };
    }
    return raw;
  }
  function clampPosition(pos, width, height) {
    return clampToViewport(pos, width, height, window.innerWidth, window.innerHeight);
  }
  function startDrag(ev, onMove, onEnd) {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startY = ev.clientY;
    const pointerId = ev.pointerId;
    const move = (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      onMove(e.clientX - startX, e.clientY - startY, e);
    };
    const up = (e) => {
      if (e.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      onEnd();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
  }
  function createPanel(baseCss, entries2, options) {
    const host2 = el("div", { class: "sztb-host" });
    host2.style.setProperty("position", "fixed");
    host2.style.setProperty("inset", "0");
    host2.style.setProperty("width", "0");
    host2.style.setProperty("height", "0");
    host2.style.setProperty("z-index", "2147483000");
    const shadow = host2.attachShadow({ mode: "open" });
    const baseStyle = document.createElement("style");
    baseStyle.textContent = baseCss;
    shadow.appendChild(baseStyle);
    const blockKeyLeak = (ev) => {
      ev.stopPropagation();
    };
    shadow.addEventListener("keydown", blockKeyLeak);
    shadow.addEventListener("keypress", blockKeyLeak);
    const ball = el("div", {
      class: "sztb-ball",
      text: "深",
      attrs: { title: "深大人工具箱（点击展开）" }
    });
    const titleText = el("span", { class: "sztb-title" }, "深大人工具箱");
    if (options.siteName !== null) {
      titleText.appendChild(el("span", { class: "sztb-site", text: ` · ${options.siteName}` }));
    }
    const collapseBtn = el("button", {
      class: "sztb-iconbtn",
      text: "—",
      attrs: { type: "button", title: "收起为悬浮球" }
    });
    const head = el(
      "header",
      { class: "sztb-head" },
      titleText,
      collapseBtn
    );
    const tabView = new TabView(shadow, {
      // 记住「用户上次停留的标签页」需要知道本页面属于哪个 scope。
      // 这里只把 id 转交给 setTabs 装的闭包（它手上有 scope），
      // 不在这里直接读 storage —— 落盘时机对顺序很敏感，原因见 setTabs 里的注释。
      onActivate: (tabId) => {
        currentTabId = tabId;
        if (restoring) return;
        remember?.(tabId);
      }
    });
    const resizeHandle = el("div", { class: "sztb-resize", attrs: { title: "拖拽调整大小" } });
    const panelEl = el("div", { class: "sztb-panel" }, head, tabView.tabbar, tabView.body, resizeHandle);
    const root = el("div", { class: "sztb-root" }, ball, panelEl);
    shadow.appendChild(root);
    const toasts = new ToastStack(shadow);
    let restoring = false;
    let remember;
    let currentTabId = null;
    const storedCollapsed = read(COLLAPSED_KEY, null);
    let collapsed = storedCollapsed ?? false;
    let size = readSize();
    let panelPos = readPos(PANEL_POS_KEY) ?? defaultPanelPos();
    let ballPos = ballPosFromPanel(panelPos, size);
    function applyGeometry() {
      size = {
        width: Math.max(MIN_SIZE.width, size.width),
        height: Math.max(MIN_SIZE.height, size.height)
      };
      panelPos = clampPosition(panelPos, size.width, size.height);
      ballPos = clampPosition(ballPos, BALL_SIZE, BALL_SIZE);
      panelEl.style.setProperty("left", `${panelPos.left}px`);
      panelEl.style.setProperty("top", `${panelPos.top}px`);
      panelEl.style.setProperty("width", `${size.width}px`);
      panelEl.style.setProperty("height", `${size.height}px`);
      ball.style.setProperty("left", `${ballPos.left}px`);
      ball.style.setProperty("top", `${ballPos.top}px`);
      root.dataset["collapsed"] = String(collapsed);
    }
    function setCollapsed(next, persist = true) {
      if (next !== collapsed) {
        collapsed = next;
        if (persist) write(COLLAPSED_KEY, collapsed);
      }
      if (collapsed) {
        ballPos = ballPosFromPanel(panelPos, size);
      } else {
        panelPos = clampPosition(panelPosFromBall(ballPos, size), size.width, size.height);
        ballPos = ballPosFromPanel(panelPos, size);
      }
      applyGeometry();
    }
    let dragged = false;
    collapseBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setCollapsed(true);
    });
    ball.addEventListener("click", (ev) => {
      if (dragged) {
        dragged = false;
        ev.stopPropagation();
        return;
      }
      setCollapsed(false);
    });
    function makeDraggable(handle, read2, write2, sizeOf) {
      handle.addEventListener("pointerdown", (ev) => {
        const origin = read2();
        dragged = false;
        startDrag(
          ev,
          (dx, dy) => {
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragged = true;
            const { w, h } = sizeOf();
            write2(clampPosition({ left: origin.left + dx, top: origin.top + dy }, w, h));
            applyGeometry();
          },
          () => {
            if (dragged) write2(read2());
          }
        );
      });
    }
    makeDraggable(
      ball,
      () => ballPos,
      (p) => {
        ballPos = p;
      },
      () => ({ w: BALL_SIZE, h: BALL_SIZE })
    );
    makeDraggable(
      head,
      () => panelPos,
      (p) => {
        panelPos = p;
        write(PANEL_POS_KEY, p);
      },
      () => ({ w: size.width, h: size.height })
    );
    resizeHandle.addEventListener("pointerdown", (ev) => {
      const origin = { ...size };
      const startLeft = panelPos.left;
      const startTop = panelPos.top;
      startDrag(
        ev,
        (dx, dy) => {
          size = {
            width: clamp(
              origin.width + dx,
              MIN_SIZE.width,
              Math.max(MIN_SIZE.width, window.innerWidth - startLeft - VIEWPORT_MARGIN)
            ),
            height: clamp(
              origin.height + dy,
              MIN_SIZE.height,
              Math.max(MIN_SIZE.height, window.innerHeight - startTop - VIEWPORT_MARGIN)
            )
          };
          applyGeometry();
        },
        () => {
          write(SIZE_KEY, size);
        }
      );
    });
    window.addEventListener("resize", () => applyGeometry());
    const api = {
      element: host2,
      collapse: () => setCollapsed(true),
      expand: () => setCollapsed(false),
      isCollapsed: () => collapsed,
      toast: (message, kind, options2) => toasts.show(message, kind ?? "info", options2 ?? {}),
      confirm: (opts) => showConfirm(shadow, opts),
      alert: (opts) => showModalAlert(shadow, opts),
      alertAuthExpired: () => showAuthAlert(shadow),
      activateTab: (tabId) => tabView.activate(tabId),
      setTabs: (next) => {
        const siteToId = /* @__PURE__ */ new Map();
        for (const entry of next) siteToId.set(entry.tab.id, entry.siteId);
        const scope = pageScopeOf(next);
        const preferred = currentTabId ?? resolveActiveTab(next, (key) => read(key, null));
        remember = (tabId) => {
          if (!tabView.has(tabId)) return;
          write(activeTabKey(scope), tabId);
        };
        restoring = true;
        try {
          tabView.setTabs(next, makeContext(siteToId), preferred);
        } finally {
          restoring = false;
        }
      },
      destroy: () => {
        try {
          tabView.destroy();
          toasts.destroy();
        } catch (err) {
          log2.warn("销毁悬浮窗时抛错", err);
        }
        host2.remove();
      }
    };
    function makeContext(siteToId) {
      return {
        get siteId() {
          const active = tabView.activeTabId();
          return active !== null ? siteToId.get(active) ?? COMMON_SITE_ID : COMMON_SITE_ID;
        },
        host: api
      };
    }
    applyGeometry();
    api.setTabs(entries2);
    (document.documentElement ?? document.body).appendChild(host2);
    if (storedCollapsed === null) write(COLLAPSED_KEY, false);
    log2.info(
      `悬浮窗已装载：${entries2.length} 个标签页，初始${collapsed ? "折叠（沿用上次）" : "展开"}，面板=(${Math.round(panelPos.left)},${Math.round(panelPos.top)})，球=(${Math.round(ballPos.left)},${Math.round(ballPos.top)})`
    );
    return api;
  }

  // src/common/core/settings.ts
  var toggleRegistry = /* @__PURE__ */ new Map();
  function composite(siteId, toggleId) {
    return `${siteId}\0${toggleId}`;
  }
  function storageKey(siteId, toggleId) {
    return `toggle:${siteId}:${toggleId}`;
  }
  function registerToggles(siteId, siteName, defs) {
    for (const def of defs) {
      toggleRegistry.set(composite(siteId, def.id), { ...def, siteId, siteName });
    }
  }
  function togglesOf(siteId) {
    const out = [];
    for (const item of toggleRegistry.values()) {
      if (item.siteId === siteId) out.push(item);
    }
    return out.sort(compareToggle);
  }
  function compareToggle(a, b) {
    const ga = a.group ?? "";
    const gb = b.group ?? "";
    if (ga !== gb) return ga.localeCompare(gb, "zh-Hans-CN");
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  }
  function isEnabled(siteId, toggleId) {
    const def = toggleRegistry.get(composite(siteId, toggleId));
    if (def === void 0) return false;
    const stored = read(storageKey(siteId, toggleId), null);
    if (stored === null) {
      return def.risk === "irreversible" ? false : def.default;
    }
    return stored;
  }
  function setEnabled(siteId, toggleId, enabled) {
    write(storageKey(siteId, toggleId), enabled);
  }
  function needsConfirm(risk) {
    return risk === "irreversible";
  }
  function coerceInput(def, raw) {
    const text2 = raw.trim();
    if (text2 === "") return def.default;
    if (def.kind === "number" && !Number.isFinite(Number(text2))) return def.default;
    return text2;
  }
  function checkInput(def, raw) {
    const value = coerceInput(def, raw);
    if (def.kind === "select" && def.options !== void 0) {
      const ok = def.options.some((o) => o.value === String(value));
      if (!ok) return `只能选：${def.options.map((o) => o.label).join(" / ")}`;
    }
    return def.validate?.(value) ?? null;
  }
  function formatValue(value) {
    return value === null || value === void 0 ? "" : String(value);
  }
  var valueRegistry = /* @__PURE__ */ new Map();
  function registerValue(def) {
    valueRegistry.set(composite(def.siteId, def.id), def);
  }
  function valuesOf(siteId) {
    const out = [];
    for (const item of valueRegistry.values()) {
      if (item.siteId === siteId) out.push(item);
    }
    return out;
  }
  function registeredSiteIds() {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of toggleRegistry.values()) {
      if (!seen.has(item.siteId)) {
        seen.add(item.siteId);
        out.push(item.siteId);
      }
    }
    for (const item of valueRegistry.values()) {
      if (!seen.has(item.siteId)) {
        seen.add(item.siteId);
        out.push(item.siteId);
      }
    }
    return out;
  }
  function getValue(siteId, id) {
    const def = valueRegistry.get(composite(siteId, id));
    const fallback = def?.default ?? void 0;
    return read(`value:${siteId}:${id}`, fallback);
  }
  function setValue(siteId, id, value) {
    write(`value:${siteId}:${id}`, value);
    const def = valueRegistry.get(composite(siteId, id));
    try {
      def?.apply?.(value);
    } catch {
    }
  }
  function removeValue(siteId, id) {
    const key = `value:${siteId}:${id}`;
    if (read(key, void 0) === void 0) return;
    remove(key);
  }

  // src/common/ui/widgets/checkbox.ts
  var RISK_TEXT = {
    trace: "留痕",
    irreversible: "不可逆"
  };
  function createToggleRow(options) {
    const input = el("input", { attrs: { type: "checkbox", id: `sztb-${options.id}` } });
    input.checked = options.checked;
    const label = el("label", {
      class: "sztb-row-label",
      text: options.label,
      attrs: { for: `sztb-${options.id}` }
    });
    if (options.risk !== "safe") {
      label.appendChild(
        el("span", {
          class: "sztb-risk",
          text: RISK_TEXT[options.risk],
          data: { risk: options.risk }
        })
      );
    }
    const main2 = el(
      "div",
      { class: "sztb-row-main" },
      label,
      options.desc !== void 0 ? el("span", { class: "sztb-row-desc", text: options.desc }) : null
    );
    let busy = false;
    input.addEventListener("change", () => {
      const desired = input.checked;
      void (async () => {
        if (busy) {
          input.checked = !desired;
          return;
        }
        busy = true;
        try {
          if (desired && options.risk === "irreversible" && options.confirm !== void 0) {
            const ok = await options.confirm({
              title: "开启不可逆功能",
              body: `${options.label}

${options.desc ?? ""}

该功能会产生无法撤销的操作，确认开启？`.trim(),
              danger: true,
              confirmText: "我确认，开启"
            });
            if (!ok) {
              input.checked = false;
              return;
            }
          }
          await options.onChange(desired);
        } catch {
          input.checked = !desired;
        } finally {
          busy = false;
        }
      })();
    });
    return el("div", { class: "sztb-row" }, input, main2);
  }

  // src/common/ui/widgets/settings-form.ts
  function renderValueField(siteId, def) {
    const defaultText = formatValue(def.default);
    const control = def.kind === "select" ? el("select", { class: "sztb-select" }) : el("input", {
      class: "sztb-input",
      attrs: { type: def.kind, placeholder: defaultText }
    });
    if (def.kind === "select") {
      for (const opt of def.options ?? []) {
        control.appendChild(el("option", { text: opt.label, attrs: { value: opt.value } }));
      }
    }
    const hint = el("div", { class: "sztb-field-hint", attrs: { hidden: true } });
    const field = el(
      "div",
      { class: "sztb-field", data: { invalid: "false" } },
      el("label", { class: "sztb-field-label", text: def.label }),
      def.desc !== void 0 ? el("div", { class: "sztb-field-desc", text: def.desc }) : null,
      control,
      hint
    );
    function showHint(message) {
      if (message === null) {
        hint.hidden = true;
        hint.textContent = "";
        field.dataset["invalid"] = "false";
        return;
      }
      hint.hidden = false;
      hint.textContent = message;
      field.dataset["invalid"] = "true";
    }
    function commit() {
      const raw = control.value;
      const value = coerceInput(def, raw);
      setValue(siteId, def.id, value);
      control.value = formatValue(value);
      showHint(checkInput(def, raw));
    }
    const initial = formatValue(getValue(siteId, def.id));
    control.value = def.kind === "select" && initial === "" ? defaultText : initial;
    if (def.kind === "select") {
      control.addEventListener("change", commit);
    } else {
      const input = control;
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit();
      });
      input.addEventListener("input", () => showHint(null));
    }
    return field;
  }
  function renderSiteSettings(siteId, siteName, ctx, opts = {}) {
    const frag = document.createDocumentFragment();
    if (siteName !== null) {
      frag.appendChild(el("div", { class: "sztb-group-title", text: siteName }));
    }
    const only = opts.onlyGroups;
    const inPage = (group) => only === void 0 || only.includes(group ?? "");
    const toggles = togglesOf(siteId).filter((t) => inPage(t.group));
    const values = valuesOf(siteId).filter((d) => inPage(d.group));
    if (toggles.length > 0) {
      if (only === void 0) {
        frag.appendChild(el("div", { class: "sztb-group-title", text: "功能开关" }));
      }
      const byGroup = /* @__PURE__ */ new Map();
      for (const item of toggles) {
        const g = item.group ?? "";
        const arr = byGroup.get(g);
        if (arr === void 0) byGroup.set(g, [item]);
        else arr.push(item);
      }
      for (const [group, items2] of byGroup) {
        if (group !== "" && only === void 0) {
          frag.appendChild(el("div", { class: "sztb-group-title", text: group }));
        }
        for (const item of items2) {
          frag.appendChild(
            createToggleRow({
              id: `${item.siteId}-${item.id}`,
              label: item.label,
              ...item.desc !== void 0 ? { desc: item.desc } : {},
              checked: isEnabled(item.siteId, item.id),
              risk: item.risk,
              confirm: (opts2) => ctx.host.confirm(opts2),
              onChange: (checked) => {
                setEnabled(item.siteId, item.id, checked);
                ctx.host.toast(
                  `${item.label} 已${checked ? "开启" : "关闭"}${checked && needsConfirm(item.risk) ? "（不可逆功能，请谨慎使用）" : ""}`,
                  checked ? "success" : "info"
                );
              }
            })
          );
        }
      }
    }
    if (values.length > 0) {
      if (only === void 0) {
        frag.appendChild(el("div", { class: "sztb-group-title", text: "参数设置" }));
      }
      for (const def of values) frag.appendChild(renderValueField(siteId, def));
    }
    return frag;
  }
  function siteHasSettings(siteId) {
    return togglesOf(siteId).length > 0 || valuesOf(siteId).length > 0;
  }
  function emptyHint(text2) {
    return el("div", { class: "sztb-empty", text: text2 });
  }
  function movedHint(siteName) {
    return el("div", {
      class: "sztb-empty",
      text: `${siteName} 的设置已移到它自己的【设置】标签页`
    });
  }

  // src/common/ui/tabs/settings.ts
  var siteNameOf = (id) => id;
  var ownsSettingsTabOf = () => false;
  function setSiteNameResolver(fn) {
    siteNameOf = fn;
  }
  function setOwnSettingsTabResolver(fn) {
    ownsSettingsTabOf = fn;
  }
  function renderTab(root, ctx) {
    clear2(root);
    const sites = registeredSiteIds().filter((id) => siteHasSettings(id));
    if (sites.length === 0) {
      root.appendChild(emptyHint("当前没有已注册的功能开关"));
      return;
    }
    let rendered = 0;
    for (const siteId of sites) {
      const name = siteNameOf(siteId);
      if (ownsSettingsTabOf(siteId)) {
        root.appendChild(movedHint(name));
        continue;
      }
      root.appendChild(renderSiteSettings(siteId, name, ctx));
      rendered += 1;
    }
    if (rendered === 0) {
      root.appendChild(emptyHint("所有站点的设置都在它们自己的标签页里"));
    }
  }
  var settingsTab = {
    id: "common:settings",
    title: "全局设置",
    order: 10,
    mount(root, ctx) {
      renderTab(root, ctx);
    }
  };

  // src/common/utils/clipboard.ts
  var ORDER = ["gm", "exec", "modern"];
  function has(env, method) {
    if (method === "gm") return env.hasGm;
    if (method === "exec") return env.hasExec;
    if (method === "modern") return env.hasClipboard;
    return false;
  }
  function copyMethodOrder(env) {
    return ORDER.filter((m) => has(env, m));
  }
  function detectCopyEnv() {
    const g = globalThis;
    return {
      hasGm: typeof g["GM_setClipboard"] === "function",
      // http 页面上这是 undefined；访问它本身也可能抛（极少），所以整段包起来
      hasClipboard: typeof navigator !== "undefined" && navigator.clipboard !== void 0,
      hasExec: typeof document !== "undefined" && typeof document.execCommand === "function"
    };
  }
  function execCopy(text2) {
    const ta = document.createElement("textarea");
    ta.value = text2;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    const sel = typeof document.getSelection === "function" ? document.getSelection() : null;
    const saved = [];
    if (sel !== null) {
      for (let i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i).cloneRange());
    }
    let ok = false;
    try {
      ta.select();
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    if (sel !== null) {
      sel.removeAllRanges();
      for (const r of saved) sel.addRange(r);
    }
    return ok;
  }
  async function copyText(text2) {
    const methods = copyMethodOrder(detectCopyEnv());
    if (methods.length === 0) {
      return { ok: false, method: "none", detail: "当前环境没有任何可用的剪贴板写入方式" };
    }
    let last = "none";
    let detail = "";
    for (const method of methods) {
      last = method;
      try {
        if (method === "gm") {
          globalThis.GM_setClipboard(text2);
          return { ok: true, method, detail: "" };
        }
        if (method === "exec") {
          if (execCopy(text2)) return { ok: true, method, detail: "" };
          detail = "document.execCommand(copy) 返回 false";
          continue;
        }
        await navigator.clipboard.writeText(text2);
        return { ok: true, method, detail: "" };
      } catch (err) {
        detail = `${method} 失败：${String(err)}`;
      }
    }
    return { ok: false, method: last, detail };
  }

  // src/common/ui/tabs/log.ts
  var LEVELS = ["debug", "info", "warn", "error"];
  async function copyAll() {
    const text2 = entries().map(formatEntry).join("\n");
    await copyText(text2);
  }
  var tabCss = `
/*
 * 日志页必须自己就是「有确定高度的容器」，否则粘底一定失效。
 * 根因：.sztb-body 是 padding:10px 的滚动盒（style.css:188），而 .sztb-pane 默认
 * 由内容撑高（style.css:194 只写了 display/flex-direction/gap）⇒ .sztb-log-wrap 的
 * height:100% 遇到「父高度 auto」会退化成 auto，.sztb-log 永远不产生溢出、
 * scrollTop 恒为 0，真正在滚的其实是外层 .sztb-body。
 * 于是「新日志到底」这段逻辑盯的是一个根本没在滚的元素，表现为日志一直停在顶上。
 * 把 pane 钉成 body 的内容高度，滚动权就交回日志区自己（顺带把工具栏固定住）。
 */
.sztb-pane[data-tab="common:log"] { height: 100%; min-height: 0; overflow: hidden; }
.sztb-log-wrap { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; }
.sztb-log { overflow: auto; flex: 1 1 auto; }
.sztb-log-empty { padding: 20px 8px; text-align: center; color: var(--sztb-text-dim); font-size: 12.5px; }
`;
  function renderTab2(root) {
    const levelSelect = el("select", { class: "sztb-input", style: { width: "auto" } });
    for (const level of LEVELS) {
      const opt = el("option", { text: level, attrs: { value: level } });
      if (level === getLevel()) opt.selected = true;
      levelSelect.appendChild(opt);
    }
    levelSelect.addEventListener("change", () => {
      setLevel(levelSelect.value);
      repaint();
    });
    const clearBtn = el("button", {
      class: "sztb-btn",
      text: "清空",
      attrs: { type: "button" },
      on: {
        click: () => {
          clear();
          repaint();
        }
      }
    });
    const copyBtn = el("button", {
      class: "sztb-btn",
      text: "复制全文",
      attrs: { type: "button" },
      on: {
        click: () => {
          void copyAll();
        }
      }
    });
    const pre = el("div", { class: "sztb-log" });
    const emptyHint2 = el("div", { class: "sztb-log-empty" });
    const wrap = el(
      "div",
      { class: "sztb-log-wrap" },
      el("div", { class: "sztb-toolbar" }, levelSelect, clearBtn, copyBtn),
      pre,
      emptyHint2
    );
    root.appendChild(wrap);
    const AT_BOTTOM_SLACK = 8;
    let autoScroll = true;
    let lastTop = 0;
    let visible = false;
    const atBottom = () => pre.scrollTop + pre.clientHeight >= pre.scrollHeight - AT_BOTTOM_SLACK;
    pre.addEventListener("scroll", () => {
      if (pre.clientHeight === 0) return;
      lastTop = pre.scrollTop;
      autoScroll = atBottom();
    });
    function scrollToBottom() {
      pre.scrollTop = pre.scrollHeight;
    }
    function restoreScroll() {
      if (autoScroll) scrollToBottom();
      else pre.scrollTop = Math.min(lastTop, pre.scrollHeight);
    }
    const sizeObserver = new ResizeObserver(() => {
      const nowVisible = pre.clientHeight > 0;
      if (nowVisible === visible) return;
      visible = nowVisible;
      if (nowVisible) restoreScroll();
    });
    sizeObserver.observe(pre);
    function line(entry) {
      return el("div", {
        class: "sztb-log-line",
        text: formatEntry(entry),
        data: { level: entry.level }
      });
    }
    function syncEmptyHint() {
      const count = pre.childElementCount;
      pre.style.display = count === 0 ? "none" : "";
      emptyHint2.style.display = count === 0 ? "" : "none";
      if (count > 0) return;
      const buffered = rawCount();
      const shown = entries().length;
      const filtered = buffered - shown;
      emptyHint2.textContent = buffered === 0 ? "暂无日志。" : `当前没有等级 ≥ ${getLevel()} 的日志（缓冲里另有 ${filtered} 条被过滤掉了）。`;
    }
    function repaint() {
      const stick = autoScroll || atBottom();
      clear2(pre);
      for (const entry of entries()) pre.appendChild(line(entry));
      syncEmptyHint();
      if (stick) scrollToBottom();
      autoScroll = stick;
    }
    repaint();
    const off = subscribe((entry) => {
      if (!passesLevel(entry.level)) return;
      if (pre.style.display === "none") pre.style.display = "";
      emptyHint2.style.display = "none";
      pre.appendChild(line(entry));
      if (pre.childElementCount > 520) pre.firstElementChild?.remove();
      if (autoScroll) scrollToBottom();
    });
    return () => {
      sizeObserver.disconnect();
      off();
    };
  }
  var logTab = {
    id: "common:log",
    title: "日志",
    order: 90,
    css: tabCss,
    mount(root) {
      return renderTab2(root);
    }
  };

  // src/common/core/limits.ts
  var LIMITS = {
    /** 全局串行队列里相邻两条请求的**开始时刻**最小间隔 */
    intervalMs: { min: 0, max: 6e4, def: 500, recommended: 200 },
    /** 抢课重试：一轮跑完等多久再开下一轮 */
    retryIntervalMs: { min: 0, max: 6e4, def: 1500, recommended: 200 },
    /** 监控轮询间隔 */
    pollIntervalMs: { min: 0, max: 6e4, def: 1500, recommended: 200 }
  };
  function clampLimit(key, value) {
    const spec = LIMITS[key];
    let n;
    if (typeof value === "number") {
      n = value;
    } else if (typeof value === "string" && value.trim() !== "") {
      n = Number(value.trim());
    } else {
      n = Number.NaN;
    }
    if (!Number.isFinite(n)) n = spec.def;
    return Math.min(spec.max, Math.max(spec.min, n));
  }
  function isBelowRecommended(key, value) {
    return value < LIMITS[key].recommended;
  }

  // src/common/core/http.ts
  var log3 = scoped("core/http");
  var RECOMMENDED_MIN_INTERVAL_MS = LIMITS.intervalMs.recommended;
  var DEFAULT_INTERVAL_MS = LIMITS.intervalMs.def;
  var MAX_QUEUE_SIZE = 10;
  var PRIORITY = {
    /** 监控命中：抢课窗口内必须插到所有普通请求前面 */
    MONITOR_HIT: -10,
    HIGH: 0,
    NORMAL: 10
  };
  var HttpError = class extends Error {
    // 注意：这里不能用 TS 的「构造函数参数属性」语法
    // （node 的类型擦除模式不支持，测试要能直接跑源码）
    status;
    responseText;
    constructor(message, status, responseText) {
      super(message);
      this.name = "HttpError";
      this.status = status;
      this.responseText = responseText;
    }
  };
  var intervalMs = DEFAULT_INTERVAL_MS;
  var items = [];
  var seq2 = 0;
  var inflight = false;
  var timer = null;
  var nextAt = 0;
  function setIntervalMs(ms) {
    const clamped = clampLimit("intervalMs", ms);
    if (clamped !== ms) {
      log3.warn(`请求间隔 ${ms} 超出可接受范围，已夹到 ${clamped}ms`);
    }
    if (isBelowRecommended("intervalMs", clamped)) {
      log3.warn(
        `请求间隔 ${clamped}ms 低于建议下限 ${RECOMMENDED_MIN_INTERVAL_MS}ms；校园站对高频请求零容忍，实测会被直接终止会话，请自行确认风险`
      );
    }
    intervalMs = clamped;
  }
  function getIntervalMs() {
    return intervalMs;
  }
  function queueDepth() {
    return items.length;
  }
  function schedule() {
    if (timer !== null || inflight) return;
    if (items.length === 0) return;
    const delay = Math.max(0, nextAt - Date.now());
    timer = setTimeout(() => {
      timer = null;
      runOne();
    }, delay);
  }
  function runOne() {
    if (inflight || items.length === 0) return;
    let idx = 0;
    for (let i = 1; i < items.length; i += 1) {
      const a = items[i];
      const b = items[idx];
      if (a.priority < b.priority || a.priority === b.priority && a.seq < b.seq) idx = i;
    }
    const item = items.splice(idx, 1)[0];
    inflight = true;
    nextAt = Date.now() + intervalMs;
    Promise.resolve().then(() => item.task()).then(
      (value) => item.resolve(value),
      (err) => item.reject(err)
    ).then(() => {
      inflight = false;
      schedule();
    });
  }
  function enqueue(task, priority) {
    if (items.length >= MAX_QUEUE_SIZE) {
      return Promise.reject(new Error(`请求队列已满（上限 ${MAX_QUEUE_SIZE}），本条已丢弃`));
    }
    return new Promise((resolve2, reject) => {
      items.push({
        task,
        priority: typeof priority === "number" && Number.isFinite(priority) ? priority : PRIORITY.NORMAL,
        seq: seq2++,
        resolve: resolve2,
        reject
      });
      schedule();
    });
  }
  function toBody(data) {
    if (data === void 0) return void 0;
    if (typeof data === "string") return data;
    if (data instanceof URLSearchParams) return data.toString();
    return JSON.stringify(data);
  }
  function resolveFetch() {
    const g = globalThis;
    const uw = g["unsafeWindow"];
    if (uw !== null && typeof uw === "object") {
      const f = uw["fetch"];
      if (typeof f === "function") return { fn: f, owner: uw };
    }
    if (typeof fetch === "function") return { fn: fetch, owner: globalThis };
    return null;
  }
  async function viaFetch(req, body) {
    const target = resolveFetch();
    if (target === null) throw new Error("当前环境没有可用的 fetch");
    const init = {
      method: req.method ?? "GET",
      // 页面 fetch 的默认 credentials 是 same-origin，这里显式写出来，
      // 免得将来有人把出口挪到别的上下文时 cookie 静默丢失。
      credentials: "include",
      ...req.headers !== void 0 ? { headers: req.headers } : {},
      ...body !== void 0 ? { body } : {},
      // 标记「本脚本发出」：响应接管（sites/bkxk/hijack）据此跳过我们自己的请求，
      // 只接管站点自己发出的那些。**改这里要同步改 hijack。**
      __szuSkip: true
    };
    const res = await target.fn.call(target.owner, req.url, init);
    const text2 = await res.text();
    return { status: res.status, statusText: res.statusText, text: text2, finalUrl: res.url };
  }
  function resolveGm() {
    const g = globalThis;
    const fn = g["GM_xmlhttpRequest"];
    return typeof fn === "function" ? fn : null;
  }
  function viaGm(req, body) {
    const gm = resolveGm();
    if (gm === null) {
      return Promise.reject(new Error("GM_xmlhttpRequest 不可用：油猴清单里缺少 @grant GM_xmlhttpRequest"));
    }
    return new Promise((resolve2, reject) => {
      const handle = gm({
        method: req.method ?? "GET",
        url: req.url,
        ...req.headers !== void 0 ? { headers: req.headers } : {},
        ...body !== void 0 ? { data: body } : {},
        ...req.timeoutMs !== void 0 ? { timeout: req.timeoutMs } : {},
        onload: (r) => {
          resolve2({
            status: r.status,
            statusText: r.statusText,
            text: r.responseText ?? "",
            finalUrl: r.finalUrl ?? req.url
          });
        },
        onerror: () => reject(new Error("GM_xmlhttpRequest 网络错误")),
        ontimeout: () => reject(new Error("GM_xmlhttpRequest 超时"))
      });
      if (handle === void 0) log3.debug("GM_xmlhttpRequest 未返回句柄，abort 不可用");
    });
  }
  async function request(req) {
    const body = toBody(req.data);
    const started = Date.now();
    const send = req.channel === "gm" ? () => viaGm(req, body) : () => viaFetch(req, body);
    const raw = await enqueue(send, req.priority);
    const elapsedMs = Date.now() - started;
    let json = null;
    if (req.responseType === "json") {
      try {
        json = JSON.parse(raw.text);
      } catch {
        log3.error(`期望 JSON 但解析失败 ${req.method ?? "GET"} ${safePath(req.url)} → ${raw.status}`);
        throw new HttpError("响应不是合法 JSON", raw.status, raw.text);
      }
    }
    const via = req.channel === "gm" ? " [gm]" : "";
    log3.debug(
      `${req.method ?? "GET"}${via} ${safePath(req.url)} → ${raw.status} (${elapsedMs}ms, ${raw.text.length}B)`
    );
    return { ...raw, elapsedMs, json };
  }
  function safePath(url) {
    try {
      const u = new URL(url);
      return `${u.pathname}${u.hash}`;
    } catch {
      return url.split("?")[0] ?? url;
    }
  }
  function qs(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === void 0 || v === null) continue;
      sp.set(k, String(v));
    }
    return sp.toString();
  }

  // src/common/ui/tabs/status.ts
  var provider = null;
  function setStatusProvider(fn) {
    provider = fn;
  }
  function row(label, value) {
    return el(
      "div",
      { class: "sztb-row" },
      el(
        "div",
        { class: "sztb-row-main" },
        el("span", { class: "sztb-row-label", text: label }),
        el("span", { class: "sztb-row-desc", text: value })
      )
    );
  }
  function renderTab3(root) {
    function repaint() {
      clear2(root);
      const info = provider?.() ?? null;
      if (info === null) {
        root.appendChild(el("div", { class: "sztb-empty", text: "状态信息尚未注入" }));
        return;
      }
      root.appendChild(el("div", { class: "sztb-group-title", text: "本页" }));
      root.appendChild(row("URL", info.href));
      root.appendChild(row("站点分派", info.resolution));
      root.appendChild(row("命中适配器", info.adapterId ?? "（无，仅公共标签页）"));
      root.appendChild(row("是否注入", info.inject ? "是" : "否"));
      root.appendChild(row("自动展开", info.autoExpand ? "是" : "否"));
      root.appendChild(row("标签页数量", String(info.tabCount)));
      root.appendChild(el("div", { class: "sztb-group-title", text: "已注册站点" }));
      root.appendChild(
        row(
          "适配器",
          info.registeredAdapters.length > 0 ? info.registeredAdapters.join("、") : "（无）"
        )
      );
      root.appendChild(el("div", { class: "sztb-group-title", text: "运行环境" }));
      root.appendChild(row("脚本版本", info.version));
      root.appendChild(row("构建时间", info.buildTime ?? "（开发模式，未注入）"));
      root.appendChild(row("存储后端", backendName()));
      root.appendChild(row("GM 存储可用", hasGmStorage() ? "是" : "否（已降级）"));
      root.appendChild(
        row("请求间隔", `${getIntervalMs()}ms（建议不低于 ${RECOMMENDED_MIN_INTERVAL_MS}ms）`)
      );
      root.appendChild(row("队列排队中", String(queueDepth())));
      root.appendChild(row("日志等级", getLevel()));
      const refresh = el("button", {
        class: "sztb-btn",
        text: "刷新",
        attrs: { type: "button" },
        on: { click: repaint }
      });
      root.appendChild(refresh);
    }
    repaint();
    const timer3 = window.setInterval(repaint, 2e3);
    return () => window.clearInterval(timer3);
  }
  var statusTab = {
    id: "common:status",
    title: "状态",
    order: 95,
    mount(root) {
      return renderTab3(root);
    }
  };

  // src/common/ui/tabs/login.ts
  var providers = /* @__PURE__ */ new Map();
  var currentSite = () => null;
  function setCurrentSiteResolver(fn) {
    currentSite = fn;
  }
  function maskValue(value) {
    const chars = [...value];
    if (chars.length <= 2) return "•".repeat(chars.length);
    if (chars.length <= 6) return `${chars[0]}${"•".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
    return `${chars.slice(0, 2).join("")}${"•".repeat(4)}${chars.slice(-2).join("")}`;
  }
  function row2(label, value) {
    return el(
      "div",
      { class: "sztb-row" },
      el(
        "div",
        { class: "sztb-row-main" },
        el("span", { class: "sztb-row-label", text: label }),
        el("span", { class: "sztb-row-desc", text: value })
      )
    );
  }
  function renderState(root, state2) {
    const badge = state2.loggedIn === true ? "已登录" : state2.loggedIn === false ? "未登录" : "未知（尚不支持该站点）";
    root.appendChild(el("div", { class: "sztb-group-title", text: `状态：${badge}` }));
    if (state2.source !== void 0) root.appendChild(row2("探测手段", state2.source));
    for (const f of state2.fields ?? []) {
      root.appendChild(row2(f.label, f.secret === true ? maskValue(f.value) : f.value));
    }
    if (state2.error !== void 0) root.appendChild(row2("失败原因", state2.error));
  }
  function renderTab4(root) {
    let seq4 = 0;
    let disposed = false;
    async function repaint() {
      const mine = ++seq4;
      clear2(root);
      const siteId = currentSite();
      if (siteId === null) {
        root.appendChild(
          el("div", {
            class: "sztb-empty",
            text: "当前页面未命中任何站点适配器，没有登录态可探测。"
          })
        );
        return;
      }
      const provider2 = providers.get(siteId);
      if (provider2 === void 0) {
        root.appendChild(
          el("div", {
            class: "sztb-empty",
            text: `站点「${siteId}」尚未提供登录态探测器。
登录态形态依赖站点接口（UOOC 需抓包确认，见需求文档 Q-M），将在该站点适配器落地时接入。`
          })
        );
        return;
      }
      root.appendChild(el("div", { class: "sztb-empty", text: "探测中…" }));
      try {
        const state2 = await provider2();
        if (disposed || mine !== seq4) return;
        clear2(root);
        renderState(root, state2);
      } catch (err) {
        if (disposed || mine !== seq4) return;
        clear2(root);
        renderState(root, { loggedIn: "unknown", error: String(err) });
      }
    }
    void repaint();
    const refresh = el("button", {
      class: "sztb-btn",
      text: "重新探测",
      attrs: { type: "button" },
      on: { click: () => void repaint() }
    });
    root.appendChild(refresh);
    return () => {
      disposed = true;
    };
  }
  var loginTab = {
    id: "common:login",
    title: "登录态",
    order: 92,
    mount(root) {
      return renderTab4(root);
    }
  };

  // src/common/utils/url.ts
  function compileGlob(pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`);
  }
  var globCache = /* @__PURE__ */ new Map();
  function globMatch(pattern, value) {
    let re = globCache.get(pattern);
    if (re === void 0) {
      re = compileGlob(pattern);
      globCache.set(pattern, re);
    }
    return re.test(value);
  }
  function matchHost(host2, pattern) {
    return globMatch(pattern.toLowerCase(), host2.toLowerCase());
  }
  function matchPage(url, pattern) {
    const target = `${url.pathname}${url.search}${url.hash}`;
    return globMatch(pattern, target);
  }
  function matchAnyHost(host2, patterns) {
    return patterns.some((p) => matchHost(host2, p));
  }
  function matchAnyPage(url, patterns) {
    return patterns.some((p) => matchPage(url, p));
  }
  function isUnderDomain(host2, root) {
    const h = host2.toLowerCase();
    const r = root.toLowerCase();
    return h === r || h.endsWith(`.${r}`);
  }

  // src/sites/registry.ts
  var SUPPORTED_ROOT_DOMAINS = ["szu.edu.cn"];
  var DEBUG_HASH_FLAG = "sztb-demo";
  var adapters = [];
  function registerAdapter(adapter) {
    const existing = adapters.findIndex((a) => a.id === adapter.id);
    if (existing >= 0) {
      adapters[existing] = adapter;
      return;
    }
    adapters.push(adapter);
  }
  function allAdapters() {
    return adapters;
  }
  function getAdapter(id) {
    return adapters.find((a) => a.id === id);
  }
  function settingsTabId(siteId) {
    return `${siteId}:settings`;
  }
  function hasOwnSettingsTab(siteId) {
    const adapter = getAdapter(siteId);
    if (adapter === void 0) return false;
    if (adapter.settingsInOwnTabs === true) return true;
    return adapter.tabs.some((t) => t.id === settingsTabId(siteId));
  }
  var NOT_INJECT = { inject: false, adapter: null, autoExpand: false, reason: "none" };
  function resolve(url, registry = adapters) {
    const debugForced = url.hash.includes(DEBUG_HASH_FLAG);
    for (const adapter of registry) {
      if (matchAnyHost(url.hostname, adapter.hosts)) {
        return {
          inject: true,
          adapter,
          autoExpand: isFeaturePage(url, adapter),
          reason: "adapter"
        };
      }
    }
    if (debugForced) {
      const demo = registry.find((a) => a.id === "demo");
      if (demo !== void 0) {
        return { inject: true, adapter: demo, autoExpand: true, reason: "debug-flag" };
      }
    }
    if (SUPPORTED_ROOT_DOMAINS.some((root) => isUnderDomain(url.hostname, root))) {
      return { inject: true, adapter: null, autoExpand: false, reason: "root-domain" };
    }
    return NOT_INJECT;
  }
  function isFeaturePage(url, adapter) {
    if (adapter.pages.length === 0) return true;
    return matchAnyPage(url, adapter.pages);
  }

  // src/sites/demo/index.ts
  var log4 = scoped("site/demo");
  var demoCss = `
.demo-box { display: flex; flex-direction: column; gap: 8px; }
.demo-hint { color: var(--sztb-text-dim); font-size: 12px; }
`;
  function button(label, onClick, variant) {
    return el("button", {
      class: "sztb-btn",
      text: label,
      attrs: { type: "button", ...variant !== void 0 ? { "data-variant": variant } : {} },
      on: {
        click: () => {
          void onClick();
        }
      }
    });
  }
  var demoTab = {
    id: "demo:playground",
    title: "演示",
    order: 100,
    css: demoCss,
    mount(root, ctx) {
      const box2 = el(
        "div",
        { class: "demo-box" },
        el("div", {
          class: "demo-hint",
          text: "这个标签页只在本机测试时出现，用来验证框架各部件是否正常。"
        }),
        button("弹一条 Toast", () => ctx.host.toast("这是一条测试提示", "success")),
        button("弹二次确认（危险）", async () => {
          const ok = await ctx.host.confirm({
            title: "危险操作确认",
            body: "这是演示用的二次确认框。\n确认后会弹一条 Toast。",
            danger: true
          });
          ctx.host.toast(ok ? "你点了确认" : "你取消了", ok ? "warn" : "info");
        }),
        button("写一条日志", () => {
          log4.info("来自演示标签页的日志", { siteId: ctx.siteId, queue: queueDepth() });
          ctx.host.toast("已写入日志，切到「日志」标签页查看");
        }),
        button("排一个请求（走限流队列）", async () => {
          ctx.host.toast(`请求已入队（间隔 ${getIntervalMs()}ms）`);
          try {
            const res = await request({ url: `${location.origin}/?_sztb_probe=${Date.now()}`, method: "GET" });
            log4.info(`探测请求返回 ${res.status}`, { elapsedMs: res.elapsedMs });
            ctx.host.toast(`返回 ${res.status}，耗时 ${res.elapsedMs}ms`, "success");
          } catch (err) {
            log4.warn("探测请求失败", err);
            ctx.host.toast("请求失败，详见日志", "error");
          }
        }),
        button("折叠悬浮窗", () => ctx.host.collapse())
      );
      root.appendChild(box2);
    }
  };
  var demoAdapter = {
    id: "demo",
    name: "演示站点",
    hosts: ["localhost", "127.0.0.1", "*.localhost"],
    pages: ["*"],
    tabs: [demoTab],
    toggles: [
      {
        id: "demo-safe",
        label: "只读示例开关",
        desc: "🟢 只读类，任何时候都能勾。",
        risk: "safe",
        default: true,
        group: "演示"
      },
      {
        id: "demo-trace",
        label: "留痕示例开关",
        desc: "🟠 会在站点留下访问记录，默认关闭。",
        risk: "trace",
        default: true,
        group: "演示"
      },
      {
        id: "demo-irreversible",
        label: "不可逆示例开关",
        desc: "🔴 勾选后会弹二次确认（提交类操作的门禁演示）。",
        risk: "irreversible",
        default: true,
        group: "演示"
      }
    ],
    init(ctx) {
      log4.info(`演示适配器已启用：isFeaturePage=${String(ctx.isFeaturePage)}`);
    }
  };

  // src/common/utils/page.ts
  function pageWindow() {
    const g = globalThis;
    const uw = g["unsafeWindow"];
    return uw !== null && typeof uw === "object" ? uw : null;
  }
  function pageOrSelf() {
    return pageWindow() ?? globalThis;
  }
  function pageSessionStorage() {
    try {
      const ps = pageOrSelf()["sessionStorage"];
      if (ps !== null && typeof ps === "object") return ps;
    } catch {
    }
    try {
      return typeof sessionStorage === "undefined" ? null : sessionStorage;
    } catch {
      return null;
    }
  }

  // src/sites/uooc/intercept.ts
  var log5 = scoped("uooc/intercept");
  function matchLearnApi(rawUrl) {
    const path = rawUrl.split("#")[0] ?? "";
    if (path.includes("/home/learn/getCatalogList")) {
      const m = /[?&]cid=(\d+)/.exec(path);
      if (m !== null && m[1] !== void 0) return { kind: "catalog", cid: m[1] };
      return null;
    }
    if (path.includes("/home/learn/getUnitLearn")) {
      const m = /[?&]catalog_id=(\d+)/.exec(path);
      if (m !== null && m[1] !== void 0) return { kind: "unit", catalogId: m[1] };
      return null;
    }
    return null;
  }
  function isCommitHttpOk(result) {
    return result.httpStatus === 0 || result.httpStatus === 200;
  }
  function matchCommitApi(rawUrl) {
    return (rawUrl.split("#")[0] ?? "").includes("/exam/commit");
  }
  function asRecord(v) {
    return v !== null && typeof v === "object" ? v : {};
  }
  function pickString(o, key) {
    const v = o[key];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return "";
  }
  function readCommit(body, httpStatus = 0) {
    const top = asRecord(body);
    const data = asRecord(top["data"]);
    const rawList = asRecord(data["score_list"]);
    const scoreList = {};
    for (const [k, v] of Object.entries(rawList)) scoreList[k] = typeof v === "string" ? v : String(v);
    const code = typeof top["code"] === "number" ? top["code"] : Number(pickString(top, "code"));
    return {
      verdict: code === 1 ? "pass" : code === 110 ? "fail" : "unknown",
      score: pickString(data, "score"),
      passScore: pickString(data, "pass_score"),
      scoreList,
      message: pickString(top, "msg"),
      httpStatus,
      raw: body
    };
  }
  var lastCatalog = null;
  var unitBodies = /* @__PURE__ */ new Map();
  var lastCommit = null;
  var commitWaiters = [];
  var catalogWaiters = [];
  var unitWaiters = /* @__PURE__ */ new Map();
  function primeCatalog(cid, body) {
    lastCatalog = { cid, body };
    const pending = catalogWaiters;
    catalogWaiters = [];
    for (const w of pending) {
      if (w.cid === cid) w.fn(body);
      else catalogWaiters.push(w);
    }
  }
  function primeUnitLearn(catalogId, body) {
    unitBodies.set(catalogId, body);
    const pending = unitWaiters.get(catalogId);
    if (pending === void 0) return;
    unitWaiters.delete(catalogId);
    for (const fn of pending) fn(body);
  }
  function primeCommit(body, httpStatus = 0) {
    const result = readCommit(body, httpStatus);
    lastCommit = result;
    const pending = commitWaiters;
    commitWaiters = [];
    for (const fn of pending) fn(result);
    return result;
  }
  function clearCommit() {
    lastCommit = null;
  }
  function waitCommit(timeoutMs) {
    if (lastCommit !== null) return Promise.resolve(lastCommit);
    return new Promise((resolve2) => {
      let done = false;
      const finish2 = (v) => {
        if (done) return;
        done = true;
        resolve2(v);
      };
      commitWaiters.push(finish2);
      setTimeout(() => finish2(null), timeoutMs);
    });
  }
  function dispatch(rawUrl, text2, httpStatus = 0) {
    const isCommit = matchCommitApi(rawUrl);
    const api = isCommit ? null : matchLearnApi(rawUrl);
    if (!isCommit && api === null) return;
    let body;
    try {
      body = JSON.parse(text2);
    } catch {
      log5.warn("截获到的响应不是 JSON，已忽略", rawUrl);
      return;
    }
    if (isCommit) {
      const result = primeCommit(body, httpStatus);
      log5.debug("截获交卷响应", `${result.verdict} / HTTP ${httpStatus} / 得分 ${result.score}`);
    } else if (api !== null && api.kind === "catalog") {
      log5.debug("截获 getCatalogList", api.cid);
      primeCatalog(api.cid, body);
    } else if (api !== null) {
      log5.debug("截获 getUnitLearn", api.catalogId);
      primeUnitLearn(api.catalogId, body);
    }
  }
  function shouldSniff(rawUrl) {
    return matchLearnApi(rawUrl) !== null || matchCommitApi(rawUrl);
  }
  var XHR_URL_KEY = "__szuUoocUrl";
  var XHR_MARK = "__szuUoocInstalled";
  function installXhr(realm) {
    const XHR = realm["XMLHttpRequest"];
    if (typeof XHR !== "function") return false;
    const proto = XHR.prototype;
    if (proto[XHR_MARK] === true) return false;
    const origOpen = proto["open"];
    const origSend = proto["send"];
    if (typeof origOpen !== "function" || typeof origSend !== "function") return false;
    proto["open"] = function(method, url, ...rest) {
      this[XHR_URL_KEY] = typeof url === "string" ? url : String(url ?? "");
      return origOpen.call(this, method, url, ...rest);
    };
    proto["send"] = function(...args) {
      const url = this[XHR_URL_KEY];
      if (typeof url === "string" && shouldSniff(url)) {
        const self = this;
        self["addEventListener"].call(self, "load", () => {
          try {
            const text2 = self["responseText"];
            if (typeof text2 === "string") {
              const st = Number(self["status"]);
              dispatch(url, text2, Number.isFinite(st) ? st : 0);
            }
          } catch {
          }
        });
      }
      return origSend.apply(this, args);
    };
    Object.defineProperty(proto, XHR_MARK, { value: true, enumerable: false, configurable: true });
    log5.debug("XMLHttpRequest 只读嗅探已装");
    return true;
  }
  var FETCH_MARK = "__szuUoocFetchInstalled";
  function installFetch(realm) {
    const origFetch = realm["fetch"];
    if (typeof origFetch !== "function") return false;
    if (realm[FETCH_MARK] === true) return false;
    const patched = function(input, init) {
      const p = origFetch.call(this, input, init);
      if (init !== void 0 && init["__szuSkip"] === true) return p;
      let url = "";
      try {
        if (typeof input === "string") url = input;
        else if (input !== null && typeof input === "object") url = String(input.url ?? "");
      } catch {
      }
      if (url === "" || !shouldSniff(url)) return p;
      p.then((res) => {
        try {
          const st = Number(res.status);
          res.clone().text().then((text2) => dispatch(url, text2, Number.isFinite(st) ? st : 0)).catch(() => void 0);
        } catch {
        }
      }).catch(() => void 0);
      return p;
    };
    realm["fetch"] = patched;
    Object.defineProperty(realm, FETCH_MARK, { value: true, enumerable: false, configurable: true });
    log5.debug("fetch 只读嗅探已装");
    return true;
  }
  function installUoocIntercept(realm = pageOrSelf()) {
    const a = installXhr(realm);
    const b = installFetch(realm);
    return a || b;
  }
  function installUoocInterceptInFrames(doc = document) {
    let n = 0;
    let frames;
    try {
      frames = Array.from(doc.querySelectorAll("iframe"));
    } catch {
      return 0;
    }
    for (const f of frames) {
      try {
        const w = f.contentWindow;
        if (w === null) continue;
        const a = installXhr(w);
        const b = installFetch(w);
        if (a || b) n += 1;
      } catch {
      }
    }
    if (n > 0) log5.debug(`已给 ${n} 个 iframe 补装嗅探`);
    return n;
  }

  // src/sites/uooc/ai/fill.ts
  function isElement(node) {
    return node !== null && node !== void 0 && node.nodeType === 1;
  }
  function asElement(node) {
    return isElement(node) ? node : null;
  }
  function asInput(node) {
    return isElement(node) && node.tagName === "INPUT" ? node : null;
  }
  function isVisible(el2) {
    const he = el2;
    if (typeof he.getBoundingClientRect !== "function") return true;
    const r = he.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
    return he.offsetParent !== null;
  }
  function clickOption(input) {
    const attempts = [
      input,
      input.closest("label"),
      input.parentElement?.querySelector(".ti-a-i") ?? null,
      input.parentElement
    ];
    for (const el2 of attempts) {
      if (el2 === null) continue;
      if (el2 !== input && !isVisible(el2)) continue;
      try {
        el2.click();
        return true;
      } catch {
      }
    }
    try {
      input.click();
      return true;
    } catch {
      return false;
    }
  }
  function collectRoots(top = document) {
    const roots = [top];
    const frames = top.querySelectorAll("iframe, frame");
    for (const f of frames) {
      const el2 = f;
      try {
        const doc = el2.contentDocument;
        if (doc !== null && doc !== void 0) roots.push(doc);
      } catch {
      }
    }
    return roots;
  }
  function inputsFor(roots, qid) {
    const out = [];
    for (const doc of roots) {
      let list2;
      try {
        list2 = doc.querySelectorAll(`input[name="${CSS.escape(qid)}"]`);
      } catch {
        list2 = doc.querySelectorAll(`input[name="${qid}"]`);
      }
      for (const el2 of list2) {
        const input = asInput(el2);
        if (input !== null) out.push(input);
      }
    }
    return out;
  }
  function fillAnswers(targets) {
    const filled = [];
    const missing = [];
    const failed = [];
    const roots = collectRoots();
    for (const t of targets) {
      if (t.letters.length === 0) {
        missing.push(t.qid);
        continue;
      }
      const inputs = inputsFor(roots, t.qid);
      if (inputs.length === 0) {
        missing.push(t.qid);
        continue;
      }
      let allOk = true;
      for (const letter of t.letters) {
        const target = inputs.find((el2) => (el2.value ?? "").toUpperCase() === letter);
        if (target === void 0) {
          allOk = false;
          continue;
        }
        if (target.checked) continue;
        if (!clickOption(target)) allOk = false;
      }
      const okNow = t.letters.every((letter) => {
        const el2 = inputs.find((i) => (i.value ?? "").toUpperCase() === letter);
        return el2 !== void 0 && el2.checked;
      });
      if (okNow) filled.push(t.qid);
      else if (allOk) failed.push(t.qid);
      else failed.push(t.qid);
    }
    return { filled, missing, failed };
  }
  var SUBMIT_SELECTORS = ["button.btn.btn-danger"];
  function findSubmitButton(top = document) {
    for (const selector of SUBMIT_SELECTORS) {
      for (const doc of collectRoots(top)) {
        const el2 = doc.querySelector(selector);
        const he = asElement(el2);
        if (he !== null) return he;
      }
    }
    return null;
  }
  function isAnsweredInDom(qid, top = document) {
    for (const el2 of inputsFor(collectRoots(top), qid)) {
      if (el2.checked) return true;
    }
    return false;
  }
  function ngModelOf(el2) {
    const win = el2.ownerDocument?.defaultView;
    const angular = win?.angular ?? null;
    if (angular === null || typeof angular.element !== "function") return null;
    try {
      const ctrl = angular.element(el2).controller?.("ngModel");
      return ctrl ?? null;
    } catch {
      return null;
    }
  }
  function emptyValueFor(kind) {
    if (kind === "multi") return [];
    if (kind === "blank" || kind === "other") return "";
    return void 0;
  }
  function clearQuestion(qid, kind, top = document) {
    const inputs = inputsFor(collectRoots(top), qid);
    if (inputs.length === 0) return "missing";
    const empty = emptyValueFor(kind);
    let viaModel = false;
    for (const el2 of inputs) {
      const ctrl = ngModelOf(el2);
      if (ctrl === null || typeof ctrl.$setViewValue !== "function") continue;
      try {
        ctrl.$setViewValue(empty);
        ctrl.$render?.();
        viaModel = true;
      } catch {
      }
    }
    if (viaModel) return "ngModel";
    for (const el2 of inputs) {
      try {
        el2.checked = false;
        el2.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
      }
    }
    return "dom";
  }
  function findQuestionAnchors(top = document) {
    const out = [];
    for (const doc of collectRoots(top)) {
      let list2;
      try {
        list2 = Array.from(doc.querySelectorAll("div.queContainer"));
      } catch {
        continue;
      }
      for (const c of list2) {
        const container = asElement(c);
        if (container === null) continue;
        const indexEl = asElement(container.querySelector("div.index"));
        if (indexEl === null) continue;
        const input = container.querySelector("input[name]");
        out.push({
          label: (indexEl.textContent ?? "").trim(),
          indexEl,
          container,
          qid: input?.getAttribute("name") ?? null
        });
      }
    }
    return out;
  }
  var PAPER_TITLE_SELECTORS = [
    "div.paperTitle",
    "div.paper-title",
    "div.examTitle",
    "h1.paperTitle",
    "h3.paperTitle"
  ];
  function findPaperTitleAnchor(top) {
    for (const doc of collectRoots(top)) {
      for (const sel of PAPER_TITLE_SELECTORS) {
        let el2 = null;
        try {
          el2 = doc.querySelector(sel);
        } catch {
          continue;
        }
        const he = asElement(el2);
        if (he !== null && isVisible(he)) return he;
      }
    }
    const first = findQuestionAnchors(top)[0];
    return first?.container.parentElement ?? null;
  }
  var CLEAR_MARK = "data-sztb-uooc-clear";
  var CLEAR_BTN_STYLE = "margin:0 6px 0 0;padding:1px 8px;font-size:12px;line-height:18px;border:1px solid #d9d9d9;border-radius:3px;background:#fff;color:#c0392b;cursor:pointer;vertical-align:middle;";
  function makeClearButton(text2, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text2;
    btn.title = title;
    btn.setAttribute("style", CLEAR_BTN_STYLE);
    btn.setAttribute(CLEAR_MARK, "one");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return btn;
  }
  function removeClearButtons(top) {
    for (const doc of collectRoots(top)) {
      let list2;
      try {
        list2 = Array.from(doc.querySelectorAll(`[${CLEAR_MARK}]`));
      } catch {
        continue;
      }
      for (const el2 of list2) el2.remove();
    }
  }
  function injectClearButtons(opts) {
    const top = opts.top ?? document;
    return {
      refresh(answered) {
        removeClearButtons(top);
        if (opts.disabled === true) return 0;
        let count = 0;
        for (const a of findQuestionAnchors(top)) {
          const qid = a.qid;
          if (qid === null) continue;
          if (!answered.has(qid)) continue;
          const btn = makeClearButton("清除答案", `清空第 ${a.label} 题的答案`, () => {
            opts.onClearOne(qid);
          });
          try {
            a.indexEl.parentElement?.insertBefore(btn, a.indexEl);
            count++;
          } catch {
          }
        }
        const title = findPaperTitleAnchor(top);
        if (title !== null) {
          const btn = makeClearButton("清除全部答案", "清空整张卷子的答案", () => {
            opts.onClearAll();
          });
          try {
            title.insertAdjacentElement("afterend", btn);
            count++;
          } catch {
          }
        }
        return count;
      },
      remove() {
        removeClearButtons(top);
      }
    };
  }

  // src/sites/uooc/ai/llm.ts
  function chatUrl(baseUrl) {
    const base = baseUrl.trim().replace(/\/+$/, "");
    if (base === "") return "";
    if (/\/chat\/completions$/.test(base)) return base;
    return `${base}/chat/completions`;
  }
  function extractContent(json) {
    if (json === null || typeof json !== "object") return null;
    const choices = json["choices"];
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first = choices[0];
    const message = first?.["message"] ?? null;
    const content = message?.["content"];
    if (typeof content === "string") return content;
    return null;
  }
  async function chat(cfg, prompt) {
    const url = chatUrl(cfg.baseUrl);
    if (url === "") throw new Error("未配置大模型接口地址");
    const headers2 = { "Content-Type": "application/json" };
    if (cfg.apiKey.trim() !== "") headers2["Authorization"] = `Bearer ${cfg.apiKey.trim()}`;
    const res = await request({
      url,
      method: "POST",
      channel: "gm",
      headers: headers2,
      data: {
        model: cfg.model,
        messages: [{ role: "user", content: prompt }]
      },
      responseType: "text",
      timeoutMs: cfg.timeoutMs,
      priority: PRIORITY.HIGH
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`模型接口返回 ${res.status}：${res.text.slice(0, 200)}`);
    }
    let json = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      throw new Error(`模型接口返回的不是 JSON（前 200 字）：${res.text.slice(0, 200)}`);
    }
    const content = extractContent(json);
    if (content === null) throw new Error(`模型响应里没有 choices[0].message.content`);
    return content;
  }
  async function testConnection(cfg) {
    try {
      const content = await chat(cfg, "只回复两个字：收到");
      return { ok: true, detail: `连接正常，模型回复：${content.trim().slice(0, 40)}`, content };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err), content: "" };
    }
  }

  // src/sites/uooc/ai/paper.ts
  function isAnswerable(kind) {
    return kind === "single" || kind === "multi" || kind === "judge";
  }
  function kindOf(typeText, type) {
    const t = typeText.trim();
    if (t.includes("多选")) return "multi";
    if (t.includes("单选")) return "single";
    if (t.includes("判断")) return "judge";
    if (t.includes("填空")) return "blank";
    switch (type) {
      case "10":
        return "single";
      case "11":
        return "multi";
      case "20":
        return "judge";
      case "30":
        return "blank";
      default:
        return "other";
    }
  }
  function toOptions(raw) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const out = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!/^[A-Za-z]$/.test(key)) continue;
      out.push({ key: key.toUpperCase(), text: String(value ?? "").trim() });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
  function asString(v) {
    return v === null || v === void 0 ? "" : String(v);
  }
  function stripHtml(s) {
    if (!s.includes("<")) return s;
    return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  function toStudentAnswer(raw) {
    if (Array.isArray(raw)) {
      return raw.map((x) => asString(x).trim()).filter((s2) => s2 !== "");
    }
    const s = asString(raw).trim();
    return s === "" ? [] : [s];
  }
  function toExamQuestion(raw) {
    if (raw === null || typeof raw !== "object") return null;
    const o = raw;
    const id = asString(o["id"]).trim();
    if (id === "") return null;
    const typeText = asString(o["type_text"]);
    return {
      id,
      kind: kindOf(typeText, asString(o["type"])),
      typeText,
      stem: stripHtml(asString(o["question"])),
      options: toOptions(o["options"]),
      score: asString(o["score"]),
      studentAnswer: toStudentAnswer(o["student_answer"])
    };
  }
  async function fetchPaper(tid) {
    const res = await request({
      url: `${location.origin}/exam/getTaskPaper?${qs({ tid })}`,
      responseType: "json",
      priority: PRIORITY.HIGH,
      // 用户 m01884 报备 2 拍板：拉试卷也跟 AI 接口一样给足 60 秒（原来是 20 秒）
      timeoutMs: 6e4
    });
    const body = res.json;
    const data = body?.["data"] ?? null;
    const list2 = Array.isArray(data?.["questions"]) ? data["questions"] : null;
    if (list2 === null) throw new Error("getTaskPaper 响应里没有 questions");
    const questions = [];
    for (const item of list2) {
      const q = toExamQuestion(item);
      if (q !== null) questions.push(q);
    }
    const paper = data?.["paper"] ?? null;
    return { questions, courseTitle: asString(paper?.["course_title"]) };
  }

  // src/sites/uooc/ai/parse.ts
  var MAX_SAMPLES = 4;
  function toHalfWidth(s) {
    return s.replace(
      /[\uFF21-\uFF3A\uFF41-\uFF5A]/g,
      (c) => String.fromCharCode(c.charCodeAt(0) - 65248)
    );
  }
  function normalizeChoice(raw) {
    const s = toHalfWidth(raw).replace(/[，、；;/\s]+/g, ",").replace(/[.。]+$/g, "").trim();
    if (s === "") return null;
    const judge = judgeToLetter(s);
    if (judge !== null) return judge;
    const letters = s.split(",").filter((p) => p !== "");
    if (letters.length === 0) return null;
    for (const p of letters) {
      if (!/^[A-Za-z]$/.test(p)) return null;
    }
    const uniq = [...new Set(letters.map((p) => p.toUpperCase()))].sort();
    return uniq.join(",");
  }
  function judgeToLetter(s) {
    const t = s.replace(/\s+/g, "");
    if (/^(正确|对|是|√|✓|T|TRUE)$/i.test(t)) return "A";
    if (/^(错误|错|否|×|✗|X|F|FALSE)$/i.test(t)) return "B";
    return null;
  }
  function normalizeAnswer(raw, kind) {
    if (kind === "blank" || kind === "other") {
      const t = raw.trim();
      return t === "" ? null : t;
    }
    return normalizeChoice(raw);
  }
  var INLINE_RE = /(?:^|[\s（(])(\d+)\s*[.、．:：)）]\s*([A-Za-z](?:\s*[,，]\s*[A-Za-z])*)/g;
  function scanInline(text2) {
    const found = /* @__PURE__ */ new Map();
    for (const m of text2.matchAll(INLINE_RE)) {
      const n = Number(m[1]);
      if (!Number.isInteger(n) || n <= 0) continue;
      if (!found.has(n)) found.set(n, (m[2] ?? "").trim());
    }
    return found;
  }
  function parseAnswerLines(text2) {
    const out = /* @__PURE__ */ new Map();
    const body = stripFence(text2);
    for (const line of body.split(/\r?\n/)) {
      const inline = scanInline(line);
      if (inline.size >= 2) {
        for (const [n2, ans2] of inline) if (!out.has(n2)) out.set(n2, ans2);
        continue;
      }
      const m = /^\s*(\d+)\s*[.、．:：)）]\s*(.+?)\s*$/.exec(line);
      if (m === null) continue;
      const n = Number(m[1]);
      const ans = (m[2] ?? "").trim();
      if (!Number.isInteger(n) || n <= 0 || ans === "") continue;
      if (!out.has(n)) out.set(n, ans);
    }
    if (out.size > 0) return out;
    for (const [n, ans] of scanInline(body)) if (!out.has(n)) out.set(n, ans);
    return out;
  }
  function stripFence(text2) {
    return text2.replace(/^\s*```[a-zA-Z]*\s*$/gm, "").replace(/```/g, "");
  }
  function parseAnswers(text2, kinds) {
    const lines = parseAnswerLines(text2);
    return kinds.map((kind, i) => {
      const raw = lines.get(i + 1);
      if (raw === void 0) return null;
      return normalizeAnswer(raw, kind);
    });
  }
  function majority(samples) {
    if (samples.length === 0) return { decided: false, answer: "" };
    const counts = /* @__PURE__ */ new Map();
    for (const s of samples) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const s of samples) {
      if ((counts.get(s) ?? 0) >= 2) return { decided: true, answer: s };
    }
    if (samples.length >= MAX_SAMPLES) {
      return { decided: true, answer: samples[samples.length - 1] ?? "" };
    }
    return { decided: false, answer: "" };
  }

  // src/sites/uooc/ai/prompts.ts
  var SHARED_INSTRUCTION = [
    "请回答下列题目。要求：",
    "1. 只输出答案行，每题一行，格式为「题号. 答案」，题号从 1 开始。",
    "2. 单选题只写一个字母，如 A。",
    "3. 多选题写多个字母，用英文逗号分隔，按字母升序，如 A,C。",
    "4. 判断题写 A（正确）或 B（错误）。",
    "5. 填空题写答案原文，不要写字母；一道题有多个空时，按空序用竖线 | 分隔。",
    "6. 如果你能联网搜索，请先检索相关资料再作答；不能联网就直接按已有知识作答。",
    "7. 不要输出解释、标题、空行、代码块或任何多余字符。",
    ""
  ].join("\n");
  var TEMPLATES = [
    {
      id: "direct",
      label: "直答",
      body: "你是一名严谨的答题助手。直接依据题干与选项作答。\n不需要展示推理过程。"
    },
    {
      id: "reason",
      label: "先推理",
      body: "你是一名严谨的答题助手。作答前请在心里逐步推理，确认无误后给出答案。\n不要把你的推理过程写出来。"
    },
    {
      id: "expert",
      label: "学科专家",
      body: "你是这门课程的资深教师，熟悉该学科的标准答案口径。\n请以专业判断作答，不要受选项表述顺序影响。"
    },
    {
      id: "eliminate",
      label: "排除法",
      body: "你是一名严谨的答题助手。先用排除法剔除明显错误的选项，\n再从剩下的选项里确定最终答案。不要输出排除过程。"
    },
    {
      id: "double-check",
      label: "自检复核",
      body: "你是一名严谨的答题助手。先在心里给出初步答案，再默读一遍题目复核；\n如果发现错误就改正。最终只输出复核后的答案。"
    }
  ];
  function renderOptions(q) {
    if (q.options.length === 0) return "";
    return q.options.map((o) => `${o.key}. ${o.text}`).join("  ");
  }
  function buildPrompt(questions, template, exclude) {
    const lines = [template.body, "", SHARED_INSTRUCTION];
    if (exclude !== void 0 && exclude !== "") {
      lines.push(
        "",
        "补充要求（很重要）：",
        `本题上一轮给出的答案「${exclude}」已被判定为错误，请给出与它**不同**的答案。`,
        "如果这道题是多选题，请给出一个与它不同的字母组合 —— 可以是它的子集，",
        "但不能与它完全相同。不要重复同一个答案。"
      );
    }
    lines.push("题目：");
    questions.forEach((q, i) => {
      const tag = q.typeText === "" ? "" : `[${q.typeText}] `;
      lines.push(`${i + 1}. ${tag}${q.stem}`);
      const opts = renderOptions(q);
      if (opts !== "") lines.push(`   ${opts}`);
    });
    return lines.join("\n");
  }

  // src/sites/uooc/ai/runner.ts
  var ASK_ATTEMPTS = 3;
  var ASK_RETRY_DELAY_MS = 2e3;
  function sleep(ms) {
    return new Promise((resolve2) => {
      setTimeout(resolve2, ms);
    });
  }
  function shuffledTemplates() {
    const out = [...TEMPLATES];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a === void 0 || b === void 0) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
  async function answerOne(question, cfg, opts = {}) {
    const exclude = opts.exclude ?? "";
    const prior = opts.prior ?? [];
    const retryMode = exclude !== "" || prior.length > 0;
    const pool = shuffledTemplates();
    const samples = [];
    const decided = retryMode ? prior.filter((v) => v !== "" && v !== exclude) : [];
    let requests = 0;
    let lastError = "";
    let note;
    const hardMax = retryMode ? Math.max(1, Math.min(2, opts.maxRequests ?? 2)) : Math.min(MAX_SAMPLES, pool.length);
    const deliver = (answer) => ({
      qid: question.id,
      answer,
      requests,
      samples,
      error: lastError,
      ...note !== void 0 ? { note } : {}
    });
    for (let round2 = 0; round2 < hardMax; round2 += 1) {
      const template = pool.pop();
      if (template === void 0) break;
      const ask = await askOnce(question, cfg, template, exclude, opts);
      requests += ask.requests;
      if (ask.error !== "") lastError = ask.error;
      if (!ask.ok) {
        samples.push(null);
        continue;
      }
      samples.push(ask.parsed);
      decided.push(ask.parsed);
      const verdict = majority(decided);
      if (verdict.decided) {
        note = retryMode ? `重答：累计 ${decided.length} 票里「${verdict.answer}」占多数（共发 ${requests} 次请求）` : note;
        return deliver(verdict.answer);
      }
      if (retryMode && prior.length === 0 && (opts.extraOnUnchanged ?? true) && round2 === 0 && ask.parsed === exclude) {
        continue;
      }
    }
    if (retryMode) {
      const tailSample = decided[decided.length - 1];
      if (tailSample !== void 0) {
        note = `重答：没凑出多数，取累计 ${decided.length} 票里的最后一票「${tailSample}」`;
        return deliver(tailSample);
      }
      const last = samples.filter((s) => s !== null).pop();
      if (last !== void 0) return deliver(last);
    }
    return deliver("");
  }
  async function askOnce(question, cfg, template, exclude, opts) {
    let requests = 0;
    let error = "";
    for (let attempt2 = 1; attempt2 <= ASK_ATTEMPTS; attempt2 += 1) {
      requests += 1;
      let text2 = "";
      try {
        text2 = await chat(cfg, buildPrompt([question], template, exclude === "" ? void 0 : exclude));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        opts.onWarn?.(`第 ${attempt2}/${ASK_ATTEMPTS} 次请求失败（模板 ${template.label}）：${error}`);
        if (attempt2 < ASK_ATTEMPTS) await sleep(ASK_RETRY_DELAY_MS);
        continue;
      }
      const parsed2 = parseAnswers(text2, [question.kind])[0] ?? null;
      opts.onDebug?.(
        `模板「${template.label}」→ ${parsed2 === null ? "解析不出答案" : parsed2}（原始回答：${text2.trim().slice(0, 60)}）`
      );
      if (parsed2 === null) {
        error = "解析不出答案";
        opts.onWarn?.(`第 ${attempt2}/${ASK_ATTEMPTS} 次回答解析不出答案（模板 ${template.label}）`);
        if (attempt2 < ASK_ATTEMPTS) await sleep(ASK_RETRY_DELAY_MS);
        continue;
      }
      return { ok: true, parsed: parsed2, requests, error: "" };
    }
    return { ok: false, parsed: "", requests, error };
  }
  async function runPool(items2, limit, worker) {
    const out = new Array(items2.length);
    const size = Math.min(8, Math.max(1, Math.floor(limit)));
    let cursor = 0;
    async function pump() {
      for (; ; ) {
        const i = cursor;
        cursor += 1;
        if (i >= items2.length) return;
        const item = items2[i];
        if (item === void 0) return;
        out[i] = await worker(item, i);
      }
    }
    const lanes = [];
    for (let i = 0; i < size; i += 1) lanes.push(pump());
    await Promise.all(lanes);
    return out;
  }
  async function answerQuestions(questions, opts) {
    const total = questions.length;
    return runPool(questions, opts.concurrency ?? 1, async (q, index) => {
      const outcome = await answerOne(q, opts.cfg, {
        ...opts.onDebug !== void 0 ? { onDebug: opts.onDebug } : {},
        ...opts.onWarn !== void 0 ? { onWarn: opts.onWarn } : {}
      });
      opts.onProgress?.({ index, total, question: q, outcome });
      return outcome;
    });
  }

  // src/sites/uooc/notice.ts
  var MAX_NOTICES = 40;
  var log6 = scoped("uooc/notice");
  var seq3 = 0;
  var list = [];
  var listeners2 = /* @__PURE__ */ new Set();
  var sink = null;
  function noticeBind(host2) {
    sink = host2;
  }
  function noticeList() {
    return list;
  }
  function subscribeNotice(fn) {
    listeners2.add(fn);
    return () => {
      listeners2.delete(fn);
    };
  }
  function clockText(at) {
    const d = new Date(at);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function emit() {
    for (const fn of [...listeners2]) {
      try {
        fn();
      } catch (err) {
        log6.warn("提示流订阅者抛错", String(err));
      }
    }
  }
  function noticePost(text2, kind = "info", options = {}) {
    const msg = text2.trim();
    if (msg === "") return;
    const last = list.length === 0 ? void 0 : list[list.length - 1];
    if (options.dedupe !== false && last !== void 0 && last.text === msg && last.kind === kind) {
      const merged = { ...last, at: Date.now(), count: last.count + 1 };
      list = [...list.slice(0, -1), merged];
      emit();
      return;
    }
    seq3 += 1;
    list = [...list, { id: seq3, at: Date.now(), kind, text: msg, count: 1 }].slice(-MAX_NOTICES);
    emit();
    if (options.quiet === true) return;
    const sticky = kind === "warn" || kind === "error";
    if (sink === null) {
      log6.debug(`面板还没绑 Toast 出口，只记监视页：${msg}`);
      return;
    }
    try {
      sink.toast(msg, kind, { sticky });
    } catch (err) {
      log6.warn("Toast 出口抛错", String(err));
    }
  }

  // src/sites/uooc/ai/monitor.ts
  var log7 = scoped("uooc/ai/monitor");
  var QUESTION_STATUS_TEXT = {
    pending: "等待中",
    answered: "已作答",
    failed: "没答出",
    skipped: "跳过"
  };
  var QUIZ_PHASE_TEXT = {
    idle: "空闲",
    fetching: "正在拉题…",
    answering: "正在问模型…",
    filling: "正在回填页面…",
    submitting: "已点提交，等待站点结果…（人机验证码要你手动点）",
    retrying: "未通过，正在重答低分题…",
    done: "已结束",
    error: "出错"
  };
  var EMPTY = { course: null, quiz: null };
  var state = EMPTY;
  var listeners3 = /* @__PURE__ */ new Set();
  function monitorState() {
    return state;
  }
  function subscribeMonitor(fn) {
    listeners3.add(fn);
    return () => {
      listeners3.delete(fn);
    };
  }
  function emit2() {
    for (const fn of [...listeners3]) {
      try {
        fn();
      } catch (err) {
        log7.warn("监视页订阅者抛异常，已忽略", err instanceof Error ? err.message : String(err));
      }
    }
  }
  function setCourseProgress(p) {
    state = { ...state, course: p };
    emit2();
  }
  var quiz = null;
  function publishQuiz() {
    state = { ...state, quiz };
    emit2();
  }
  function quizBegin(tid, questions) {
    quiz = {
      tid,
      total: questions.length,
      done: questions.filter((q) => q.hasAnswer).length,
      phase: "fetching",
      message: "",
      questions: questions.map((q, i) => ({
        qid: q.id,
        no: i + 1,
        typeText: q.typeText,
        status: q.hasAnswer ? "skipped" : "pending",
        answer: "",
        requests: 0,
        samples: [],
        note: q.hasAnswer ? "页面上已有答案，不重复请求" : ""
      }))
    };
    log7.debug(`监视：登记 ${tid}，共 ${questions.length} 题`);
    publishQuiz();
  }
  function quizPatch(qid, patch) {
    if (quiz === null) return;
    let hit = false;
    const questions = quiz.questions.map((q) => {
      if (q.qid !== qid) return q;
      hit = true;
      return { ...q, ...patch };
    });
    if (!hit) return;
    const done = questions.filter((q) => q.status === "answered" || q.status === "skipped").length;
    quiz = { ...quiz, questions, done };
    publishQuiz();
  }
  function quizPhase(phase, message = "") {
    if (quiz === null) return;
    quiz = { ...quiz, phase, message };
    publishQuiz();
    const detail = message === "" ? "" : ` —— ${message}`;
    noticePost(`${QUIZ_PHASE_TEXT[phase]}${detail}`, phase === "error" ? "error" : "info");
  }
  function quizEnd(message, kind = "info") {
    if (quiz === null) return;
    quiz = { ...quiz, phase: "done", message };
    publishQuiz();
    noticePost(message, kind);
  }
  function quizClear() {
    quiz = null;
    publishQuiz();
  }

  // src/sites/uooc/ai/overlay.ts
  var log8 = scoped("uooc/quiz-overlay");
  var cur = null;
  var ROOT_CSS = [
    "position:fixed",
    "inset:0",
    "z-index:2147483000",
    "box-sizing:border-box",
    "display:flex",
    "flex-direction:column",
    "gap:10px",
    "padding:18px 20px",
    "background:rgba(17,21,27,.9)",
    "color:#f2f4f7",
    'font:13px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif'
  ].join(";");
  var HIDE_BTN_CSS = [
    "flex:none",
    "cursor:pointer",
    "border:1px solid rgba(255,255,255,.35)",
    "border-radius:6px",
    "background:transparent",
    "color:#f2f4f7",
    "font:12.5px/1 inherit",
    "padding:7px 12px"
  ].join(";");
  var BAR_CSS = "height:6px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden";
  var BAR_FILL_CSS = "height:100%;width:0;background:#3b82f6;transition:width .2s ease";
  var LIST_CSS = [
    "flex:1",
    "min-height:0",
    "overflow:auto",
    "border:1px solid rgba(255,255,255,.14)",
    "border-radius:8px",
    "padding:6px 10px",
    "font-size:12.5px",
    "line-height:1.75"
  ].join(";");
  function mk(doc, tag, css, text2) {
    const node = doc.createElement(tag);
    node.style.cssText = css;
    if (text2 !== void 0) node.textContent = text2;
    return node;
  }
  function questionLine(doc, q) {
    const status = QUESTION_STATUS_TEXT[q.status];
    const answer = q.answer === "" ? "—" : q.answer;
    const tail = q.note === "" ? "" : `（${q.note}）`;
    return mk(
      doc,
      "div",
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
      `#${q.no} [${q.typeText}] ${status} → ${answer} · 请求 ${q.requests} 次${tail}`
    );
  }
  function buildRoot(doc) {
    const node = mk(doc, "div", ROOT_CSS);
    node.setAttribute("data-sztb", "quiz-overlay");
    const head = mk(doc, "div", "display:flex;align-items:center;gap:10px");
    head.appendChild(mk(doc, "div", "flex:1;font-weight:600;font-size:14px", "脚本正在作答这张试卷"));
    const hide = mk(doc, "button", HIDE_BTN_CSS, "隐藏遮罩");
    hide.setAttribute("type", "button");
    hide.addEventListener("click", () => {
      if (cur === null) return;
      cur.hidden = true;
      log8.info("用户点了【隐藏遮罩】，本次测验内不再显示");
      render(cur);
    });
    head.appendChild(hide);
    node.appendChild(head);
    const live = mk(doc, "div", "display:flex;flex-direction:column;gap:10px;flex:1;min-height:0");
    node.appendChild(live);
    node.appendChild(
      mk(
        doc,
        "div",
        "flex:none;font-size:12px;opacity:.72",
        "遮罩只挡视线，不影响脚本作答；走到「等你过人机验证码」那一步会自动让开。"
      )
    );
    return { node, live };
  }
  function render(o) {
    const state2 = monitorState();
    const quiz2 = state2.quiz !== null && state2.quiz.tid === o.tid ? state2.quiz : null;
    const phase = quiz2 === null ? "idle" : quiz2.phase;
    const submitting = phase === "submitting";
    const visible = !o.hidden && !submitting;
    if (!o.node.isConnected) {
      const body = o.doc.body;
      if (body === null) return;
      body.appendChild(o.node);
      log8.debug("遮罩被站点重渲染抹掉，已重新挂回");
    }
    o.node.style.setProperty("display", visible ? "flex" : "none");
    if (!visible) return;
    o.live.textContent = "";
    if (quiz2 === null) return;
    o.live.appendChild(mk(o.doc, "div", "font-weight:600;font-size:14px", QUIZ_PHASE_TEXT[quiz2.phase]));
    if (quiz2.message !== "") {
      o.live.appendChild(mk(o.doc, "div", "opacity:.85", quiz2.message));
    }
    o.live.appendChild(
      mk(
        o.doc,
        "div",
        "opacity:.85",
        `第 ${quiz2.done}/${quiz2.total} 题已定稿 · 任务 tid=${quiz2.tid}${o.hidden ? " · 遮罩已隐藏" : ""}`
      )
    );
    const bar2 = mk(o.doc, "div", BAR_CSS);
    const fill = mk(o.doc, "div", BAR_FILL_CSS);
    const pct = quiz2.total <= 0 ? 0 : Math.round(quiz2.done / quiz2.total * 100);
    fill.style.setProperty("width", `${pct}%`);
    bar2.appendChild(fill);
    o.live.appendChild(bar2);
    const list2 = mk(o.doc, "div", LIST_CSS);
    if (quiz2.questions.length === 0) {
      list2.appendChild(mk(o.doc, "div", "opacity:.7", "还没读到题目"));
    } else {
      for (const q of quiz2.questions) list2.appendChild(questionLine(o.doc, q));
    }
    o.live.appendChild(list2);
  }
  function quizOverlayOpen(frame, tid) {
    quizOverlayClose();
    const doc = frame === null ? null : frame.contentDocument;
    if (doc === null || doc.body === null) {
      log8.warn("拿不到试卷 iframe 的 document，本次不盖遮罩（不影响作答）");
      return;
    }
    const { node, live } = buildRoot(doc);
    doc.body.appendChild(node);
    const o = { tid, doc, node, live, hidden: false, off: null };
    cur = o;
    o.off = subscribeMonitor(() => {
      try {
        render(o);
      } catch (err) {
        log8.warn("遮罩渲染抛错", String(err));
      }
    });
    render(o);
    log8.info(`已给试卷 tid=${tid} 盖上进度遮罩`);
  }
  function quizOverlayClose() {
    const o = cur;
    if (o === null) return;
    cur = null;
    o.off?.();
    o.off = null;
    o.node.remove();
  }

  // src/sites/uooc/settings.ts
  var log9 = scoped("uooc/settings");
  var SITE_ID = "uooc";
  var GROUP = {
    /** 播放器行为（U1/U2/U4） */
    VIDEO: "视频",
    /** 连播行为（U3） */
    AUTOPLAY: "连播",
    /** AI 作答（U6–U9） */
    AI: "AI 作答"
  };
  var TOGGLE = {
    /** 🟢 二倍速播放（U1） */
    RATE_2X: "rate-2x",
    /** 🟢 静音播放（U2） */
    MUTE: "mute",
    /** 🟢 防失焦暂停（U4） */
    KEEP_PLAYING: "keep-playing",
    /** 🟢 空白片源（V5）：把原片换成等长黑画面，只省流量不省时间 */
    BLANK_VIDEO: "blank-video",
    /** 🟠 AI 答题（U6–U9）：连播走到测验就交给它；关掉则停下等用户手动处理 */
    AI_ANSWER: "ai-answer"
  };
  var VALUE = {
    /** 改完 `location.hash` 之后、开始等元素出现之前的固定 sleep（ms） */
    WAIT_BEFORE_MS: "wait-before-ms",
    /** 一项处理完（`ended` 之后）停留多久再重拉课程树（ms） */
    HOLD_AFTER_MS: "hold-after-ms",
    /** 除 API 请求本身之外，所有「等某个条件出现」的超时（ms） */
    WAIT_TIMEOUT_MS: "wait-timeout-ms",
    /** 大模型接口根地址（OpenAI Chat Completions 兼容），如 `https://api.openai.com/v1` */
    AI_BASE_URL: "ai-base-url",
    /** 大模型 API Key */
    AI_API_KEY: "ai-api-key",
    /** 模型名，如 `gpt-4o-mini` */
    AI_MODEL: "ai-model",
    /** 单次请求超时（ms） */
    AI_TIMEOUT_MS: "ai-timeout-ms",
    /** 同时答几道题（1~8） */
    AI_CONCURRENCY: "ai-concurrency"
  };
  var UOOC_TOGGLES = [
    {
      id: TOGGLE.RATE_2X,
      label: "二倍速",
      desc: "锁在 2 倍速，在播放器里改回去会被扳回",
      risk: "safe",
      default: true,
      group: GROUP.VIDEO
    },
    {
      id: TOGGLE.MUTE,
      label: "静音",
      desc: "锁在静音，取消会被扳回",
      risk: "safe",
      default: true,
      group: GROUP.VIDEO
    },
    {
      id: TOGGLE.KEEP_PLAYING,
      label: "防暂停",
      desc: "暂停会被立刻恢复（含你自己按的暂停）",
      risk: "safe",
      default: true,
      group: GROUP.VIDEO
    },
    {
      id: TOGGLE.BLANK_VIDEO,
      label: "空白片源",
      desc: "读到原片时长后立刻把片源换成等长的纯黑片段（自制的 1KB MP4），播放进度与上报的时长/进度照旧，但不再下载原片；只省流量不省时间（2 倍速下依然要播满一半时长），且只对本页之后加载的视频生效",
      risk: "safe",
      default: true,
      group: GROUP.VIDEO
    },
    {
      id: TOGGLE.AI_ANSWER,
      label: "AI 答题",
      desc: "连播遇到测验脚本就在页内答题 iframe 里拉题问模型、逐题回填；提交前会弹确认框，人机验证码要你手动点一下",
      risk: "irreversible",
      default: false,
      group: GROUP.AI
    }
  ];
  function registerUoocSettings() {
    registerValue({
      siteId: SITE_ID,
      id: VALUE.WAIT_BEFORE_MS,
      label: "跳转后等待(ms)",
      desc: "改完地址栏 hash 后先等这么久，再开始等页面元素出现（给页面加载与视频缓冲留时间）",
      default: "5000",
      kind: "number",
      group: GROUP.AUTOPLAY
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.HOLD_AFTER_MS,
      label: "播完后停留(ms)",
      desc: "视频播放结束（ended）后停留这么久，再去重拉课程树确认完成状态",
      default: "5000",
      kind: "number",
      group: GROUP.AUTOPLAY
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.WAIT_TIMEOUT_MS,
      label: "全局等待超时(ms)",
      desc: "除取数请求外，所有「等某个东西出现」的超时上限（等元素、等待测验交卷……）",
      default: "30000",
      kind: "number",
      group: GROUP.AUTOPLAY
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.AI_BASE_URL,
      label: "接口地址",
      desc: "OpenAI Chat Completions 兼容的根地址，会自动补 /chat/completions。例：https://api.openai.com/v1",
      default: "",
      kind: "url",
      group: GROUP.AI
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.AI_API_KEY,
      label: "API Key",
      desc: "只存在你本机的油猴存储里。本地部署（ollama 等）不需要填",
      default: "",
      kind: "password",
      group: GROUP.AI
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.AI_MODEL,
      label: "模型名",
      desc: "填服务商文档里那个精确的模型 id，例：gpt-4o-mini",
      default: "",
      kind: "text",
      group: GROUP.AI
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.AI_TIMEOUT_MS,
      label: "超时(ms)",
      desc: "单次请求的最长等待时间；推理型模型要调大",
      default: "60000",
      kind: "number",
      group: GROUP.AI
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.AI_CONCURRENCY,
      label: "并发数",
      desc: "同时答几道题（1~8）。默认 1 最稳；调高容易撞到服务商的速率限制（表现为「这道题没答出来」）",
      default: "1",
      kind: "number",
      group: GROUP.AI
    });
  }
  function readMs(id, fallbackMs) {
    const raw = getValue(SITE_ID, id);
    const num3 = Number(raw);
    if (!Number.isFinite(num3) || num3 < 0) {
      log9.warn(`${id} 取值异常（${String(raw)}），按 ${fallbackMs}ms 处理`);
      return fallbackMs;
    }
    return num3;
  }
  function waitBeforeMs() {
    return readMs(VALUE.WAIT_BEFORE_MS, 5e3);
  }
  function holdAfterMs() {
    return readMs(VALUE.HOLD_AFTER_MS, 5e3);
  }
  function waitTimeoutMs() {
    return readMs(VALUE.WAIT_TIMEOUT_MS, 3e4);
  }
  function readText(id) {
    return getValue(SITE_ID, id).trim();
  }
  function aiConfig() {
    const baseUrl = readText(VALUE.AI_BASE_URL);
    const model = readText(VALUE.AI_MODEL);
    if (baseUrl === "" || model === "") return null;
    return {
      baseUrl,
      model,
      apiKey: readText(VALUE.AI_API_KEY),
      timeoutMs: readMs(VALUE.AI_TIMEOUT_MS, 6e4)
    };
  }
  function aiConcurrency() {
    const n = Math.floor(readMs(VALUE.AI_CONCURRENCY, 1));
    return Math.min(8, Math.max(1, n));
  }
  function applyUoocSettings() {
    waitBeforeMs();
    holdAfterMs();
    aiConcurrency();
    log9.info(`AI 作答配置：${aiConfig() === null ? "未配置（AI 答题用不了）" : "已配置"}`);
  }

  // src/sites/uooc/ai/index.ts
  var log10 = scoped("uooc/ai");
  var SUBMIT_WAIT_MS = 5 * 60 * 1e3;
  function lettersOf(answer) {
    return answer.split(",").map((s) => s.trim().toUpperCase()).filter((s) => s !== "");
  }
  function tidFromLocation(href = location.href) {
    let u;
    try {
      u = new URL(href, location.href);
    } catch {
      return null;
    }
    const fromQuery = u.searchParams.get("tid");
    if (fromQuery !== null && fromQuery !== "") return fromQuery;
    const m = /^\/exam\/(\d{6,})\/?$/.exec(u.pathname);
    return m !== null && m[1] !== void 0 ? m[1] : null;
  }
  function quizTidOnPage() {
    for (const frame of document.querySelectorAll("iframe")) {
      const src = frame.getAttribute("src") ?? "";
      if (!src.includes("/exam/")) continue;
      const tid = tidFromLocation(src);
      if (tid !== null) return tid;
    }
    return tidFromLocation();
  }
  function quizFrameOnPage() {
    for (const frame of document.querySelectorAll("iframe")) {
      const src = frame.getAttribute("src") ?? "";
      if (src.includes("/exam/") && tidFromLocation(src) !== null) return frame;
    }
    return null;
  }
  function summarizeFailures(outcomes) {
    const bad = outcomes.filter((o) => o.answer === "");
    if (bad.length === 0) return "";
    const reasons = /* @__PURE__ */ new Set();
    for (const o of bad) {
      if (o.error !== "") reasons.add(o.error);
    }
    const head = `有 ${bad.length} 道题没答出来`;
    if (reasons.size === 0) return `${head}（模型没给出能识别的答案格式）`;
    return `${head}：${[...reasons].join("；").slice(0, 200)}`;
  }
  async function submitAndRead() {
    installUoocInterceptInFrames();
    const btn = findSubmitButton();
    if (btn === null) {
      const msg = "页面上找不到【提交】按钮，请自己点一下（答案已经填好了）";
      log10.error(msg);
      noticePost(msg, "warn");
      return { submitted: false, commit: null };
    }
    clearCommit();
    quizPhase("submitting");
    log10.info("已合成点击站点【提交】，接下来请手动完成人机验证码");
    btn.click();
    const commit = await waitCommit(SUBMIT_WAIT_MS);
    if (commit === null) log10.warn("没截获到交卷响应（可能你还没点完验证码，或站点换了接口）");
    else log10.info(`交卷判读：${commit.verdict}，得分 ${commit.score}/${commit.passScore}，msg=${commit.message}`);
    return { submitted: true, commit };
  }
  async function retryLowScore(commit, questions, previous, priorVotes, cfg) {
    const lows = [];
    for (const q of questions) {
      const got = commit.scoreList[q.id];
      if (got === void 0) continue;
      const full = Number(q.score);
      const score = Number(got);
      if (Number.isFinite(full) && Number.isFinite(score) && score < full) lows.push(q);
    }
    if (lows.length === 0) {
      log10.info("这次没过，但 score_list 里挑不出低分题（或没带分数），不重答");
      return { retried: 0, filled: 0 };
    }
    quizPhase("retrying", `未通过（得分 ${commit.score} / 门槛 ${commit.passScore}），重答 ${lows.length} 道低分题`);
    log10.info(`未通过，重答 ${lows.length} 道低分题：${lows.map((q) => q.id).join(", ")}`);
    let filled = 0;
    for (const q of lows) {
      const exclude = previous.get(q.id) ?? "";
      const prior = priorVotes.get(q.id) ?? [];
      quizPatch(q.id, { status: "pending", note: "重答中…" });
      const o = await answerOne(q, cfg, {
        onDebug: (m) => log10.debug(m),
        onWarn: (m) => log10.warn(m),
        ...exclude === "" ? {} : { exclude },
        prior,
        maxRequests: 2
      });
      quizPatch(q.id, {
        status: o.answer === "" ? "failed" : "answered",
        answer: o.answer,
        requests: o.requests,
        samples: o.samples,
        note: o.note ?? ""
      });
      if (o.answer === "") continue;
      const target = { qid: q.id, kind: q.kind, letters: lettersOf(o.answer) };
      const r = fillAnswers([target]);
      if (r.filled.length > 0) {
        filled += 1;
        previous.set(q.id, o.answer);
        priorVotes.set(q.id, o.samples.filter((s) => s !== null));
      }
    }
    return { retried: lows.length, filled };
  }
  async function runQuizAnswer(tid, host2) {
    try {
      return await runQuizAnswerBody(tid, host2);
    } finally {
      quizOverlayClose();
    }
  }
  async function runQuizAnswerBody(tid, host2) {
    const cfg = aiConfig();
    if (cfg === null) {
      const msg = "AI 作答未配置：请到【AI 作答】标签页填接口地址与模型名";
      log10.error(msg);
      noticePost(msg, "error");
      host2.activateTab("uooc:ai");
      return null;
    }
    log10.info(`开始 AI 作答：tid=${tid}，接口=${chatUrl(cfg.baseUrl)}，模型=${cfg.model}`);
    installUoocInterceptInFrames();
    quizClear();
    let paper;
    try {
      paper = await fetchPaper(tid);
    } catch (err) {
      const msg = `拉题失败：${err instanceof Error ? err.message : String(err)}`;
      log10.error(msg);
      noticePost(msg, "error");
      return null;
    }
    const all = paper.questions;
    const already = all.filter((q) => q.studentAnswer.length > 0 || isAnsweredInDom(q.id));
    const alreadyIds = new Set(already.map((q) => q.id));
    const todo = all.filter((q) => !alreadyIds.has(q.id) && isAnswerable(q.kind));
    const skippedKind = all.filter((q) => !alreadyIds.has(q.id) && !isAnswerable(q.kind)).length;
    quizBegin(
      tid,
      all.map((q) => ({ id: q.id, typeText: q.typeText, hasAnswer: alreadyIds.has(q.id) }))
    );
    for (const q of already) quizPatch(q.id, { status: "skipped", note: "页面上已有答案，不重复请求" });
    quizOverlayOpen(quizFrameOnPage(), tid);
    log10.info(
      `拿到 ${all.length} 道题：页面上已有答案 ${already.length} 道（跳过），可自动作答 ${todo.length} 道，跳过 ${skippedKind} 道填空/主观题`
    );
    const answers = /* @__PURE__ */ new Map();
    const priorVotes = /* @__PURE__ */ new Map();
    const failures = [];
    let filled = 0;
    let buttons = injectClearButtons({
      onClearOne: () => void 0,
      onClearAll: () => void 0
    });
    const refreshButtons = () => {
      buttons.refresh(new Set(answers.keys()));
    };
    if (todo.length > 0) {
      const concurrency = aiConcurrency();
      quizPhase("answering", `并发 ${concurrency}`);
      log10.info(`开始问模型（并发 ${concurrency}）…`);
      await answerQuestions(todo, {
        cfg,
        concurrency,
        onDebug: (m) => log10.debug(m),
        onWarn: (m) => log10.warn(m),
        onProgress: (ev) => {
          const { question, outcome } = ev;
          log10.info(
            `[${ev.index + 1}/${ev.total}] ${question.typeText} ${question.id} → ${outcome.answer === "" ? "未答出" : outcome.answer}（${outcome.requests} 次请求）`
          );
          if (outcome.answer === "") {
            failures.push(outcome);
            quizPatch(question.id, {
              status: "failed",
              requests: outcome.requests,
              samples: outcome.samples,
              note: outcome.error === "" ? "模型没给出可识别的答案" : outcome.error
            });
            return;
          }
          const report = fillAnswers([
            { qid: question.id, kind: question.kind, letters: lettersOf(outcome.answer) }
          ]);
          const ok = report.filled.length > 0;
          if (ok) {
            filled += 1;
            answers.set(question.id, outcome.answer);
            priorVotes.set(
              question.id,
              outcome.samples.filter((s) => s !== null)
            );
          }
          quizPatch(question.id, {
            status: ok ? "answered" : "failed",
            answer: outcome.answer,
            requests: outcome.requests,
            samples: outcome.samples,
            note: ok ? outcome.note ?? "" : "模型答出来了，但页面里点不动这一题"
          });
          refreshButtons();
        }
      });
    }
    buttons.remove();
    buttons = injectClearButtons({
      onClearOne: (qid) => {
        const q = all.find((x) => x.id === qid);
        const how = clearQuestion(qid, q?.kind ?? "other");
        answers.delete(qid);
        refreshButtons();
        log10.info(`清除第 ${qid} 题的答案（${how}）`);
      },
      onClearAll: () => {
        for (const q of all) {
          clearQuestion(q.id, q.kind);
          answers.delete(q.id);
        }
        refreshButtons();
        log10.info("清除全部答案");
      }
    });
    refreshButtons();
    const failure = summarizeFailures(failures);
    const bodyLines = [
      `卷面 ${all.length} 道题：页面上本来就有答案 ${already.length} 道，模型作答并填入 ${filled} 道。`
    ];
    if (skippedKind > 0) bodyLines.push(`跳过 ${skippedKind} 道（填空/主观题）。`);
    if (filled < todo.length) bodyLines.push(`有 ${todo.length - filled} 道没填进去（见【监视】页的逐题表）。`);
    if (failure !== "") bodyLines.push(failure);
    bodyLines.push("");
    bodyLines.push("点【开始提交】后脚本会点站点的提交按钮，接着会弹人机验证码，需要你手动点一下。");
    bodyLines.push("没通过的话，脚本会按分数挑低分题重答一轮（每题只再问 1 次），然后自动再提交一次。");
    quizPhase("filling", `已填入 ${filled} 道，等你确认提交`);
    const confirmed = await host2.confirm({
      title: "答案已填好，确认提交？",
      body: bodyLines.join("\n"),
      danger: true,
      confirmText: "开始提交（会弹验证码）",
      cancelText: "再等等"
    });
    if (!confirmed) {
      log10.info("用户选择「再等等」，不提交。答案已填在页面上，你可以自己改");
      quizEnd("用户取消了提交，答案已填在页面上", "warn");
      return {
        total: all.length,
        alreadyAnswered: already.length,
        answered: answers.size,
        filled,
        submitted: false,
        commit: null,
        retried: 0
      };
    }
    buttons.remove();
    const first = await submitAndRead();
    let commit = first.commit;
    let retried = 0;
    if (commit !== null && commit.verdict === "fail" && first.submitted) {
      const r = await retryLowScore(commit, all, answers, priorVotes, cfg);
      retried = r.retried;
      filled += r.filled;
      if (r.retried > 0) {
        const again = await submitAndRead();
        commit = again.commit ?? commit;
      }
    }
    if (commit !== null) {
      const passed = commit.verdict === "pass";
      quizEnd(
        passed ? `已通过（得分 ${commit.score}）` : commit.verdict === "fail" ? `仍未通过：${commit.message}` : `提交完成，但读不懂站点回话：${commit.message}`,
        passed ? "success" : "warn"
      );
    } else {
      quizEnd("已点提交，但没截获到站点回话（可能验证码还没点完）", "warn");
    }
    return {
      total: all.length,
      alreadyAnswered: already.length,
      answered: answers.size,
      filled,
      submitted: first.submitted,
      commit,
      retried
    };
  }

  // src/sites/uooc/catalog.ts
  var SOURCE_TYPE = {
    VIDEO: "10",
    ATTACH: "50",
    TEXT: "60",
    DISCUSSION: "70",
    QUIZ: "80"
  };
  var SOURCE_NAME = {
    [SOURCE_TYPE.VIDEO]: "视频",
    [SOURCE_TYPE.ATTACH]: "附件",
    [SOURCE_TYPE.TEXT]: "文本",
    [SOURCE_TYPE.DISCUSSION]: "讨论",
    [SOURCE_TYPE.QUIZ]: "测验"
  };
  function isTaskType(type) {
    const t = String(type);
    return t === SOURCE_TYPE.VIDEO || t === SOURCE_TYPE.QUIZ;
  }
  function classifySource(type) {
    switch (String(type)) {
      case SOURCE_TYPE.VIDEO:
        return "video";
      case SOURCE_TYPE.ATTACH:
        return "attach";
      case SOURCE_TYPE.TEXT:
        return "text";
      case SOURCE_TYPE.DISCUSSION:
        return "discussion";
      case SOURCE_TYPE.QUIZ:
        return "quiz";
      default:
        return "unknown";
    }
  }
  function text(value) {
    return value === null || value === void 0 ? "" : String(value);
  }
  function isFinished(value) {
    return Number(value) === 1;
  }
  function sourceHash(cid, ancestors, nodeId, sourceId) {
    if (!cid || !nodeId || !sourceId) return { form: "unsupported", hash: "" };
    if (ancestors.length === 1) {
      return { form: "section", hash: `#/${cid}/${ancestors[0]}/${nodeId}/${sourceId}/section` };
    }
    if (ancestors.length === 2) {
      return {
        form: "subsection",
        hash: `#/${cid}/${ancestors[0]}/${ancestors[1]}/${nodeId}/${sourceId}/subsection`
      };
    }
    return { form: "unsupported", hash: "" };
  }
  function parseIcons(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      if (item === null || typeof item !== "object") continue;
      const o = item;
      const sourceId = text(o["id"]);
      if (sourceId === "" || sourceId === "0") continue;
      out.push({
        sourceId,
        type: text(o["type"]),
        typeName: text(o["type_name"]),
        kind: classifySource(o["type"]),
        task: isTaskType(o["type"])
      });
    }
    return out;
  }
  function flattenTaskPoints(tree, cid) {
    const out = [];
    collectTaskPoints(tree, cid, [], [], out);
    return out;
  }
  function collectTaskPoints(nodes, cid, ancestors, names, out) {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      if (raw === null || typeof raw !== "object") continue;
      const node = raw;
      const nodeId = text(node["id"]);
      const nodeName = text(node["name"]);
      const icons = parseIcons(node["icon_list"]);
      const declared = node["learn_task_cnt"];
      const taskCount = declared === void 0 || declared === null ? icons.filter((i) => i.task).length : Number(declared) || 0;
      const primary = icons.find((i) => i.task) ?? icons[0];
      if (nodeId && taskCount > 0 && primary !== void 0) {
        const { form, hash } = sourceHash(cid, ancestors, nodeId, primary.sourceId);
        out.push({
          nodeId,
          ancestors: [...ancestors],
          path: [...names],
          primaryHash: hash,
          form,
          sourceId: primary.sourceId,
          type: primary.type,
          typeName: primary.typeName,
          kind: primary.kind,
          name: nodeName,
          finished: isFinished(node["finished"]),
          chapterId: ancestors[0] ?? "",
          sectionId: ancestors.length === 1 ? nodeId : ancestors[1] ?? "",
          pointId: ancestors.length === 2 ? nodeId : "",
          taskCount,
          icons
        });
      }
      if (nodeId) collectTaskPoints(node["children"], cid, [...ancestors, nodeId], [...names, nodeName], out);
    }
  }
  function firstUnfinished(points, skipped = /* @__PURE__ */ new Set()) {
    for (const point of points) {
      if (point.finished) continue;
      if (skipped.has(point.nodeId)) continue;
      return point;
    }
    return null;
  }
  function parseUnitSources(data) {
    if (!Array.isArray(data)) return [];
    const out = [];
    for (const item of data) {
      if (item === null || typeof item !== "object") continue;
      const o = item;
      const sourceId = text(o["id"]);
      if (sourceId === "" || sourceId === "0") continue;
      const type = text(o["type"]);
      const declared = o["is_task"];
      const isTask = declared === void 0 || declared === null ? isTaskType(type) : text(declared) === "1";
      const rawPos = o["video_pos"];
      const pos = rawPos === void 0 || rawPos === null || rawPos === "" ? NaN : Number(rawPos);
      const tid = text(o["task_id"]);
      out.push({
        sourceId,
        type,
        typeName: text(o["type_name"]),
        kind: classifySource(type),
        name: text(o["title"]) || text(o["type_name"]),
        isTask,
        finished: isFinished(o["finished"]),
        videoPos: Number.isFinite(pos) ? pos : null,
        // `task_id` 恒为 0 是 `getCatalogList` 那个接口的毛病，这里是真的 tid；
        // 但缺字段时也会给 0，同样当「没有」处理。
        taskId: tid === "0" ? "" : tid
      });
    }
    return out;
  }
  function firstUnfinishedSource(sources, skipped = /* @__PURE__ */ new Set()) {
    for (const source of sources) {
      if (!source.isTask) continue;
      if (source.finished) continue;
      if (skipped.has(source.sourceId)) continue;
      return source;
    }
    return null;
  }
  function hashForSource(cid, point, source) {
    return sourceHash(cid, point.ancestors, point.nodeId, source.sourceId).hash;
  }
  function courseIdFromLocation(pathname, hash) {
    const fromPath = /^\/home\/learn\/new\/(\d+)/.exec(pathname);
    if (fromPath !== null) return fromPath[1] ?? null;
    const fromHash = /^#\/(\d+)(?:\/|$)/.exec(hash);
    if (fromHash !== null) return fromHash[1] ?? null;
    return null;
  }
  function summarizeTaskPoints(points) {
    let done = 0;
    for (const point of points) {
      if (point.finished) done += 1;
    }
    return { total: points.length, done };
  }
  function buildCourseRows(points) {
    const rows = [];
    const seenChapter = /* @__PURE__ */ new Set();
    const seenSection = /* @__PURE__ */ new Set();
    for (const point of points) {
      const chapterId = point.ancestors[0];
      const chapterName = point.path[0];
      if (chapterId !== void 0 && !seenChapter.has(chapterId)) {
        seenChapter.add(chapterId);
        rows.push({
          ids: [chapterId],
          depth: 0,
          label: chapterName === void 0 || chapterName === "" ? `（未命名章 ${chapterId}）` : chapterName,
          typeName: "",
          done: null
        });
      }
      const isSub = point.ancestors.length >= 2;
      const sectionName = isSub ? point.path[1] : point.name;
      if (!seenSection.has(point.sectionId)) {
        seenSection.add(point.sectionId);
        rows.push({
          ids: [point.sectionId],
          depth: 1,
          label: sectionName === void 0 || sectionName === "" ? `（未命名节 ${point.sectionId}）` : sectionName,
          typeName: isSub ? "" : point.typeName,
          done: isSub ? null : point.finished
        });
      }
      if (isSub) {
        rows.push({
          ids: [point.nodeId, point.sourceId],
          depth: 2,
          label: point.name === "" ? `（未命名任务点 ${point.nodeId}）` : point.name,
          typeName: point.typeName,
          done: point.finished
        });
      }
    }
    return rows;
  }
  function isCurrentRow(row3, currentId) {
    if (currentId === null) return false;
    return row3.ids.includes(currentId);
  }

  // src/sites/uooc/autoplay.ts
  var log11 = scoped("uooc/autoplay");
  var VIDEO_SLACK_MS = 10 * 60 * 1e3;
  var VIDEO_MIN_MS = 5 * 60 * 1e3;
  var VIDEO_MAX_MS = 6 * 60 * 60 * 1e3;
  var listeners4 = /* @__PURE__ */ new Set();
  var host = null;
  var running = false;
  var statusText = "已停止";
  var token = null;
  function notify() {
    for (const fn of [...listeners4]) {
      try {
        fn();
      } catch {
      }
    }
  }
  function setStatus(text2) {
    statusText = text2;
    notify();
  }
  function startAutoplay(api) {
    host = api;
    log11.debug("连播已装载（等待用户点【开始连播】）");
    return () => {
      autoplayStop();
      host = null;
      listeners4.clear();
    };
  }
  function autoplayStop() {
    if (!running && token === null) return;
    running = false;
    if (token !== null) token.cancelled = true;
    token = null;
    setStatus("已停止");
    setCourseProgress(null);
    log11.info("连播已停止");
    notify();
  }

  // src/sites/uooc/tabs/ai.ts
  var log12 = scoped("uooc/ai-tab");
  var UOOC_AI_TAB = {
    id: `${SITE_ID}:ai`,
    title: "AI 作答",
    order: 220,
    mount(root, ctx) {
      const status = el("div", { class: "sztb-field-desc", text: "" });
      const runBtn = el("button", {
        class: "sztb-btn",
        text: "开始作答",
        attrs: { type: "button", "data-variant": "primary" },
        on: {
          click: () => {
            void (async () => {
              const tid = quizTidOnPage();
              if (tid === null) {
                status.textContent = "这个页面上没找到试卷：请先在目录里点开一个测验。";
                ctx.host.toast("没找到试卷", "warn");
                return;
              }
              runBtn.disabled = true;
              status.textContent = `正在作答（tid=${tid}）…进度看【监视】标签页`;
              try {
                const r = await runQuizAnswer(tid, ctx.host);
                status.textContent = r === null ? "作答没跑完，详见【监视】页与日志" : `已填入 ${r.filled} 题，页面已有答案跳过 ${r.alreadyAnswered} 题${r.submitted ? "，已点提交" : "（未提交）"}`;
              } finally {
                runBtn.disabled = false;
              }
            })();
          }
        }
      });
      const testBtn = el("button", {
        class: "sztb-btn",
        text: "测试连接",
        attrs: { type: "button" },
        on: {
          click: () => {
            void (async () => {
              const cfg = aiConfig();
              if (cfg === null) {
                status.textContent = "请先填「接口地址」与「模型名」";
                ctx.host.toast("配置不完整", "warn");
                return;
              }
              testBtn.disabled = true;
              status.textContent = "正在测试…";
              const r = await testConnection(cfg);
              status.textContent = r.detail;
              log12.info(`测试连接：${r.ok ? "OK" : "失败"} — ${r.detail}`);
              ctx.host.toast(r.ok ? "连接正常" : "连接失败，详见下方说明", r.ok ? "success" : "error");
              testBtn.disabled = false;
            })();
          }
        }
      });
      root.appendChild(
        el(
          "div",
          { class: "sztb-field" },
          el("div", { class: "sztb-group-title", text: "操作" }),
          el("div", {
            class: "sztb-field-desc",
            text: "答完不会自动交卷：会先弹确认框，你点了才会提交（还要你手动点一下人机验证码）。"
          }),
          el("div", { class: "sztb-modal-foot" }, runBtn, testBtn),
          status
        )
      );
      root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AI] }));
    }
  };

  // src/sites/uooc/fetch-catalog.ts
  var log13 = scoped("uooc/fetch-catalog");
  var CATALOG_PATH = "/home/learn/getCatalogList";
  var FALLBACK_ORIGIN = "https://www.uooc.net.cn";
  var CATALOG_ATTEMPTS = 3;
  var CATALOG_RETRY_DELAY_MS = 2e3;
  var CATALOG_TIMEOUT_MS = 3e4;
  var DETAIL_MAX_CHARS = 200;
  function defaultOrigin() {
    const loc = globalThis.location;
    const origin = loc?.origin;
    return typeof origin === "string" && origin !== "" ? origin : FALLBACK_ORIGIN;
  }
  function catalogListUrl(cid, origin = defaultOrigin()) {
    return `${origin}${CATALOG_PATH}?cid=${encodeURIComponent(cid)}&hidemsg_=true`;
  }
  var defaultSender = async (url, timeoutMs) => {
    const res = await request({
      url,
      method: "GET",
      responseType: "json",
      timeoutMs,
      priority: PRIORITY.NORMAL,
      channel: "page"
    });
    return { status: res.status, text: res.text, json: res.json };
  };
  function truncateDetail(text2) {
    const flat = text2.replace(/\s+/g, " ").trim();
    return flat.length <= DETAIL_MAX_CHARS ? flat : `${flat.slice(0, DETAIL_MAX_CHARS)}…`;
  }
  function errorText(err) {
    if (err instanceof Error) return err.message;
    return String(err);
  }
  function parseCatalogResponse(json, cid) {
    if (json === null || typeof json !== "object") {
      return { ok: false, failure: { kind: "shape", detail: "响应不是对象" } };
    }
    const root = json;
    if (Number(root.code) !== 1) {
      return {
        ok: false,
        failure: {
          kind: "business",
          code: root.code,
          detail: `code=${String(root.code)} msg=${String(root.msg ?? "")}`
        }
      };
    }
    if (!Array.isArray(root.data)) {
      return { ok: false, failure: { kind: "shape", detail: "code=1 但 data 不是数组" } };
    }
    return { ok: true, points: flattenTaskPoints(root.data, cid), raw: json };
  }
  function describeFailure(failure) {
    switch (failure.kind) {
      case "network":
        return `网络错误：${failure.detail}`;
      case "http":
        return `HTTP ${failure.status}：${failure.detail}`;
      case "business":
        return `业务码异常：${failure.detail}`;
      case "shape":
        return `响应结构异常：${failure.detail}`;
      case "aborted":
        return `已中止：${failure.detail}`;
      default:
        return "未知失败";
    }
  }
  function defaultSleep(ms) {
    return new Promise((resolve2) => {
      setTimeout(resolve2, ms);
    });
  }
  async function attemptOnce(plan) {
    let res;
    try {
      res = await plan.send(plan.url, CATALOG_TIMEOUT_MS);
    } catch (err) {
      return { ok: false, failure: { kind: "network", detail: errorText(err) } };
    }
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        failure: { kind: "http", status: res.status, detail: truncateDetail(res.text) }
      };
    }
    return plan.parse(res);
  }
  async function fetchWithRetry(plan) {
    let attempts = 0;
    let lastFailure = { kind: "network", detail: "一次都没发出去" };
    const aborted = () => ({
      ok: false,
      attempts,
      failure: { kind: "aborted", detail: plan.abortDetail }
    });
    for (let attempt2 = 1; attempt2 <= CATALOG_ATTEMPTS; attempt2 += 1) {
      attempts = attempt2;
      if (attempt2 > 1 && plan.shouldAbort?.() === true) return aborted();
      const outcome = await attemptOnce(plan);
      if (outcome.ok) {
        log13.info(
          `取到${plan.label}：${plan.describeOk(outcome.value)}（第 ${attempt2}/${CATALOG_ATTEMPTS} 次）`
        );
        return { ok: true, attempts: attempt2, value: outcome.value, raw: outcome.raw };
      }
      lastFailure = outcome.failure;
      log13.warn(`取${plan.label}第 ${attempt2}/${CATALOG_ATTEMPTS} 次失败 —— ${describeFailure(lastFailure)}`);
      if (attempt2 >= CATALOG_ATTEMPTS) break;
      if (plan.shouldAbort?.() === true) return aborted();
      await plan.sleep(CATALOG_RETRY_DELAY_MS);
      if (plan.shouldAbort?.() === true) return aborted();
    }
    log13.error(`取${plan.label}彻底失败（共 ${attempts} 次）—— ${describeFailure(lastFailure)}`);
    return { ok: false, attempts, failure: lastFailure };
  }
  async function fetchCatalogPoints(options) {
    const { cid } = options;
    const result = await fetchWithRetry({
      label: "课程树",
      url: catalogListUrl(cid, options.origin),
      send: options.send ?? defaultSender,
      sleep: options.sleep ?? defaultSleep,
      shouldAbort: options.shouldAbort,
      abortDetail: "等待重试期间用户停止了接管",
      parse: (res) => {
        const parsed2 = parseCatalogResponse(res.json, cid);
        return parsed2.ok ? { ok: true, value: parsed2.points, raw: parsed2.raw } : { ok: false, failure: parsed2.failure };
      },
      describeOk: (points) => `${points.length} 个任务点`
    });
    if (!result.ok) return { ok: false, attempts: result.attempts, failure: result.failure };
    return { ok: true, attempts: result.attempts, points: result.value, raw: result.raw };
  }
  var UNIT_PATH = "/home/learn/getUnitLearn";
  function unitLearnUrl(cid, point, origin = defaultOrigin()) {
    const params = [
      `catalog_id=${encodeURIComponent(point.nodeId)}`,
      `chapter_id=${encodeURIComponent(point.chapterId)}`,
      `section_id=${encodeURIComponent(point.sectionId)}`,
      `cid=${encodeURIComponent(cid)}`,
      "hidemsg_=true"
    ];
    return `${origin}${UNIT_PATH}?${params.join("&")}`;
  }
  function parseUnitResponse(json) {
    if (json === null || typeof json !== "object") {
      return { ok: false, failure: { kind: "shape", detail: "响应不是对象" } };
    }
    const root = json;
    if (Number(root.code) !== 1) {
      return {
        ok: false,
        failure: {
          kind: "business",
          code: root.code,
          detail: `code=${String(root.code)} msg=${String(root.msg ?? "")}`
        }
      };
    }
    if (!Array.isArray(root.data)) {
      return { ok: false, failure: { kind: "shape", detail: "code=1 但 data 不是数组" } };
    }
    return { ok: true, sources: parseUnitSources(root.data), raw: json };
  }
  async function fetchUnitSources(options) {
    const { cid, point } = options;
    const result = await fetchWithRetry({
      label: "资源列表",
      url: unitLearnUrl(cid, point, options.origin),
      send: options.send ?? defaultSender,
      sleep: options.sleep ?? defaultSleep,
      shouldAbort: options.shouldAbort,
      abortDetail: "等待重试期间用户停止了接管",
      parse: (res) => {
        const parsed2 = parseUnitResponse(res.json);
        return parsed2.ok ? { ok: true, value: parsed2.sources, raw: parsed2.raw } : { ok: false, failure: parsed2.failure };
      },
      describeOk: (sources) => `${sources.length} 个资源`
    });
    if (!result.ok) return { ok: false, attempts: result.attempts, failure: result.failure };
    return { ok: true, attempts: result.attempts, sources: result.value, raw: result.raw };
  }

  // src/sites/uooc/takeover.ts
  var log14 = scoped("uooc/takeover");
  var VIEWER_SEL = "div.showViewer";
  var POLL_MS = 200;
  var STUCK_LIMIT = 3;
  var QUIZ_MAX_ROUNDS = 3;
  var ALERT_DEDUPE = "sztb-uooc-takeover-alert";
  var VIDEO_SLACK_MS2 = 10 * 60 * 1e3;
  var VIDEO_MIN_MS2 = 5 * 60 * 1e3;
  var VIDEO_MAX_MS2 = 6 * 60 * 60 * 1e3;
  var IDLE_TEXT = "已停止 —— 点【开始接管】从第一个未完成任务点接着走";
  var running2 = false;
  var statusText2 = IDLE_TEXT;
  var token2 = null;
  var listeners5 = /* @__PURE__ */ new Set();
  function notify2() {
    for (const fn of [...listeners5]) {
      try {
        fn();
      } catch {
      }
    }
  }
  function setStatus2(text2, kind = "info") {
    statusText2 = text2;
    notify2();
    noticePost(text2, kind);
  }
  function takeoverStatus() {
    return { running: running2, text: statusText2 };
  }
  function subscribeTakeover(fn) {
    listeners5.add(fn);
    return () => {
      listeners5.delete(fn);
    };
  }
  function takeoverStart(host2) {
    if (running2) {
      log14.warn("接管已经在跑，这次【开始接管】被忽略");
      return;
    }
    const t = { cancelled: false };
    token2 = t;
    running2 = true;
    setStatus2("接管中：正在读取课程目录…");
    void loop(host2, t).catch((err) => {
      const detail = err instanceof Error ? err.message : String(err);
      log14.error("接管循环异常退出", detail);
      void fatal(host2, `已停止 —— 接管内部出错：${detail}`, `接管循环抛了异常：

${detail}`);
    });
  }
  function takeoverStop() {
    const t = token2;
    if (t === null) return;
    t.cancelled = true;
    release();
    setStatus2(IDLE_TEXT);
  }
  function release() {
    running2 = false;
    token2 = null;
    setCourseProgress(null);
  }
  function stop(text2) {
    release();
    setStatus2(text2);
  }
  async function fatal(host2, status, body) {
    release();
    setStatus2(status, "warn");
    log14.warn(status);
    await host2.alert({
      title: "接管已停止",
      body,
      danger: true,
      dedupeClass: ALERT_DEDUPE,
      actions: [{ key: "ok", label: "知道了", variant: "primary" }]
    });
  }
  async function fatalCatalog(host2, failure, attempts) {
    const detail = describeFailure(failure);
    log14.error(`取课程目录失败（已试 ${attempts} 次）：${detail}`);
    await fatal(
      host2,
      "已停止 —— 读取课程目录失败",
      `连着试了 ${attempts} 次都没能拿到课程目录（间隔 2 秒、单次超时 30 秒）。

${detail}

多半是断网或登录态失效。处理完之后点【开始接管】重来。`
    );
  }
  function sleep2(ms, t) {
    return new Promise((resolve2) => {
      if (t.cancelled || ms <= 0) {
        resolve2();
        return;
      }
      let done = false;
      const finish2 = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer3);
        window.clearInterval(iv);
        resolve2();
      };
      const timer3 = window.setTimeout(finish2, ms);
      const iv = window.setInterval(() => {
        if (t.cancelled) finish2();
      }, POLL_MS);
    });
  }
  async function waitFor(pred, timeoutMs, t) {
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      if (t.cancelled) return false;
      if (pred()) return true;
      if (Date.now() >= deadline) return false;
      await sleep2(POLL_MS, t);
    }
  }
  function viewerSignature() {
    const box2 = document.querySelector(VIEWER_SEL);
    if (box2 === null) return "";
    const parts = [];
    box2.querySelectorAll("video").forEach((v) => parts.push(`v:${v.getAttribute("src") ?? ""}`));
    box2.querySelectorAll("iframe").forEach((f) => parts.push(`i:${f.getAttribute("src") ?? ""}`));
    return parts.join("|");
  }
  function viewerReady(kind) {
    const box2 = document.querySelector(VIEWER_SEL);
    if (box2 === null) return false;
    if (kind === "video") return box2.querySelector("video") !== null;
    return box2.querySelector("iframe") !== null && quizTidOnPage() !== null;
  }
  async function gotoPoint(hash, kind, label, t) {
    const needsChange = location.hash !== hash;
    const before = needsChange ? viewerSignature() : "";
    if (needsChange) {
      log14.info(`跳转 ${hash}`);
      location.hash = hash;
    } else {
      log14.debug(`已经在这一项上了（${hash}），不再改 hash`);
    }
    await sleep2(waitBeforeMs(), t);
    if (t.cancelled) return false;
    const ok = await waitFor(() => {
      if (!viewerReady(kind)) return false;
      return !needsChange || viewerSignature() !== before;
    }, waitTimeoutMs(), t);
    if (ok) log14.info(`内容已就绪：${label}`);
    return ok;
  }
  function waitVideoEnd(video, t) {
    return new Promise((resolve2) => {
      if (video.ended) {
        resolve2(true);
        return;
      }
      const rate = video.playbackRate > 0 ? video.playbackRate : 1;
      const remaining = Number.isFinite(video.duration) ? (video.duration - video.currentTime) / rate : 0;
      const budget = Math.min(VIDEO_MAX_MS2, Math.max(VIDEO_MIN_MS2, remaining * 1e3 + VIDEO_SLACK_MS2));
      let done = false;
      const finish2 = (ok) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer3);
        window.clearInterval(iv);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onError);
        resolve2(ok);
      };
      const onEnded = () => finish2(true);
      const onError = () => finish2(false);
      const timer3 = window.setTimeout(() => finish2(video.ended), budget);
      const iv = window.setInterval(() => {
        if (t.cancelled) finish2(false);
      }, POLL_MS);
      video.addEventListener("ended", onEnded);
      video.addEventListener("error", onError);
    });
  }
  function pointLabel(point) {
    const parts = point.path.filter((s) => s !== "");
    const tail = point.name === "" ? "" : `「${point.name}」`;
    const head = parts.length === 0 ? "" : parts.join(" ");
    return `${head}${tail}` === "" ? point.typeName || point.nodeId : `${head}${tail}`;
  }
  function taskLabel(task) {
    const head = pointLabel(task.point);
    const fallback = SOURCE_NAME[task.source.type] ?? "";
    const name = task.source.name === "" ? fallback : task.source.name;
    return name === "" ? head : `${head} · ${name}`;
  }
  function publishProgress(points, sum, current) {
    const label = current === null ? "" : pointLabel(current);
    setCourseProgress({
      index: sum.done,
      total: sum.total,
      label,
      rows: buildCourseRows(points),
      currentId: current === null ? null : current.nodeId
    });
  }
  async function reload(ctx, t) {
    const res = await fetchCatalogPoints({ cid: ctx.cid, shouldAbort: () => t.cancelled });
    if (res.ok) {
      ctx.points = res.points;
      return true;
    }
    if (res.failure.kind === "aborted") return false;
    await fatalCatalog(ctx.host, res.failure, res.attempts);
    return false;
  }
  function stillUnfinished(ctx, nodeId) {
    const found = ctx.points.find((p) => p.nodeId === nodeId);
    return found !== void 0 && !found.finished;
  }
  async function loop(host2, t) {
    const cid = courseIdFromLocation(location.pathname, location.hash);
    if (cid === null) {
      stop("已停止 —— 认不出这是哪门课（地址栏里没有 cid）");
      log14.warn(`认不出 cid：pathname=${location.pathname} hash=${location.hash}`);
      return;
    }
    const ctx = {
      host: host2,
      cid,
      skipped: /* @__PURE__ */ new Set(),
      skippedSources: /* @__PURE__ */ new Set(),
      warnedTypes: /* @__PURE__ */ new Set(),
      points: []
    };
    const first = await fetchCatalogPoints({ cid, shouldAbort: () => t.cancelled });
    if (!first.ok) {
      if (first.failure.kind === "aborted") return;
      await fatalCatalog(host2, first.failure, first.attempts);
      return;
    }
    ctx.points = first.points;
    log14.info(`课程 ${cid} 共 ${first.points.length} 个任务点`);
    if (first.points.length === 0) {
      stop("已停止 —— 这门课一个任务点都没有");
      return;
    }
    let lastNodeId = "";
    let stuck = 0;
    for (; ; ) {
      if (t.cancelled) return;
      const sum = summarizeTaskPoints(ctx.points);
      const section = firstUnfinished(ctx.points, ctx.skipped);
      publishProgress(ctx.points, sum, section);
      if (sum.done === sum.total) {
        release();
        setStatus2("已停止 —— 全部任务点都完成了 🎉");
        log14.info("全部任务点都完成了");
        return;
      }
      if (section === null) {
        stop(`已停止 —— 剩 ${sum.total - sum.done} 个任务点本站不自动处理，其余都完成了`);
        log14.info(`没有可自动处理的节了，跳过 ${ctx.skipped.size} 个`);
        return;
      }
      stuck = section.nodeId === lastNodeId ? stuck + 1 : 1;
      lastNodeId = section.nodeId;
      if (stuck > STUCK_LIMIT) {
        await fatal(
          host2,
          `已停止 —— 「${section.name}」连续 ${STUCK_LIMIT} 轮没有进展`,
          `同一节被连续挑中 ${STUCK_LIMIT} 次都没能往下走，判定为卡死。

位置：${pointLabel(section)}
形态：${section.form}
任务点个数：${section.taskCount}
这多半是本工具的 bug（而不是站点的问题），可以带着上面的信息反馈。`
        );
        return;
      }
      if (section.form === "unsupported") {
        log14.warn(`「${section.name}」(${section.nodeId}) 的路径形态不支持，已跳过`);
        ctx.skipped.add(section.nodeId);
        continue;
      }
      const unit = await fetchUnitSources({ cid, point: section, shouldAbort: () => t.cancelled });
      if (!unit.ok) {
        if (unit.failure.kind === "aborted") return;
        await fatalCatalog(host2, unit.failure, unit.attempts);
        return;
      }
      const target = firstUnfinishedSource(unit.sources, ctx.skippedSources);
      if (target === null) {
        const taskSources = unit.sources.filter((s) => s.isTask);
        for (const s of unit.sources) {
          if (s.kind === "unknown" && !ctx.warnedTypes.has(s.type)) {
            ctx.warnedTypes.add(s.type);
            log14.warn(`遇到未知类型 ${s.type}（${s.typeName || "无名字"}），已跳过`);
          }
        }
        const reason = taskSources.length === 0 ? "这一节没有本站能处理的任务点" : "这一节的视频/测验都已完成，但目录树仍标未完成（站点记账滞后）";
        log14.warn(
          `跳过「${section.name}」(${section.nodeId})：${reason}（资源 ${unit.sources.length} 个 / 任务点 ${taskSources.length} 个）`
        );
        ctx.skipped.add(section.nodeId);
        continue;
      }
      const kind = target.kind === "video" ? "video" : "quiz";
      const task = { point: section, source: target, hash: hashForSource(cid, section, target) };
      const label = taskLabel(task);
      setStatus2(
        `接管中：${kind === "video" ? "正在播放" : "正在作答"} ${label}（${sum.done}/${sum.total} 已完成）`
      );
      if (kind === "quiz") {
        const q = await handleQuiz(ctx, task, t);
        if (t.cancelled) return;
        if (!q.ok) return;
        if (q.verdict === "pass") continue;
        await fatal(
          host2,
          `已停止 —— 测验「${label}」答了 ${q.rounds} 轮仍未通过`,
          `这个测验连着作答并提交了 ${q.rounds} 轮，站点每次都判没到及格线。

位置：${label}

去页面看一眼得分与及格线，再决定要不要点【开始接管】接着走。`
        );
        return;
      }
      const handled = await handleVideo(ctx, task, t);
      if (t.cancelled) return;
      if (!handled) return;
      if (!await reload(ctx, t)) return;
      if (t.cancelled) return;
      if (!stillUnfinished(ctx, section.nodeId)) continue;
      setStatus2(`接管中：视频「${label}」播完了，等站点记账（最多 ${Math.round(waitTimeoutMs() / 1e3)} 秒）…`);
      log14.info(`视频「${label}」播完了但还没记完成，等 ${waitTimeoutMs()}ms 再拉一次`);
      await sleep2(waitTimeoutMs(), t);
      if (t.cancelled) return;
      if (!await reload(ctx, t)) return;
      if (t.cancelled) return;
      if (!stillUnfinished(ctx, section.nodeId)) continue;
      await fatal(
        host2,
        `已停止 —— 视频「${label}」播完两轮仍未记完成`,
        `这一项已经完整播完，又等了两轮（${holdAfterMs()} 毫秒 + ${waitTimeoutMs()} 毫秒）重新拉取课程目录，站点那边仍然显示未完成。

位置：${label}

可能原因：播放没真正到底（比如一直卡着 / 被暂停）、或者站点记账更慢。
去页面看一眼这一项现在的状态，再决定要不要点【开始接管】接着走。`
      );
      return;
    }
  }
  async function handleVideo(ctx, task, t) {
    const label = taskLabel(task);
    if (!await gotoPoint(task.hash, "video", label, t)) {
      if (t.cancelled) return false;
      await fatal(
        ctx.host,
        `已停止 —— 视频「${label}」等满等待超时也没出现播放器`,
        `跳到这一项之后，等了 ${Math.round(waitTimeoutMs() / 1e3)} 秒都没等到播放器出现。

位置：${label}
形态：${task.point.form}
跳转地址：${task.hash}

如果是四级路径（\`/subsection\`）的项，那说明这套 hash 拼法没被站点认下来 —— 这是新方案里**唯一没有实证**的地方，把上面那一行地址反馈给开发者。`
      );
      return false;
    }
    const box2 = document.querySelector(VIEWER_SEL);
    const video = box2?.querySelector("video");
    if (video === void 0 || video === null) {
      await fatal(
        ctx.host,
        `已停止 —— 视频「${label}」找到了播放器却拿不到 video 元素`,
        `内容区里出现了 \`div.showViewer\`，但里面取不到 \`<video>\`。多半是页面结构和预期不一致，请反馈。`
      );
      return false;
    }
    log14.info(`视频「${label}」开始等播完（当前 ${video.currentTime.toFixed(1)}s / ${String(video.duration)}s）`);
    const ended = await waitVideoEnd(video, t);
    if (t.cancelled) return false;
    if (!ended) {
      log14.warn(`视频「${label}」没等到播完（被暂停 / 出错 / 超保底时长），转去核实完成状态`);
    }
    await sleep2(holdAfterMs(), t);
    return !t.cancelled;
  }
  async function handleQuiz(ctx, task, t) {
    const give = (ok, verdict, rounds2) => ({
      ok,
      verdict,
      rounds: rounds2
    });
    const label = taskLabel(task);
    if (!isEnabled(SITE_ID, TOGGLE.AI_ANSWER)) {
      await fatal(
        ctx.host,
        `已停止 —— 测验「${label}」到了，但 AI 作答没开`,
        `走到测验了，但【AI 作答】开关是关着的。

位置：${label}

没有替你跳过：跳过等于在不知情的情况下漏掉一整个测验。
去【AI 作答】页把开关打开（顺便确认接口地址与模型名填好了），再点【开始接管】。`
      );
      return give(false, null, 0);
    }
    if (!await gotoPoint(task.hash, "quiz", label, t)) {
      if (t.cancelled) return give(false, null, 0);
      await fatal(
        ctx.host,
        `已停止 —— 测验「${label}」等满等待超时还没出题`,
        `跳到这一项之后，等了 ${Math.round(waitTimeoutMs() / 1e3)} 秒，测验的题目一直没渲染出来。

位置：${label}
跳转地址：${task.hash}

去页面看一眼这项到底是什么情况，再决定要不要点【开始接管】接着走。`
      );
      return give(false, null, 0);
    }
    const fromPage = quizTidOnPage();
    const tid = fromPage ?? (task.source.taskId === "" ? null : task.source.taskId);
    if (tid === null) {
      stop(`已停止 —— 测验「${label}」读不出 tid`);
      log14.warn(`测验「${label}」页面与接口都给不出 tid，无法作答`);
      return give(false, null, 0);
    }
    if (fromPage !== null && task.source.taskId !== "" && fromPage !== task.source.taskId) {
      log14.warn(`测验「${label}」页面 tid=${fromPage} 与接口 tid=${task.source.taskId} 不一致，按页面的走`);
    }
    let last = null;
    let rounds = 0;
    for (let round2 = 1; round2 <= QUIZ_MAX_ROUNDS; round2 += 1) {
      if (t.cancelled) return give(false, null, rounds);
      rounds = round2;
      setStatus2(`接管中：正在作答 ${label}（第 ${round2}/${QUIZ_MAX_ROUNDS} 轮）`);
      const result = await runQuizAnswer(tid, ctx.host);
      if (t.cancelled) return give(false, null, rounds);
      if (result === null) {
        stop(`已停止 —— 测验「${label}」没能开始作答（看日志与提示）`);
        log14.warn(`runQuizAnswer 返回 null，测验「${label}」没跑起来`);
        return give(false, null, rounds);
      }
      const commit = result.commit;
      last = commit;
      if (commit === null) {
        await fatal(
          ctx.host,
          `已停止 —— 测验「${label}」没截获到交卷响应`,
          `点完提交之后没有读到站点的回话，所以无从判断过没过。

位置：${label}

可能原因：验证码还没点完、站点换了交卷接口、或者交卷请求不是从试卷 iframe 里发出来的。
去页面看一眼这次到底交上没有（有没有出现分数），再决定要不要点【开始接管】接着走。`
        );
        return give(false, null, rounds);
      }
      if (!isCommitHttpOk(commit)) {
        await fatal(
          ctx.host,
          `已停止 —— 测验「${label}」交卷请求返回 HTTP ${commit.httpStatus}`,
          `这一发 POST /exam/commit 的状态码是 ${commit.httpStatus}，不是 200，响应体里的业务码不能当结论用。

位置：${label}
站点回话：${commit.message || "（空）"}

去页面看一眼状态，过一会儿再点【开始接管】重试。`
        );
        return give(false, null, rounds);
      }
      if (commit.verdict === "pass") {
        log14.info(`测验「${label}」第 ${round2} 轮通过（得分 ${commit.score}）`);
        return give(true, "pass", rounds);
      }
      if (commit.verdict === "unknown") {
        await fatal(
          ctx.host,
          `已停止 —— 测验「${label}」的交卷回话读不懂`,
          `站点回了一个我们不认识的业务码，不敢替你下结论（既不重做也不跳过）。

位置：${label}
站点回话：${commit.message || "（空）"}
原始响应：${JSON.stringify(commit.raw).slice(0, 300)}

把上面这段贴回来，我们对一下新的判据。`
        );
        return give(false, null, rounds);
      }
      log14.warn(
        `测验「${label}」第 ${round2} 轮未通过：${commit.message}（得分 ${commit.score} / 门槛 ${commit.passScore}）`
      );
      if (round2 === QUIZ_MAX_ROUNDS) return give(true, "fail", rounds);
      setStatus2(`接管中：测验「${label}」第 ${round2} 轮没过（得分 ${commit.score}），重做…`);
      await sleep2(holdAfterMs(), t);
    }
    return give(true, last === null ? null : last.verdict, rounds);
  }

  // src/sites/uooc/tabs/autoplay.ts
  var UOOC_AUTOPLAY_TAB = {
    id: `${SITE_ID}:autoplay`,
    title: "接管",
    order: 210,
    mount(root, ctx) {
      const startBtn = el("button", {
        class: "sztb-btn",
        text: "开始接管",
        attrs: { type: "button", "data-variant": "primary" }
      });
      const stopBtn = el("button", {
        class: "sztb-btn",
        text: "停止接管",
        attrs: { type: "button", "data-variant": "danger" }
      });
      startBtn.addEventListener("click", () => {
        takeoverStart(ctx.host);
      });
      stopBtn.addEventListener("click", () => {
        takeoverStop();
      });
      const statusLine = el("div", { class: "sztb-field-desc" });
      const sync = () => {
        const s = takeoverStatus();
        statusLine.textContent = s.text;
        startBtn.disabled = s.running;
        stopBtn.disabled = !s.running;
      };
      sync();
      const off = subscribeTakeover(() => {
        if (!root.isConnected) {
          off();
          return;
        }
        sync();
      });
      root.appendChild(el("div", { class: "sztb-toolbar" }, startBtn, stopBtn));
      root.appendChild(statusLine);
    }
  };

  // src/sites/uooc/tabs/monitor.ts
  var log15 = scoped("uooc/monitor-tab");
  var KIND_MARK = {
    info: "·",
    success: "✔",
    warn: "!",
    error: "✘"
  };
  function bar(done, total) {
    const pct = total <= 0 ? 0 : Math.round(done / total * 100);
    const fill = el("div", { class: "sztb-bar-fill" });
    fill.style.width = `${pct}%`;
    return el(
      "div",
      { class: "sztb-field" },
      el("div", { class: "sztb-field-desc", text: `${done} / ${total}（${pct}%）` }),
      el("div", { class: "sztb-bar" }, fill)
    );
  }
  function courseTree(rows, currentId) {
    const box2 = el("div", { class: "sztb-tree" });
    for (const row3 of rows) {
      const mark = row3.done === null ? "　" : row3.done ? "✅" : "⬜";
      const type = row3.typeName === "" ? "" : `[${row3.typeName}] `;
      const line = el("div", {
        class: "sztb-tree-row",
        attrs: { "data-depth": String(row3.depth), "data-current": String(isCurrentRow(row3, currentId)) }
      });
      if (row3.depth > 0) line.style.paddingLeft = `${4 + row3.depth * 14}px`;
      line.appendChild(el("span", { class: "sztb-tree-mark", text: mark }));
      line.appendChild(el("span", { text: `${type}${row3.label}` }));
      box2.appendChild(line);
    }
    return box2;
  }
  function questionRow(q) {
    const samples = q.samples.length === 0 ? "—" : q.samples.map((s) => s === null ? "✗" : s).join(" → ");
    return el(
      "tr",
      {},
      el("td", { text: String(q.no) }),
      el("td", { text: q.typeText === "" ? "—" : q.typeText }),
      el("td", { text: QUESTION_STATUS_TEXT[q.status] }),
      el("td", { text: String(q.requests) }),
      el("td", { text: samples }),
      el("td", { text: q.answer === "" ? "—" : q.answer }),
      el("td", { text: q.note === "" ? "—" : q.note })
    );
  }
  function fillStatus(box2) {
    box2.appendChild(el("div", { class: "sztb-group-title", text: "接管状态" }));
    box2.appendChild(el("div", { class: "sztb-status-line", text: takeoverStatus().text }));
    const items2 = noticeList();
    if (items2.length === 0) {
      box2.appendChild(el("div", { class: "sztb-field-desc", text: "还没有任何提示" }));
      return;
    }
    const list2 = el("div", { class: "sztb-notices" });
    for (let i = items2.length - 1; i >= 0; i -= 1) {
      const n = items2[i];
      const row3 = el("div", { class: "sztb-notice-row", data: { kind: n.kind } });
      row3.appendChild(el("span", { class: "sztb-notice-time", text: clockText(n.at) }));
      row3.appendChild(el("span", { class: "sztb-notice-kind", text: KIND_MARK[n.kind] }));
      row3.appendChild(
        el("span", {
          class: "sztb-notice-text",
          text: n.count > 1 ? `${n.text}（×${n.count}）` : n.text
        })
      );
      list2.appendChild(row3);
    }
    box2.appendChild(list2);
  }
  var UOOC_MONITOR_TAB = {
    id: `${SITE_ID}:monitor`,
    title: "监视",
    order: 230,
    mount(root, ctx) {
      const statusBox = el("div", { class: "sztb-field" });
      root.appendChild(statusBox);
      const box2 = el("div", { class: "sztb-field" });
      root.appendChild(box2);
      const offs = [];
      const draw = () => {
        const s = monitorState();
        statusBox.textContent = "";
        fillStatus(statusBox);
        box2.textContent = "";
        const course = s.course;
        if (course === null) {
          box2.appendChild(el("div", { class: "sztb-group-title", text: "课程进度" }));
          box2.appendChild(el("div", { class: "sztb-field-desc", text: "接管还没开始（在【接管】页点【开始接管】）" }));
        } else {
          box2.appendChild(el("div", { class: "sztb-group-title", text: "课程进度" }));
          box2.appendChild(el("div", { class: "sztb-field-desc", text: course.label }));
          box2.appendChild(bar(course.index, course.total));
          const rows = course.rows;
          if (rows !== void 0 && rows.length > 0) {
            box2.appendChild(courseTree(rows, course.currentId ?? null));
          }
        }
        box2.appendChild(el("div", { class: "sztb-group-title", text: "AI 答题进度" }));
        const quiz2 = s.quiz;
        if (quiz2 === null) {
          box2.appendChild(el("div", { class: "sztb-field-desc", text: "本次会话还没跑过答题" }));
        } else {
          box2.appendChild(el("div", { class: "sztb-field-desc", text: `任务 tid=${quiz2.tid} —— ${QUIZ_PHASE_TEXT[quiz2.phase]}` }));
          if (quiz2.message !== "") box2.appendChild(el("div", { class: "sztb-field-desc", text: quiz2.message }));
          box2.appendChild(bar(quiz2.done, quiz2.total));
          const table = el(
            "table",
            { class: "sztb-table" },
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                el("th", { text: "题号" }),
                el("th", { text: "题型" }),
                el("th", { text: "状态" }),
                el("th", { text: "请求" }),
                el("th", { text: "每次答案" }),
                el("th", { text: "定稿" }),
                el("th", { text: "备注" })
              )
            ),
            el("tbody", {}, ...quiz2.questions.map(questionRow))
          );
          box2.appendChild(table);
        }
        void ctx;
      };
      draw();
      const stop2 = () => {
        while (offs.length > 0) offs.pop()?.();
      };
      const onChange = () => {
        if (!root.isConnected) {
          stop2();
          return;
        }
        draw();
      };
      offs.push(subscribeMonitor(onChange), subscribeNotice(onChange), subscribeTakeover(onChange));
      log15.debug("监视页已挂载");
    }
  };

  // src/sites/uooc/tabs/video.ts
  var UOOC_VIDEO_TAB = {
    id: `${SITE_ID}:video`,
    title: "视频",
    order: 200,
    mount(root, ctx) {
      root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.VIDEO] }));
    }
  };

  // src/sites/uooc/tabs/wait.ts
  var UOOC_WAIT_TAB = {
    id: `${SITE_ID}:wait`,
    title: "等待",
    order: 240,
    mount(root, ctx) {
      root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AUTOPLAY] }));
    }
  };

  // src/sites/uooc/blank.ts
  var log16 = scoped("uooc/blank");
  var BLACK_FRAME_B64 = "AAAAAWdCwB7cCgL/lwEQAAADABAAAAMDIPFi+AAAAAFozg/IAAABBgX//1vcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIzIDA0ODBjYjAgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MSBkZWJsb2NrPTE6LTM6LTMgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTIgcHN5PTEgcHN5X3JkPTIuMDA6MC43MCBtaXhlZF9yZWY9MCBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTAgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9MCB0aHJlYWRzPTExIGxvb2thaGVhZF90aHJlYWRzPTIgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTEga2V5aW50X21pbj0xIHNjZW5lY3V0PTAgaW50cmFfcmVmcmVzaD0wIHJjPWNyZiBtYnRyZWU9MCBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMjAAgAAAAWWIhAVzn///D0UAAULfJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXgA==";
  var BLACK_WIDTH = 640;
  var BLACK_HEIGHT = 360;
  var TIMESCALE = 1e3;
  var MAX_DURATION_MS = 8 * 60 * 60 * 1e3;
  var urlCache = /* @__PURE__ */ new Map();
  var URL_CACHE_MAX = 32;
  function u16(n) {
    return new Uint8Array([n >> 8 & 255, n & 255]);
  }
  function u32(n) {
    return new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
  }
  function ascii(text2) {
    const out = new Uint8Array(text2.length);
    for (let i = 0; i < text2.length; i += 1) out[i] = text2.charCodeAt(i) & 255;
    return out;
  }
  function concat(parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
  function box(type, ...parts) {
    const payload = concat(parts);
    return concat([u32(payload.length + 8), ascii(type), payload]);
  }
  function fullBox(type, version, flags, ...parts) {
    return box(type, new Uint8Array([version & 255, flags >> 16 & 255, flags >> 8 & 255, flags & 255]), ...parts);
  }
  var MATRIX = (() => {
    const m = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
    return concat(m.map((v) => u32(v)));
  })();
  function base64ToBytes(text2) {
    const bin = atob(text2);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  function splitAnnexB(stream) {
    const heads = [];
    for (let i = 0; i + 2 < stream.length; i += 1) {
      if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1) {
        heads.push(i + 3);
        i += 2;
      }
    }
    const out = [];
    for (let k = 0; k < heads.length; k += 1) {
      const start = heads[k];
      let end = k + 1 < heads.length ? heads[k + 1] - 3 : stream.length;
      while (end > start && stream[end - 1] === 0) end -= 1;
      if (end > start) out.push(stream.slice(start, end));
    }
    return out;
  }
  function nalType(nal) {
    return (nal[0] ?? 0) & 31;
  }
  function buildAvcC(sps, pps) {
    if (sps.length < 4) throw new Error("SPS 太短，至少要有 4 个字节");
    return concat([
      new Uint8Array([1]),
      // configurationVersion
      new Uint8Array([sps[1]]),
      // AVCProfileIndication
      new Uint8Array([sps[2]]),
      // profile_compatibility
      new Uint8Array([sps[3]]),
      // AVCLevelIndication
      new Uint8Array([252 | 3]),
      // 保留 6 位全 1 + lengthSizeMinusOne=3（4 字节长度前缀）
      new Uint8Array([224 | 1]),
      // 保留 3 位全 1 + numOfSequenceParameterSets=1
      u16(sps.length),
      sps,
      new Uint8Array([1]),
      // numOfPictureParameterSets
      u16(pps.length),
      pps
    ]);
  }
  function buildBlankMp4(opts) {
    const { durationMs, width, height, sps, pps } = opts;
    const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isom"), ascii("iso2"), ascii("avc1"), ascii("mp41"));
    const sample = concat(opts.sampleNals.map((nal) => concat([u32(nal.length), nal])));
    const mdat = box("mdat", sample);
    const mvhd = fullBox(
      "mvhd",
      0,
      0,
      u32(0),
      // creation_time
      u32(0),
      // modification_time
      u32(TIMESCALE),
      u32(durationMs),
      u32(65536),
      // rate = 1.0
      u16(256),
      // volume = 1.0
      u16(0),
      // reserved
      u32(0),
      // reserved
      u32(0),
      // reserved
      MATRIX,
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      // pre_defined[6]
      u32(2)
      // next_track_ID
    );
    const tkhd = fullBox(
      "tkhd",
      0,
      7,
      // enabled | in movie | in preview
      u32(0),
      u32(0),
      u32(1),
      // track_ID
      u32(0),
      // reserved
      u32(durationMs),
      u32(0),
      u32(0),
      // reserved[2]
      u16(0),
      // layer
      u16(0),
      // alternate_group
      u16(0),
      // volume（视频轨恒为 0）
      u16(0),
      // reserved
      MATRIX,
      u32(width << 16),
      u32(height << 16)
    );
    const mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(durationMs), u16(21956), u16(0));
    const hdlr = fullBox("hdlr", 0, 0, u32(0), ascii("vide"), u32(0), u32(0), u32(0), ascii("VideoHandler\0"));
    const vmhd = fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0));
    const dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));
    const avc1 = box(
      "avc1",
      new Uint8Array([0, 0, 0, 0, 0, 0]),
      // reserved
      u16(1),
      // data_reference_index
      u16(0),
      // pre_defined
      u16(0),
      // reserved
      u32(0),
      u32(0),
      u32(0),
      // pre_defined[3]
      u16(width),
      u16(height),
      u32(4718592),
      // 72 dpi
      u32(4718592),
      u32(0),
      // reserved
      u16(1),
      // frame_count
      new Uint8Array(32),
      // compressorname（32 字节定长，全 0 即无名）
      u16(24),
      // depth
      u16(65535),
      // pre_defined
      box("avcC", buildAvcC(sps, pps))
    );
    const buildMoov = (chunkOffset) => {
      const stbl = box(
        "stbl",
        fullBox("stsd", 0, 0, u32(1), avc1),
        // 只有一个 sample，它的 delta 就是整段时长 —— 黑帧「显示」到片尾
        fullBox("stts", 0, 0, u32(1), u32(1), u32(durationMs)),
        fullBox("stsc", 0, 0, u32(1), u32(1), u32(1), u32(1)),
        fullBox("stsz", 0, 0, u32(0), u32(1), u32(sample.length)),
        fullBox("stco", 0, 0, u32(1), u32(chunkOffset))
      );
      const minf = box("minf", vmhd, dinf, stbl);
      const mdia = box("mdia", mdhd, hdlr, minf);
      const trak = box("trak", tkhd, mdia);
      return box("moov", mvhd, trak);
    };
    const offset = ftyp.length + buildMoov(0).length + 8;
    return concat([ftyp, buildMoov(offset), mdat]);
  }
  var parsed = null;
  function blackFrame() {
    if (parsed !== null) return parsed;
    const nals = splitAnnexB(base64ToBytes(BLACK_FRAME_B64));
    const sps = nals.find((n) => nalType(n) === 7);
    const pps = nals.find((n) => nalType(n) === 8);
    if (sps === void 0 || pps === void 0) throw new Error("内嵌黑帧码流缺少 SPS/PPS");
    const slice = nals.filter((n) => nalType(n) === 5 || nalType(n) === 1);
    if (slice.length === 0) throw new Error("内嵌黑帧码流缺少切片 NAL");
    parsed = { sps, pps, nals: slice };
    return parsed;
  }
  function blankVideoBytes(durationMs) {
    const frame = blackFrame();
    return buildBlankMp4({
      durationMs,
      width: BLACK_WIDTH,
      height: BLACK_HEIGHT,
      sps: frame.sps,
      pps: frame.pps,
      sampleNals: frame.nals
    });
  }
  function blankVideoUrl(durationMs) {
    const hit = urlCache.get(durationMs);
    if (hit !== void 0) return hit;
    const bytes = blankVideoBytes(durationMs);
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    const url = URL.createObjectURL(new Blob([buf], { type: "video/mp4" }));
    if (urlCache.size >= URL_CACHE_MAX) {
      const oldest = urlCache.keys().next();
      if (oldest.done !== true) urlCache.delete(oldest.value);
    }
    urlCache.set(durationMs, url);
    return url;
  }
  var states = /* @__PURE__ */ new WeakMap();
  var FIGHT_WINDOW_MS = 1e4;
  var FIGHT_MAX = 3;
  function maybeSwapToBlank(v) {
    const state2 = states.get(v) ?? { url: null, stamps: [], giveUp: false, lastAbsurd: null };
    states.set(v, state2);
    if (state2.giveUp) return false;
    if (!isEnabled(SITE_ID, TOGGLE.BLANK_VIDEO)) return false;
    if (state2.url !== null && v.currentSrc === state2.url) return false;
    if (v.readyState < 1) return false;
    const seconds = v.duration;
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    const durationMs = Math.round(seconds * 1e3);
    if (durationMs > MAX_DURATION_MS) {
      if (state2.lastAbsurd !== durationMs) {
        state2.lastAbsurd = durationMs;
        log16.warn(`时长 ${seconds}s 大得不像课程视频，不换片源`);
      }
      return false;
    }
    const now = Date.now();
    while (state2.stamps.length > 0 && now - state2.stamps[0] > FIGHT_WINDOW_MS) state2.stamps.shift();
    if (state2.stamps.length >= FIGHT_MAX) {
      state2.giveUp = true;
      log16.warn(`这个播放器 ${FIGHT_WINDOW_MS / 1e3} 秒内被换了 ${FIGHT_MAX} 次片源，疑似与站点对着改，停手`);
      noticePost("空白片源被站点反复改回，已停手，这一集继续播原片", "warn", { quiet: true });
      return false;
    }
    const wasPlaying = !v.paused && !v.ended;
    let url;
    try {
      url = blankVideoUrl(durationMs);
    } catch (err) {
      log16.warn(`合成空白视频失败，继续播原片：${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    state2.stamps.push(now);
    state2.url = url;
    v.src = url;
    v.addEventListener(
      "loadedmetadata",
      () => {
        try {
          if (v.currentTime !== 0) v.currentTime = 0;
        } catch {
        }
        if (!wasPlaying) return;
        const p = v.play();
        if (p !== void 0 && typeof p.catch === "function") {
          p.catch((err) => {
            log16.debug(`空白片源续播被拒绝：${err instanceof Error ? err.message : String(err)}`);
          });
        }
      },
      { once: true }
    );
    log16.info(`片源已换成空白视频：${seconds.toFixed(2)}s（${blankVideoBytes(durationMs).length} 字节）`);
    noticePost(`视频已换成空白片段（${seconds.toFixed(1)} 秒），不再下载原片`, "info", { quiet: true });
    return true;
  }

  // src/sites/uooc/video.ts
  var log17 = scoped("uooc/video");
  var VIDEO_ID = "player_html5_api";
  var TARGET_RATE = 2;
  var RESCAN_DEBOUNCE_MS = 200;
  var FRAME_FALLBACK_MIN_GAP_MS = 2e3;
  var FIGHT_WINDOW_MS2 = 5e3;
  var FIGHT_MAX2 = 8;
  var FIGHT_COOLDOWN_MS = 5e3;
  var applied = /* @__PURE__ */ new WeakMap();
  var announced = /* @__PURE__ */ new WeakSet();
  var hasStarted = /* @__PURE__ */ new WeakSet();
  function asVideo(el2) {
    return el2 !== null && el2.tagName === "VIDEO" ? el2 : null;
  }
  function makeGuard(label) {
    const stamps = [];
    let mutedUntil = 0;
    return () => {
      const now = Date.now();
      if (now < mutedUntil) return false;
      while (stamps.length > 0 && now - stamps[0] > FIGHT_WINDOW_MS2) stamps.shift();
      if (stamps.length >= FIGHT_MAX2) {
        mutedUntil = now + FIGHT_COOLDOWN_MS;
        stamps.length = 0;
        log17.warn(`${label}在 ${FIGHT_WINDOW_MS2 / 1e3} 秒内被反复改回，暂停纠正 ${FIGHT_COOLDOWN_MS / 1e3} 秒`);
        return false;
      }
      stamps.push(now);
      return true;
    };
  }
  var rateGuard = makeGuard("二倍速");
  var muteGuard = makeGuard("静音");
  var playGuard = makeGuard("防失焦");
  var lastFrameScanAt = 0;
  var cachedFrameVideo = null;
  function findVideo() {
    const byId3 = asVideo(document.getElementById(VIDEO_ID));
    if (byId3 !== null) return byId3;
    const anyVideo = asVideo(document.querySelector("video"));
    if (anyVideo !== null) return anyVideo;
    if (cachedFrameVideo !== null && cachedFrameVideo.isConnected) return cachedFrameVideo;
    const now = Date.now();
    if (now - lastFrameScanAt < FRAME_FALLBACK_MIN_GAP_MS) return null;
    lastFrameScanAt = now;
    cachedFrameVideo = null;
    for (const frame of Array.from(document.querySelectorAll("iframe"))) {
      let doc = null;
      try {
        doc = frame.contentDocument;
      } catch {
        continue;
      }
      if (doc === null) continue;
      const found = asVideo(doc.getElementById(VIDEO_ID)) ?? asVideo(doc.querySelector("video"));
      if (found !== null) {
        cachedFrameVideo = found;
        log17.debug("播放器在同源 iframe 内，已切换查找目标");
        return found;
      }
    }
    return null;
  }
  function apply(v) {
    const state2 = applied.get(v) ?? { rate: false, mute: false };
    maybeSwapToBlank(v);
    if (!v.paused && !v.ended) hasStarted.add(v);
    const wantRate = isEnabled(SITE_ID, TOGGLE.RATE_2X);
    if (wantRate) {
      if (v.playbackRate !== TARGET_RATE) {
        try {
          v.playbackRate = TARGET_RATE;
          state2.rate = true;
        } catch {
        }
      }
    } else if (state2.rate && v.playbackRate === TARGET_RATE) {
      v.playbackRate = 1;
      state2.rate = false;
    }
    const wantMute = isEnabled(SITE_ID, TOGGLE.MUTE);
    if (wantMute) {
      if (!v.muted) {
        v.muted = true;
        state2.mute = true;
      }
    } else if (state2.mute && v.muted) {
      v.muted = false;
      state2.mute = false;
    }
    applied.set(v, state2);
    if (!announced.has(v)) {
      announced.add(v);
      log17.info(
        `播放器助手已就绪：二倍速=${wantRate ? "开" : "关"}，静音=${wantMute ? "开" : "关"}，防失焦=${isEnabled(SITE_ID, TOGGLE.KEEP_PLAYING) ? "开" : "关"}（当前速率 ${v.playbackRate}x）`
      );
    }
  }
  function restorePlayback(v) {
    if (!isEnabled(SITE_ID, TOGGLE.KEEP_PLAYING)) return;
    if (!hasStarted.has(v)) return;
    if (v.ended) return;
    if (v.readyState < 2) return;
    if (!playGuard()) return;
    const p = v.play();
    if (p !== void 0 && typeof p.catch === "function") {
      p.catch((err) => {
        log17.debug(`抢播被拒绝：${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }
  function onMediaEvent(ev) {
    const v = asVideo(ev.target);
    if (v === null) return;
    switch (ev.type) {
      case "play":
      case "playing":
        hasStarted.add(v);
        apply(v);
        return;
      case "pause":
        restorePlayback(v);
        return;
      case "ratechange":
        if (isEnabled(SITE_ID, TOGGLE.RATE_2X) && v.playbackRate !== TARGET_RATE && rateGuard()) {
          try {
            v.playbackRate = TARGET_RATE;
          } catch {
          }
        }
        return;
      case "volumechange":
        if (isEnabled(SITE_ID, TOGGLE.MUTE) && !v.muted && muteGuard()) {
          v.muted = true;
        }
        return;
      default:
        return;
    }
  }
  var MEDIA_EVENTS = ["play", "playing", "pause", "ratechange", "volumechange"];
  function startVideoAssist() {
    let timer3 = null;
    let stopped = false;
    const scan2 = () => {
      if (stopped) return;
      const v = findVideo();
      if (v !== null) apply(v);
    };
    const schedule2 = () => {
      if (stopped || timer3 !== null) return;
      timer3 = window.setTimeout(() => {
        timer3 = null;
        scan2();
      }, RESCAN_DEBOUNCE_MS);
    };
    scan2();
    const observer = new MutationObserver(schedule2);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const onLoad = () => scan2();
    document.addEventListener("loadstart", onLoad, true);
    document.addEventListener("loadedmetadata", onLoad, true);
    document.addEventListener("play", onMediaEvent, true);
    document.addEventListener("playing", onMediaEvent, true);
    document.addEventListener("pause", onMediaEvent, true);
    document.addEventListener("ratechange", onMediaEvent, true);
    document.addEventListener("volumechange", onMediaEvent, true);
    window.addEventListener("hashchange", schedule2);
    window.addEventListener("popstate", schedule2);
    log17.debug("视频助手已挂载（二倍速 / 静音 / 防失焦）");
    return () => {
      stopped = true;
      if (timer3 !== null) {
        window.clearTimeout(timer3);
        timer3 = null;
      }
      observer.disconnect();
      document.removeEventListener("loadstart", onLoad, true);
      document.removeEventListener("loadedmetadata", onLoad, true);
      for (const type of MEDIA_EVENTS) document.removeEventListener(type, onMediaEvent, true);
      window.removeEventListener("hashchange", schedule2);
      window.removeEventListener("popstate", schedule2);
    };
  }

  // src/sites/uooc/video-quiz.ts
  var log18 = scoped("uooc/video-quiz");
  var LAYER_SEL = "#quizLayer";
  var DONE_ATTR = "data-sztb-quiz-done";
  var INPUT_SEL = 'input[name^="answer_"]';
  var ANSWER_ID_RE = /^answer_(.+)$/;
  var SURE_SEL = '[ng-click^="sureAnswer"]';
  var SURE_FALLBACK_SEL = "button.btn.btn-success.fl_right";
  var VIDEO_SOURCE_SEL = "[uooc-video][source]";
  var ANY_SOURCE_SEL = "[source]";
  var RESCAN_DEBOUNCE_MS2 = 200;
  var AFTER_SURE_MS = 800;
  function lettersOf2(raw) {
    if (Array.isArray(raw)) {
      const arr = raw.map((v) => String(v).trim().toUpperCase()).filter((v) => v !== "");
      return arr.length > 0 ? arr : [];
    }
    if (typeof raw !== "string") return [];
    const s = raw.trim();
    if (s === "") return [];
    if (s.startsWith("[")) {
      try {
        const parsed2 = JSON.parse(s);
        if (Array.isArray(parsed2)) return lettersOf2(parsed2);
      } catch {
      }
    }
    if (!/^[A-Za-z](?:[\s,，、]*[A-Za-z])*$/.test(s)) return [];
    return s.toUpperCase().match(/[A-Z]/g) ?? [];
  }
  function toVideoQuiz(raw) {
    if (raw === null || typeof raw !== "object") return null;
    const o = raw;
    const id = String(o["id"] ?? "");
    if (id === "") return null;
    const letters = lettersOf2(o["eanswer"] ?? "");
    const fallback = letters.length > 0 ? letters : lettersOf2(o["answer"] ?? "");
    if (fallback.length === 0) return null;
    return { id, letters: fallback };
  }
  function videoQuizAnswers() {
    const out = /* @__PURE__ */ new Map();
    for (const sel of [VIDEO_SOURCE_SEL, ANY_SOURCE_SEL]) {
      for (const el2 of document.querySelectorAll(sel)) {
        const raw = el2.getAttribute("source");
        if (raw === null || !raw.includes('"quiz"')) continue;
        let parsed2;
        try {
          parsed2 = JSON.parse(raw);
        } catch {
          log18.warn("视频容器的 source 属性不是合法 JSON，跳过");
          continue;
        }
        if (parsed2 === null || typeof parsed2 !== "object") continue;
        const quiz2 = parsed2["quiz"];
        if (!Array.isArray(quiz2)) continue;
        for (const item of quiz2) {
          const q = toVideoQuiz(item);
          if (q !== null && !out.has(q.id)) out.set(q.id, q.letters);
        }
      }
      if (out.size > 0) break;
    }
    return out;
  }
  async function answerVideoQuizLayer(layer) {
    const inputs = Array.from(layer.querySelectorAll(INPUT_SEL));
    if (inputs.length === 0) return null;
    const answers = videoQuizAnswers();
    if (answers.size === 0) {
      log18.warn("弹层里有题，但页面上找不到 quiz 数据（视频容器的 source 属性变了？），留给用户");
      return null;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const inp of inputs) {
      const m = ANSWER_ID_RE.exec(inp.name);
      if (m === null || m[1] === void 0) continue;
      const key = m[1];
      const arr = groups.get(key);
      if (arr === void 0) groups.set(key, [inp]);
      else arr.push(inp);
    }
    let answered = 0;
    let missing = 0;
    for (const [id, list2] of groups) {
      const want = answers.get(id);
      if (want === void 0) {
        missing += 1;
        log18.warn(`小测 ${id} 在页面的 quiz 数据里找不到，留给用户`);
        continue;
      }
      const wantSet = new Set(want.map((s) => s.toUpperCase()));
      let hit = 0;
      for (const inp of list2) {
        if (!wantSet.has(inp.value.toUpperCase())) continue;
        if (!inp.checked) inp.click();
        hit += 1;
      }
      if (hit > 0) answered += 1;
      else {
        missing += 1;
        log18.warn(`小测 ${id} 的答案 [${want.join(",")}] 在选项里找不到对应项，留给用户`);
      }
    }
    if (answered === 0) return { questions: groups.size, answered: 0, sure: false };
    const box2 = layer.closest(".layui-layer") ?? layer;
    const sure = box2.querySelector(SURE_SEL) ?? box2.querySelector(SURE_FALLBACK_SEL);
    if (sure === null) {
      log18.warn("小测弹层里没有【确定】按钮，答案已选好，请你点一下");
      return { questions: groups.size, answered, sure: false };
    }
    layer.setAttribute(DONE_ATTR, "1");
    sure.click();
    log18.info(
      `视频小测已作答：${answered}/${groups.size} 题（${missing} 题没对上），已点【确定】`
    );
    await new Promise((resolve2) => {
      window.setTimeout(resolve2, AFTER_SURE_MS);
    });
    if (layer.isConnected) {
      log18.warn("点了【确定】但小测弹层还在 —— 可能答案不对，交给用户处理（不重试）");
    }
    return { questions: groups.size, answered, sure: true };
  }
  function startVideoQuiz() {
    let timer3 = null;
    let stopped = false;
    const scan2 = () => {
      if (stopped) return;
      for (const el2 of document.querySelectorAll(LAYER_SEL)) {
        if (el2.hasAttribute(DONE_ATTR)) continue;
        void answerVideoQuizLayer(el2);
      }
    };
    const schedule2 = () => {
      if (stopped || timer3 !== null) return;
      timer3 = window.setTimeout(() => {
        timer3 = null;
        scan2();
      }, RESCAN_DEBOUNCE_MS2);
    };
    scan2();
    const observer = new MutationObserver(schedule2);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule2);
    log18.debug("视频小测助手已挂载（读 DOM 里的答案，无声作答）");
    return () => {
      stopped = true;
      if (timer3 !== null) {
        window.clearTimeout(timer3);
        timer3 = null;
      }
      observer.disconnect();
      window.removeEventListener("hashchange", schedule2);
    };
  }

  // src/sites/uooc/index.ts
  var log19 = scoped("site/uooc");
  var HOSTS = ["uooc.net.cn", "*.uooc.net.cn"];
  var PAGES = ["/home/learn/index*", "/home/learn/new/*"];
  var OLD_LEARN_PATH = "/home/learn/index";
  var NEW_LEARN_PREFIX = "/home/learn/new/";
  function isNewVersionPage() {
    return location.pathname.startsWith(NEW_LEARN_PREFIX);
  }
  function isOldVersionPage() {
    return location.pathname.startsWith(OLD_LEARN_PATH);
  }
  function oldVersionUrl(href = location.href) {
    let u;
    try {
      u = new URL(href);
    } catch {
      return null;
    }
    if (!u.pathname.startsWith(NEW_LEARN_PREFIX)) return null;
    u.pathname = OLD_LEARN_PATH;
    return u.toString();
  }
  var uoocAdapter = {
    id: SITE_ID,
    name: "UOOC 优课联盟",
    hosts: HOSTS,
    pages: PAGES,
    tabs: [UOOC_VIDEO_TAB, UOOC_AUTOPLAY_TAB, UOOC_AI_TAB, UOOC_MONITOR_TAB, UOOC_WAIT_TAB],
    /**
     * 本站的设置**拆成了多个标签页**（视频 / 连播 / AI 作答 / 监视），没有任何一个 id
     * 能代表全部 ⇒ 必须显式声明，否则公共【设置】页会把同一批开关再渲染一遍。
     * 详见 `src/sites/types.ts` 的 `settingsInOwnTabs`。
     */
    settingsInOwnTabs: true,
    toggles: UOOC_TOGGLES,
    /**
     * 启动期：此刻 `document.body` 还不存在，**只注册设置、不碰 DOM**。
     *
     * 必须在设置面板渲染之前注册完，否则用户打开设置页会看不到本站的开关。
     */
    earlyInit() {
      registerUoocSettings();
      if (isNewVersionPage()) {
        log19.debug("新版课程页：不装接口嗅探（本次不启动任何 UOOC 功能）");
        return;
      }
      installUoocIntercept();
    },
    /** 挂载期：DOM 已就绪，可以开始接管播放器。 */
    init(ctx) {
      applyUoocSettings();
      noticeBind(ctx.panel);
      if (isNewVersionPage()) {
        log19.info("新版课程页：只弹「要不要切旧版」的提示，本次不启动任何 UOOC 功能");
        void promptSwitchToOld(ctx.panel);
        return;
      }
      if (!isOldVersionPage()) {
        log19.debug(`非旧版课程页（${location.pathname}），本次不启动任何 UOOC 功能`);
        return;
      }
      startVideoAssist();
      startVideoQuiz();
      startAutoplay(ctx.panel);
      log19.info(
        `UOOC 旧版课程页已启用：isFeaturePage=${String(ctx.isFeaturePage)}，路径=${location.pathname}，视频助手=已挂载，小测助手=已挂载，接管=等用户点开始`
      );
    }
  };
  async function promptSwitchToOld(host2) {
    const yes = await host2.confirm({
      title: "检测到新版课程页",
      body: "本插件只适配旧版课程页，是否切换到旧版？",
      confirmText: "切换到旧版",
      cancelText: "不用，我自己看"
    });
    if (!yes) {
      log19.info("用户选择留在新版页 —— 面板挂空，不启动任何 UOOC 功能");
      return;
    }
    const target = oldVersionUrl();
    if (target === null) {
      const msg = "拼不出旧版地址，请手动把地址栏的 /home/learn/new/<cid> 改成 /home/learn/index";
      log19.error(msg);
      host2.toast(msg, "error");
      return;
    }
    log19.info(`切换到旧版：${target}`);
    location.href = target;
  }

  // src/sites/bkxk/settings.ts
  var log20 = scoped("bkxk/settings");
  var SITE_ID2 = "bkxk";
  var TOGGLE2 = {
    /** 🔴 写接口总开关（抢课）。旧仓库红线 R1：默认 false，不得改 */
    WRITE_API: "write-api",
    /** 🟠 课表注入：把自定义课程写进 teachingTime.do 的返回，交给站点原生渲染（默认开） */
    HIJACK_TIMETABLE: "hijack-timetable",
    /** 🟠 列表冲突追加：在站点算好的 isConflict 上追加我们算出的冲突（默认开） */
    HIJACK_LIST_CONFLICT: "hijack-list-conflict",
    /** 🟢 列表注入（教学班ID / 抢课按钮） */
    LIST_INJECT: "list-inject",
    /** 🟢 自定义课程 */
    CUSTOM_COURSES: "custom-courses"
  };
  var VALUE2 = {
    INTERVAL_MS: "intervalMs",
    RETRY_INTERVAL_MS: "retryIntervalMs",
    POLL_INTERVAL_MS: "pollIntervalMs",
    BATCH_CODE: "batchCode",
    MONITOR_MODE: "monitorMode",
    RETRY_MODE: "retryMode"
  };
  var STALE_VALUE_IDS = ["monitorCategory"];
  var BKXK_TOGGLES = [
    {
      id: TOGGLE2.WRITE_API,
      label: "写接口总开关（抢课）",
      desc: "开启后才会真正提交选课请求。这类操作不可撤销，且会在学校系统留痕。默认关闭；打开时需要二次确认。",
      risk: "irreversible",
      default: false,
      group: "选课"
    },
    {
      id: TOGGLE2.HIJACK_TIMETABLE,
      label: "课表注入",
      desc: "把自定义课程合并进 teachingTime.do 的响应，让站点自己把它画进课表。需要拦截页面请求，会改变站点看到的返回内容。默认开启。",
      risk: "trace",
      default: true,
      group: "课表"
    },
    {
      id: TOGGLE2.HIJACK_LIST_CONFLICT,
      label: "列表冲突追加",
      desc: "在站点自己算好的 isConflict 之上，追加上自定义课程造成的冲突。只追加、不清除站点原值。需要拦截页面请求，会改变站点看到的返回内容。默认开启。",
      risk: "trace",
      default: true,
      group: "选课列表"
    },
    {
      id: TOGGLE2.LIST_INJECT,
      label: "列表注入（教学班ID / 抢课按钮）",
      desc: "在选课列表的每个教学班旁补上教学班ID 与「添加抢课 / 添加监控」两个按钮。点击只写本地队列，不发送任何请求。关掉后已注入的块会立即移除。",
      risk: "safe",
      default: true,
      group: "选课列表"
    },
    {
      id: TOGGLE2.CUSTOM_COURSES,
      label: "自定义课程",
      desc: "本地维护一份不属于培养方案、但你想让它出现在课表上的课程。",
      risk: "safe",
      default: true,
      group: "课表"
    }
  ];
  function registerBkxkSettings() {
    for (const id of STALE_VALUE_IDS) removeValue(SITE_ID2, id);
    registerInterval(
      VALUE2.INTERVAL_MS,
      "intervalMs",
      "请求间隔（毫秒）",
      "全局串行队列里相邻两条请求的最小间隔。"
    );
    registerInterval(
      VALUE2.RETRY_INTERVAL_MS,
      "retryIntervalMs",
      "抢课重试间隔（毫秒）",
      "一轮抢课跑完等多久再开下一轮。"
    );
    registerInterval(
      VALUE2.POLL_INTERVAL_MS,
      "pollIntervalMs",
      "监控轮询间隔（毫秒）",
      "监控模式下一轮查容量到下一轮的间隔。"
    );
    registerValue({
      siteId: SITE_ID2,
      id: VALUE2.BATCH_CODE,
      label: "选课批次码",
      desc: "留空则自动从页面会话里读取（studentInfo.electiveBatch.code）。手动填用于会话里读不到的场景。",
      default: "",
      kind: "text"
    });
    registerValue({
      siteId: SITE_ID2,
      id: VALUE2.MONITOR_MODE,
      label: "监控模式",
      desc: "决定监控怎么拿数据。类别监控请求少、粒度粗；单独监控逐课查容量、更精确但请求多。",
      default: "category",
      kind: "select",
      options: [
        { value: "category", label: "类别监控（拉类别列表，一次拿一类）" },
        { value: "single", label: "单独监控（逐课查容量，精确）" }
      ]
    });
    registerValue({
      siteId: SITE_ID2,
      id: VALUE2.RETRY_MODE,
      label: "重试策略",
      desc: "抢课任务失败之后怎么处理。",
      default: "smart",
      kind: "select",
      options: [
        { value: "smart", label: "智能 —— 只对可能成功的失败重试" },
        { value: "never", label: "失败即停 —— 不重试" },
        { value: "always", label: "持续重试 —— 失败一律重试" }
      ]
    });
  }
  function registerInterval(id, key, label, desc) {
    const spec = LIMITS[key];
    registerValue({
      siteId: SITE_ID2,
      id,
      label,
      desc: `${desc}建议不低于 ${spec.recommended}ms。`,
      default: String(spec.def),
      kind: "number",
      validate: (raw) => {
        const ms = clampLimit(key, raw);
        if (!isBelowRecommended(key, ms)) return null;
        return `低于建议下限 ${spec.recommended}ms。校园站对高频请求零容忍，实测会被直接终止会话 —— 请自行确认风险。`;
      },
      // 只有请求间隔现在就有消费方（http.ts 的串行队列）；
      // 重试/轮询间隔要等批 4 的任务与监控模块，到那时再补 apply。
      ...key === "intervalMs" ? { apply: applyIntervalMs } : {}
    });
  }
  function applyIntervalMs(raw) {
    setIntervalMs(clampLimit("intervalMs", raw));
  }
  function applyBkxkSettings() {
    const raw = getValue(SITE_ID2, VALUE2.INTERVAL_MS);
    const ms = clampLimit("intervalMs", raw);
    if (isBelowRecommended("intervalMs", ms)) {
      log20.warn(`请求间隔被设为 ${ms}ms，低于建议下限 ${LIMITS.intervalMs.recommended}ms`);
    }
    setIntervalMs(ms);
  }

  // src/sites/bkxk/session.ts
  var log21 = scoped("bkxk/session");
  var DEFAULT_CAMPUS = "01";
  var EMPTY_SESSION = {
    studentCode: "",
    batchCode: null,
    campus: DEFAULT_CAMPUS,
    token: "",
    loggedIn: false
  };
  function parseStudentInfo(raw) {
    if (raw === null || raw === "") return null;
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    if (json === null || typeof json !== "object" || Array.isArray(json)) return null;
    const obj = json;
    const studentCode = typeof obj["code"] === "string" ? obj["code"] : obj["code"] !== void 0 && obj["code"] !== null ? String(obj["code"]) : "";
    let batchCode = null;
    const batch = obj["electiveBatch"];
    if (batch !== null && typeof batch === "object" && !Array.isArray(batch)) {
      const bc = batch["code"];
      if (bc !== void 0 && bc !== null && String(bc) !== "") batchCode = String(bc);
    }
    if (batchCode === null) {
      const bc = obj["electiveBatchCode"];
      if (bc !== void 0 && bc !== null && String(bc) !== "") batchCode = String(bc);
    }
    return { studentCode, batchCode, data: json };
  }
  function parseCampusCode(raw) {
    if (raw === null || raw === "") return DEFAULT_CAMPUS;
    try {
      const json = JSON.parse(raw);
      if (json !== null && typeof json === "object" && !Array.isArray(json)) {
        const code = json["code"];
        if (code !== void 0 && code !== null && String(code) !== "") return String(code);
      }
    } catch {
    }
    return DEFAULT_CAMPUS;
  }
  function buildSession(input) {
    const info = parseStudentInfo(input.studentInfo);
    const studentCode = info?.studentCode ?? "";
    const token3 = input.token ?? "";
    return {
      studentCode,
      batchCode: info?.batchCode ?? null,
      campus: parseCampusCode(input.campus),
      token: token3,
      loggedIn: studentCode !== "" && token3 !== ""
    };
  }
  function readSession() {
    const ss = pageSessionStorage();
    if (ss === null) {
      log21.warn("读不到 sessionStorage，按未登录处理");
      return EMPTY_SESSION;
    }
    try {
      return buildSession({
        studentInfo: ss.getItem("studentInfo"),
        campus: ss.getItem("currentCampus"),
        token: ss.getItem("token")
      });
    } catch (err) {
      log21.warn("读取会话失败，按未登录处理", err);
      return EMPTY_SESSION;
    }
  }
  function sessionSummary(s) {
    if (!s.loggedIn) return "未登录（学号或 token 缺失）";
    const tail = s.studentCode.length > 4 ? s.studentCode.slice(-4) : s.studentCode;
    return `已登录（学号 ****${tail}，批次 ${s.batchCode ?? "未知"}，校区 ${s.campus}）`;
  }

  // src/common/custom/courses.ts
  var CUSTOM_COURSES_KEY = "custom:courses";
  var LEGACY_SITE_CUSTOM_KEY = "bkxk:customCourses";
  var CUSTOM_COLORS = [
    "#e8f2fd",
    "#fdf0e8",
    "#e8fdf0",
    "#f2e8fd",
    "#fdfde8",
    "#fde8f0"
  ];
  function colorAt(index) {
    const n = CUSTOM_COLORS.length;
    const i = Number.isFinite(index) ? Math.floor(index) : 0;
    const picked = CUSTOM_COLORS[(i % n + n) % n];
    return picked === void 0 ? "#e8f2fd" : picked;
  }
  function asRecord2(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v;
  }
  function str(v) {
    return typeof v === "string" ? v : "";
  }
  function slimCustomCourse(item) {
    const o = asRecord2(item);
    if (o === null) return null;
    const name = str(o["name"]).trim();
    if (name === "") return null;
    const id = str(o["id"]);
    if (id === "") return null;
    return {
      id,
      name,
      teacher: str(o["teacher"]),
      place: str(o["place"]),
      color: str(o["color"]),
      // 旧仓库语义：只有显式 false 才算关（`custom.js:106`）
      enabled: o["enabled"] !== false
    };
  }
  function parseCustomCourses(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      const rec = slimCustomCourse(item);
      if (rec !== null) out.push(rec);
    }
    return out;
  }
  function readCustomCourses() {
    return parseCustomCourses(read(CUSTOM_COURSES_KEY, []));
  }
  function enabledCourses(courses) {
    return courses.filter((c) => c.enabled);
  }
  function makeCourseId(now, rand) {
    const ms = Number.isFinite(now) ? Math.floor(now) : 0;
    const r = Number.isFinite(rand) ? Math.floor(Math.abs(rand) * 1e3) % 1e3 : 0;
    return `c${String(ms)}-${String(r).padStart(3, "0")}`;
  }
  function appendCourse(courses, draft, id) {
    const created = {
      id,
      name: draft.name.trim(),
      teacher: draft.teacher.trim(),
      place: draft.place.trim(),
      color: colorAt(courses.length),
      enabled: true
    };
    return [...courses, created];
  }
  function updateCourse(courses, id, patch) {
    return courses.map(
      (c) => c.id === id ? {
        ...c,
        name: patch.name.trim(),
        teacher: patch.teacher.trim(),
        place: patch.place.trim()
      } : c
    );
  }
  function removeCourse(courses, id) {
    return courses.filter((c) => c.id !== id);
  }
  function setCourseEnabled(courses, id, enabled) {
    return courses.map((c) => c.id === id ? { ...c, enabled } : c);
  }
  function writeCustomCourses(courses) {
    write(CUSTOM_COURSES_KEY, courses);
  }

  // src/sites/bkxk/legacy.ts
  var log22 = scoped("bkxk/legacy");
  var LEGACY_SETTINGS_KEY = "szubkxk.settings.v2";
  var LEGACY_STORE_PREFIX = "szubkxk.v2.";
  var LEGACY_DATA_KEY = {
    CUSTOM_COURSES: "customCourses",
    MONITOR: "monitor",
    TASKS: "tasks"
  };
  var BKXK_STORE_KEY = {
    MONITOR: "bkxk:monitor",
    TASKS: "bkxk:tasks"
  };
  var BKXK_SITE_CUSTOM_KEY = LEGACY_SITE_CUSTOM_KEY;
  var MIGRATION_FLAG_KEY = "migrate:bkxk:v2";
  var CARRY_FLAG_KEY = "migrate:bkxk:custom-to-common";
  var SETTING_VALUE_MAP = [
    { from: "intervalMs", to: "intervalMs", kind: "number" },
    { from: "retryIntervalMs", to: "retryIntervalMs", kind: "number" },
    { from: "pollIntervalMs", to: "pollIntervalMs", kind: "number" },
    { from: "batchCode", to: "batchCode", kind: "text" },
    { from: "monitorMode", to: "monitorMode", kind: "text" },
    // `monitorCategory` 不在表里：这个配置项在 v0.31 被删掉（引擎自己找出要查哪些类别），
    // 迁过来只会留下一个没人读的键。老用户机上的历史键由 `registerBkxkSettings()` 清掉。
    { from: "retryMode", to: "retryMode", kind: "text" }
  ];
  var DANGER_TOGGLE_MAP = [
    { from: "writeApiEnabled", to: TOGGLE2.WRITE_API, label: "写接口总开关（🔴）" },
    { from: "hijackTimetable", to: TOGGLE2.HIJACK_TIMETABLE, label: "课表注入（🟠）" },
    { from: "hijackListConflict", to: TOGGLE2.HIJACK_LIST_CONFLICT, label: "列表冲突追加（🟠）" }
  ];
  function parseJson(raw) {
    if (raw === null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function asRecord3(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v;
  }
  function planMigration(snapshot, alreadyMigrated) {
    const report = [];
    const notices = [];
    if (alreadyMigrated) {
      return { entries: [], report: ["旧数据已迁移过，本次跳过。"], notices: [], empty: true };
    }
    const entries2 = [];
    const settings = asRecord3(parseJson(snapshot.settings));
    if (settings === null && snapshot.settings !== null) {
      notices.push("旧设置 `szubkxk.settings.v2` 无法解析，已跳过。");
    }
    if (settings !== null) {
      for (const m of SETTING_VALUE_MAP) {
        const raw = settings[m.from];
        if (raw === void 0 || raw === null) continue;
        if (m.kind === "number") {
          const n = typeof raw === "number" ? raw : Number(raw);
          if (!Number.isFinite(n) || n <= 0) {
            notices.push(`旧设置 ${m.from} 的值 ${String(raw)} 不是有效正数，未迁移。`);
            continue;
          }
          entries2.push({ key: `value:bkxk:${m.to}`, value: String(Math.floor(n)) });
        } else {
          const s = String(raw);
          if (s === "") continue;
          entries2.push({ key: `value:bkxk:${m.to}`, value: s });
        }
        report.push(`设置 ${m.from} → ${m.to}`);
      }
      for (const d of DANGER_TOGGLE_MAP) {
        if (settings[d.from] === true) {
          notices.push(
            `旧版曾开启「${d.label}」。按风险门禁约定**不会**自动为你打开，如需继续使用请在设置页手动勾选一次。`
          );
        }
      }
    }
    const ccRaw = parseJson(snapshot.customCourses);
    if (ccRaw !== null) {
      if (Array.isArray(ccRaw)) {
        const slim = parseCustomCourses(ccRaw);
        const dropped = ccRaw.length - slim.length;
        entries2.push({ key: CUSTOM_COURSES_KEY, value: slim });
        report.push(`自定义课程 ${slim.length} 门 → ${CUSTOM_COURSES_KEY}`);
        if (dropped > 0) notices.push(`有 ${dropped} 条自定义课程缺少 name / id，已丢弃。`);
      } else {
        notices.push("旧自定义课程不是数组，已跳过。");
      }
    }
    const blobs = [
      { raw: snapshot.monitor, newKey: BKXK_STORE_KEY.MONITOR, label: "监控进度" },
      { raw: snapshot.tasks, newKey: BKXK_STORE_KEY.TASKS, label: "任务进度" }
    ];
    for (const blob of blobs) {
      const parsed2 = parseJson(blob.raw);
      if (parsed2 === null) continue;
      if (asRecord3(parsed2) === null) {
        notices.push(`旧${blob.label}不是对象，已跳过。`);
        continue;
      }
      entries2.push({ key: blob.newKey, value: parsed2 });
      report.push(blob.label);
    }
    if (entries2.length === 0) {
      report.push("旧数据里没有可迁移的内容。");
    }
    return { entries: entries2, report, notices, empty: entries2.length === 0 };
  }
  function planCustomCarry(siteValue, commonValue) {
    const rawCount2 = Array.isArray(siteValue) ? siteValue.length : 0;
    const site = parseCustomCourses(siteValue);
    if (site.length === 0) {
      return { entries: [], report: [], notices: [], empty: true };
    }
    const notices = [];
    if (rawCount2 > site.length) {
      notices.push(`站点键里有 ${rawCount2 - site.length} 条自定义课程缺少 name / id，搬运时丢弃。`);
    }
    const common = parseCustomCourses(commonValue);
    if (common.length > 0) {
      notices.push(
        `通用键 ${CUSTOM_COURSES_KEY} 里已有 ${common.length} 门自定义课程，站点键里的 ${site.length} 门**未搬运**（避免覆盖）。如需保留，请自行导出后合并。`
      );
      return { entries: [], report: [], notices, empty: true };
    }
    return {
      entries: [{ key: CUSTOM_COURSES_KEY, value: site }],
      report: [`自定义课程 ${site.length} 门：${BKXK_SITE_CUSTOM_KEY} → ${CUSTOM_COURSES_KEY}`],
      notices,
      empty: false
    };
  }
  function runCustomCarry() {
    if (read(CARRY_FLAG_KEY, false)) return [];
    const site = read(BKXK_SITE_CUSTOM_KEY, null);
    const common = read(CUSTOM_COURSES_KEY, []);
    const plan = planCustomCarry(site, common);
    write(CARRY_FLAG_KEY, true);
    if (plan.empty) {
      for (const line of plan.notices) log22.warn(`搬运 · ${line}`);
      return [];
    }
    for (const e of plan.entries) write(e.key, e.value);
    log22.info(`自定义课程搬运完成：${plan.report.join("；")}`);
    for (const line of plan.notices) log22.warn(`搬运 · ${line}`);
    return [...plan.report, ...plan.notices];
  }
  function readLegacySnapshot() {
    const ls = (() => {
      try {
        const w = globalThis;
        const pageLs = w.unsafeWindow?.localStorage;
        if (pageLs !== void 0) return pageLs;
        return globalThis.localStorage ?? null;
      } catch {
        return null;
      }
    })();
    if (ls === null) {
      return { settings: null, customCourses: null, monitor: null, tasks: null };
    }
    const get = (k) => {
      try {
        return ls.getItem(k);
      } catch {
        return null;
      }
    };
    return {
      settings: get(LEGACY_SETTINGS_KEY),
      customCourses: get(LEGACY_STORE_PREFIX + LEGACY_DATA_KEY.CUSTOM_COURSES),
      monitor: get(LEGACY_STORE_PREFIX + LEGACY_DATA_KEY.MONITOR),
      tasks: get(LEGACY_STORE_PREFIX + LEGACY_DATA_KEY.TASKS)
    };
  }
  function runMigration() {
    if (read(MIGRATION_FLAG_KEY, false)) {
      return [];
    }
    const snapshot = readLegacySnapshot();
    const plan = planMigration(snapshot, false);
    const lines = [];
    if (plan.empty && plan.notices.length === 0) {
      write(MIGRATION_FLAG_KEY, true);
      log22.info("未发现旧版数据，跳过迁移");
      return [];
    }
    for (const e of plan.entries) {
      write(e.key, e.value);
    }
    write(MIGRATION_FLAG_KEY, true);
    lines.push(...plan.report, ...plan.notices);
    log22.info(`旧数据迁移完成：写入 ${plan.entries.length} 项`);
    for (const line of plan.report) log22.info(`迁移 · ${line}`);
    for (const line of plan.notices) log22.warn(`迁移 · ${line}`);
    return lines;
  }

  // src/sites/bkxk/time.ts
  var WEEKDAY = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7
  };
  var CN_WEEKDAY = [
    "",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
    "星期日"
  ];
  var DEFAULT_WEEK_BITMAP_LEN = 18;
  var WEEK_RE = /(\d+)(?:\s*-\s*(\d+))?\s*周\s*(?:[（(]\s*(单|双)\s*[)）])?/;
  var DAY_RE = /星期\s*([一二三四五六日天])/;
  var SECTION_RE = /(\d+)(?:\s*-\s*(\d+))?\s*节/;
  function parityMatches(week, parity) {
    if (parity === null) return true;
    return parity === "单" ? week % 2 === 1 : week % 2 === 0;
  }
  function parseWeekRange(text2) {
    if (typeof text2 !== "string" || text2 === "") return null;
    const m = WEEK_RE.exec(text2);
    if (m === null) return null;
    const from = Number(m[1]);
    const to = m[2] === void 0 ? from : Number(m[2]);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || from > to) return null;
    const p = m[3];
    return { weekFrom: from, weekTo: to, parity: p === "单" || p === "双" ? p : null };
  }
  function parseSegment(seg) {
    if (typeof seg !== "string") return null;
    const s = seg.trim();
    if (s === "") return null;
    const week = parseWeekRange(s);
    if (week === null) return null;
    const section = SECTION_RE.exec(s);
    if (section === null) return null;
    const sectionFrom = Number(section[1]);
    const sectionTo = section[2] === void 0 ? sectionFrom : Number(section[2]);
    if (!Number.isFinite(sectionFrom) || !Number.isFinite(sectionTo)) return null;
    const dayText = DAY_RE.exec(s);
    const day = dayText === null ? null : WEEKDAY[dayText[1] ?? ""] ?? null;
    return {
      weekFrom: week.weekFrom,
      weekTo: week.weekTo,
      parity: week.parity,
      day,
      sectionFrom,
      sectionTo: Math.max(sectionFrom, sectionTo),
      // 地点 = 节次匹配之后的剩余文本。用匹配下标而不是 indexOf，
      // 免得「节次文本恰好也在前面出现过」时截错位置。
      place: s.slice(section.index + section[0].length).trim(),
      raw: seg
    };
  }
  function parsePlace(text2) {
    if (typeof text2 !== "string" || text2.trim() === "") return [];
    const out = [];
    for (const piece of text2.split(/[,，]/)) {
      const seg = parseSegment(piece);
      if (seg !== null) out.push(seg);
    }
    return out;
  }
  function weekMatches(seg, week) {
    if (!Number.isFinite(week) || week < seg.weekFrom || week > seg.weekTo) return false;
    return parityMatches(week, seg.parity);
  }
  function sectionsOverlap(a, b) {
    return a.sectionFrom <= b.sectionTo && b.sectionFrom <= a.sectionTo;
  }
  function segmentsConflict(a, b) {
    if (a.day === null || b.day === null) return false;
    if (a.day !== b.day) return false;
    if (!sectionsOverlap(a, b)) return false;
    const from = Math.max(a.weekFrom, b.weekFrom);
    const to = Math.min(a.weekTo, b.weekTo);
    for (let w = from; w <= to; w += 1) {
      if (weekMatches(a, w) && weekMatches(b, w)) return true;
    }
    return false;
  }
  function placesConflict(a, b) {
    const left = parsePlace(a);
    const right = parsePlace(b);
    if (left.length === 0 || right.length === 0) return false;
    for (const x of left) {
      for (const y of right) {
        if (segmentsConflict(x, y)) return true;
      }
    }
    return false;
  }
  function buildWeekBitmap(from, to, parity, len = DEFAULT_WEEK_BITMAP_LEN) {
    const n = Number.isFinite(len) && len > 0 ? Math.floor(len) : DEFAULT_WEEK_BITMAP_LEN;
    let out = "";
    for (let i = 1; i <= n; i += 1) {
      out += i >= from && i <= to && parityMatches(i, parity) ? "1" : "0";
    }
    return out;
  }
  function weekText(seg) {
    const body = seg.weekFrom === seg.weekTo ? `${seg.weekFrom}周` : `${seg.weekFrom}-${seg.weekTo}周`;
    return seg.parity === null ? body : `${body}(${seg.parity})`;
  }
  function sectionText(seg) {
    return seg.sectionFrom === seg.sectionTo ? `${seg.sectionFrom}节` : `${seg.sectionFrom}-${seg.sectionTo}节`;
  }
  function segToPlaceText(seg) {
    const parts = [weekText(seg)];
    const dayText = seg.day === null ? "" : CN_WEEKDAY[seg.day] ?? "";
    if (dayText !== "") parts.push(dayText);
    parts.push(sectionText(seg));
    const place = seg.place.trim();
    if (place !== "") parts.push(place);
    return parts.join(" ");
  }
  function maxBitmapLength(bitmaps) {
    let n = 0;
    for (const b of bitmaps) if (b.length > n) n = b.length;
    return n;
  }

  // src/sites/bkxk/custom.ts
  function withSegments(courses) {
    return courses.map((c) => ({ ...c, segs: parsePlace(c.place) }));
  }
  function readEnabledCustomCourses() {
    if (!isEnabled(SITE_ID2, TOGGLE2.CUSTOM_COURSES)) return [];
    return withSegments(enabledCourses(readCustomCourses()));
  }
  function countSelfConflicts(courses) {
    const live = enabledCourses(courses);
    let n = 0;
    for (let i = 0; i < live.length; i += 1) {
      const a = live[i];
      if (a === void 0) continue;
      for (let j = i + 1; j < live.length; j += 1) {
        const b = live[j];
        if (b === void 0) continue;
        if (placesConflict(a.place, b.place)) n += 1;
      }
    }
    return n;
  }

  // src/sites/bkxk/tt-mark.ts
  var TT_TAG_CLASS = "sztb-bkxk-tt-tag";
  var TT_MARK_ATTR = "data-sztb-tt";
  var TT_TAG_TEXT = "自定义";
  var TT_TAG_SELECTOR = `[${TT_MARK_ATTR}]`;
  var TT_TAG_HTML = `<span class="${TT_TAG_CLASS}" ${TT_MARK_ATTR}="1">${TT_TAG_TEXT}</span>`;
  function escapeText(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function tagMarkedName(name) {
    return `${escapeText(name)}${TT_TAG_HTML}`;
  }

  // src/sites/bkxk/page-realm.ts
  function pageRealm() {
    if (typeof unsafeWindow !== "undefined") return unsafeWindow;
    return globalThis;
  }
  function pageRecord() {
    const realm = pageRealm();
    if (realm === null || typeof realm !== "object" && typeof realm !== "function") return {};
    return realm;
  }

  // src/sites/bkxk/hijack.ts
  var log23 = scoped("bkxk/hijack");
  var CUSTOM_ID_PREFIX = "szu-custom-";
  var LIST_RE = /elective\/(?:programCourse|unProgramCourse|publicCourse|recommendedCourse|queryCourse|course|minorCourse|retakeCourse|sportCourse)\.do/i;
  var TIMETABLE_RE = /elective\/teachingTime\.do/i;
  function kindOf2(url) {
    if (typeof url !== "string" || url === "") return null;
    if (TIMETABLE_RE.test(url)) return "timetable";
    if (LIST_RE.test(url)) return "list";
    return null;
  }
  function kindEnabled(kind) {
    return isEnabled(SITE_ID2, kind === "timetable" ? TOGGLE2.HIJACK_TIMETABLE : TOGGLE2.HIJACK_LIST_CONFLICT);
  }
  function asRecord4(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v;
  }
  function asArray(v) {
    return Array.isArray(v) ? v : null;
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function customConflicts(place, items2) {
    if (typeof place !== "string" || place === "") return [];
    const out = [];
    for (const c of items2) {
      if (!c.enabled) continue;
      if (placesConflict(place, c.place)) out.push(c);
    }
    return out;
  }
  function conflictDescFor(items2) {
    return items2.map((c) => `自定义课程：${c.name}(${c.place})`).join("；");
  }
  function augmentTimetable(json, items2) {
    const root = asRecord4(json);
    if (root === null) return { json, changed: 0 };
    const list2 = asArray(root["dataList"]);
    if (list2 === null) return { json, changed: 0 };
    const len = Math.max(DEFAULT_WEEK_BITMAP_LEN, maxBitmapLength(weekStringsOf(list2)));
    let changed = 0;
    for (const c of items2) {
      if (!c.enabled) continue;
      for (let k = 0; k < c.segs.length; k++) {
        const seg = c.segs[k];
        if (seg === void 0 || seg.day === null) continue;
        list2.push(timetableRow(c, seg, k, len));
        changed++;
      }
    }
    if (changed > 0) root["totalCount"] = num(root["totalCount"]) + changed;
    return { json, changed };
  }
  function weekStringsOf(list2) {
    const out = [];
    for (const row3 of list2) {
      const rec = asRecord4(row3);
      if (rec === null) continue;
      const w = rec["week"];
      if (typeof w === "string" && w !== "") out.push(w);
    }
    return out;
  }
  function timetableRow(c, seg, index, len) {
    return {
      dayOfWeekName: seg.day === null ? "" : CN_WEEKDAY[seg.day] ?? "",
      teachingClassID: `${CUSTOM_ID_PREFIX}${c.id}-${index}`,
      courseNumber: "",
      studentCode: "",
      // ⚠️ 站点把 courseName 原样拼进 HTML（不转义、也不渲染任何数据属性）⇒
      // 「这是我们加的课」这个标记只能随课名一起塞进去。见 `tt-mark.ts`。
      courseName: tagMarkedName(c.name),
      courseIndex: "",
      teacherName: escapeText(c.teacher),
      teachingPlace: escapeText(seg.place),
      sportCode: null,
      timeType: "1",
      sportName: null,
      studyMode: "01",
      weekName: weekText(seg),
      beginSection: String(seg.sectionFrom),
      endSection: String(seg.sectionTo),
      week: buildWeekBitmap(seg.weekFrom, seg.weekTo, seg.parity, len),
      dayOfWeek: seg.day === null ? "" : String(seg.day),
      wid: null,
      /** 我们自己打的标记：站点不会返回这个键，用于辨认与将来的排查 */
      szuCustom: true
    };
  }
  function augmentList(json, items2) {
    const root = asRecord4(json);
    if (root === null) return { json, changed: 0 };
    const list2 = asArray(root["dataList"]);
    if (list2 === null) return { json, changed: 0 };
    let changed = 0;
    for (const row3 of list2) {
      const item = asRecord4(row3);
      if (item === null) continue;
      const tcList = asArray(item["tcList"]);
      const targets = tcList === null ? [item] : tcList.map(asRecord4).filter(isRec);
      for (const tc of targets) {
        const place = tc["teachingPlace"];
        if (typeof place !== "string" || place === "") continue;
        const mine = customConflicts(place, items2);
        if (mine.length === 0) continue;
        const desc = conflictDescFor(mine);
        const before = tc["conflictDesc"];
        tc["isConflict"] = "1";
        tc["conflictDesc"] = typeof before === "string" && before !== "" ? `${before}；${desc}` : desc;
        tc["szuCustomConflict"] = true;
        changed++;
      }
    }
    return { json, changed };
  }
  function isRec(v) {
    return v !== null;
  }
  function transformResponse(kind, text2, items2) {
    if (text2 === "" || items2.length === 0) return null;
    let json;
    try {
      json = JSON.parse(text2);
    } catch {
      return null;
    }
    const root = asRecord4(json);
    if (root === null) return null;
    if (String(root["code"]) !== "1") return null;
    const res = kind === "timetable" ? augmentTimetable(root, items2) : augmentList(root, items2);
    if (res.changed === 0) return null;
    log23.info(`[接管] ${kind} 改写了 ${res.changed} 处`);
    return JSON.stringify(res.json);
  }
  function transformCurrentResponse(kind, text2) {
    if (!kindEnabled(kind)) return null;
    const next = transformResponse(kind, text2, readEnabledCustomCourses());
    if (next !== null && kind === "timetable") rewroteTimetable = true;
    return next;
  }
  var rewroteTimetable = false;
  function didRewriteTimetable() {
    return rewroteTimetable;
  }
  function rewriteXhr(xhr) {
    const kind = kindOf2(typeof xhr.responseURL === "string" ? xhr.responseURL : null);
    if (kind === null) return false;
    const rt = typeof xhr.responseType === "string" ? xhr.responseType : "";
    if (rt !== "" && rt !== "text" && rt !== "json") return false;
    let text2;
    try {
      text2 = typeof xhr.responseText === "string" ? xhr.responseText : "";
    } catch {
      return false;
    }
    if (text2 === "") return false;
    const next = transformCurrentResponse(kind, text2);
    if (next === null) return false;
    try {
      Object.defineProperty(xhr, "responseText", { configurable: true, get: () => next });
      if (rt === "json") {
        Object.defineProperty(xhr, "response", { configurable: true, get: () => JSON.parse(next) });
      }
    } catch {
      log23.warn("接管响应失败（无法改写 responseText）");
      return false;
    }
    return true;
  }
  function makeXhrCtor(Orig) {
    function Wrapped() {
      const xhr = new Orig();
      xhr.addEventListener("readystatechange", () => {
        if (xhr.readyState === 4) rewriteXhr(xhr);
      });
      return xhr;
    }
    Wrapped.prototype = Orig.prototype;
    return Wrapped;
  }
  function installXhr2(target = pageRealm()) {
    const t = target;
    if (t["__szuXhrInstalled"] === true) return false;
    const orig = t["XMLHttpRequest"];
    if (typeof orig !== "function") return false;
    t["XMLHttpRequest"] = makeXhrCtor(orig);
    t["__szuXhrInstalled"] = true;
    return true;
  }
  function installFetch2(target = pageRealm()) {
    const t = target;
    if (t["__szuFetchInstalled"] === true) return false;
    const orig = t["fetch"];
    if (typeof orig !== "function") return false;
    const ResponseCtor = t["Response"];
    const patched = (input, init) => {
      const p = orig(input, init);
      if (init !== void 0 && init !== null && init["__szuSkip"] === true) return p;
      const url = typeof input === "string" ? input : input?.url ?? "";
      const kind = kindOf2(url);
      if (kind === null) return p;
      return p.then(async (res) => {
        const text2 = await res.text();
        const next = transformCurrentResponse(kind, text2);
        if (next === null) return res;
        if (typeof ResponseCtor !== "function") {
          log23.warn("接管响应失败（环境里没有 Response 构造器）");
          return res;
        }
        const Ctor = ResponseCtor;
        return new Ctor(next, { status: res.status, statusText: res.statusText, headers: res.headers });
      });
    };
    t["fetch"] = patched;
    t["__szuFetchInstalled"] = true;
    return true;
  }
  function installHijack(target = pageRealm()) {
    const xhr = installXhr2(target);
    const fetch2 = installFetch2(target);
    if (xhr || fetch2) log23.info(`响应接管已安装（XHR=${String(xhr)} fetch=${String(fetch2)}）`);
    return xhr || fetch2;
  }

  // src/sites/bkxk/list-style.ts
  var LIST_STYLE_ID = "sztb-bkxk-list-style";
  var LIST_CSS2 = `
/* ---- 我们自己的注入块（列表行与卡片共用，v0.17 起整体压缩高度） ---- */

.sztb-bkxk-block {
  display: block;
  margin: 0 0 1px;
  padding: 1px 5px;
  border-left: 2px solid #2a6df4;
  border-radius: 3px;
  background: rgba(42, 109, 244, 0.06);
  font-size: 12px;
  line-height: 1.35;
}

.sztb-bkxk-id {
  display: block;
  font-family: ui-monospace, Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 1.4;
  color: #1b4fd8;
  white-space: nowrap;
  cursor: pointer;
  /* 一整块可选中：复制失败时用户可以手动拖选，不用一个字符一个字符点 */
  user-select: all;
}

.sztb-bkxk-id:hover {
  text-decoration: underline;
}

/* 两个按钮**必须在同一行**：列表页这一列只有 150px 上下，
   一旦允许换行就折成两行、把整行行高顶上去（v0.17 手测 #52 的反馈） */
.sztb-bkxk-ops {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  margin-top: 1px;
  white-space: nowrap;
}

.sztb-bkxk-btn {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid #c9d4e6;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
}

.sztb-bkxk-btn:hover {
  border-color: #2a6df4;
  color: #2a6df4;
}

/* 已入队 / 已监控 */
.sztb-bkxk-btn-on {
  border-color: #2a6df4;
  background: #2a6df4;
  color: #fff;
}

.sztb-bkxk-btn-on:hover {
  color: #fff;
}

/* 新加的那一列：占满剩余宽度，最小宽度兜住「ID 一行 + 两个按钮一行」 */
.sztb-bkxk-col {
  flex: 1 1 auto;
  min-width: 150px;
  box-sizing: border-box;
}

.sztb-bkxk-head {
  font-weight: bold;
  /* 站点给表头单元格挂的排序箭头（伪元素或背景图）会连我们这份一起命中 ——
     我们的表头不是可排序列，v0.17 手测 #53 要求清掉（用户拍板保留「抢课模块」文字） */
  background-image: none !important;
  cursor: default;
}

.sztb-bkxk-head::before,
.sztb-bkxk-head::after {
  content: none !important;
  display: none !important;
}

/* ---- 只在被我们加过列的容器上改布局 ---- */

.cv-body:has(> .cv-row > .sztb-bkxk-col) > .cv-row {
  display: flex;
  align-items: center;
}

.cv-body:has(> .cv-row > .sztb-bkxk-col) > .cv-row > div {
  float: none;
  flex: 0 1 auto;
  min-width: 0;
}

.cv-head:has(> .sztb-bkxk-col) {
  display: flex;
  align-items: center;
}

.cv-head:has(> .sztb-bkxk-col) > * {
  float: none;
  flex: 0 1 auto;
}

.cv-head:has(> .sztb-bkxk-col) > .sztb-bkxk-col {
  flex: 1 1 auto;
}

/* ---- 卡片页：卡片高度改为「按内容自适应」+ 缩小卡片内外边距（v0.17 手测 #54/#55，
        v0.18 按 v5 采样定稿）----

   **为什么必须让高度自适应**：站点给 .cv-course-card 写死了 210px 高（v5 采样实测 13 张卡
   的计算高度全是 210px，overflow 是 visible），而卡片里的 .cv-info 实际有 234–254px 高
   —— 各卡内容本来就不一样（有的多一行 .cv-caption-text / .cv-caption-red）。
   固定高度装不下，内容就从卡片下沿漏出去；也是因为这个写死的高度，我们压 h5 的行高
   在屏幕上一屏卡片数量毫无变化（用户手测「行高没有减少」的真正原因）。
   所以这里对含我们块的卡片改 height: auto（!important 压得住站点的行内 style），
   min-height 保留站点原值，以免内容少的卡变得比站点风格还矮。

   严格限制在「含我们注入块的那张卡」上：没有注入的卡片一律不动。
   注入块是 .cv-info 的第一个子元素，所以锚点用 :has(> .cv-info > .sztb-bkxk-block)。 */

.cv-course-card:has(> .cv-info > .sztb-bkxk-block) {
  height: auto !important;
  min-height: 210px;
  /* 站点是 16px。v0.18 先压到 8px 10px，手测反馈「过于不美观」⇒ v0.19 恢复一点点到 12px 14px：
     既比站点原样紧，又不至于内容贴边。想再松/再紧就改这一行。 */
  padding: 12px 14px !important;
  box-sizing: border-box;
}

.cv-info:has(> .sztb-bkxk-block) {
  padding: 2px 0 !important;
}

/* 卡片内容区里的每一层：上下外边距一律清零（站点给这些 div 挂了 margin-top: 4px）。
   这里用通配而不是逐个列举，是因为站点各卡的元素数量不同 ——
   列举漏掉的那一层就是「部分卡片还是溢出」的原因（v5 采样里那三个 20/16/32px 的 div）。 */
.cv-info:has(> .sztb-bkxk-block) > * {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

.cv-info:has(> .sztb-bkxk-block) > h5 {
  line-height: 1.3 !important;
}

.cv-info:has(> .sztb-bkxk-block) > h5 > div,
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-text,
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-red {
  line-height: 1.3 !important;
}

.cv-info:has(> .sztb-bkxk-block) > div.cv-operate {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
}

/* 卡片里我们的块：ID 与按钮保持两行（卡片只有 ~212px 宽，硬挤一行会把 ID 截断），
   但纵向间距再收一点。站点给 .cv-info 的子元素挂了 margin-top，这里要显式压掉。 */
.cv-info > .sztb-bkxk-block {
  margin-top: 0;
  margin-bottom: 2px;
}

/* ---- 站点节点的重新摆位（v0.20）----

   list.ts 会把站点自己的两个节点挪位置（见那边 relocateInUnit 的注释）：
     · 退选按钮 button.cv-delete-volunteer → 挪进 h5、「已选」标签旁边
     · 收藏星标 img.collection-img → 挪到课名（span.cv-info-title）前面
   搬完剩下的宽度问题由这里的样式解决。 */

/* h5 原来是「float:left 的课名 + inline-block 的标签」。
   课名浮动后不占文档流宽度，剩下的空间不够再塞一个退选按钮（h5 宽 216px，
   课名 136 + 已选 41 + 间隙 4 = 177，只剩 39px，而退选按钮要 41px）。
   改成 flex 之后三个元素一起参与排布，课名按内容自适应宽度，标签靠右。 */
.cv-info:has(> .sztb-bkxk-block) > h5 {
  display: flex !important;
  align-items: center;
  gap: 4px;
}

/* 课名：取消浮动、按内容宽度占位（min-width: 0 允许它在极窄时收缩，不撑破卡片） */
.cv-info:has(> .sztb-bkxk-block) > h5 > .cv-info-title {
  float: none !important;
  flex: 0 1 auto;
  min-width: 0;
}

/* h5 里的三个标签（星标 / 已选 / 退选）：不缩放、不换行，各自的 margin 由站点给 */
.cv-info:has(> .sztb-bkxk-block) > h5 > .cv-one,
.cv-info:has(> .sztb-bkxk-block) > h5 > .cv-delete-volunteer,
.cv-info:has(> .sztb-bkxk-block) > h5 > .collection-img {
  flex: 0 0 auto;
}

/* 星标搬进 h5 后，原本由它那层 div 提供的 20px 行高没了 —— 星标自己带
   vertical-align: middle 是给行内流用的，flex 下不生效，靠 align-items: center 对齐。
   站点给它的 inline style 里有 width/height: 20px，保留。 */
.cv-info:has(> .sztb-bkxk-block) > h5 > .collection-img {
  display: block;
  cursor: pointer;
}

/* 退选按钮搬走以后，站点那个只装它一个的 div.cv-caption-text 会变成空 div。
   站点在未选课时这个 div 本来就高 0，所以**不需要额外规则** —— 这里只兜一层保险：
   万一站点给空 div 补了伪元素或背景，也不让它冒出行高。 */
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-text:empty {
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}
`;

  // src/sites/bkxk/context.ts
  function bkxkContext() {
    const s = readSession();
    const stored = getValue(SITE_ID2, VALUE2.BATCH_CODE);
    const fallback = typeof stored === "string" ? stored.trim() : "";
    return {
      studentCode: s.studentCode,
      batchCode: s.batchCode === null || s.batchCode === "" ? fallback : s.batchCode,
      campus: s.campus,
      token: s.token,
      loggedIn: s.loggedIn
    };
  }
  function pageOrigin() {
    return typeof location === "undefined" ? "" : location.origin;
  }

  // src/sites/bkxk/api.ts
  var log24 = scoped("bkxk/api");
  var BASE_PATH = "/xsxkapp/sys/xsxkapp/";
  var EP = {
    // 只读：课程查询（按类别分派）
    PROGRAM_COURSE: "elective/programCourse.do",
    PUBLIC_COURSE: "elective/publicCourse.do",
    RECOMMENDED_COURSE: "elective/recommendedCourse.do",
    QUERY_COURSE: "elective/queryCourse.do",
    // 只读：其它
    COURSE_RESULT: "elective/courseResult.do",
    CAPACITY: "elective/teachingclass/capacity.do",
    TEACHING_TIME: "elective/teachingTime.do",
    NO_ARRANGED: "elective/noArranged.do",
    // 写：默认关闭（红线 R1）
    VOLUNTEER: "elective/volunteer.do"
  };
  var CATEGORY_NAME = {
    FANKC: "方案内",
    FAWKC: "方案外",
    // 显示名（用户 m00846 口径：这个页签叫「本班」）。
    // ⚠️ 只改这个字符串，**请求里的 teachingClassType 仍然是 TJKC** —— 那是站点自己的码。
    TJKC: "本班",
    XGXK: "校公选",
    CXKC: "重修",
    TYKC: "体育",
    FXKC: "辅修",
    MOOC: "慕课"
  };
  var CATEGORY_EP = {
    FANKC: EP.PROGRAM_COURSE,
    FAWKC: EP.PROGRAM_COURSE,
    // 未实测
    TJKC: EP.RECOMMENDED_COURSE,
    XGXK: EP.PUBLIC_COURSE,
    CXKC: EP.PROGRAM_COURSE,
    // 未实测
    TYKC: EP.PROGRAM_COURSE,
    // 未实测
    FXKC: EP.PROGRAM_COURSE,
    // 未实测
    MOOC: EP.PUBLIC_COURSE
  };
  var RESP_KIND = {
    OK: "ok",
    BUSINESS: "business",
    UNAUTHENTICATED: "unauthenticated",
    UNKNOWN: "unknown"
  };
  var RESP_CODE = {
    SUCCESS: "1",
    BUSINESS_ERROR: "2",
    UNAUTHENTICATED: "302"
  };
  var AUTH_MSG = /登录|认证/;
  var MAX_BATCH_SCAN_NODES = 2e4;
  function isAuthStatus(status) {
    return status === 401 || status === 403;
  }
  function classify(input) {
    const out = {
      kind: RESP_KIND.UNKNOWN,
      code: null,
      msg: "",
      data: null,
      json: null
    };
    if (isAuthStatus(input.status)) {
      return { ...out, kind: RESP_KIND.UNAUTHENTICATED, msg: `HTTP ${input.status}` };
    }
    let json = null;
    try {
      json = JSON.parse(input.text);
    } catch {
      return { ...out, kind: RESP_KIND.UNKNOWN, msg: "响应不是 JSON" };
    }
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return { ...out, kind: RESP_KIND.UNKNOWN, msg: "JSON 顶层不是对象" };
    }
    const obj = json;
    const rawCode = obj["code"];
    const code = rawCode === void 0 || rawCode === null ? null : String(rawCode);
    const msg = obj["msg"] === void 0 || obj["msg"] === null ? "" : String(obj["msg"]);
    let kind;
    if (code === RESP_CODE.SUCCESS) kind = RESP_KIND.OK;
    else if (code === RESP_CODE.BUSINESS_ERROR) kind = RESP_KIND.BUSINESS;
    else if (code === RESP_CODE.UNAUTHENTICATED) kind = RESP_KIND.UNAUTHENTICATED;
    else if (AUTH_MSG.test(msg)) kind = RESP_KIND.UNAUTHENTICATED;
    else kind = RESP_KIND.UNKNOWN;
    return { kind, code, msg, data: obj["data"] === void 0 ? null : obj["data"], json };
  }
  function endpointUrl(ep, origin) {
    return `${origin}${BASE_PATH}${ep}`;
  }
  function appendTimestamp(url, nowMs) {
    const ts = typeof nowMs === "number" ? nowMs : Date.now();
    return `${url}${url.includes("?") ? "&" : "?"}timestamp=${ts}`;
  }
  function formBody(obj) {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v === void 0 || v === null ? "" : String(v))}`);
    }
    return parts.join("&");
  }
  function buildVolunteerBody(p) {
    const payload = {
      data: {
        operationType: "1",
        studentCode: String(p.studentCode),
        electiveBatchCode: String(p.electiveBatchCode),
        teachingClassId: String(p.teachingClassId),
        isMajor: p.isMajor === void 0 || p.isMajor === null ? "1" : String(p.isMajor),
        campus: p.campus === void 0 || p.campus === null ? "01" : String(p.campus),
        teachingClassType: String(p.teachingClassType)
      }
    };
    return `addParam=${encodeURIComponent(JSON.stringify(payload))}`;
  }
  function buildCapacityBody(teachingClassId, batchCode) {
    return formBody({ teachingClassId, batchCode });
  }
  function buildQueryBody(p) {
    const setting = {
      data: {
        studentCode: String(p.studentCode),
        campus: p.campus === void 0 || p.campus === null ? "01" : String(p.campus),
        electiveBatchCode: String(p.electiveBatchCode),
        isMajor: p.isMajor === void 0 || p.isMajor === null ? "1" : String(p.isMajor),
        teachingClassType: String(p.teachingClassType),
        checkConflict: "2",
        checkCapacity: "2",
        queryContent: p.queryContent === void 0 ? "YCJX:2,MOOC:2," : String(p.queryContent)
      },
      pageSize: String(p.pageSize === void 0 ? 10 : p.pageSize),
      pageNumber: String(p.pageNumber === void 0 ? 0 : p.pageNumber),
      order: p.order === void 0 ? "" : String(p.order),
      orderBy: p.orderBy === void 0 ? "courseNumber" : String(p.orderBy)
    };
    return `querySetting=${encodeURIComponent(JSON.stringify(setting))}`;
  }
  function headers(token3) {
    return { token: String(token3), "X-Requested-With": "XMLHttpRequest" };
  }
  function capacityRemain(data) {
    if (data === null || typeof data !== "object") return null;
    const d = data;
    if (d["mainClassCapacity"] === void 0 || d["mainClassCapacity"] === null) return null;
    if (d["mainElectiveNumber"] === void 0 || d["mainElectiveNumber"] === null) return null;
    const cap = Number(d["mainClassCapacity"]);
    const used = Number(d["mainElectiveNumber"]);
    if (!Number.isFinite(cap) || !Number.isFinite(used)) return null;
    return cap - used;
  }
  function extractBatchCode(json) {
    let found = null;
    const counts = {};
    let budget = MAX_BATCH_SCAN_NODES;
    function walk(node, depth) {
      if (budget <= 0 || depth > 6 || node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      budget -= 1;
      const obj = node;
      const bc = obj["electiveBatchCode"];
      if (typeof bc === "string" && bc !== "") {
        counts[bc] = (counts[bc] ?? 0) + 1;
        if (found === null) found = bc;
      }
      for (const v of Object.values(obj)) walk(v, depth + 1);
    }
    walk(json, 0);
    return { batchCode: found, counts };
  }
  function dumpUnknown(input) {
    const text2 = input.text ?? "";
    const block = `
──────── [未识别返回] ────────
action: ${input.action}
url: ${input.url}
body: ${input.body ?? ""}
code: ${input.code ?? ""} | msg: ${input.msg}
长度: ${text2.length} 字符
原文:
${text2}
──────────────────────────────
`;
    log24.error(
      `未识别返回（已全量落档） code=${input.code ?? ""}${input.msg !== "" ? ` msg=${input.msg}` : ""}`
    );
    console.log(`%c${block}`, "color:#c00");
    return block;
  }
  async function bkxkSend(o) {
    const token3 = o.token ?? "";
    const extra = o.extraHeaders ?? {};
    const requestHeaders = token3 !== "" ? { ...headers(token3), ...extra } : { ...extra };
    if (o.body !== void 0) requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    const url = o.timestamp === true ? appendTimestamp(o.url) : o.url;
    log24.info(`[请求] ${o.action} ${o.url}`);
    const raw = await request({
      url,
      method: o.method ?? "POST",
      headers: requestHeaders,
      ...o.body !== void 0 ? { data: o.body } : {},
      ...o.priority !== void 0 ? { priority: o.priority } : {}
    });
    const cls = classify({ status: raw.status, text: raw.text });
    if (cls.kind === RESP_KIND.UNKNOWN) {
      dumpUnknown({
        action: o.action,
        url,
        body: o.body ?? "",
        text: raw.text,
        code: cls.code,
        msg: cls.msg
      });
    }
    return { status: raw.status, text: raw.text, cls, raw };
  }

  // src/sites/bkxk/courses.ts
  var log25 = scoped("bkxk/courses");
  function asRecord5(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  }
  function pick(...values) {
    for (const v of values) {
      if (v === null || v === void 0) continue;
      if (typeof v === "string" && v === "") continue;
      return v;
    }
    return null;
  }
  function pickString2(...values) {
    const v = pick(...values);
    if (v === null) return "";
    return typeof v === "string" ? v : String(v);
  }
  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      if (value.trim() === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  function toFlag(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    if (typeof value === "string") {
      if (value === "1" || value === "true") return true;
      if (value === "0" || value === "false") return false;
    }
    return null;
  }
  function pickNumber(...values) {
    for (const v of values) {
      const n = toNumber(v);
      if (n !== null) return n;
    }
    return null;
  }
  function pickFlag(...values) {
    for (const v of values) {
      const b = toFlag(v);
      if (b !== null) return b;
    }
    return null;
  }
  function normClass(tc, course) {
    const t = asRecord5(tc);
    const c = asRecord5(course);
    return {
      teachingClassID: pickString2(t["teachingClassID"], c["teachingClassID"]),
      courseNumber: pickString2(t["courseNumber"], c["courseNumber"]),
      courseName: pickString2(t["courseName"], c["courseName"]),
      teacherName: pickString2(t["teacherName"], c["teacherName"]),
      teachingPlace: pickString2(t["teachingPlace"], c["teachingPlace"]),
      courseTotalNumber: pickNumber(t["courseTotalNumber"], c["courseTotalNumber"]),
      classCapacity: pickNumber(t["classCapacity"], c["classCapacity"]),
      numberOfFirstVolunteer: pickNumber(t["numberOfFirstVolunteer"], c["numberOfFirstVolunteer"]),
      courseIndex: pickString2(t["courseIndex"], c["courseIndex"]),
      isMooc: pickFlag(t["isMooc"], c["isMooc"]),
      isFull: pickFlag(t["isFull"], c["isFull"]),
      isConflict: pickFlag(t["isConflict"], c["isConflict"]),
      isFavorite: pickFlag(t["isFavorite"], c["isFavorite"]),
      typeName: pickString2(t["typeName"], c["typeName"]),
      courseNatureName: pickString2(t["courseNatureName"], c["courseNatureName"]),
      departmentName: pickString2(t["departmentName"], c["departmentName"]),
      credit: pickNumber(t["credit"], c["credit"]),
      campus: pickString2(t["campus"], c["campus"])
    };
  }
  function classesOf(item) {
    const obj = asRecord5(item);
    const list2 = obj["tcList"];
    if (Array.isArray(list2)) {
      return list2.map((tc) => normClass(tc, item));
    }
    return [normClass(item, item)];
  }
  function listFrom(json) {
    const list2 = asRecord5(json)["dataList"];
    return Array.isArray(list2) ? list2 : null;
  }
  function flatten(json) {
    const list2 = listFrom(json);
    if (list2 === null) {
      log25.warn("列表响应里没有顶层 dataList，返回空列表（站点改版？端点形态变了？）");
      return [];
    }
    const out = [];
    for (const item of list2) out.push(...classesOf(item));
    log25.info(`列表响应 ${list2.length} 项 → ${out.length} 个教学班`);
    return out;
  }
  function remainOf(c) {
    if (c.classCapacity === null || c.numberOfFirstVolunteer === null) return null;
    return c.classCapacity - c.numberOfFirstVolunteer;
  }
  function currentOrigin() {
    return typeof location !== "undefined" && typeof location.origin === "string" ? location.origin : "";
  }
  async function fetchCategory(p) {
    const denied = (msg) => ({
      ok: false,
      kind: RESP_KIND.UNKNOWN,
      code: null,
      msg,
      classes: [],
      batchCode: null,
      status: 0,
      raw: null
    });
    const origin = p.origin ?? currentOrigin();
    if (origin === "") {
      log25.warn("取不到 origin，放弃拉取课程列表");
      return denied("取不到 origin");
    }
    if (p.studentCode === "") {
      log25.warn("会话里没有学号，放弃拉取课程列表");
      return denied("缺少学号");
    }
    if (p.batchCode === null || p.batchCode === "") {
      log25.warn("没有选课批次码，放弃拉取课程列表");
      return denied("缺少选课批次码");
    }
    const url = endpointUrl(CATEGORY_EP[p.category], origin);
    const body = buildQueryBody({
      studentCode: p.studentCode,
      electiveBatchCode: p.batchCode,
      teachingClassType: p.category,
      campus: p.campus ?? DEFAULT_CAMPUS,
      ...p.pageSize === void 0 ? {} : { pageSize: p.pageSize },
      ...p.pageNumber === void 0 ? {} : { pageNumber: p.pageNumber }
    });
    const send = p.send ?? bkxkSend;
    const raw = await send({
      url,
      action: `列表:${p.category}`,
      body,
      token: p.token ?? ""
    });
    const base = {
      code: raw.cls.code,
      msg: raw.cls.msg,
      batchCode: null,
      status: raw.status,
      raw
    };
    if (raw.cls.kind !== RESP_KIND.OK) {
      return { ok: false, kind: raw.cls.kind, classes: [], ...base };
    }
    const classes = flatten(raw.cls.json);
    return {
      ok: true,
      kind: raw.cls.kind,
      classes,
      ...base,
      batchCode: extractBatchCode(raw.cls.json).batchCode
    };
  }

  // src/sites/bkxk/list-model.ts
  var TC_ID_RE = /^\d{15,24}$/;
  function isTcId(value) {
    return typeof value === "string" && TC_ID_RE.test(value);
  }
  function cleanText(raw) {
    if (raw === null || raw === void 0) return "";
    return raw.replace(/\s+/g, " ").replace(/^[·\s]+/, "").trim();
  }
  function pickTcId(candidates) {
    for (const c of candidates) {
      if (isTcId(c)) return c;
    }
    return null;
  }
  var BODY_CATEGORY = {
    programBody: "FANKC",
    unProgramBody: "FAWKC",
    recommendBody: "TJKC",
    publicBody: "XGXK",
    retakeBody: "CXKC",
    sportBody: "TYKC",
    minorBody: "FXKC",
    moocBody: "MOOC",
    // 全校课程没有独立类别码，旧仓库按校公选处理（旧仓库自己标了「未实测」）
    schoolBody: "XGXK"
  };
  function categoryOfBodyId(id) {
    if (id === null || id === void 0) return "";
    const hit = BODY_CATEGORY[id];
    return hit === void 0 ? "" : hit;
  }
  var TASK_STATUS_PENDING = "pending";
  function asRecord6(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v;
  }
  function str2(v) {
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
  }
  function num2(v, fallback) {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  }
  function bool(v, fallback) {
    return typeof v === "boolean" ? v : fallback;
  }
  function readTaskStore(raw) {
    const rec = asRecord6(raw);
    const rawItems = rec === null ? null : rec["items"];
    if (!Array.isArray(rawItems)) return { seq: 0, items: [] };
    const items2 = [];
    for (const it of rawItems) {
      const o = asRecord6(it);
      if (o === null) continue;
      const teachingClassID = str2(o["teachingClassID"]);
      if (teachingClassID === "") continue;
      items2.push({
        id: str2(o["id"]),
        seq: num2(o["seq"], 0),
        teachingClassID,
        courseName: str2(o["courseName"]),
        teacherName: str2(o["teacherName"]),
        category: str2(o["category"]),
        priority: num2(o["priority"], 0),
        enabled: bool(o["enabled"], true),
        status: str2(o["status"]) === "" ? TASK_STATUS_PENDING : str2(o["status"]),
        retryMode: str2(o["retryMode"]),
        attempts: num2(o["attempts"], 0),
        lastMsg: str2(o["lastMsg"]),
        lastKind: str2(o["lastKind"]),
        addedAt: num2(o["addedAt"], 0)
      });
    }
    return { seq: num2(rec?.["seq"], items2.length), items: items2 };
  }
  function readMonitorStore(raw) {
    const rec = asRecord6(raw);
    const rawItems = rec === null ? null : rec["items"];
    if (!Array.isArray(rawItems)) return { items: [], hitCount: 0 };
    const items2 = [];
    for (const it of rawItems) {
      const o = asRecord6(it);
      if (o === null) continue;
      const teachingClassID = str2(o["teachingClassID"]);
      if (teachingClassID === "") continue;
      items2.push({
        teachingClassID,
        courseName: str2(o["courseName"]),
        teacherName: str2(o["teacherName"]),
        teachingPlace: str2(o["teachingPlace"]),
        category: str2(o["category"]),
        remain: typeof o["remain"] === "number" && Number.isFinite(o["remain"]) ? o["remain"] : null,
        checkedAt: typeof o["checkedAt"] === "number" && Number.isFinite(o["checkedAt"]) ? o["checkedAt"] : null,
        hits: num2(o["hits"], 0),
        lastMsg: str2(o["lastMsg"])
      });
    }
    return { items: items2, hitCount: num2(rec?.["hitCount"], 0) };
  }
  function hasTask(store, tcId) {
    return store.items.some((t) => t.teachingClassID === tcId);
  }
  function hasMonitor(store, tcId) {
    return store.items.some((m) => m.teachingClassID === tcId);
  }
  function addTask(store, input) {
    if (hasTask(store, input.tcId)) return { store, added: false };
    const seq4 = store.seq + 1;
    const item = {
      id: `t${seq4}`,
      seq: seq4,
      teachingClassID: input.tcId,
      courseName: cleanText(input.courseName),
      teacherName: cleanText(input.teacherName),
      category: input.category,
      // 一律从 0 开始：抢课顺序看的是 priority（小的先抢），要插队到【任务】页点【−】
      priority: 0,
      enabled: true,
      status: TASK_STATUS_PENDING,
      retryMode: input.retryMode,
      attempts: 0,
      lastMsg: "",
      lastKind: "",
      addedAt: input.now
    };
    return { store: { seq: seq4, items: [...store.items, item] }, added: true };
  }
  function addMonitor(store, input) {
    if (hasMonitor(store, input.tcId)) return { store, added: false };
    const item = {
      teachingClassID: input.tcId,
      courseName: cleanText(input.courseName),
      teacherName: cleanText(input.teacherName),
      teachingPlace: cleanText(input.teachingPlace),
      category: input.category,
      remain: null,
      checkedAt: null,
      hits: 0,
      lastMsg: ""
    };
    return { store: { ...store, items: [...store.items, item] }, added: true };
  }
  function removeMonitor(store, tcId) {
    const items2 = store.items.filter((m) => m.teachingClassID !== tcId);
    if (items2.length === store.items.length) return { store, removed: false };
    return { store: { ...store, items: items2 }, removed: true };
  }
  function removeTaskByTcId(store, tcId) {
    const items2 = store.items.filter((t) => t.teachingClassID !== tcId);
    if (items2.length === store.items.length) return { store, removed: false };
    return { store: { ...store, items: items2 }, removed: true };
  }
  function toggleTask(store, input) {
    if (hasTask(store, input.tcId)) {
      const { store: next2 } = removeTaskByTcId(store, input.tcId);
      return { store: next2, on: false };
    }
    const { store: next } = addTask(store, input);
    return { store: next, on: true };
  }
  function grabButtonLabel(on) {
    return on ? "移除抢课" : "添加抢课";
  }
  function monitorButtonLabel(on) {
    return on ? "移除监控" : "添加监控";
  }
  function teacherFromTitle(raw) {
    if (raw === null || raw === void 0) return "";
    return cleanText(raw.replace(/^\s*\[\d+\]\s*/, ""));
  }
  function idLineText(tcId) {
    return `教学班ID ${tcId}`;
  }
  function placeFromTimeText(raw) {
    const first = cleanText(raw).split(",")[0] ?? "";
    const tokens = first.split(" ").filter((t) => t !== "");
    const last = tokens[tokens.length - 1];
    if (last === void 0) return "";
    if (last.endsWith("节") || last.endsWith("周")) return "";
    return last;
  }
  var CLASS_DELETE_VOLUNTEER = "cv-delete-volunteer";
  var CLASS_COLLECTION_IMG = "collection-img";
  function planDeleteVolunteer(inH5) {
    return inH5 ? "none" : "h5";
  }
  function planCollectionImg(beforeTitle) {
    return beforeTitle ? "none" : "title-before";
  }
  var H5_ORDER = [
    CLASS_COLLECTION_IMG,
    "cv-info-title",
    "cv-one",
    CLASS_DELETE_VOLUNTEER
  ];
  function orderH5Children(keys) {
    const rank = (key) => {
      const i = H5_ORDER.indexOf(key);
      return i === -1 ? H5_ORDER.length : i;
    };
    return [...keys].map((key, index) => ({ key, index })).sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index).map((item) => item.key);
  }
  function elementKey(classList) {
    let best = "";
    for (const c of classList) {
      if (c.length > best.length) best = c;
    }
    return best;
  }

  // src/sites/bkxk/monitor-model.ts
  var MONITOR_MODE = {
    /** 逐个教学班查 `capacity.do` */
    SINGLE: "single",
    /** 按类别的列表接口整页拉，再在本地比对 */
    CATEGORY: "category"
  };
  var MONITOR_MODE_NAME = {
    category: "按类别（列表接口整页拉，请求少）",
    single: "逐个教学班（capacity 接口，直观但请求多）"
  };
  function normalizeMonitorMode(v) {
    return v === MONITOR_MODE.SINGLE ? MONITOR_MODE.SINGLE : MONITOR_MODE.CATEGORY;
  }
  var MAX_PAGES = 4;
  var PAGE_SIZE = 50;
  function groupByCategory(items2) {
    const map = /* @__PURE__ */ new Map();
    let skipped = 0;
    for (const it of items2) {
      if (it.category === "") {
        skipped += 1;
        continue;
      }
      const bucket = map.get(it.category);
      if (bucket === void 0) map.set(it.category, [it]);
      else bucket.push(it);
    }
    const groups = [];
    for (const [category, group] of map) groups.push({ category, items: group });
    return { groups, skipped };
  }
  function hitsOf(rows) {
    return rows.filter((r) => r.remain !== null && r.remain > 0);
  }
  function remainText(remain) {
    if (remain === null) return "未知";
    if (remain <= 0) return "无余量";
    return `余 ${String(remain)}`;
  }
  function remainKey(remain) {
    if (remain === null) return "unknown";
    if (remain > 0) return "has";
    return "none";
  }
  function normalizeMonitorStore(raw) {
    const base = readMonitorStore(raw);
    return {
      items: base.items.map((m) => ({ ...m, hits: nonNegativeInt(m.hits) })),
      hitCount: nonNegativeInt(base.hitCount)
    };
  }
  function nonNegativeInt(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
  }
  function slimMonitor(store) {
    return {
      items: store.items.map((m) => ({
        teachingClassID: m.teachingClassID,
        courseName: m.courseName,
        teacherName: m.teacherName,
        teachingPlace: m.teachingPlace,
        category: m.category,
        remain: m.remain,
        checkedAt: m.checkedAt,
        hits: m.hits,
        lastMsg: m.lastMsg
      })),
      hitCount: nonNegativeInt(store.hitCount)
    };
  }
  function applyCheck(store, tcId, remain, nowMs, lastMsg) {
    let hit = false;
    let changed = false;
    const items2 = store.items.map((m) => {
      if (m.teachingClassID !== tcId) return m;
      changed = true;
      const isHit = remain !== null && remain > 0;
      if (isHit) hit = true;
      return {
        ...m,
        remain,
        checkedAt: nowMs,
        hits: isHit ? m.hits + 1 : m.hits,
        ...lastMsg === void 0 ? {} : { lastMsg }
      };
    });
    return changed ? { store: { ...store, items: items2 }, hit } : { store, hit: false };
  }
  function addHitCount(store, n) {
    if (n <= 0) return store;
    return { ...store, hitCount: nonNegativeInt(store.hitCount) + n };
  }
  function removeMonitorItem(store, tcId) {
    const items2 = store.items.filter((m) => m.teachingClassID !== tcId);
    if (items2.length === store.items.length) return { store, removed: false };
    return { store: { ...store, items: items2 }, removed: true };
  }
  function clearMonitor() {
    return { items: [], hitCount: 0 };
  }
  function patchMonitor(store, tcId, patch) {
    let hit = false;
    const items2 = store.items.map((m) => {
      if (m.teachingClassID !== tcId) return m;
      hit = true;
      return { ...m, ...patch };
    });
    return hit ? { ...store, items: items2 } : store;
  }
  function resetMonitorStats(store) {
    return {
      items: store.items.map((m) => ({ ...m, hits: 0, remain: null, checkedAt: null, lastMsg: "" })),
      hitCount: 0
    };
  }
  function byId(store, tcId) {
    return store.items.find((m) => m.teachingClassID === tcId) ?? null;
  }
  function checkedAgoText(checkedAt, nowMs) {
    if (checkedAt === null || checkedAt <= 0) return "从未";
    const delta = nowMs - checkedAt;
    if (delta < 0) return "刚刚";
    if (delta < 3e3) return "刚刚";
    if (delta < 6e4) return `${String(Math.floor(delta / 1e3))} 秒前`;
    if (delta < 36e5) return `${String(Math.floor(delta / 6e4))} 分钟前`;
    return `${String(Math.floor(delta / 36e5))} 小时前`;
  }
  function summaryText(store, nowMs) {
    const n = store.items.length;
    if (n === 0) return "监控列表为空";
    const last = store.items.reduce((acc, m) => {
      if (m.checkedAt === null) return acc;
      return acc === null || m.checkedAt > acc ? m.checkedAt : acc;
    }, null);
    return `${String(n)} 条监控（累计命中 ${String(store.hitCount)} 次，最近检查 ${checkedAgoText(last, nowMs)}）`;
  }
  function hitSummaryText(rows, nameOf2) {
    return rows.map((r) => `${nameOf2(r.teachingClassID)} ${remainText(r.remain)}`).join("；");
  }

  // src/sites/bkxk/monitor.ts
  var log26 = scoped("bkxk/monitor");
  var panel = null;
  function bindMonitorPanel(p) {
    panel = p;
  }
  var listeners6 = /* @__PURE__ */ new Set();
  function subscribeMonitor2(fn) {
    listeners6.add(fn);
    return () => {
      listeners6.delete(fn);
    };
  }
  function notify3() {
    for (const fn of [...listeners6]) {
      try {
        fn();
      } catch (err) {
        log26.warn("监控订阅回调抛错（已忽略）", err);
      }
    }
  }
  function loadMonitorStore() {
    return normalizeMonitorStore(read(BKXK_STORE_KEY.MONITOR, null));
  }
  function saveMonitorStore(store) {
    write(BKXK_STORE_KEY.MONITOR, slimMonitor(store));
    notify3();
  }
  function updateMonitor(fn) {
    const next = fn(loadMonitorStore());
    saveMonitorStore(next);
    return next;
  }
  function currentMode() {
    return normalizeMonitorMode(getValue(SITE_ID2, VALUE2.MONITOR_MODE));
  }
  function pollIntervalMs() {
    return clampLimit("pollIntervalMs", getValue(SITE_ID2, VALUE2.POLL_INTERVAL_MS));
  }
  var polling = false;
  var timer2 = null;
  var wake = null;
  var lastPollAt = null;
  var pollCount = 0;
  function pollStats() {
    return { polling, lastPollAt, pollCount };
  }
  function sleepInterruptible(ms) {
    return new Promise((resolve2) => {
      wake = resolve2;
      timer2 = setTimeout(() => {
        timer2 = null;
        wake = null;
        resolve2();
      }, ms);
    });
  }
  function interruptSleep() {
    if (timer2 !== null) {
      clearTimeout(timer2);
      timer2 = null;
    }
    const w = wake;
    wake = null;
    if (w !== null) w();
  }
  function startPolling() {
    if (polling) return false;
    const store = loadMonitorStore();
    if (store.items.length === 0) {
      panel?.toast("监控列表为空，先到选课列表里点「监控该教学班」", "warn");
      return false;
    }
    polling = true;
    log26.info(`开始监控轮询（${currentMode()}），监控项 ${String(store.items.length)} 条`);
    panel?.toast(`开始监控（${String(store.items.length)} 条）`, "success");
    notify3();
    void loop2();
    return true;
  }
  function stopPolling() {
    if (!polling) return false;
    polling = false;
    interruptSleep();
    log26.info("已停止监控轮询");
    panel?.toast("已停止监控轮询", "info");
    notify3();
    return true;
  }
  function isPolling() {
    return polling;
  }
  async function loop2() {
    try {
      while (polling) {
        await pollOnce();
        if (!polling) return;
        await sleepInterruptible(pollIntervalMs());
      }
    } catch (err) {
      polling = false;
      log26.error("监控轮询异常结束", err);
      panel?.toast("监控轮询异常，已停止（详见日志）", "error");
    } finally {
      notify3();
    }
  }
  async function pollOnce() {
    lastPollAt = Date.now();
    pollCount += 1;
    const store = loadMonitorStore();
    if (store.items.length === 0) {
      notify3();
      return { checked: 0, hits: [] };
    }
    const res = currentMode() === "single" ? await pollSingle(store) : await pollCategory(store);
    await afterCheck(res);
    notify3();
    return res;
  }
  async function pollSingle(start) {
    let store = start;
    const rows = [];
    for (const item of start.items) {
      const r = await checkOne(store, item.teachingClassID);
      store = r.store;
      rows.push(r.row);
    }
    return { checked: rows.length, hits: hitsOf(rows) };
  }
  async function checkOne(store, tcId) {
    const ctx = bkxkContext();
    if (ctx.batchCode === "") {
      log26.warn(`查容量跳过 ${tcId}：批次码为空（请刷新选课页）`);
      return {
        store,
        row: { teachingClassID: tcId, remain: null, kind: "nobatch", msg: "批次码为空（请刷新选课页）" }
      };
    }
    let kind;
    let msg;
    let remain = null;
    try {
      const r = await bkxkSend({
        url: endpointUrl(EP.CAPACITY, pageOrigin()),
        action: `查容量 ${tcId}`,
        method: "POST",
        body: buildCapacityBody(tcId, ctx.batchCode),
        token: ctx.token,
        priority: PRIORITY.NORMAL
      });
      kind = r.cls.kind;
      msg = r.cls.msg;
      if (kind === RESP_KIND.OK) remain = capacityRemain(r.cls.data);
    } catch (err) {
      const text2 = err instanceof Error ? err.message : String(err);
      log26.warn(`查容量请求异常：${tcId}`, err);
      const applied3 = applyCheck(store, tcId, null, Date.now(), `请求异常：${text2}`);
      saveMonitorStore(applied3.store);
      return { store: applied3.store, row: { teachingClassID: tcId, remain: null, kind: "exception", msg: text2 } };
    }
    if (kind !== RESP_KIND.OK) {
      noteAuthLost(kind);
      log26.warn(`查容量失败（${kind}）：${tcId} ${msg}`);
      const applied3 = applyCheck(store, tcId, null, Date.now(), msg);
      saveMonitorStore(applied3.store);
      return { store: applied3.store, row: { teachingClassID: tcId, remain: null, kind, msg } };
    }
    const applied2 = applyCheck(store, tcId, remain, Date.now());
    saveMonitorStore(applied2.store);
    return { store: applied2.store, row: { teachingClassID: tcId, remain, kind: "ok" } };
  }
  async function fetchCategoryAll(category) {
    const ctx = bkxkContext();
    const out = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let r;
      try {
        r = await fetchCategory({
          category,
          studentCode: ctx.studentCode,
          batchCode: ctx.batchCode === "" ? null : ctx.batchCode,
          token: ctx.token,
          pageNumber: page,
          pageSize: PAGE_SIZE,
          origin: pageOrigin()
        });
      } catch (err) {
        log26.warn(`类别 ${category} 请求异常（pageNumber=${String(page)}）`, err);
        return out.length > 0 ? out : null;
      }
      if (r.kind !== RESP_KIND.OK) {
        noteAuthLost(r.kind);
        log26.warn(`类别 ${category} 拉取失败（pageNumber=${String(page)}，${r.kind}）：${r.msg}`);
        return out.length > 0 ? out : null;
      }
      for (const c of r.classes) out.push(c);
      if (r.classes.length < PAGE_SIZE) return out;
    }
    log26.warn(`类别 ${category} 超过 ${String(MAX_PAGES)} 页上限，只用前 ${String(out.length)} 条比对`);
    return out;
  }
  async function pollCategory(start) {
    const { groups, skipped } = groupByCategory(start.items);
    if (skipped > 0) {
      log26.warn(`类别监控：跳过 ${String(skipped)} 条缺类别代码的监控项（无法按类别查询）`);
    }
    if (groups.length === 0) {
      log26.warn("类别监控：监控项都缺类别代码，无法按类别查询");
      return { checked: 0, hits: [] };
    }
    let store = start;
    const rows = [];
    for (const group of groups) {
      const classes = await fetchCategoryAll(group.category);
      if (classes === null) {
        for (const it of group.items) {
          rows.push({ teachingClassID: it.teachingClassID, remain: null, kind: "fail" });
          const applied2 = applyCheck(store, it.teachingClassID, null, Date.now(), "按类别查询失败");
          store = applied2.store;
          saveMonitorStore(store);
        }
        continue;
      }
      const index = /* @__PURE__ */ new Map();
      for (const c of classes) index.set(c.teachingClassID, c);
      for (const it of group.items) {
        const cls = index.get(it.teachingClassID);
        const remain = cls === void 0 ? null : remainOf(cls);
        const applied2 = cls === void 0 ? applyCheck(store, it.teachingClassID, null, Date.now(), "按类别查询未找到该教学班") : applyCheck(store, it.teachingClassID, remain, Date.now());
        store = applied2.store;
        saveMonitorStore(store);
        rows.push({
          teachingClassID: it.teachingClassID,
          remain,
          kind: cls === void 0 ? "notfound" : "ok"
        });
      }
    }
    return { checked: rows.length, hits: hitsOf(rows) };
  }
  function noteAuthLost(kind) {
    if (kind !== RESP_KIND.UNAUTHENTICATED) return false;
    stopPolling();
    log26.error("登录态失效，已停止监控轮询");
    panel?.toast("登录态失效，已停止监控，请刷新页面重新登录", "error");
    panel?.alertAuthExpired();
    return true;
  }
  function nameOf(store, tcId) {
    const m = byId(store, tcId);
    if (m === null || m.courseName === "") return tcId;
    return m.courseName;
  }
  async function afterCheck(res) {
    if (res.hits.length === 0) return;
    const withCount = addHitCount(loadMonitorStore(), res.hits.length);
    saveMonitorStore(withCount);
    const summary = hitSummaryText(res.hits, (tcId) => nameOf(withCount, tcId));
    log26.info(`监控命中余量：${summary}`);
    panel?.toast(`发现余量：${summary}`, "success");
    if (!isEnabled(SITE_ID2, TOGGLE2.WRITE_API)) {
      log26.warn("监控命中余量，但写接口总开关未开启，只提醒不自动抢");
      return;
    }
    for (const row3 of res.hits) {
      const item = byId(loadMonitorStore(), row3.teachingClassID);
      if (item === null) continue;
      await grabNow(item);
    }
  }
  async function grabNow(item) {
    if (!isEnabled(SITE_ID2, TOGGLE2.WRITE_API)) return { ok: false, reason: "write-disabled" };
    const ctx = bkxkContext();
    if (ctx.batchCode === "" || ctx.studentCode === "") return { ok: false, reason: "no-session" };
    if (item.category === "") return { ok: false, reason: "no-category" };
    const body = buildVolunteerBody({
      studentCode: ctx.studentCode,
      electiveBatchCode: ctx.batchCode,
      teachingClassId: item.teachingClassID,
      campus: ctx.campus,
      teachingClassType: item.category
    });
    try {
      const r = await bkxkSend({
        url: endpointUrl(EP.VOLUNTEER, pageOrigin()),
        action: `监控自动抢 ${item.teachingClassID}`,
        method: "POST",
        body,
        token: ctx.token,
        priority: PRIORITY.MONITOR_HIT
      });
      if (r.cls.kind === RESP_KIND.OK) {
        const name = item.courseName === "" ? item.teachingClassID : item.courseName;
        log26.info(`监控自动抢成功 ${name}`);
        panel?.toast(`监控抢到：${name}`, "success");
        const removed = removeMonitorItem(loadMonitorStore(), item.teachingClassID);
        if (removed.removed) saveMonitorStore(removed.store);
        return { ok: true, reason: "" };
      }
      const msg = r.cls.msg === "" ? r.cls.kind : r.cls.msg;
      updateMonitor((s) => patchMonitor(s, item.teachingClassID, { lastMsg: msg }));
      log26.warn(`监控自动抢未成功（${r.cls.kind}）：${msg}`);
      noteAuthLost(r.cls.kind);
      return { ok: false, reason: r.cls.kind, msg };
    } catch (err) {
      const text2 = err instanceof Error ? err.message : String(err);
      log26.warn(`监控自动抢请求异常：${item.teachingClassID}`, err);
      return { ok: false, reason: "exception", msg: text2 };
    }
  }

  // src/sites/bkxk/tasks-model.ts
  var TASK_STATUS = {
    /** 等待尝试（也是每轮跑完/刷新后的落点） */
    PENDING: "pending",
    /** 正在请求。**不落盘** */
    RUNNING: "running",
    /** 抢到了。留在队列里不删（旧仓库如此），只是不再参与轮询 */
    SUCCESS: "success",
    /** 已按策略停手 */
    FAILED: "failed"
  };
  var RETRY_MODE = {
    SMART: "smart",
    NEVER: "never",
    ALWAYS: "always"
  };
  var RETRY_MODE_NAME = {
    smart: "智能",
    never: "失败即停",
    always: "持续重试"
  };
  var TASK_KIND = {
    OK: "ok",
    RETRYABLE: "retryable",
    TERMINAL: "terminal",
    AUTH: "auth",
    UNKNOWN: "unknown"
  };
  var AUTH_MSG2 = "登录态失效，请刷新页面重新登录";
  var RETRYABLE_RE = /已满|满员|容量|人数/;
  var TERMINAL_RE = /已选|已添加|选中|重复|冲突|学分|门数|门课|限选|性别|年级|不允许|未开放|无权限|不在|已经存在|存在选课结果/;
  function classifyMsg(msg) {
    const m = msg === null || msg === void 0 ? "" : String(msg);
    if (RETRYABLE_RE.test(m)) return TASK_KIND.RETRYABLE;
    if (TERMINAL_RE.test(m)) return TASK_KIND.TERMINAL;
    return TASK_KIND.UNKNOWN;
  }
  function shouldRetry(mode, kind) {
    if (mode === RETRY_MODE.ALWAYS) return true;
    if (mode === RETRY_MODE.NEVER) return false;
    return kind === TASK_KIND.RETRYABLE || kind === TASK_KIND.UNKNOWN;
  }
  function isRetryMode(v) {
    return v === RETRY_MODE.SMART || v === RETRY_MODE.NEVER || v === RETRY_MODE.ALWAYS;
  }
  function normalizeRetryMode(v) {
    return isRetryMode(v) ? v : RETRY_MODE.SMART;
  }
  function normalizeStatus(v) {
    if (v === TASK_STATUS.SUCCESS) return TASK_STATUS.SUCCESS;
    if (v === TASK_STATUS.FAILED) return TASK_STATUS.FAILED;
    return TASK_STATUS.PENDING;
  }
  function isActiveTask(t) {
    return t.enabled && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);
  }
  function activeTasks(items2) {
    return [...items2].filter((t) => isActiveTask(t)).sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : a.seq - b.seq);
  }
  function slimTasks(store) {
    return {
      seq: store.seq,
      items: store.items.map((t) => t.status === TASK_STATUS.RUNNING ? { ...t, status: TASK_STATUS.PENDING } : t)
    };
  }
  function normalizeStore(raw) {
    const base = readTaskStore(raw);
    return { seq: base.seq, items: base.items.map((t) => normalizeItem(t)) };
  }
  function normalizeItem(t) {
    const authResidue = t.lastKind === TASK_KIND.AUTH || t.lastMsg === AUTH_MSG2;
    const status = normalizeStatus(t.status);
    return {
      ...t,
      status: authResidue && status === TASK_STATUS.FAILED ? TASK_STATUS.PENDING : status,
      retryMode: normalizeRetryMode(t.retryMode),
      ...authResidue ? { lastMsg: "", lastKind: "" } : {}
    };
  }
  function byId2(store, id) {
    return store.items.find((t) => t.id === id) ?? null;
  }
  function patchTask(store, id, patch) {
    let hit = false;
    const items2 = store.items.map((t) => {
      if (t.id !== id) return t;
      hit = true;
      return { ...t, ...patch };
    });
    return hit ? { ...store, items: items2 } : store;
  }
  function setRetryMode(store, id, mode) {
    if (!isRetryMode(mode)) return store;
    return patchTask(store, id, { retryMode: mode });
  }
  function toggleTask2(store, id) {
    const t = byId2(store, id);
    if (t === null) return { store, enabled: false };
    const enabled = !t.enabled;
    const next = enabled && t.status === TASK_STATUS.FAILED ? patchTask(store, id, { enabled, status: TASK_STATUS.PENDING }) : patchTask(store, id, { enabled });
    return { store: next, enabled };
  }
  function removeTask(store, id) {
    const items2 = store.items.filter((t) => t.id !== id);
    if (items2.length === store.items.length) return { store, removed: false };
    return { store: { ...store, items: items2 }, removed: true };
  }
  function clearTasks() {
    return { seq: 0, items: [] };
  }
  function clearStaleTasks(store) {
    let cleared = 0;
    const items2 = store.items.map((t) => {
      if (!t.enabled || t.status !== TASK_STATUS.FAILED) return t;
      cleared += 1;
      return { ...t, status: TASK_STATUS.PENDING, attempts: 0, lastMsg: "", lastKind: "" };
    });
    return cleared === 0 ? { store, cleared } : { store: { ...store, items: items2 }, cleared };
  }
  function resetTasks(store) {
    return {
      seq: store.seq,
      items: store.items.map(
        (t) => t.status === TASK_STATUS.SUCCESS ? { ...t, attempts: 0, lastMsg: "" } : { ...t, status: TASK_STATUS.PENDING, attempts: 0, lastMsg: "" }
      )
    };
  }
  var STATUS_LABEL = {
    pending: "待抢",
    running: "抢课中",
    success: "已抢到",
    failed: "已停止"
  };
  function statusLabel(v) {
    return STATUS_LABEL[v] ?? v;
  }
  function statusKey(v) {
    if (v === TASK_STATUS.SUCCESS) return "ok";
    if (v === TASK_STATUS.FAILED) return "bad";
    if (v === TASK_STATUS.RUNNING) return "run";
    return "wait";
  }
  var KIND_LABEL = {
    ok: "正常",
    retryable: "可重试",
    terminal: "终结性",
    auth: "登录态",
    unknown: "未识别"
  };
  function kindLabel(v) {
    return KIND_LABEL[v] ?? v;
  }
  function summaryText2(items2) {
    if (items2.length === 0) return "队列为空";
    const count = (s) => items2.filter((t) => t.status === s).length;
    const parts = [];
    const pending = count(TASK_STATUS.PENDING);
    const running4 = count(TASK_STATUS.RUNNING);
    const success = count(TASK_STATUS.SUCCESS);
    const failed = count(TASK_STATUS.FAILED);
    if (pending > 0) parts.push(`待抢 ${String(pending)}`);
    if (running4 > 0) parts.push(`抢课中 ${String(running4)}`);
    if (success > 0) parts.push(`已抢到 ${String(success)}`);
    if (failed > 0) parts.push(`已停止 ${String(failed)}`);
    const disabled = items2.filter((t) => !t.enabled).length;
    if (disabled > 0) parts.push(`未勾选 ${String(disabled)}`);
    return `${String(items2.length)} 条（${parts.join(" · ")}）`;
  }
  var PRIORITY_MIN = -9;
  var PRIORITY_MAX = 9;
  function clampPriority(p) {
    const n = typeof p === "number" ? p : Number(p);
    if (!Number.isFinite(n)) return 0;
    const i = Math.trunc(n);
    if (i < PRIORITY_MIN) return PRIORITY_MIN;
    if (i > PRIORITY_MAX) return PRIORITY_MAX;
    return i;
  }
  function setPriority(store, id, p) {
    return patchTask(store, id, { priority: clampPriority(p) });
  }
  function priorityHint(p) {
    if (p < 0) return `优先级 ${String(p)}（比默认更先抢）`;
    if (p > 0) return `优先级 ${String(p)}（比默认更后抢）`;
    return "优先级 0（默认）";
  }
  function priorityLabel(p) {
    if (p < 0) return "更先抢";
    if (p > 0) return "更后抢";
    return "默认";
  }

  // src/sites/bkxk/tasks.ts
  var log27 = scoped("bkxk/tasks");
  var panel2 = null;
  function bindTaskPanel(p) {
    panel2 = p;
  }
  var listeners7 = /* @__PURE__ */ new Set();
  function subscribeTasks(fn) {
    listeners7.add(fn);
    return () => {
      listeners7.delete(fn);
    };
  }
  function notify4() {
    for (const fn of [...listeners7]) {
      try {
        fn();
      } catch (err) {
        log27.warn("任务订阅回调抛错（已忽略）", err);
      }
    }
  }
  function loadTaskStore() {
    return normalizeStore(read(BKXK_STORE_KEY.TASKS, null));
  }
  function saveTaskStore(store) {
    write(BKXK_STORE_KEY.TASKS, slimTasks(store));
    notify4();
  }
  function updateTasks(fn) {
    const next = fn(loadTaskStore());
    saveTaskStore(next);
    return next;
  }
  var running3 = false;
  function isTaskRunning() {
    return running3;
  }
  function startTasks() {
    if (!isEnabled(SITE_ID2, TOGGLE2.WRITE_API)) {
      log27.warn("写接口总开关未开启，拒绝开始抢课");
      panel2?.toast("写接口总开关未开启，请先到【设置】里打开", "warn");
      return { ok: false, reason: "write-disabled", count: 0 };
    }
    if (running3) {
      return { ok: false, reason: "already-running", count: 0 };
    }
    const stale = clearStaleTasks(loadTaskStore());
    if (stale.cleared > 0) {
      saveTaskStore(stale.store);
      log27.info(`开始前清洗了 ${String(stale.cleared)} 条「已勾选但上次跑失败」的任务，它们会重新参与`);
    }
    const list2 = activeTasks(loadTaskStore().items);
    if (list2.length === 0) {
      panel2?.toast("没有可抢的任务（都没勾选，或都已抢到）", "warn");
      return { ok: false, reason: "no-task", count: 0 };
    }
    running3 = true;
    log27.info(`开始抢课，任务数 ${String(list2.length)}`);
    panel2?.toast(`开始抢课（${String(list2.length)} 条）`, "success");
    void loop3();
    return { ok: true, reason: "", count: list2.length };
  }
  function stopTasks() {
    if (!running3) return false;
    running3 = false;
    const before = loadTaskStore();
    const after = slimTasks(before);
    const changed = after.items.some((t, i) => t !== before.items[i]);
    if (changed) saveTaskStore(after);
    else notify4();
    log27.info("已停止抢课");
    panel2?.toast("已停止抢课", "info");
    return true;
  }
  function sleep3(ms) {
    return new Promise((resolve2) => {
      setTimeout(resolve2, ms);
    });
  }
  async function loop3() {
    try {
      while (running3) {
        if (activeTasks(loadTaskStore().items).length === 0) {
          running3 = false;
          log27.info("全部任务已结束");
          panel2?.toast("全部任务已结束", "info");
          return;
        }
        await round();
        if (!running3) return;
        const iv = clampLimit("retryIntervalMs", getValue(SITE_ID2, VALUE2.RETRY_INTERVAL_MS));
        await sleep3(iv);
      }
    } catch (err) {
      running3 = false;
      log27.error("抢课循环异常结束", err);
      panel2?.toast("抢课循环异常，已停止（详见日志）", "error");
    } finally {
      notify4();
    }
  }
  async function round() {
    const list2 = activeTasks(loadTaskStore().items);
    for (const snapshot of list2) {
      if (!running3) return;
      const cur2 = byId2(loadTaskStore(), snapshot.id);
      if (cur2 === null || !cur2.enabled) continue;
      await attempt(cur2);
    }
  }
  function finish(id, patch) {
    saveTaskStore(patchTask(loadTaskStore(), id, patch));
  }
  async function attempt(task) {
    const ctx = bkxkContext();
    if (ctx.batchCode === "" || ctx.studentCode === "") {
      finish(task.id, {
        status: TASK_STATUS.FAILED,
        lastMsg: "缺少学号或选课批次码，请在设置中补全",
        lastKind: TASK_KIND.TERMINAL
      });
      log27.error(`抢课中止：缺少学号或批次码 ${task.teachingClassID}`);
      return;
    }
    if (task.category === "") {
      finish(task.id, {
        status: TASK_STATUS.FAILED,
        lastMsg: "未能识别该教学班的类别代码，请重新在列表中点击「添加抢课」",
        lastKind: TASK_KIND.TERMINAL
      });
      log27.error(`抢课中止：类别代码未知 ${task.teachingClassID}`);
      return;
    }
    finish(task.id, { status: TASK_STATUS.RUNNING, attempts: task.attempts + 1 });
    const body = buildVolunteerBody({
      studentCode: ctx.studentCode,
      electiveBatchCode: ctx.batchCode,
      teachingClassId: task.teachingClassID,
      campus: ctx.campus,
      teachingClassType: task.category
    });
    let kind;
    let msg;
    try {
      const r = await bkxkSend({
        url: endpointUrl(EP.VOLUNTEER, pageOrigin()),
        action: `抢课 ${task.teachingClassID}`,
        method: "POST",
        body,
        token: ctx.token,
        priority: PRIORITY.HIGH
      });
      kind = r.cls.kind;
      msg = r.cls.msg;
    } catch (err) {
      const text2 = err instanceof Error ? err.message : String(err);
      const retry = shouldRetry(task.retryMode, TASK_KIND.UNKNOWN);
      finish(task.id, {
        status: retry ? TASK_STATUS.PENDING : TASK_STATUS.FAILED,
        lastMsg: `请求异常：${text2}`,
        lastKind: TASK_KIND.UNKNOWN
      });
      log27.warn(`抢课请求异常（${retry ? "稍后重试" : "已停手"}）：${task.teachingClassID}`, err);
      return;
    }
    if (kind === RESP_KIND.OK) {
      finish(task.id, { status: TASK_STATUS.SUCCESS, lastMsg: msg, lastKind: TASK_KIND.OK });
      const name = task.courseName === "" ? task.teachingClassID : task.courseName;
      log27.info(`抢课成功 ${name}`);
      panel2?.toast(`抢课成功：${name}`, "success");
      return;
    }
    if (kind === RESP_KIND.UNAUTHENTICATED) {
      running3 = false;
      finish(task.id, { status: TASK_STATUS.FAILED, lastMsg: AUTH_MSG2, lastKind: TASK_KIND.AUTH });
      log27.error("登录态失效，已停止全部任务");
      panel2?.toast("登录态失效，已停止全部任务，请刷新页面重新登录", "error");
      panel2?.alertAuthExpired();
      return;
    }
    const cls = kind === RESP_KIND.BUSINESS ? classifyMsg(msg) : TASK_KIND.UNKNOWN;
    if (shouldRetry(task.retryMode, cls)) {
      finish(task.id, { status: TASK_STATUS.PENDING, lastMsg: msg, lastKind: cls });
      log27.warn(`抢课未成功，稍后重试（${kindLabel(cls)}）：${msg}`);
    } else {
      finish(task.id, { status: TASK_STATUS.FAILED, lastMsg: msg, lastKind: cls });
      const mode = RETRY_MODE_NAME[task.retryMode] ?? task.retryMode;
      log27.warn(`抢课失败，已按「${mode}」停手（${kindLabel(cls)}）：${msg}`);
    }
  }

  // src/sites/bkxk/list.ts
  var log28 = scoped("site/bkxk/list");
  var LIST_PAGE_MARK = "grablessons.do";
  var RESCAN_DELAY_MS = 120;
  var MAX_BLOCKS_PER_SCAN = 400;
  var HEAD_TEXT = "抢课模块";
  var CARD_SELECTOR = ".cv-course-card";
  var INFO_SELECTOR = ".cv-info";
  var ROW_SELECTOR = ".cv-row";
  var BODY_SELECTOR = ".cv-body";
  var SETTING_COL_SELECTOR = ".cv-setting-col";
  var TITLE_CELL_SELECTOR = ".cv-title-col, .cv-course";
  function swallow(ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  function textOf(node) {
    return cleanText(node === null ? "" : node.textContent);
  }
  function ownDescendant(unit, selector) {
    for (const node of unit.querySelectorAll(selector)) {
      if (node.closest(INFO_SELECTOR) === unit) return node;
    }
    return null;
  }
  function ownsBlock(unit) {
    return ownDescendant(unit, ".sztb-bkxk-block") !== null;
  }
  function attr(node, name) {
    const v = node.getAttribute(name);
    return v === null ? "" : v.trim();
  }
  function tcIdIn(unit) {
    const candidates = [];
    for (const node of unit.querySelectorAll("[tcid]")) {
      if (node.closest(INFO_SELECTOR) !== unit) continue;
      candidates.push(attr(node, "tcid"));
    }
    return pickTcId(candidates);
  }
  function tcIdsIn(node) {
    const out = [];
    for (const node2 of node.querySelectorAll("[tcid]")) {
      const id = attr(node2, "tcid");
      if (!isTcId(id)) continue;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }
  function categoryFor(node) {
    let cur2 = node;
    for (let i = 0; i < 10 && cur2 !== null; i++) {
      if (cur2.classList.contains("cv-body")) return categoryOfBodyId(cur2.id);
      cur2 = cur2.parentElement;
    }
    return "";
  }
  function courseNameOf(row3) {
    if (row3 === null) return "";
    return textOf(row3.querySelector(TITLE_CELL_SELECTOR));
  }
  function placeOfUnit(unit) {
    const timeEl = ownDescendant(unit, "div[title]");
    return placeFromTimeText(timeEl === null ? "" : timeEl.getAttribute("title"));
  }
  function infoForUnit(unit, tcId) {
    const titleEl = ownDescendant(unit, ".cv-info-title");
    const rawTitle = titleEl === null ? "" : titleEl.getAttribute("title") ?? titleEl.textContent;
    const row3 = unit.closest(".cv-row");
    return {
      tcId,
      courseName: courseNameOf(row3),
      teacherName: teacherFromTitle(rawTitle),
      category: categoryFor(unit),
      teachingPlace: placeOfUnit(unit)
    };
  }
  function infoForRow(row3, tcId) {
    return {
      tcId,
      courseName: courseNameOf(row3),
      teacherName: textOf(row3.querySelector(".cv-teacher-col")),
      category: categoryFor(row3),
      teachingPlace: textOf(row3.querySelector(".cv-time-col"))
    };
  }
  function targetText(info) {
    const parts = [info.courseName, info.teacherName].filter((s) => s !== "");
    const label = parts.length === 0 ? info.tcId : parts.join(" / ");
    return info.category === "" ? `${label}（类别未识别）` : label;
  }
  async function copyId(tcId, panel3) {
    const res = await copyText(tcId);
    if (res.ok) {
      log28.info(`已复制教学班ID ${tcId} 到剪贴板（方式：${res.method}）`);
      panel3.toast("已复制教学班ID", "success");
      return;
    }
    log28.warn(`复制教学班ID 失败：${res.detail}（可手动选中那一行复制）`);
    panel3.toast("复制失败，请手动选中复制", "warn");
  }
  function applyGrabButton(btn, on) {
    btn.textContent = grabButtonLabel(on);
    btn.classList.toggle("sztb-bkxk-btn-on", on);
  }
  function applyMonitorButton(btn, on) {
    btn.textContent = monitorButtonLabel(on);
    btn.classList.toggle("sztb-bkxk-btn-on", on);
  }
  function syncInjectedButtons() {
    const blocks = document.querySelectorAll("[data-sztb-tcid]");
    if (blocks.length === 0) return;
    const tasks = loadTaskStore();
    const monitors = loadMonitorStore();
    for (const block of blocks) {
      const tcId = block.getAttribute("data-sztb-tcid") ?? "";
      const grab = block.querySelector('button[data-role="grab"]');
      if (grab !== null) applyGrabButton(grab, hasTask(tasks, tcId));
      const mon = block.querySelector('button[data-role="monitor"]');
      if (mon !== null) applyMonitorButton(mon, hasMonitor(monitors, tcId));
    }
  }
  function onGrab(info, ctx, btn) {
    let nowOn = false;
    updateTasks((store) => {
      const res = toggleTask(store, {
        ...info,
        now: Date.now(),
        retryMode: getValue(SITE_ID2, VALUE2.RETRY_MODE)
      });
      nowOn = res.on;
      return res.store;
    });
    applyGrabButton(btn, nowOn);
    if (nowOn) {
      log28.info(`已加入抢课队列：${targetText(info)}（本轮只入队，不会发送任何请求）`);
      ctx.panel.toast(
        `已加入抢课队列：${info.courseName === "" ? info.tcId : info.courseName}`,
        "success"
      );
    } else {
      log28.info(`已移出抢课队列：${targetText(info)}（站点上已经选到的课不会被退掉）`);
      ctx.panel.toast("已移出抢课队列（不会退掉已经选上的课）", "info");
    }
  }
  function onMonitorToggle(info, ctx, btn) {
    let nowOn = false;
    updateMonitor((store) => {
      if (hasMonitor(store, info.tcId)) {
        nowOn = false;
        return removeMonitor(store, info.tcId).store;
      }
      nowOn = true;
      return addMonitor(store, { ...info, now: Date.now() }).store;
    });
    applyMonitorButton(btn, nowOn);
    if (nowOn) {
      log28.info(`已加入监控列表：${targetText(info)}（到监控页点【开始监控】才会轮询）`);
      ctx.panel.toast("已加入监控", "success");
    } else {
      log28.info(`已移出监控列表：${targetText(info)}`);
      ctx.panel.toast("已移出监控", "info");
    }
  }
  function buildBlock(info, ctx) {
    const idLine = el("div", {
      class: "sztb-bkxk-id",
      text: idLineText(info.tcId),
      attrs: { title: `点击复制：${info.tcId}` },
      on: {
        click: (ev) => {
          swallow(ev);
          void copyId(info.tcId, ctx.panel);
        }
      }
    });
    const queued = hasTask(loadTaskStore(), info.tcId);
    const grab = el("button", {
      class: `sztb-bkxk-btn${queued ? " sztb-bkxk-btn-on" : ""}`,
      text: grabButtonLabel(queued),
      attrs: { type: "button", "data-role": "grab" },
      on: {
        click: (ev) => {
          swallow(ev);
          onGrab(info, ctx, grab);
        }
      }
    });
    const monitored = hasMonitor(loadMonitorStore(), info.tcId);
    const mon = el("button", {
      class: `sztb-bkxk-btn${monitored ? " sztb-bkxk-btn-on" : ""}`,
      text: monitorButtonLabel(monitored),
      attrs: { type: "button", "data-role": "monitor" },
      on: {
        click: (ev) => {
          swallow(ev);
          onMonitorToggle(info, ctx, mon);
        }
      }
    });
    const block = el("div", {
      class: "sztb-bkxk-block",
      attrs: { "data-sztb-tcid": info.tcId }
    }, idLine, el("div", { class: "sztb-bkxk-ops" }, grab, mon));
    block.addEventListener("click", swallow);
    return block;
  }
  function injectStyle() {
    if (document.getElementById(LIST_STYLE_ID) !== null) return;
    const style = el("style", { attrs: { id: LIST_STYLE_ID } });
    style.textContent = LIST_CSS2;
    (document.head ?? document.documentElement).appendChild(style);
  }
  function enhanceUnit(unit, ctx) {
    if (ctx.budget >= MAX_BLOCKS_PER_SCAN) return;
    if (ownsBlock(unit)) return;
    const tcId = tcIdIn(unit);
    if (tcId === null) {
      log28.debug("卡片 .cv-info 未取到教学班 id，跳过（站点结构可能已变）");
      return;
    }
    const info = infoForUnit(unit, tcId);
    const block = buildBlock(info, ctx);
    unit.insertBefore(block, unit.firstChild);
    ctx.budget += 1;
    relocateInUnit(unit);
  }
  function enhanceRow(row3, ctx) {
    if (ctx.budget >= MAX_BLOCKS_PER_SCAN) return;
    if (row3.querySelector(CARD_SELECTOR) !== null) return;
    if (row3.querySelector(`:scope > .sztb-bkxk-col`) !== null) return;
    const cell = row3.querySelector(SETTING_COL_SELECTOR);
    if (cell === null) return;
    const ids = tcIdsIn(cell);
    if (ids.length === 0) {
      log28.debug("列表行未取到教学班 id，跳过（站点结构可能已变）");
      return;
    }
    const col = el("div", { class: "sztb-bkxk-col" });
    for (const tcId of ids) {
      col.appendChild(buildBlock(infoForRow(row3, tcId), ctx));
      ctx.budget += 1;
    }
    row3.appendChild(col);
  }
  function syncHeads() {
    for (const body of document.querySelectorAll(BODY_SELECTOR)) {
      if (body.querySelector(`:scope > ${ROW_SELECTOR} > .sztb-bkxk-col`) === null) continue;
      const head = body.parentElement?.querySelector(":scope > .cv-head") ?? null;
      if (head === null) continue;
      if (head.querySelector(":scope > .sztb-bkxk-col") !== null) continue;
      head.appendChild(el("div", { class: "sztb-bkxk-col sztb-bkxk-head", text: HEAD_TEXT }));
    }
  }
  function relocateInUnit(unit) {
    const title = ownDescendant(unit, ".cv-info-title");
    const star = ownDescendant(unit, `.${CLASS_COLLECTION_IMG}`);
    if (star !== null && title !== null) {
      const already = title.previousElementSibling === star;
      if (planCollectionImg(already) === "title-before") {
        title.parentElement?.insertBefore(star, title);
      }
    }
    const del = ownDescendant(unit, `.${CLASS_DELETE_VOLUNTEER}`);
    const h5 = ownDescendant(unit, "h5");
    if (del !== null && h5 !== null) {
      const already = del.parentElement === h5;
      if (planDeleteVolunteer(already) === "h5") {
        h5.appendChild(del);
      }
      reorderH5(h5);
    }
  }
  function reorderH5(h5) {
    const kids = Array.from(h5.children);
    if (kids.length < 2) return;
    const current = kids.map((node) => elementKey(Array.from(node.classList)));
    const wanted = orderH5Children(current);
    if (current.every((key, i) => key === wanted[i])) return;
    const byKey = /* @__PURE__ */ new Map();
    for (const node of kids) {
      const key = elementKey(Array.from(node.classList));
      const list2 = byKey.get(key);
      if (list2 === void 0) byKey.set(key, [node]);
      else list2.push(node);
    }
    for (const key of wanted) {
      const list2 = byKey.get(key);
      const node = list2?.shift();
      if (node !== void 0) h5.appendChild(node);
    }
  }
  function syncRelocation() {
    for (const unit of document.querySelectorAll(`${CARD_SELECTOR} ${INFO_SELECTOR}`)) {
      relocateInUnit(unit);
    }
  }
  function removeInjected() {
    const nodes = document.querySelectorAll(".sztb-bkxk-block, .sztb-bkxk-col, .sztb-bkxk-head");
    if (nodes.length === 0) return;
    for (const node of nodes) node.remove();
    log28.info(`列表注入开关已关闭：移除 ${String(nodes.length)} 个注入节点`);
  }
  function scan(ctx) {
    if (!isEnabled(SITE_ID2, TOGGLE2.LIST_INJECT)) {
      removeInjected();
      return;
    }
    ctx.budget = 0;
    injectStyle();
    for (const unit of document.querySelectorAll(`${CARD_SELECTOR} ${INFO_SELECTOR}`)) {
      enhanceUnit(unit, ctx);
    }
    for (const row3 of document.querySelectorAll(`${BODY_SELECTOR} > ${ROW_SELECTOR}`)) {
      enhanceRow(row3, ctx);
    }
    syncHeads();
    syncRelocation();
  }
  function startListInjection(panel3) {
    if (!location.pathname.includes(LIST_PAGE_MARK)) {
      log28.debug(`当前不是选课页（${location.pathname}），跳过列表注入`);
      return () => void 0;
    }
    const ctx = {
      panel: panel3,
      budget: 0
    };
    let observer = null;
    let timer3 = null;
    const schedule2 = () => {
      if (timer3 !== null) return;
      timer3 = window.setTimeout(() => {
        timer3 = null;
        scan(ctx);
      }, RESCAN_DELAY_MS);
    };
    const unsubscribes = [subscribeTasks(syncInjectedButtons), subscribeMonitor2(syncInjectedButtons)];
    whenDomReady(() => {
      scan(ctx);
      observer = new MutationObserver(schedule2);
      observer.observe(document.body, { childList: true, subtree: true });
      log28.info(
        `选课列表注入已就绪：抢课队列 ${String(loadTaskStore().items.length)} 条 / 监控 ${String(loadMonitorStore().items.length)} 条（本轮点击只入队，不发请求）`
      );
    });
    return () => {
      for (const off of unsubscribes) off();
      observer?.disconnect();
      observer = null;
      if (timer3 !== null) {
        window.clearTimeout(timer3);
        timer3 = null;
      }
    };
  }

  // src/sites/bkxk/timetable-style.ts
  var TT_STYLE_ID = "sztb-bkxk-tt-style";
  var TT_CSS = `
/* ---- 站点画的卡片里、我们塞进去的「自定义」标签 ---- */

.sztb-bkxk-tt-tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1.3;
  padding: 0 3px;
  border-radius: 2px;
  background: #047adc;
  color: #fff;
  margin-left: 3px;
  /* 站点的卡片文字可能被设成块级/绝对定位，这里把小标签按行内块摆稳 */
  vertical-align: middle;
}
`;

  // src/sites/bkxk/timetable-model.ts
  var SITE_TABLE_ID = "myCourseTable";
  var SITE_TABLE_SELECTOR = ".cv-my-course";
  var SITE_CARD_CLASS = "cv-course-card-single";
  var SITE_CARD_SELECTOR = `.${SITE_CARD_CLASS}`;
  var MAX_REFETCH_TRIES = 3;
  function shouldRefetchSite(input) {
    return input.hijackOn && input.tried < input.maxTries && input.enabledCourses > 0 && input.siteCards > 0 && input.tags === 0;
  }

  // src/sites/bkxk/timetable.ts
  var log29 = scoped("site/bkxk/timetable");
  var TT_PAGE_MARK = "curriculum.do";
  var MAX_TRIES = 20;
  var RETRY_MS = 500;
  var RESCAN_DELAY_MS2 = 300;
  var SITE_TIMETABLE_MODULE = "CVQueryCurriculum";
  var autoRefetch = { tried: 0 };
  var loggedDrawn = false;
  function findTable(doc = document) {
    return doc.getElementById(SITE_TABLE_ID) ?? doc.querySelector(SITE_TABLE_SELECTOR);
  }
  function countSiteCards(table) {
    return table.querySelectorAll(`.${SITE_CARD_CLASS}`).length;
  }
  function countTags(table) {
    return table.querySelectorAll(TT_TAG_SELECTOR).length;
  }
  function injectTagStyle() {
    if (document.getElementById(TT_STYLE_ID) !== null) return;
    const style = el("style", { attrs: { id: TT_STYLE_ID } });
    style.textContent = TT_CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }
  function askSiteToRefetch(reason) {
    const mod = pageRecord()[SITE_TIMETABLE_MODULE];
    if (mod === void 0 || typeof mod.init !== "function") {
      log29.warn(
        `站点没有 ${SITE_TIMETABLE_MODULE}.init（改版了？）—— 这一轮的自定义课程不会出现，刷新页面可重来`
      );
      return false;
    }
    log29.info(
      `请站点重新请求一次课表（${reason}；上一发响应${didRewriteTimetable() ? "已被我们改写" : "我们没赶上"}）⇒ ${SITE_TIMETABLE_MODULE}.init()`
    );
    mod.init.call(mod);
    return true;
  }
  function autoRefetchIfNeeded(table) {
    const enabled = readEnabledCustomCourses().length;
    const cards = countSiteCards(table);
    const tags = countTags(table);
    const ok = shouldRefetchSite({
      hijackOn: kindEnabled("timetable"),
      tried: autoRefetch.tried,
      maxTries: MAX_REFETCH_TRIES,
      enabledCourses: enabled,
      siteCards: cards,
      tags
    });
    if (!ok) {
      if (!loggedDrawn && tags > 0) {
        loggedDrawn = true;
        log29.info(
          `站点画出的课表里已经带上我们的标记 ${String(tags)} 个（自定义课程 ${String(enabled)} 门）`
        );
      }
      return false;
    }
    autoRefetch.tried += 1;
    return askSiteToRefetch(
      `站点已经画完 ${String(cards)} 张卡片、里面没有我们的标记（第 ${String(autoRefetch.tried)} 次）`
    );
  }
  function refreshTimetable() {
    const table = findTable();
    if (table === null) return 0;
    if (readEnabledCustomCourses().length === 0) return 0;
    if (!kindEnabled("timetable")) return 0;
    return askSiteToRefetch("你在【自定义】里改了课程") ? 1 : 0;
  }
  function startTimetableInjection() {
    if (!location.pathname.includes(TT_PAGE_MARK)) {
      log29.debug(`当前不是课表页（${location.pathname}），跳过课表接管`);
      return () => void 0;
    }
    let observer = null;
    let timer3 = null;
    let retry = null;
    let tries = 0;
    const schedule2 = () => {
      if (timer3 !== null) return;
      timer3 = window.setTimeout(() => {
        timer3 = null;
        const table = findTable();
        if (table === null) return;
        injectTagStyle();
        autoRefetchIfNeeded(table);
      }, RESCAN_DELAY_MS2);
    };
    const attempt2 = () => {
      const table = findTable();
      if (table === null) {
        tries += 1;
        if (tries < MAX_TRIES) {
          retry = window.setTimeout(attempt2, RETRY_MS);
        } else {
          log29.warn(`未找到课表容器 #${SITE_TABLE_ID}，放弃接管（站点的课表可能还没出数据）`);
        }
        return;
      }
      injectTagStyle();
      const courses = readEnabledCustomCourses();
      log29.info(
        `课表页接管就绪：自定义课程 ${String(courses.length)} 门；课表由站点自己画，我们只加「自定义」标签`
      );
      autoRefetchIfNeeded(table);
      observer = new MutationObserver(schedule2);
      observer.observe(table, { childList: true, subtree: true });
    };
    whenDomReady(attempt2);
    return () => {
      observer?.disconnect();
      observer = null;
      if (timer3 !== null) {
        window.clearTimeout(timer3);
        timer3 = null;
      }
      if (retry !== null) {
        window.clearTimeout(retry);
        retry = null;
      }
    };
  }

  // src/sites/bkxk/tabs/tasks-style.ts
  var TASKS_TAB_CSS = `
.sztb-bkxk-tk-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
}

.sztb-bkxk-tk-item:hover {
  background: var(--sztb-bg-alt);
}

.sztb-bkxk-tk-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.sztb-bkxk-tk-main {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-bkxk-tk-name {
  font-size: 13px;
  word-break: break-word;
}

.sztb-bkxk-tk-meta {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

/* 未勾选的任务：名字划掉，一眼看出它这轮不参与 */
.sztb-bkxk-tk-item[data-off="true"] .sztb-bkxk-tk-name {
  color: var(--sztb-text-dim);
  text-decoration: line-through;
}

.sztb-bkxk-tk-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--sztb-border);
  border-radius: 9px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-tk-badge[data-state="ok"] {
  color: var(--sztb-ok);
  border-color: var(--sztb-ok);
}

.sztb-bkxk-tk-badge[data-state="bad"] {
  color: var(--sztb-danger);
  border-color: var(--sztb-danger);
}

.sztb-bkxk-tk-badge[data-state="run"] {
  color: var(--sztb-accent);
  border-color: var(--sztb-accent);
}

.sztb-bkxk-tk-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 很小的按钮：优先级加减、删除。两个类名压住公共 .sztb-btn 的内边距 */
.sztb-btn.sztb-bkxk-tk-tiny {
  padding: 1px 7px;
  font-size: 11.5px;
}

/* 步进器左边那个短标签：告诉人这一串是干什么的 */
.sztb-bkxk-tk-prio-label {
  font-size: 11.5px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-tk-prio {
  min-width: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--sztb-text-dim);
}

/* 策略下拉很窄，压掉公共 .sztb-select 的 width:100% */
.sztb-select.sztb-bkxk-tk-mode {
  width: auto;
  padding: 2px 4px;
  font-size: 11.5px;
}

/* 公共样式里勾选框只被 .sztb-row 管，这里的行不是 .sztb-row */
.sztb-bkxk-tk-item input[type="checkbox"] {
  flex: 0 0 auto;
  margin: 0;
  width: 15px;
  height: 15px;
  accent-color: var(--sztb-accent);
  cursor: pointer;
}

/* 失败原因 / 登录态失效：红色左边线，与「自定义课程」的警示条同款 */
.sztb-bkxk-tk-warn {
  border-left-color: var(--sztb-danger);
  color: var(--sztb-danger);
}

.sztb-bkxk-tk-ok {
  color: var(--sztb-ok);
}

.sztb-bkxk-tk-now {
  margin: 0 0 6px;
  padding: 6px 8px;
  border-left: 2px solid var(--sztb-accent);
  border-radius: 0 5px 5px 0;
  background: var(--sztb-bg-alt);
  font-size: 12px;
  line-height: 1.6;
}

.sztb-bkxk-tk-now[hidden] {
  display: none;
}
`;

  // src/sites/bkxk/tabs/tasks.ts
  var log30 = scoped("bkxk/tasks-tab");
  var BKXK_TASKS_TAB_ID = "bkxk:tasks";
  var MODE_ORDER = [RETRY_MODE.SMART, RETRY_MODE.NEVER, RETRY_MODE.ALWAYS];
  var GATE_POLL_MS = 1e3;
  var BKXK_TASKS_TAB = {
    id: BKXK_TASKS_TAB_ID,
    title: "任务",
    order: 100,
    css: TASKS_TAB_CSS,
    mount(root, ctx) {
      return mountTasksTab(root, ctx);
    }
  };
  function mountTasksTab(root, ctx) {
    const note = el("div", {
      class: "sztb-note",
      text: "这里管抢课队列。列表页点【添加抢课】只入队，必须回本页点【开始抢课】才会真正发请求。抢课是不可逆操作（会直接产生选课结果），点之前请确认【设置】里的写接口总开关是你想要的状态。"
    });
    const gateWarn = el("div", { class: "sztb-note sztb-bkxk-tk-warn" });
    gateWarn.hidden = true;
    const summary = el("div", { class: "sztb-group-title" });
    const runningBox = el("div", { class: "sztb-bkxk-tk-now" });
    runningBox.hidden = true;
    const startBtn = el("button", {
      class: "sztb-btn",
      text: "开始抢课",
      attrs: { type: "button", "data-variant": "primary" }
    });
    const stopBtn = el("button", { class: "sztb-btn", text: "停止", attrs: { type: "button" } });
    const resetBtn = el("button", {
      class: "sztb-btn",
      text: "重置未成功",
      attrs: { type: "button" }
    });
    const clearBtn = el("button", {
      class: "sztb-btn",
      text: "清空队列",
      attrs: { type: "button", "data-variant": "danger" }
    });
    const toolbar = el("div", { class: "sztb-toolbar" }, startBtn, stopBtn, resetBtn, clearBtn);
    const listTitle = el("div", { class: "sztb-group-title" });
    const listBox = el("div");
    root.appendChild(note);
    root.appendChild(gateWarn);
    root.appendChild(summary);
    root.appendChild(runningBox);
    root.appendChild(toolbar);
    root.appendChild(listTitle);
    root.appendChild(listBox);
    function render2() {
      const items2 = loadTaskStore().items;
      const running4 = isTaskRunning();
      summary.textContent = summaryText2(items2);
      listTitle.textContent = `队列（${String(items2.length)} 条）`;
      runningBox.hidden = !running4;
      if (running4) {
        const left = items2.filter(
          (t) => t.enabled && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
        ).length;
        runningBox.textContent = `抢课进行中：还剩 ${String(left)} 条待抢。抢到的任务会留在队列里（不会自动移出）。循环跑在本页里，关掉页面就等于停止抢课。`;
      }
      stopBtn.disabled = !running4;
      startBtn.disabled = running4;
      listBox.textContent = "";
      if (items2.length === 0) {
        listBox.appendChild(
          el("div", {
            class: "sztb-empty",
            text: "队列是空的。到选课页的课程卡片上点【添加抢课】就会出现在这里。"
          })
        );
        return;
      }
      for (const task of items2) listBox.appendChild(buildItem(task));
    }
    function syncGate() {
      const on = isEnabled(SITE_ID2, TOGGLE2.WRITE_API);
      gateWarn.hidden = on;
      if (!on) {
        gateWarn.textContent = "写接口总开关未开启：点【开始抢课】不会发出任何请求。要真的抢课，请到【设置】页打开「写接口总开关（抢课）」。";
      }
      return on;
    }
    function metaText(task) {
      const cat = CATEGORY_NAME[task.category];
      return [
        task.teacherName === "" ? "教师未知" : task.teacherName,
        cat ?? (task.category === "" ? "类别未知" : task.category),
        `已试 ${String(task.attempts)} 次`,
        task.teachingClassID
      ].join(" ｜ ");
    }
    function buildItem(task) {
      const item = el("div", {
        class: "sztb-bkxk-tk-item",
        data: task.enabled ? {} : { off: "true" }
      });
      const top = el("div", { class: "sztb-bkxk-tk-top" });
      const check = el("input", { attrs: { type: "checkbox", title: "这条任务是否参与抢课" } });
      check.checked = task.enabled;
      check.addEventListener("change", () => {
        updateTasks((s) => toggleTask2(s, task.id).store);
        log30.info(
          `${task.enabled ? "取消勾选" : "勾选"}任务「${task.courseName === "" ? task.teachingClassID : task.courseName}」`
        );
        render2();
      });
      top.appendChild(check);
      const main2 = el("div", { class: "sztb-bkxk-tk-main" });
      main2.appendChild(el("span", { class: "sztb-bkxk-tk-name", text: task.courseName || "（课名未知）" }));
      main2.appendChild(el("span", { class: "sztb-bkxk-tk-meta", text: metaText(task) }));
      const msg = el("span", { class: "sztb-bkxk-tk-meta" });
      if (task.lastMsg === "") {
        msg.textContent = priorityHint(task.priority);
      } else {
        msg.textContent = `${kindLabel(task.lastKind)}：${task.lastMsg}`;
        if (task.lastKind !== "ok" && task.lastKind !== "retryable") {
          msg.classList.add("sztb-bkxk-tk-warn");
        }
      }
      main2.appendChild(msg);
      top.appendChild(main2);
      top.appendChild(
        el("span", {
          class: "sztb-bkxk-tk-badge",
          text: statusLabel(task.status),
          data: { state: statusKey(task.status) }
        })
      );
      item.appendChild(top);
      const ops = el("div", { class: "sztb-bkxk-tk-ops" });
      ops.appendChild(
        el("span", {
          class: "sztb-bkxk-tk-prio-label",
          text: priorityLabel(task.priority),
          attrs: { title: priorityHint(task.priority) }
        })
      );
      const down = el("button", {
        class: "sztb-btn sztb-bkxk-tk-tiny",
        text: "−",
        attrs: { type: "button", title: "优先级 -1（更先抢）" }
      });
      down.addEventListener("click", () => {
        updateTasks((s) => setPriority(s, task.id, clampPriority(task.priority - 1)));
        render2();
      });
      const prio = el("span", {
        class: "sztb-bkxk-tk-prio",
        text: String(task.priority),
        attrs: { title: priorityHint(task.priority) }
      });
      const up = el("button", {
        class: "sztb-btn sztb-bkxk-tk-tiny",
        text: "＋",
        attrs: { type: "button", title: "优先级 +1（更后抢）" }
      });
      up.addEventListener("click", () => {
        updateTasks((s) => setPriority(s, task.id, clampPriority(task.priority + 1)));
        render2();
      });
      ops.appendChild(down);
      ops.appendChild(prio);
      ops.appendChild(up);
      const mode = el("select", { class: "sztb-select sztb-bkxk-tk-mode", attrs: { title: "失败后怎么处理" } });
      for (const value of MODE_ORDER) {
        const opt = el("option", { text: RETRY_MODE_NAME[value] ?? value });
        opt.value = value;
        mode.appendChild(opt);
      }
      mode.value = RETRY_MODE_NAME[task.retryMode] === void 0 ? RETRY_MODE.SMART : task.retryMode;
      mode.addEventListener("change", () => {
        updateTasks((s) => setRetryMode(s, task.id, mode.value));
        log30.info(`任务「${task.courseName || task.teachingClassID}」的重试策略改为 ${mode.value}`);
        render2();
      });
      ops.appendChild(mode);
      const del = el("button", {
        class: "sztb-btn sztb-bkxk-tk-tiny",
        text: "删除",
        attrs: { type: "button" }
      });
      del.addEventListener("click", () => {
        updateTasks((s) => removeTask(s, task.id).store);
        log30.info(`已从队列删除任务「${task.courseName || task.teachingClassID}」`);
        render2();
      });
      ops.appendChild(del);
      item.appendChild(ops);
      return item;
    }
    startBtn.addEventListener("click", () => {
      if (!syncGate()) log30.warn("写接口总开关未开，拒绝开始");
      const res = startTasks();
      if (!res.ok && res.reason === "already-running") ctx.host.toast("已经在抢课中了", "info");
      render2();
    });
    stopBtn.addEventListener("click", () => {
      if (!stopTasks()) ctx.host.toast("当前没有在抢课", "info");
      render2();
    });
    resetBtn.addEventListener("click", () => {
      const stale = loadTaskStore().items.filter((t) => t.status === TASK_STATUS.FAILED).length;
      if (stale === 0) {
        ctx.host.toast("没有需要重置的任务", "info");
        return;
      }
      void ctx.host.confirm({
        title: `重置 ${String(stale)} 条未成功的任务`,
        body: "会把「已停止」的任务改回待抢，并清空它们的重试次数与失败原因。已抢到的任务不受影响，也不会被重新提交。",
        confirmText: "重置",
        cancelText: "取消"
      }).then((yes) => {
        if (!yes) return;
        updateTasks((s) => resetTasks(s));
        log30.info(`已重置 ${String(stale)} 条未成功的任务`);
        ctx.host.toast("已重置", "success");
        render2();
      });
    });
    clearBtn.addEventListener("click", () => {
      const n = loadTaskStore().items.length;
      if (n === 0) {
        ctx.host.toast("队列已经是空的", "info");
        return;
      }
      void ctx.host.confirm({
        title: `清空队列（${String(n)} 条）`,
        body: "会把整个抢课队列删掉。已经抢到的课不受影响（那是站点那边的选课结果），但队列里的记录、优先级与重试次数都会丢失，无法撤销。",
        danger: true,
        confirmText: "清空",
        cancelText: "取消"
      }).then((yes) => {
        if (!yes) return;
        updateTasks(() => clearTasks());
        log30.info(`已清空抢课队列（${String(n)} 条）`);
        ctx.host.toast("已清空队列", "success");
        render2();
      });
    });
    const off = subscribeTasks(render2);
    syncGate();
    render2();
    let lastGate = isEnabled(SITE_ID2, TOGGLE2.WRITE_API);
    const gateTimer = window.setInterval(() => {
      const on = isEnabled(SITE_ID2, TOGGLE2.WRITE_API);
      if (on === lastGate) return;
      lastGate = on;
      syncGate();
      render2();
    }, GATE_POLL_MS);
    return () => {
      off();
      window.clearInterval(gateTimer);
    };
  }

  // src/sites/bkxk/tabs/monitor-style.ts
  var MONITOR_TAB_CSS = `
.sztb-bkxk-mo-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
}

.sztb-bkxk-mo-item:hover {
  background: var(--sztb-bg-alt);
}

.sztb-bkxk-mo-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.sztb-bkxk-mo-main {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-bkxk-mo-name {
  font-size: 13px;
  word-break: break-word;
}

.sztb-bkxk-mo-meta {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

/* 余量徽标：有货 / 没货 / 查不到，三种颜色 */
.sztb-bkxk-mo-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--sztb-border);
  border-radius: 9px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-mo-badge[data-state="has"] {
  color: var(--sztb-ok);
  border-color: var(--sztb-ok);
  font-weight: 600;
}

.sztb-bkxk-mo-badge[data-state="none"] {
  color: var(--sztb-text-dim);
}

.sztb-bkxk-mo-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.sztb-btn.sztb-bkxk-mo-tiny {
  padding: 1px 7px;
  font-size: 11.5px;
}

/* 模式与类别的两个下拉：窄一点，跟同行标签并排 */
.sztb-select.sztb-bkxk-mo-mode {
  width: auto;
  min-width: 96px;
  font-size: 12px;
}

.sztb-bkxk-mo-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-mo-row > span {
  flex: 0 0 auto;
  min-width: 62px;
}

/* 警示条：红色左边线（写开关未开 / 登录态失效） */
.sztb-bkxk-mo-warn {
  border-left-color: var(--sztb-danger);
  color: var(--sztb-danger);
}

.sztb-bkxk-mo-hit {
  color: var(--sztb-ok);
  font-weight: 600;
}

.sztb-bkxk-mo-now {
  margin: 0 0 6px;
  padding: 6px 8px;
  border-left: 2px solid var(--sztb-accent);
  border-radius: 0 5px 5px 0;
  background: var(--sztb-bg-alt);
  font-size: 12px;
  line-height: 1.6;
}

.sztb-bkxk-mo-now[hidden] {
  display: none;
}
`;

  // src/sites/bkxk/tabs/monitor.ts
  var log31 = scoped("bkxk/monitor-tab");
  var BKXK_MONITOR_TAB_ID = "bkxk:monitor";
  var TICK_MS = 1e3;
  var GRAB_REASON = {
    "write-disabled": "写接口总开关未开启，现在不会抢",
    "no-session": "读不到学号或批次码，请刷新选课页后重试",
    "no-category": "这条监控项没有类别代码，无法抢 —— 请到列表页重新点一次「监控该教学班」",
    unauthenticated: "登录态失效，请刷新页面重新登录"
  };
  var BKXK_MONITOR_TAB = {
    id: BKXK_MONITOR_TAB_ID,
    title: "监控",
    order: 120,
    css: MONITOR_TAB_CSS,
    mount(root, ctx) {
      return mountMonitorTab(root, ctx);
    }
  };
  function mountMonitorTab(root, ctx) {
    const note = el("div", {
      class: "sztb-note",
      text: "这里盯余量。列表页点【监控该教学班】加入监控项，回本页点【开始监控】才会开始查询。轮询跑在本页里，关掉页面就等于停止监控。"
    });
    const gateWarn = el("div", { class: "sztb-note sztb-bkxk-mo-warn" });
    gateWarn.hidden = true;
    const modeRow = el("div", { class: "sztb-bkxk-mo-row" });
    modeRow.appendChild(el("span", { text: "查询模式" }));
    const modeSelect = el("select", { class: "sztb-select sztb-bkxk-mo-mode" });
    for (const value of [MONITOR_MODE.CATEGORY, MONITOR_MODE.SINGLE]) {
      const opt = el("option", { text: MONITOR_MODE_NAME[value] ?? value });
      opt.value = value;
      modeSelect.appendChild(opt);
    }
    modeRow.appendChild(modeSelect);
    modeSelect.addEventListener("change", () => {
      setValue(SITE_ID2, VALUE2.MONITOR_MODE, modeSelect.value);
      log31.info(`监控模式改为 ${modeSelect.value}`);
      render2();
    });
    const modeHint = el("span", { class: "sztb-bkxk-mo-meta" });
    modeRow.appendChild(modeHint);
    const summary = el("div", { class: "sztb-group-title" });
    const runningBox = el("div", { class: "sztb-bkxk-mo-now" });
    runningBox.hidden = true;
    const startBtn = el("button", {
      class: "sztb-btn",
      text: "开始监控",
      attrs: { type: "button", "data-variant": "primary" }
    });
    const stopBtn = el("button", { class: "sztb-btn", text: "停止", attrs: { type: "button" } });
    const onceBtn = el("button", { class: "sztb-btn", text: "立即检查", attrs: { type: "button" } });
    const resetBtn = el("button", { class: "sztb-btn", text: "重置统计", attrs: { type: "button" } });
    const clearBtn = el("button", {
      class: "sztb-btn",
      text: "清空列表",
      attrs: { type: "button", "data-variant": "danger" }
    });
    const toolbar = el("div", { class: "sztb-toolbar" }, startBtn, stopBtn, onceBtn, resetBtn, clearBtn);
    const listTitle = el("div", { class: "sztb-group-title" });
    const listBox = el("div");
    root.appendChild(note);
    root.appendChild(gateWarn);
    root.appendChild(modeRow);
    root.appendChild(summary);
    root.appendChild(runningBox);
    root.appendChild(toolbar);
    root.appendChild(listTitle);
    root.appendChild(listBox);
    const agoNodes = /* @__PURE__ */ new Map();
    function render2() {
      agoNodes.clear();
      const mode = normalizeMonitorMode(getValue(SITE_ID2, VALUE2.MONITOR_MODE));
      modeSelect.value = mode;
      const categoryMode = mode === MONITOR_MODE.CATEGORY;
      modeHint.textContent = categoryMode ? "自动按监控列表里出现过的类别逐类拉列表（请求少）。" : "每条监控各查一次容量（精确，但请求数是监控条数）。";
      const store = loadMonitorStore();
      const stats = pollStats();
      const now = Date.now();
      summary.textContent = summaryText(store, now);
      listTitle.textContent = `监控项（${String(store.items.length)} 条）`;
      const running4 = isPolling();
      startBtn.disabled = running4;
      stopBtn.disabled = !running4;
      runningBox.hidden = !running4;
      if (running4) {
        runningBox.textContent = `监控进行中（${mode === MONITOR_MODE.CATEGORY ? "按类别" : "逐个教学班"}）：已跑 ${String(stats.pollCount)} 轮，上次检查 ${checkedAgoText(stats.lastPollAt, now)}。命中余量时会提醒你；写接口总开关开着的话会直接帮你抢。`;
      }
      listBox.textContent = "";
      if (store.items.length === 0) {
        listBox.appendChild(
          el("div", {
            class: "sztb-empty",
            text: "没有监控项。到选课页的课程卡片上点【监控该教学班】就会出现在这里。"
          })
        );
        return;
      }
      for (const item of store.items) listBox.appendChild(buildItem(item, now));
    }
    function tick() {
      const now = Date.now();
      for (const [tcId, node] of agoNodes) {
        const item = loadMonitorStore().items.find((m) => m.teachingClassID === tcId);
        node.textContent = agoText(item, now);
      }
      summary.textContent = summaryText(loadMonitorStore(), now);
    }
    function agoText(item, now) {
      if (item === void 0) return "";
      return `上次检查 ${checkedAgoText(item.checkedAt, now)}`;
    }
    function syncGate() {
      const on = isEnabled(SITE_ID2, TOGGLE2.WRITE_API);
      gateWarn.hidden = on;
      if (!on) {
        gateWarn.textContent = "写接口总开关未开启：监控命中也只会提醒，不会自动抢。要自动抢，请到【设置】页打开「写接口总开关（抢课）」。";
      }
      return on;
    }
    function metaText(item) {
      const cat = CATEGORY_NAME[item.category];
      const parts = [item.teacherName === "" ? "教师未知" : item.teacherName];
      parts.push(cat ?? (item.category === "" ? "类别未知" : item.category));
      parts.push(`累计命中 ${String(item.hits)} 次`);
      return parts.join(" ｜ ");
    }
    function buildItem(item, now) {
      const row3 = el("div", { class: "sztb-bkxk-mo-item" });
      const top = el("div", { class: "sztb-bkxk-mo-top" });
      const main2 = el("div", { class: "sztb-bkxk-mo-main" });
      main2.appendChild(el("span", { class: "sztb-bkxk-mo-name", text: item.courseName || "（课名未知）" }));
      main2.appendChild(el("span", { class: "sztb-bkxk-mo-meta", text: metaText(item) }));
      const ago = el("span", { class: "sztb-bkxk-mo-meta", text: agoText(item, now) });
      agoNodes.set(item.teachingClassID, ago);
      main2.appendChild(ago);
      if (item.lastMsg !== "") {
        main2.appendChild(el("span", { class: "sztb-bkxk-mo-meta sztb-bkxk-mo-warn", text: `上次抢课：${item.lastMsg}` }));
      }
      top.appendChild(main2);
      const has2 = item.remain !== null && item.remain > 0;
      top.appendChild(
        el("span", {
          class: has2 ? "sztb-bkxk-mo-badge sztb-bkxk-mo-hit" : "sztb-bkxk-mo-badge",
          text: remainText(item.remain),
          data: { state: String(remainKey(item.remain)) }
        })
      );
      row3.appendChild(top);
      const ops = el("div", { class: "sztb-bkxk-mo-ops" });
      const grab = el("button", {
        class: "sztb-btn sztb-bkxk-mo-tiny",
        text: "抢课",
        attrs: { type: "button", title: "立刻对这条发一次抢课请求" }
      });
      grab.addEventListener("click", () => {
        grab.disabled = true;
        void grabNow(item).then((res) => {
          if (res.ok) return;
          if (res.reason === "exception") {
            ctx.host.toast(`请求异常：${res.msg ?? ""}`, "error");
            return;
          }
          ctx.host.toast(GRAB_REASON[res.reason] ?? `未成功（${res.reason}）${res.msg ?? ""}`, "warn");
        }).finally(() => {
          grab.disabled = false;
          render2();
        });
      });
      ops.appendChild(grab);
      const del = el("button", {
        class: "sztb-btn sztb-bkxk-mo-tiny",
        text: "移除",
        attrs: { type: "button" }
      });
      del.addEventListener("click", () => {
        updateMonitor((s) => removeMonitorItem(s, item.teachingClassID).store);
        log31.info(`已移出监控列表：${item.courseName || item.teachingClassID}`);
        render2();
      });
      ops.appendChild(del);
      row3.appendChild(ops);
      return row3;
    }
    startBtn.addEventListener("click", () => {
      startPolling();
      render2();
    });
    stopBtn.addEventListener("click", () => {
      if (!stopPolling()) ctx.host.toast("当前没有在监控", "info");
      render2();
    });
    onceBtn.addEventListener("click", () => {
      if (isPolling()) {
        ctx.host.toast("轮询正在跑，请先【停止】，或等这一轮结束", "warn");
        return;
      }
      onceBtn.disabled = true;
      void pollOnce().then((res) => {
        const hits = res.hits.length;
        ctx.host.toast(
          hits === 0 ? `检查了 ${String(res.checked)} 条，没有余量` : `检查了 ${String(res.checked)} 条，发现 ${String(hits)} 条有余量`,
          hits === 0 ? "info" : "success"
        );
      }).finally(() => {
        onceBtn.disabled = false;
        render2();
      });
    });
    resetBtn.addEventListener("click", () => {
      updateMonitor((s) => resetMonitorStats(s));
      log31.info("已重置监控统计（余量、检查时间、命中次数与上次抢课结果）");
      ctx.host.toast("已重置统计，下次检查会重新填", "success");
      render2();
    });
    clearBtn.addEventListener("click", () => {
      const n = loadMonitorStore().items.length;
      if (n === 0) {
        ctx.host.toast("监控列表已经是空的", "info");
        return;
      }
      void ctx.host.confirm({
        title: `清空监控列表（${String(n)} 条）`,
        body: "会移除全部监控项，并停掉轮询。已经抢到的课不受影响，但监控记录无法恢复。",
        danger: true,
        confirmText: "清空",
        cancelText: "取消"
      }).then((yes) => {
        if (!yes) return;
        stopPolling();
        updateMonitor(() => clearMonitor());
        log31.info(`已清空监控列表（${String(n)} 条）`);
        ctx.host.toast("已清空监控列表", "success");
        render2();
      });
    });
    const off = subscribeMonitor2(render2);
    syncGate();
    render2();
    let lastGate = isEnabled(SITE_ID2, TOGGLE2.WRITE_API);
    const tickTimer = window.setInterval(() => {
      const on = isEnabled(SITE_ID2, TOGGLE2.WRITE_API);
      if (on !== lastGate) {
        lastGate = on;
        syncGate();
        render2();
      }
      tick();
    }, TICK_MS);
    return () => {
      off();
      window.clearInterval(tickTimer);
    };
  }

  // src/sites/bkxk/custom-form.ts
  var DRAFT_LIMITS = {
    WEEK_MIN: 1,
    WEEK_MAX: 52,
    SECTION_MIN: 1,
    SECTION_MAX: 20,
    /** 最多几段：只是想拦住误触「再加一段」，正常课程 1~3 段 */
    MAX_SEGMENTS: 8
  };
  var DEFAULT_SEGMENT = {
    weekFrom: "1",
    weekTo: "18",
    parity: "",
    day: "1",
    sectionFrom: "1",
    sectionTo: "2",
    place: ""
  };
  function emptySegment() {
    return { ...DEFAULT_SEGMENT };
  }
  function intOf(text2) {
    const s = text2.trim();
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : null;
  }
  function draftFromSegment(seg) {
    return {
      weekFrom: String(seg.weekFrom),
      weekTo: String(seg.weekTo),
      parity: seg.parity === null ? "" : seg.parity,
      day: seg.day === null ? "" : String(seg.day),
      sectionFrom: String(seg.sectionFrom),
      sectionTo: String(seg.sectionTo),
      place: seg.place
    };
  }
  function draftsFromText(text2) {
    return parsePlace(text2).map((seg) => draftFromSegment(seg));
  }
  function validateSegment(d) {
    const { WEEK_MIN, WEEK_MAX, SECTION_MIN, SECTION_MAX } = DRAFT_LIMITS;
    const wf = intOf(d.weekFrom);
    const wt = intOf(d.weekTo);
    if (wf === null || wt === null || wf < WEEK_MIN || wt > WEEK_MAX || wf > WEEK_MAX || wt < WEEK_MIN) {
      return `周次要填 ${String(WEEK_MIN)}-${String(WEEK_MAX)} 之间的整数`;
    }
    if (wf > wt) return "周次起止颠倒：起始周不能大于结束周";
    const sf = intOf(d.sectionFrom);
    const st = intOf(d.sectionTo);
    if (sf === null || st === null || sf < SECTION_MIN || st > SECTION_MAX || sf > SECTION_MAX || st < SECTION_MIN) {
      return `节次要填 ${String(SECTION_MIN)}-${String(SECTION_MAX)} 之间的整数`;
    }
    if (sf > st) return "节次起止颠倒：起始节不能大于结束节";
    if (intOf(d.day) === null || (intOf(d.day) ?? 0) < 1 || (intOf(d.day) ?? 0) > 7) {
      return "请选择星期几";
    }
    if (d.place.trim() === "") return "请填地点（例如 致理楼L1-707）";
    return null;
  }
  function validateDraft(name, segs) {
    if (name.trim() === "") return "请填课程名";
    if (segs.length === 0) return "至少填一段上课时间";
    if (segs.length > DRAFT_LIMITS.MAX_SEGMENTS) {
      return `最多 ${String(DRAFT_LIMITS.MAX_SEGMENTS)} 段`;
    }
    for (let i = 0; i < segs.length; i += 1) {
      const seg = segs[i];
      if (seg === void 0) continue;
      const err = validateSegment(seg);
      if (err !== null) {
        const nth = segs.length > 1 ? `第 ${String(i + 1)} 段：` : "";
        return nth + err;
      }
    }
    return null;
  }
  function segmentFromDraft(d) {
    if (validateSegment(d) !== null) return null;
    const wf = intOf(d.weekFrom);
    const wt = intOf(d.weekTo);
    const sf = intOf(d.sectionFrom);
    const st = intOf(d.sectionTo);
    const day = intOf(d.day);
    if (wf === null || wt === null || sf === null || st === null || day === null) return null;
    const parity = d.parity === "" ? null : d.parity;
    const place = d.place.trim();
    return {
      weekFrom: wf,
      weekTo: wt,
      parity,
      day,
      sectionFrom: sf,
      sectionTo: st,
      place,
      // 与手写文本走同一条生成路径，`raw` 就是生成出来的那一串
      raw: segToPlaceText({
        weekFrom: wf,
        weekTo: wt,
        parity,
        day,
        sectionFrom: sf,
        sectionTo: st,
        place
      })
    };
  }
  function placeFromDraft(segs) {
    const parsed2 = [];
    for (const d of segs) {
      const seg = segmentFromDraft(d);
      if (seg === null) return null;
      parsed2.push(seg);
    }
    return parsed2.map((s) => s.raw).join(",");
  }

  // src/sites/bkxk/tabs/custom-style.ts
  var CUSTOM_TAB_CSS = `
.sztb-bkxk-seg {
  border: 1px solid var(--sztb-border);
  border-radius: 6px;
  padding: 6px 8px 8px;
  margin-bottom: 6px;
}

.sztb-bkxk-seghead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 8px;
  align-items: center;
}

.sztb-bkxk-grid > .sztb-bkxk-key {
  font-size: 12px;
  color: var(--sztb-text-dim);
  white-space: nowrap;
}

.sztb-bkxk-line {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

/* 数字框很窄，得压掉公共 .sztb-input 的 width:100%（两个类名提高特异性） */
.sztb-input.sztb-bkxk-num {
  width: 48px;
  text-align: center;
}

.sztb-select.sztb-bkxk-parity {
  width: auto;
}

.sztb-bkxk-amp {
  font-size: 12px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
}

.sztb-bkxk-item:hover {
  background: var(--sztb-bg-alt);
}

.sztb-bkxk-color {
  flex: 0 0 auto;
  width: 4px;
  height: 30px;
  border-radius: 2px;
  border: 1px solid var(--sztb-border);
}

.sztb-bkxk-itemmain {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-bkxk-name {
  display: block;
  font-size: 13px;
}

.sztb-bkxk-meta {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

.sztb-bkxk-item[data-off="true"] .sztb-bkxk-name {
  color: var(--sztb-text-dim);
  text-decoration: line-through;
}

.sztb-bkxk-ops {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
}

/* 公共样式里勾选框只被 .sztb-row input[type=checkbox] 管，这里的行不是 .sztb-row */
.sztb-bkxk-item input[type="checkbox"] {
  flex: 0 0 auto;
  margin: 0;
  width: 15px;
  height: 15px;
  accent-color: var(--sztb-accent);
  cursor: pointer;
}

/* 「自定义课程之间有几处冲突」的警示条：红色左边线 */
.sztb-bkxk-warn {
  border-left-color: var(--sztb-danger);
  color: var(--sztb-danger);
}

.sztb-bkxk-bad {
  color: var(--sztb-danger);
}
`;

  // src/sites/bkxk/tabs/custom.ts
  var log32 = scoped("bkxk/custom-tab");
  var BKXK_CUSTOM_TAB_ID = "bkxk:custom";
  var PARITY_OPTIONS = [
    ["", "每周"],
    ["单", "单周"],
    ["双", "双周"]
  ];
  var BKXK_CUSTOM_TAB = {
    id: BKXK_CUSTOM_TAB_ID,
    title: "自定义",
    order: 150,
    css: CUSTOM_TAB_CSS,
    mount(root, ctx) {
      mountCustomTab(root, ctx);
    }
  };
  function mountCustomTab(root, ctx) {
    let courses = readCustomCourses();
    let editingId = null;
    let segs = [emptySegment()];
    const offNote = el("div", {
      class: "sztb-note",
      text: "「自定义课程」已在【设置】里关闭：这些课不会参与列表页的冲突追加，也不会注入课表。要使用请到【设置】页打开它，再切回本页。"
    });
    offNote.hidden = true;
    const body = el("div");
    const formTitle = el("div", { class: "sztb-group-title", text: "添加自定义课程" });
    const nameInput = el("input", {
      class: "sztb-input",
      attrs: { type: "text", placeholder: "例：线性代数（重修）", maxlength: 40 }
    });
    const teacherInput = el("input", {
      class: "sztb-input",
      attrs: { type: "text", placeholder: "可空，例：张三", maxlength: 30 }
    });
    const segBox = el("div");
    const addSegBtn = el("button", {
      class: "sztb-btn",
      attrs: { type: "button" },
      text: "再加一段"
    });
    const submitBtn = el("button", {
      class: "sztb-btn",
      attrs: { type: "button", "data-variant": "primary" },
      text: "添加"
    });
    const cancelBtn = el("button", {
      class: "sztb-btn",
      attrs: { type: "button" },
      text: "取消编辑"
    });
    cancelBtn.hidden = true;
    const hint = el("div", { class: "sztb-field-hint" });
    hint.hidden = true;
    const warnBox = el("div", { class: "sztb-note sztb-bkxk-warn" });
    warnBox.hidden = true;
    const listTitle = el("div", { class: "sztb-group-title", text: "已添加" });
    const listBox = el("div");
    const clearBtn = el("button", {
      class: "sztb-btn",
      attrs: { type: "button", "data-variant": "danger" },
      text: "清空全部"
    });
    const formToolbar = el("div", { class: "sztb-toolbar" }, addSegBtn, submitBtn, cancelBtn);
    const listToolbar = el("div", { class: "sztb-toolbar" }, clearBtn);
    const segField = el("div", { class: "sztb-field" });
    segField.appendChild(el("label", { class: "sztb-field-label", text: "上课时间" }));
    segField.appendChild(segBox);
    const noteTop = el("div", {
      class: "sztb-note",
      text: "课程名与地点必填，教师可空。时间用下面的下拉与数字框填 —— 不用也不能手写时间文本（写错了自己也不知道）。这里加的课会参与 ① 列表页的冲突提示 ② 课表页（站点自己画的课表里会带上「自定义」标签）。"
    });
    body.appendChild(noteTop);
    body.appendChild(formTitle);
    body.appendChild(field("课程名", nameInput));
    body.appendChild(field("教师", teacherInput));
    body.appendChild(segField);
    body.appendChild(formToolbar);
    body.appendChild(hint);
    body.appendChild(warnBox);
    body.appendChild(listTitle);
    body.appendChild(listBox);
    body.appendChild(listToolbar);
    root.appendChild(offNote);
    root.appendChild(body);
    function applyGate() {
      const on = isEnabled(SITE_ID2, TOGGLE2.CUSTOM_COURSES);
      offNote.hidden = on;
      body.hidden = !on;
      return on;
    }
    function guard() {
      if (applyGate()) return true;
      ctx.host.toast("「自定义课程」已在【设置】里关闭", "warn");
      return false;
    }
    function field(label, control) {
      const box2 = el("div", { class: "sztb-field" });
      box2.appendChild(el("label", { class: "sztb-field-label", text: label }));
      box2.appendChild(control);
      return box2;
    }
    function showHint(text2) {
      hint.textContent = text2;
      hint.hidden = false;
    }
    function hideHint() {
      hint.textContent = "";
      hint.hidden = true;
    }
    function patchSeg(index, patch) {
      const cur2 = segs[index];
      if (cur2 === void 0) return;
      segs[index] = { ...cur2, ...patch };
    }
    function numInput(value, onChange) {
      const input = el("input", {
        class: "sztb-input sztb-bkxk-num",
        attrs: { type: "text", inputmode: "numeric", maxlength: 2 }
      });
      input.value = value;
      input.addEventListener("input", () => {
        onChange(input.value);
      });
      return input;
    }
    function optionEl(value, label) {
      const opt = el("option", { text: label });
      opt.value = value;
      return opt;
    }
    function paritySelect(value, onChange) {
      const sel = el("select", { class: "sztb-select sztb-bkxk-parity" });
      for (const [v, label] of PARITY_OPTIONS) sel.appendChild(optionEl(v, label));
      sel.value = value;
      sel.addEventListener("change", () => {
        onChange(sel.value);
      });
      return sel;
    }
    function daySelect(value, onChange) {
      const sel = el("select", { class: "sztb-select sztb-bkxk-parity" });
      sel.appendChild(optionEl("", "—"));
      for (let d = 1; d <= 7; d += 1) sel.appendChild(optionEl(String(d), CN_WEEKDAY[d] ?? ""));
      sel.value = value;
      sel.addEventListener("change", () => {
        onChange(sel.value);
      });
      return sel;
    }
    function placeInput(value, onChange) {
      const input = el("input", {
        class: "sztb-input",
        attrs: { type: "text", placeholder: "例：致理楼L1-707", maxlength: 60 }
      });
      input.value = value;
      input.addEventListener("input", () => {
        onChange(input.value);
      });
      return input;
    }
    function line(...nodes) {
      const box2 = el("div", { class: "sztb-bkxk-line" });
      for (const n of nodes) box2.appendChild(typeof n === "string" ? el("span", { class: "sztb-bkxk-amp", text: n }) : n);
      return box2;
    }
    function gridRow(key, control) {
      return [el("span", { class: "sztb-bkxk-key", text: key }), control];
    }
    function buildSegRow(index, draft) {
      const block = el("div", { class: "sztb-bkxk-seg" });
      const head = el("div", { class: "sztb-bkxk-seghead" });
      head.appendChild(el("span", { text: `第 ${String(index + 1)} 段` }));
      if (segs.length > 1) {
        const del = el("button", {
          class: "sztb-btn",
          attrs: { type: "button" },
          text: "删除这段"
        });
        del.addEventListener("click", () => {
          segs.splice(index, 1);
          renderSegs();
        });
        head.appendChild(del);
      }
      block.appendChild(head);
      const grid = el("div", { class: "sztb-bkxk-grid" });
      for (const node of gridRow(
        "周次",
        line(
          numInput(draft.weekFrom, (v) => {
            patchSeg(index, { weekFrom: v });
          }),
          "到",
          numInput(draft.weekTo, (v) => {
            patchSeg(index, { weekTo: v });
          }),
          paritySelect(draft.parity, (v) => {
            patchSeg(index, { parity: v });
          })
        )
      )) {
        grid.appendChild(node);
      }
      for (const node of gridRow(
        "星期",
        line(
          daySelect(draft.day, (v) => {
            patchSeg(index, { day: v });
          })
        )
      )) {
        grid.appendChild(node);
      }
      for (const node of gridRow(
        "节次",
        line(
          numInput(draft.sectionFrom, (v) => {
            patchSeg(index, { sectionFrom: v });
          }),
          "到",
          numInput(draft.sectionTo, (v) => {
            patchSeg(index, { sectionTo: v });
          }),
          "节"
        )
      )) {
        grid.appendChild(node);
      }
      for (const node of gridRow(
        "地点",
        line(
          placeInput(draft.place, (v) => {
            patchSeg(index, { place: v });
          })
        )
      )) {
        grid.appendChild(node);
      }
      block.appendChild(grid);
      return block;
    }
    function renderSegs() {
      segBox.textContent = "";
      for (let i = 0; i < segs.length; i += 1) {
        const d = segs[i];
        if (d === void 0) continue;
        segBox.appendChild(buildSegRow(i, d));
      }
    }
    function scrollToForm() {
      formTitle.scrollIntoView({ block: "start" });
    }
    function resetForm() {
      editingId = null;
      nameInput.value = "";
      teacherInput.value = "";
      segs = [emptySegment()];
      renderSegs();
      hideHint();
      formTitle.textContent = "添加自定义课程";
      submitBtn.textContent = "添加";
      cancelBtn.hidden = true;
    }
    function submit() {
      if (!guard()) return;
      const name = nameInput.value.trim();
      const err = validateDraft(name, segs);
      if (err !== null) {
        showHint(err);
        ctx.host.toast(err, "warn");
        return;
      }
      const place = placeFromDraft(segs);
      if (place === null) {
        const msg = "时间填得不完整，请检查周次 / 节次 / 星期 / 地点";
        showHint(msg);
        ctx.host.toast(msg, "warn");
        return;
      }
      const parsed2 = parsePlace(place);
      if (parsed2.length !== segs.length) {
        log32.warn(
          `生成的时间文本与解析结果对不上：${place}（解析出 ${String(parsed2.length)} 段，表单有 ${String(segs.length)} 段）`
        );
        const msg = "时间文本生成异常，已取消本次提交（请把这条日志报给开发者）";
        showHint(msg);
        ctx.host.toast(msg, "error");
        return;
      }
      const draft = { name, teacher: teacherInput.value.trim(), place };
      const editing = editingId;
      const next = editing === null ? appendCourse(courses, draft, makeCourseId(Date.now(), Math.random())) : updateCourse(courses, editing, draft);
      mutate(next);
      resetForm();
      log32.info(`${editing === null ? "添加" : "修改"}自定义课程「${name}」（${place}）`);
      ctx.host.toast(editing === null ? "已添加" : "已保存修改", "success");
    }
    function beginEdit(course) {
      if (!guard()) return;
      const drafts = draftsFromText(course.place);
      editingId = course.id;
      nameInput.value = course.name;
      teacherInput.value = course.teacher;
      if (drafts.length === 0) {
        segs = [emptySegment()];
        const msg = "这门课原本的时间文本解析不出，已按默认值回填，请重新填写";
        showHint(msg);
        ctx.host.toast(msg, "warn");
        log32.warn(`自定义课程「${course.name}」的 place 解析不出：${course.place}`);
      } else {
        segs = drafts.map((d) => ({ ...d }));
        hideHint();
      }
      renderSegs();
      formTitle.textContent = `修改：${course.name}`;
      submitBtn.textContent = "保存修改";
      cancelBtn.hidden = false;
      scrollToForm();
    }
    function buildItem(course) {
      const item = el("div", { class: "sztb-bkxk-item", data: course.enabled ? {} : { off: "true" } });
      const color = el("span", { class: "sztb-bkxk-color" });
      color.style.background = course.color;
      item.appendChild(color);
      const toggle = el("input", { attrs: { type: "checkbox", title: "参与冲突计算与课表注入" } });
      toggle.checked = course.enabled;
      toggle.addEventListener("change", () => {
        if (!guard()) {
          toggle.checked = course.enabled;
          return;
        }
        mutate(setCourseEnabled(courses, course.id, toggle.checked));
        log32.info(`${toggle.checked ? "启用" : "停用"}自定义课程「${course.name}」`);
      });
      item.appendChild(toggle);
      const main2 = el("div", { class: "sztb-bkxk-itemmain" });
      main2.appendChild(el("span", { class: "sztb-bkxk-name", text: course.name }));
      main2.appendChild(
        el("span", {
          class: "sztb-bkxk-meta",
          text: course.teacher === "" ? course.place : `${course.teacher} ｜ ${course.place}`
        })
      );
      const parsedCount = parsePlace(course.place).length;
      main2.appendChild(
        el("span", {
          class: parsedCount === 0 ? "sztb-bkxk-meta sztb-bkxk-bad" : "sztb-bkxk-meta",
          text: parsedCount === 0 ? "时间未解析：这门课不会参与冲突计算，也不会注入课表（建议【修改】重填）" : `解析出 ${String(parsedCount)} 段`
        })
      );
      item.appendChild(main2);
      const ops = el("div", { class: "sztb-bkxk-ops" });
      const editBtn = el("button", { class: "sztb-btn", attrs: { type: "button" }, text: "修改" });
      editBtn.addEventListener("click", () => {
        beginEdit(course);
      });
      const delBtn = el("button", {
        class: "sztb-btn",
        attrs: { type: "button", "data-variant": "danger" },
        text: "删除"
      });
      delBtn.addEventListener("click", () => {
        if (!guard()) return;
        const wasEditing = editingId === course.id;
        mutate(removeCourse(courses, course.id));
        if (wasEditing) resetForm();
        log32.info(`删除自定义课程「${course.name}」`);
        ctx.host.toast("已删除", "success");
      });
      ops.appendChild(editBtn);
      ops.appendChild(delBtn);
      item.appendChild(ops);
      return item;
    }
    function renderList() {
      listBox.textContent = "";
      listTitle.textContent = `已添加（${String(courses.length)} 门）`;
      if (courses.length === 0) {
        listBox.appendChild(
          el("div", { class: "sztb-empty", text: "还没有自定义课程。上面填一门，点【添加】。" })
        );
        listToolbar.hidden = true;
        return;
      }
      listToolbar.hidden = false;
      for (const c of courses) listBox.appendChild(buildItem(c));
    }
    function renderConflicts() {
      const n = countSelfConflicts(courses);
      if (n <= 0) {
        warnBox.hidden = true;
        warnBox.textContent = "";
        return;
      }
      warnBox.hidden = false;
      warnBox.textContent = `自定义课程之间有 ${String(n)} 处时间冲突（不影响使用，只是提醒）`;
    }
    function mutate(next) {
      courses = next;
      writeCustomCourses(next);
      renderList();
      renderConflicts();
      if (refreshTimetable() > 0) log32.info("已请站点重画课表（这次带的课程就是你刚改的）");
    }
    addSegBtn.addEventListener("click", () => {
      if (!guard()) return;
      if (segs.length >= DRAFT_LIMITS.MAX_SEGMENTS) {
        const msg = `最多 ${String(DRAFT_LIMITS.MAX_SEGMENTS)} 段`;
        showHint(msg);
        ctx.host.toast(msg, "warn");
        return;
      }
      segs.push(emptySegment());
      renderSegs();
    });
    submitBtn.addEventListener("click", () => {
      submit();
    });
    cancelBtn.addEventListener("click", () => {
      resetForm();
      scrollToForm();
    });
    clearBtn.addEventListener("click", () => {
      if (!guard()) return;
      const n = courses.length;
      void ctx.host.confirm({
        title: "清空自定义课程",
        body: `确定要删除全部 ${String(n)} 门自定义课程吗？删除后无法恢复。`,
        danger: true,
        confirmText: "全部删除"
      }).then((ok) => {
        if (!ok) return;
        mutate([]);
        resetForm();
        log32.info(`清空自定义课程：删除 ${String(n)} 门`);
        ctx.host.toast("已清空", "success");
      });
    });
    renderSegs();
    renderList();
    renderConflicts();
    applyGate();
  }

  // src/sites/bkxk/tabs/settings.ts
  var BKXK_SETTINGS_TAB_ID = settingsTabId("bkxk");
  var BKXK_SETTINGS_TAB = {
    id: BKXK_SETTINGS_TAB_ID,
    title: "设置",
    order: 200,
    mount(root, ctx) {
      root.appendChild(
        el("div", {
          class: "sztb-note",
          text: "🟢 随时可开关；🟠 / 🔴 需要你显式勾选才生效，开启前请先读一遍说明。本页参数改动即刻生效，不用刷新页面。"
        })
      );
      root.appendChild(renderSiteSettings("bkxk", null, ctx));
    }
  };

  // src/sites/bkxk/index.ts
  var log33 = scoped("site/bkxk");
  var HOSTS2 = ["bkxk.szu.edu.cn"];
  var PAGES2 = ["*default/grablessons.do*", "*default/curriculum.do*"];
  var bkxkAdapter = {
    id: SITE_ID2,
    name: "本科选课",
    hosts: HOSTS2,
    pages: PAGES2,
    // 标签页按 order 排（只在站点组内生效）：任务 100 / 监控 120 / 自定义 150 /【设置】200。
    // 【日志】是公共标签页，不用站点注册。
    tabs: [BKXK_TASKS_TAB, BKXK_MONITOR_TAB, BKXK_CUSTOM_TAB, BKXK_SETTINGS_TAB],
    toggles: BKXK_TOGGLES,
    /**
     * 启动期：只做「读 storage / 写 storage」与「装响应接管」，不碰 DOM。
     *
     * 响应接管必须**最先**装：站点的 jQuery 请求随时可能发出去，晚一步就漏掉第一条
     * （`readystatechange` 监听在 XHR 构造时注册，装了之后的请求才归我们管）。
     *
     * 迁移必须在这里跑完 —— 后面的 courses / list / hijack 模块初始化时就要读迁移结果。
     */
    earlyInit(ctx) {
      installHijack();
      const lines = runMigration();
      registerBkxkSettings();
      const carried = runCustomCarry();
      if (lines.length > 0) {
        log33.info(`已从旧版迁移 ${lines.length} 条内容，详情见日志页`);
      }
      if (carried.length > 0) {
        log33.info(`自定义课程已搬到通用键（${carried.length} 条说明见日志页）`);
      }
      if (lines.length === 0 && carried.length === 0) {
        log33.debug(`无旧数据需要迁移（earlyInit @ ${ctx.url.pathname}）`);
      }
    },
    /** 挂载期：DOM 已就绪，可以安全地把配置推给运行时并报登录态。 */
    init(ctx) {
      applyBkxkSettings();
      bindTaskPanel(ctx.panel);
      bindMonitorPanel(ctx.panel);
      const session = readSession();
      if (!session.loggedIn) {
        log33.warn("未读到有效登录态：学号或 token 缺失，功能接口会失败。请先在站内完成登录。");
      } else {
        log33.info(`站点已就绪：${sessionSummary(session)}`);
      }
      log33.info(`功能页=${String(ctx.isFeaturePage)}（任务 / 监控 / 自定义 / 设置四个站点标签页已就绪）`);
      startListInjection(ctx.panel);
      startTimetableInjection();
    }
  };

  // src/sites/index.ts
  function registerSites() {
    registerAdapter(demoAdapter);
    registerAdapter(uoocAdapter);
    registerAdapter(bkxkAdapter);
    for (const adapter of allAdapters()) {
      if (adapter.toggles !== void 0 && adapter.toggles.length > 0) {
        registerToggles(adapter.id, adapter.name, adapter.toggles);
      }
    }
  }

  // src/main.ts
  var log34 = scoped("main");
  var VERSION = true ? "0.1.0" : "0.0.0-dev";
  var BUILD_TIME = true ? "2026-10-09T14:06:55.250Z" : null;
  var BUILD_NO = true ? 97 : null;
  var VERSION_LABEL = BUILD_NO === null ? `v${VERSION}` : `v${VERSION}#${BUILD_NO}`;
  function wireSites() {
    registerSites();
    setSiteNameResolver((siteId) => allAdapters().find((a) => a.id === siteId)?.name ?? siteId);
    setCurrentSiteResolver(() => booted?.adapterId ?? null);
    setOwnSettingsTabResolver(hasOwnSettingsTab);
  }
  var booted = null;
  var COMMON_TABS = [
    { siteId: COMMON_SITE_ID, tab: settingsTab },
    { siteId: COMMON_SITE_ID, tab: logTab },
    { siteId: COMMON_SITE_ID, tab: loginTab },
    { siteId: COMMON_SITE_ID, tab: statusTab }
  ];
  function buildEntries(siteTabs) {
    return [...COMMON_TABS, ...siteTabs];
  }
  function boot(url, res) {
    if (booted !== null) {
      booted.panel.destroy();
      booted = null;
    }
    const siteTabs = res.adapter !== null ? res.adapter.tabs.map((tab) => ({ siteId: res.adapter.id, tab })) : [];
    const panel3 = createPanel(style_default, buildEntries(siteTabs), {
      siteName: res.adapter?.name ?? null
    });
    setStatusProvider(() => ({
      href: location.href,
      host: location.host,
      resolution: res.reason,
      adapterId: res.adapter?.id ?? null,
      inject: res.inject,
      autoExpand: res.autoExpand,
      tabCount: siteTabs.length + COMMON_TABS.length,
      registeredAdapters: allAdapters().map((a) => a.id),
      buildTime: BUILD_TIME,
      version: VERSION
    }));
    booted = { panel: panel3, adapterId: res.adapter?.id ?? null };
    log34.info(
      `深大人工具箱 ${VERSION_LABEL} 已装载（host=${url.hostname}，分派=${res.reason}，站点=${res.adapter?.id ?? "无"}，功能页=${res.autoExpand ? "是" : "否"}）`
    );
    res.adapter?.init?.({
      adapter: res.adapter,
      isFeaturePage: res.autoExpand,
      panel: panel3
    });
  }
  function watchNavigation() {
    let bootedFor = location.href;
    const onNavigate = () => {
      const url = new URL(location.href);
      const res = resolve(url);
      const nextAdapter = res.adapter?.id ?? null;
      if (nextAdapter === (booted?.adapterId ?? null) && res.inject) {
        bootedFor = location.href;
        return;
      }
      if (!res.inject) {
        log34.debug(`站内跳转后不再属于支持范围，保持现有悬浮窗`);
        return;
      }
      log34.info(`站内跳转导致重新分派：${bootedFor} → ${location.href}`);
      bootedFor = location.href;
      boot(url, res);
    };
    window.addEventListener("hashchange", onNavigate);
    window.addEventListener("popstate", onNavigate);
  }
  function main() {
    if (window.top !== window.self) {
      console.info("[深大人工具箱] 当前是子框架，跳过（@noframes 兜底）");
      return;
    }
    console.info(
      `[深大人工具箱] ${VERSION_LABEL} 启动，href=${location.href}，构建于 ${BUILD_TIME ?? "未知"}`
    );
    wireSites();
    const url = new URL(location.href);
    const res = resolve(url);
    if (!res.inject) {
      console.info(
        `[深大人工具箱] 不注入：host=${url.hostname} 既不属于任何适配器（${allAdapters().map((a) => a.hosts.join("|")).join(" , ")}），也不在根域 ${SUPPORTED_ROOT_DOMAINS.join("/")} 下`
      );
      return;
    }
    if (res.adapter?.earlyInit !== void 0) {
      try {
        res.adapter.earlyInit({ adapter: res.adapter, url });
        log34.debug(`已执行启动期钩子：${res.adapter.id}`);
      } catch (err) {
        log34.error(`启动期钩子执行失败：${res.adapter.id}`, err);
      }
    }
    whenDomReady(() => {
      boot(url, res);
      watchNavigation();
    });
  }
  try {
    main();
  } catch (err) {
    console.error("[深大人工具箱] 启动失败", err);
  }
})();

