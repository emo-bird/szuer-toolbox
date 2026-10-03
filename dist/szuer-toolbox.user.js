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

/* 构建信息：2026-10-03T17:17:05.745Z（构建号 21） */

"use strict";
(() => {
  // src/common/ui/style.css
  var style_default = '/* ============================================================\n   深大人工具箱 —— 悬浮窗基础样式\n   本文件被 esbuild 以 --loader:.css=text 打成字符串，\n   运行时整段塞进 shadow root 的 <style>。\n   因为处在 Shadow DOM 内，天然不受宿主页面 CSS 影响，\n   反向也绝不会污染宿主页面。\n   ============================================================ */\n\n:host,\n.sztb-root {\n  --sztb-accent: #1e6fff;\n  --sztb-accent-hover: #175be0;\n  --sztb-bg: #ffffff;\n  --sztb-bg-alt: #f5f6f8;\n  --sztb-border: #e3e5e9;\n  --sztb-text: #1f2329;\n  --sztb-text-dim: #8a9099;\n  --sztb-danger: #e5484d;\n  --sztb-warn: #f5a623;\n  --sztb-ok: #30a46c;\n\n  all: initial;\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--sztb-text);\n  box-sizing: border-box;\n}\n\n.sztb-root *,\n.sztb-root *::before,\n.sztb-root *::after {\n  box-sizing: border-box;\n}\n\n/* ---------------------------------------------------------- 悬浮球 */\n.sztb-ball {\n  position: fixed;\n  z-index: 2147483000;\n  width: 44px;\n  height: 44px;\n  border-radius: 50%;\n  background: var(--sztb-accent);\n  color: #fff;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  font-size: 15px;\n  font-weight: 600;\n  cursor: grab;\n  user-select: none;\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);\n  transition: transform 0.15s ease, background 0.15s ease;\n}\n\n.sztb-root[data-collapsed="true"] .sztb-ball {\n  display: flex;\n}\n\n.sztb-ball:hover {\n  background: var(--sztb-accent-hover);\n  transform: scale(1.06);\n}\n\n.sztb-ball:active {\n  cursor: grabbing;\n}\n\n/* ---------------------------------------------------------- 面板 */\n.sztb-panel {\n  position: fixed;\n  z-index: 2147483001;\n  display: flex;\n  flex-direction: column;\n  background: var(--sztb-bg);\n  border: 1px solid var(--sztb-border);\n  border-radius: 10px;\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);\n  overflow: hidden;\n  min-width: 260px;\n  min-height: 180px;\n}\n\n.sztb-root[data-collapsed="true"] .sztb-panel {\n  display: none;\n}\n\n/* ---------------------------------------------------------- 标题栏 */\n.sztb-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  background: var(--sztb-bg-alt);\n  border-bottom: 1px solid var(--sztb-border);\n  cursor: move;\n  user-select: none;\n  flex: 0 0 auto;\n}\n\n.sztb-title {\n  flex: 1 1 auto;\n  font-weight: 600;\n  font-size: 13px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.sztb-site {\n  color: var(--sztb-text-dim);\n  font-weight: 400;\n}\n\n.sztb-iconbtn {\n  flex: 0 0 auto;\n  width: 22px;\n  height: 22px;\n  padding: 0;\n  border: none;\n  border-radius: 5px;\n  background: transparent;\n  color: var(--sztb-text-dim);\n  font-size: 14px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.sztb-iconbtn:hover {\n  background: rgba(0, 0, 0, 0.07);\n  color: var(--sztb-text);\n}\n\n/* ---------------------------------------------------------- 标签栏 */\n.sztb-tabbar {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 2px;\n  padding: 6px 8px 0;\n  border-bottom: 1px solid var(--sztb-border);\n  background: var(--sztb-bg);\n  flex: 0 0 auto;\n}\n\n.sztb-tab {\n  padding: 5px 10px;\n  border: none;\n  border-bottom: 2px solid transparent;\n  background: transparent;\n  color: var(--sztb-text-dim);\n  font-size: 12.5px;\n  cursor: pointer;\n  border-radius: 6px 6px 0 0;\n  white-space: nowrap;\n}\n\n.sztb-tab:hover {\n  color: var(--sztb-text);\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-tab[aria-selected="true"] {\n  color: var(--sztb-accent);\n  border-bottom-color: var(--sztb-accent);\n  font-weight: 600;\n}\n\n/**\n * 站点组与公共组之间的分组竖线。\n *\n * - `align-self: center` 而不是 `stretch`：标签按钮自带上下内边距，\n *   竖线只有它们高度的一部分才像「分组线」而不是「分割框」。\n * - 用固定 px 高度（约标签按钮高度的 60%）而不是百分比：\n *   `flex-wrap` 换行后每行的行高由内容决定，百分比会跟着抖。\n * - `flex: 0 0 auto` 防止它在窄面板里被压扁。\n * - 标签栏本身有 `gap: 2px`，所以左右各留 4px 即可得到 6px 的视觉间距。\n */\n.sztb-tab-sep {\n  align-self: center;\n  flex: 0 0 auto;\n  width: 1px;\n  height: 14px;\n  margin: 0 4px;\n  background: var(--sztb-border);\n}\n\n/* ---------------------------------------------------------- 内容区 */\n.sztb-body {\n  flex: 1 1 auto;\n  overflow: auto;\n  padding: 10px;\n}\n\n.sztb-pane {\n  display: none;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.sztb-pane[data-active="true"] {\n  display: flex;\n}\n\n/* ---------------------------------------------------------- 表单控件 */\n.sztb-row {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 7px 8px;\n  border-radius: 6px;\n}\n\n.sztb-row:hover {\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-row input[type="checkbox"] {\n  flex: 0 0 auto;\n  margin: 2px 0 0;\n  width: 15px;\n  height: 15px;\n  accent-color: var(--sztb-accent);\n  cursor: pointer;\n}\n\n.sztb-row-main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.sztb-row-label {\n  display: block;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.sztb-row-desc {\n  display: block;\n  color: var(--sztb-text-dim);\n  font-size: 12px;\n  margin-top: 1px;\n  word-break: break-word;\n}\n\n.sztb-risk {\n  display: inline-block;\n  margin-left: 6px;\n  padding: 0 5px;\n  border-radius: 4px;\n  font-size: 11px;\n  font-weight: 600;\n  vertical-align: 1px;\n}\n\n.sztb-risk[data-risk="trace"] {\n  background: rgba(245, 166, 35, 0.16);\n  color: #b3730a;\n}\n\n.sztb-risk[data-risk="irreversible"] {\n  background: rgba(229, 72, 77, 0.14);\n  color: var(--sztb-danger);\n}\n\n.sztb-field {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  margin-bottom: 10px;\n  padding: 0 8px;\n}\n\n.sztb-field-label {\n  font-size: 13px;\n  color: var(--sztb-text);\n}\n\n/* 配置项提示：单独一行，紧跟在标签下面（不塞进输入框里） */\n.sztb-field-desc {\n  font-size: 12px;\n  line-height: 1.45;\n  color: var(--sztb-text-dim);\n  word-break: break-word;\n}\n\n.sztb-input,\n.sztb-select {\n  width: 100%;\n  padding: 5px 8px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 6px;\n  font-size: 13px;\n  font-family: inherit;\n  color: var(--sztb-text);\n  background: var(--sztb-bg);\n  box-sizing: border-box;\n}\n\n.sztb-input:focus,\n.sztb-select:focus {\n  outline: none;\n  border-color: var(--sztb-accent);\n}\n\n/* 空值时显示的灰色默认值 */\n.sztb-input::placeholder {\n  color: var(--sztb-text-dim);\n  opacity: 0.8;\n}\n\n.sztb-select {\n  cursor: pointer;\n}\n\n/* 校验提示：校验通过时用 hidden 收起来，不占高度 */\n.sztb-field-hint {\n  font-size: 12px;\n  line-height: 1.45;\n  color: #b3730a;\n}\n\n.sztb-field-hint[hidden] {\n  display: none;\n}\n\n.sztb-field[data-invalid="true"] .sztb-input,\n.sztb-field[data-invalid="true"] .sztb-select {\n  border-color: #d9a340;\n}\n\n.sztb-btn {\n  padding: 5px 12px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 6px;\n  background: var(--sztb-bg);\n  color: var(--sztb-text);\n  font-size: 12.5px;\n  font-family: inherit;\n  cursor: pointer;\n}\n\n.sztb-btn:hover {\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-btn[data-variant="primary"] {\n  background: var(--sztb-accent);\n  border-color: var(--sztb-accent);\n  color: #fff;\n}\n\n.sztb-btn[data-variant="primary"]:hover {\n  background: var(--sztb-accent-hover);\n}\n\n.sztb-btn[data-variant="danger"] {\n  background: var(--sztb-danger);\n  border-color: var(--sztb-danger);\n  color: #fff;\n}\n\n.sztb-group-title {\n  margin: 10px 0 2px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--sztb-text-dim);\n}\n\n.sztb-group-title:first-child {\n  margin-top: 0;\n}\n\n.sztb-empty {\n  padding: 16px 8px;\n  text-align: center;\n  color: var(--sztb-text-dim);\n  font-size: 12.5px;\n}\n\n/* 段首说明文字：站点自己的设置标签页用它交代门禁规则 */\n.sztb-note {\n  margin: 0 0 8px;\n  padding: 7px 9px;\n  border-left: 2px solid var(--sztb-border);\n  border-radius: 0 5px 5px 0;\n  background: var(--sztb-bg-alt);\n  color: var(--sztb-text-dim);\n  font-size: 12px;\n  line-height: 1.6;\n}\n\n/* ---------------------------------------------------------- 日志面板 */\n.sztb-log {\n  font-family: Consolas, "Cascadia Mono", monospace;\n  font-size: 11.5px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n  word-break: break-all;\n  margin: 0;\n  flex: 1 1 auto;\n}\n\n.sztb-log-line[data-level="warn"] {\n  color: #b3730a;\n}\n\n.sztb-log-line[data-level="error"] {\n  color: var(--sztb-danger);\n}\n\n.sztb-log-line[data-level="debug"] {\n  color: var(--sztb-text-dim);\n}\n\n.sztb-toolbar {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n  align-items: center;\n}\n\n/* ---------------------------------------------------------- Toast */\n.sztb-toasts {\n  position: fixed;\n  z-index: 2147483003;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  align-items: flex-end;\n  pointer-events: none;\n}\n\n.sztb-toast {\n  max-width: 260px;\n  padding: 7px 11px;\n  border-radius: 7px;\n  background: rgba(31, 35, 41, 0.94);\n  color: #fff;\n  font-size: 12.5px;\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);\n  animation: sztb-toast-in 0.16s ease;\n  word-break: break-word;\n}\n\n.sztb-toast[data-kind="error"] {\n  background: var(--sztb-danger);\n}\n\n.sztb-toast[data-kind="warn"] {\n  background: #b3730a;\n}\n\n.sztb-toast[data-kind="success"] {\n  background: var(--sztb-ok);\n}\n\n@keyframes sztb-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n/* ---------------------------------------------------------- 确认框 */\n.sztb-modal-mask {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483002;\n  background: rgba(0, 0, 0, 0.35);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.sztb-modal {\n  width: 300px;\n  max-width: calc(100vw - 32px);\n  background: var(--sztb-bg);\n  border-radius: 10px;\n  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);\n  overflow: hidden;\n}\n\n.sztb-modal-title {\n  padding: 12px 14px 0;\n  font-weight: 600;\n  font-size: 13.5px;\n}\n\n.sztb-modal-title[data-danger="true"] {\n  color: var(--sztb-danger);\n}\n\n.sztb-modal-body {\n  padding: 8px 14px 14px;\n  font-size: 12.5px;\n  color: var(--sztb-text-dim);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.sztb-modal-foot {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  padding: 10px 14px;\n  background: var(--sztb-bg-alt);\n  border-top: 1px solid var(--sztb-border);\n}\n\n/* ---------------------------------------------------------- 缩放手柄 */\n.sztb-resize {\n  position: absolute;\n  right: 0;\n  bottom: 0;\n  width: 14px;\n  height: 14px;\n  cursor: nwse-resize;\n  background: linear-gradient(\n    135deg,\n    transparent 0 50%,\n    var(--sztb-border) 50% 60%,\n    transparent 60% 72%,\n    var(--sztb-border) 72% 82%,\n    transparent 82%\n  );\n}\n';

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
  function readyStateAllowsMount(state) {
    return state === "interactive" || state === "complete";
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
  function activeTabKey(siteId) {
    return `ui:active-tab:${siteId}`;
  }
  function resolveActiveTab(entries2, stored) {
    const planned = planTabOrder(entries2);
    const mounted = /* @__PURE__ */ new Set();
    const scopes = [];
    for (const item of planned) {
      mounted.add(item.entry.tab.id);
      if (item.entry.siteId === COMMON_SITE_ID) continue;
      if (!scopes.includes(item.entry.siteId)) scopes.push(item.entry.siteId);
    }
    scopes.push(COMMON_SITE_ID);
    for (const scope of scopes) {
      const id = stored(activeTabKey(scope));
      if (id !== null && mounted.has(id)) return id;
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

  // src/common/ui/widgets/toast.ts
  var DEFAULT_DURATION = 2600;
  var ToastStack = class {
    host;
    root;
    timers = /* @__PURE__ */ new Set();
    /** @param shadowRoot 悬浮窗所在的 shadow root */
    constructor(shadowRoot) {
      this.root = el("div", { class: "sztb-toasts" });
      this.host = el("div", { class: "sztb-root" }, this.root);
      shadowRoot.appendChild(this.host);
      this.reposition();
    }
    show(message, kind = "info", durationMs = DEFAULT_DURATION) {
      const node = el("div", { class: "sztb-toast", data: { kind }, text: message });
      this.root.appendChild(node);
      this.reposition();
      const timer2 = window.setTimeout(() => {
        this.timers.delete(timer2);
        node.remove();
        this.reposition();
      }, durationMs);
      this.timers.add(timer2);
    }
    /** 跟随悬浮球/面板位置显示（简化：固定右上角，避让面板宽度） */
    reposition() {
      this.root.style.setProperty("top", "10px");
      this.root.style.setProperty("right", "10px");
    }
    destroy() {
      for (const t of this.timers) window.clearTimeout(t);
      this.timers.clear();
      clear2(this.root);
      this.host.remove();
    }
  };

  // src/common/ui/widgets/confirm.ts
  var ESC_KEY = "Escape";
  function showConfirm(shadowRoot, options) {
    return new Promise((resolve2) => {
      const danger = options.danger === true;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeyDown, true);
        mask.remove();
        resolve2(value);
      };
      const onKeyDown = (ev) => {
        if (ev.key !== ESC_KEY) return;
        ev.stopPropagation();
        finish(false);
      };
      const confirmBtn = el("button", {
        class: "sztb-btn",
        text: options.confirmText ?? (danger ? "我确认，执行" : "确定"),
        attrs: { type: "button", "data-variant": danger ? "danger" : "primary" },
        on: { click: () => finish(true) }
      });
      const cancelBtn = el("button", {
        class: "sztb-btn",
        text: options.cancelText ?? "取消",
        attrs: { type: "button" },
        on: { click: () => finish(false) }
      });
      const modal = el(
        "div",
        { class: "sztb-modal" },
        el("div", {
          class: "sztb-modal-title",
          text: options.title,
          data: { danger: String(danger) }
        }),
        el("div", { class: "sztb-modal-body", text: options.body }),
        el("div", { class: "sztb-modal-foot" }, cancelBtn, confirmBtn)
      );
      const mask = el(
        "div",
        {
          class: "sztb-modal-mask",
          on: {
            // 只有点在遮罩本身上才算取消（点在对话框里不算）
            click: (ev) => {
              if (ev.target === mask) finish(false);
            }
          }
        },
        modal
      );
      shadowRoot.appendChild(mask);
      document.addEventListener("keydown", onKeyDown, true);
      confirmBtn.focus();
    });
  }

  // src/common/ui/panel.ts
  var log2 = scoped("ui/panel");
  var SIZE_KEY = "ui:size";
  var COLLAPSED_KEY = "ui:collapsed";
  var DEFAULT_SIZE = { width: 344, height: 430 };
  var MIN_SIZE = { width: 260, height: 180 };
  var BALL_SIZE = 44;
  var VIEWPORT_MARGIN = 8;
  var PANEL_POS_KEY = "ui:panel-pos";
  function isPos(v) {
    return typeof v === "object" && v !== null && typeof v.left === "number" && typeof v.top === "number";
  }
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
  function ballPosFromPanel(panelPos, size) {
    const headCenterY = panelPos.top + HEAD_HEIGHT / 2;
    return {
      left: panelPos.left + size.width - COLLAPSE_BTN_INSET - BALL_SIZE / 2,
      top: headCenterY - BALL_SIZE / 2
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
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
    return {
      left: clamp(pos.left, VIEWPORT_MARGIN, maxLeft),
      top: clamp(pos.top, VIEWPORT_MARGIN, maxTop)
    };
  }
  var HEAD_HEIGHT = 37;
  var COLLAPSE_BTN_INSET = 21;
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
    const host = el("div", { class: "sztb-host" });
    host.style.setProperty("position", "fixed");
    host.style.setProperty("inset", "0");
    host.style.setProperty("width", "0");
    host.style.setProperty("height", "0");
    host.style.setProperty("z-index", "2147483000");
    const shadow = host.attachShadow({ mode: "open" });
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
      // 记住「用户上次停留的标签页」需要知道它属于哪个站点。
      // 这里只把 id 转交给 setTabs 装的闭包（它手上有 id → siteId 映射），
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
      element: host,
      collapse: () => setCollapsed(true),
      expand: () => setCollapsed(false),
      isCollapsed: () => collapsed,
      toast: (message, kind) => toasts.show(message, kind ?? "info"),
      confirm: (opts) => showConfirm(shadow, opts),
      activateTab: (tabId) => tabView.activate(tabId),
      setTabs: (next) => {
        const siteToId = /* @__PURE__ */ new Map();
        for (const entry of next) siteToId.set(entry.tab.id, entry.siteId);
        const preferred = currentTabId ?? resolveActiveTab(next, (key) => read(key, null));
        remember = (tabId) => {
          if (!tabView.has(tabId)) return;
          const scope = siteToId.get(tabId) ?? COMMON_SITE_ID;
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
        host.remove();
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
    (document.documentElement ?? document.body).appendChild(host);
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
      return def.risk === "safe" ? def.default : false;
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
    const text = raw.trim();
    if (text === "") return def.default;
    if (def.kind === "number" && !Number.isFinite(Number(text))) return def.default;
    return text;
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
  function renderSiteSettings(siteId, siteName, ctx) {
    const frag = document.createDocumentFragment();
    if (siteName !== null) {
      frag.appendChild(el("div", { class: "sztb-group-title", text: siteName }));
    }
    const toggles = togglesOf(siteId);
    const values = valuesOf(siteId);
    if (toggles.length > 0) {
      frag.appendChild(el("div", { class: "sztb-group-title", text: "功能开关" }));
      const byGroup = /* @__PURE__ */ new Map();
      for (const item of toggles) {
        const g = item.group ?? "";
        const arr = byGroup.get(g);
        if (arr === void 0) byGroup.set(g, [item]);
        else arr.push(item);
      }
      for (const [group, items2] of byGroup) {
        if (group !== "") {
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
              confirm: (opts) => ctx.host.confirm(opts),
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
      frag.appendChild(el("div", { class: "sztb-group-title", text: "参数设置" }));
      for (const def of values) frag.appendChild(renderValueField(siteId, def));
    }
    return frag;
  }
  function siteHasSettings(siteId) {
    return togglesOf(siteId).length > 0 || valuesOf(siteId).length > 0;
  }
  function emptyHint(text) {
    return el("div", { class: "sztb-empty", text });
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
    title: "设置",
    order: 10,
    mount(root, ctx) {
      renderTab(root, ctx);
    }
  };

  // src/common/ui/tabs/log.ts
  var LEVELS = ["debug", "info", "warn", "error"];
  async function copyAll() {
    const text = entries().map(formatEntry).join("\n");
    const gm = globalThis["GM_setClipboard"];
    if (typeof gm === "function") {
      gm(text);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
    }
  }
  var tabCss = `
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
    const atBottom = () => pre.scrollTop + pre.clientHeight >= pre.scrollHeight - AT_BOTTOM_SLACK;
    pre.addEventListener("scroll", () => {
      autoScroll = atBottom();
    });
    function scrollToBottom() {
      pre.scrollTop = pre.scrollHeight;
    }
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
    const text = await res.text();
    return { status: res.status, statusText: res.statusText, text, finalUrl: res.url };
  }
  async function request(req) {
    const body = toBody(req.data);
    const started = Date.now();
    const raw = await enqueue(() => viaFetch(req, body), req.priority);
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
    log3.debug(
      `${req.method ?? "GET"} ${safePath(req.url)} → ${raw.status} (${elapsedMs}ms, ${raw.text.length}B)`
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
    const timer2 = window.setInterval(repaint, 2e3);
    return () => window.clearInterval(timer2);
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
  function renderState(root, state) {
    const badge = state.loggedIn === true ? "已登录" : state.loggedIn === false ? "未登录" : "未知（尚不支持该站点）";
    root.appendChild(el("div", { class: "sztb-group-title", text: `状态：${badge}` }));
    if (state.source !== void 0) root.appendChild(row2("探测手段", state.source));
    for (const f of state.fields ?? []) {
      root.appendChild(row2(f.label, f.secret === true ? maskValue(f.value) : f.value));
    }
    if (state.error !== void 0) root.appendChild(row2("失败原因", state.error));
  }
  function renderTab4(root) {
    let seq3 = 0;
    let disposed = false;
    async function repaint() {
      const mine = ++seq3;
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
        const state = await provider2();
        if (disposed || mine !== seq3) return;
        clear2(root);
        renderState(root, state);
      } catch (err) {
        if (disposed || mine !== seq3) return;
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
  function matchHost(host, pattern) {
    return globMatch(pattern.toLowerCase(), host.toLowerCase());
  }
  function matchPage(url, pattern) {
    const target = `${url.pathname}${url.search}${url.hash}`;
    return globMatch(pattern, target);
  }
  function matchAnyHost(host, patterns) {
    return patterns.some((p) => matchHost(host, p));
  }
  function matchAnyPage(url, patterns) {
    return patterns.some((p) => matchPage(url, p));
  }
  function isUnderDomain(host, root) {
    const h = host.toLowerCase();
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
      const box = el(
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
      root.appendChild(box);
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

  // src/sites/uooc/index.ts
  var log5 = scoped("site/uooc");
  var HOSTS = ["uooc.net.cn", "*.uooc.net.cn"];
  var PAGES = [];
  var uoocAdapter = {
    id: "uooc",
    name: "UOOC 优课联盟",
    hosts: HOSTS,
    pages: PAGES,
    tabs: [],
    init(ctx) {
      log5.info(`UOOC 适配器已启用：isFeaturePage=${String(ctx.isFeaturePage)}（功能待阶段 3 接入）`);
    }
  };

  // src/sites/bkxk/api.ts
  var log6 = scoped("bkxk/api");
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
    VOLUNTEER: "elective/volunteer.do",
    DELETE_VOLUNTEER: "elective/deleteVolunteer.do"
  };
  var CATEGORIES = [
    "FANKC",
    "FAWKC",
    "TJKC",
    "XGXK",
    "CXKC",
    "TYKC",
    "FXKC",
    "MOOC"
  ];
  var CATEGORY_NAME = {
    FANKC: "方案内",
    FAWKC: "方案外",
    TJKC: "推荐",
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

  // src/sites/bkxk/settings.ts
  var log7 = scoped("bkxk/settings");
  var SITE_ID = "bkxk";
  var TOGGLE = {
    /** 🔴 写接口总开关（抢课 / 退课）。旧仓库红线 R1：默认 false，不得改 */
    WRITE_API: "write-api",
    /** 🟠 课表注入：把自定义课程写进 teachingTime.do 的返回，交给站点原生渲染 */
    HIJACK_TIMETABLE: "hijack-timetable",
    /** 🟠 列表冲突追加：在站点算好的 isConflict 上追加我们算出的冲突 */
    HIJACK_LIST_CONFLICT: "hijack-list-conflict",
    /** 🟢 自绘课表 */
    TIMETABLE_SELF_DRAW: "timetable-self-draw",
    /** 🟢 列表加列 */
    LIST_EXTRA_COLUMNS: "list-extra-columns",
    /** 🟢 自定义课程 */
    CUSTOM_COURSES: "custom-courses"
  };
  var VALUE = {
    INTERVAL_MS: "intervalMs",
    RETRY_INTERVAL_MS: "retryIntervalMs",
    POLL_INTERVAL_MS: "pollIntervalMs",
    BATCH_CODE: "batchCode",
    MONITOR_MODE: "monitorMode",
    MONITOR_CATEGORY: "monitorCategory",
    RETRY_MODE: "retryMode"
  };
  var BKXK_TOGGLES = [
    {
      id: TOGGLE.WRITE_API,
      label: "写接口总开关（抢课 / 退课）",
      desc: "开启后才会真正提交选课与退课请求。这类操作不可撤销，且会在学校系统留痕。默认关闭；打开时需要二次确认。",
      risk: "irreversible",
      default: false,
      group: "选课"
    },
    {
      id: TOGGLE.HIJACK_TIMETABLE,
      label: "课表注入",
      desc: "把自定义课程合并进 teachingTime.do 的响应，让站点自己把它画进课表。需要拦截页面请求，会改变站点看到的返回内容。",
      risk: "trace",
      default: false,
      group: "课表"
    },
    {
      id: TOGGLE.HIJACK_LIST_CONFLICT,
      label: "列表冲突追加",
      desc: "在站点自己算好的 isConflict 之上，追加上自定义课程造成的冲突。只追加、不清除站点原值。需要拦截页面请求。",
      risk: "trace",
      default: false,
      group: "选课列表"
    },
    {
      id: TOGGLE.TIMETABLE_SELF_DRAW,
      label: "自绘课表",
      desc: "用工具箱自己画一份课表（含自定义课程）。关掉「课表注入」后就只剩这一份。",
      risk: "safe",
      default: true,
      group: "课表"
    },
    {
      id: TOGGLE.LIST_EXTRA_COLUMNS,
      label: "列表加列（冲突 / 余量）",
      desc: "在选课列表里补上冲突提示与实时余量。用 flex 布局，不写死列宽。",
      risk: "safe",
      default: true,
      group: "选课列表"
    },
    {
      id: TOGGLE.CUSTOM_COURSES,
      label: "自定义课程",
      desc: "本地维护一份不属于培养方案、但你想让它出现在课表上的课程。",
      risk: "safe",
      default: true,
      group: "课表"
    }
  ];
  function registerBkxkSettings() {
    registerInterval(
      VALUE.INTERVAL_MS,
      "intervalMs",
      "请求间隔（毫秒）",
      "全局串行队列里相邻两条请求的最小间隔。"
    );
    registerInterval(
      VALUE.RETRY_INTERVAL_MS,
      "retryIntervalMs",
      "抢课重试间隔（毫秒）",
      "一轮抢课跑完等多久再开下一轮。"
    );
    registerInterval(
      VALUE.POLL_INTERVAL_MS,
      "pollIntervalMs",
      "监控轮询间隔（毫秒）",
      "监控模式下一轮查容量到下一轮的间隔。"
    );
    registerValue({
      siteId: SITE_ID,
      id: VALUE.BATCH_CODE,
      label: "选课批次码",
      desc: "留空则自动从页面会话里读取（studentInfo.electiveBatch.code）。手动填用于会话里读不到的场景。",
      default: "",
      kind: "text"
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.MONITOR_MODE,
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
      siteId: SITE_ID,
      id: VALUE.MONITOR_CATEGORY,
      label: "监控类别",
      desc: "类别监控模式下盯哪一类课。方案外 / 重修 / 体育 / 辅修的端点映射尚未实测。",
      default: "FANKC",
      kind: "select",
      options: CATEGORIES.map((code) => ({
        value: code,
        label: `${CATEGORY_NAME[code]}（${code}）`
      }))
    });
    registerValue({
      siteId: SITE_ID,
      id: VALUE.RETRY_MODE,
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
      siteId: SITE_ID,
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
    const raw = getValue(SITE_ID, VALUE.INTERVAL_MS);
    const ms = clampLimit("intervalMs", raw);
    if (isBelowRecommended("intervalMs", ms)) {
      log7.warn(`请求间隔被设为 ${ms}ms，低于建议下限 ${LIMITS.intervalMs.recommended}ms`);
    }
    setIntervalMs(ms);
  }

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

  // src/sites/bkxk/session.ts
  var log8 = scoped("bkxk/session");
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
    const token = input.token ?? "";
    return {
      studentCode,
      batchCode: info?.batchCode ?? null,
      campus: parseCampusCode(input.campus),
      token,
      loggedIn: studentCode !== "" && token !== ""
    };
  }
  function readSession() {
    const ss = pageSessionStorage();
    if (ss === null) {
      log8.warn("读不到 sessionStorage，按未登录处理");
      return EMPTY_SESSION;
    }
    try {
      return buildSession({
        studentInfo: ss.getItem("studentInfo"),
        campus: ss.getItem("currentCampus"),
        token: ss.getItem("token")
      });
    } catch (err) {
      log8.warn("读取会话失败，按未登录处理", err);
      return EMPTY_SESSION;
    }
  }
  function sessionSummary(s) {
    if (!s.loggedIn) return "未登录（学号或 token 缺失）";
    const tail = s.studentCode.length > 4 ? s.studentCode.slice(-4) : s.studentCode;
    return `已登录（学号 ****${tail}，批次 ${s.batchCode ?? "未知"}，校区 ${s.campus}）`;
  }

  // src/sites/bkxk/legacy.ts
  var log9 = scoped("bkxk/legacy");
  var LEGACY_SETTINGS_KEY = "szubkxk.settings.v2";
  var LEGACY_STORE_PREFIX = "szubkxk.v2.";
  var LEGACY_DATA_KEY = {
    CUSTOM_COURSES: "customCourses",
    MONITOR: "monitor",
    TASKS: "tasks"
  };
  var BKXK_STORE_KEY = {
    CUSTOM_COURSES: "bkxk:customCourses",
    MONITOR: "bkxk:monitor",
    TASKS: "bkxk:tasks"
  };
  var MIGRATION_FLAG_KEY = "migrate:bkxk:v2";
  var SETTING_VALUE_MAP = [
    { from: "intervalMs", to: "intervalMs", kind: "number" },
    { from: "retryIntervalMs", to: "retryIntervalMs", kind: "number" },
    { from: "pollIntervalMs", to: "pollIntervalMs", kind: "number" },
    { from: "batchCode", to: "batchCode", kind: "text" },
    { from: "monitorMode", to: "monitorMode", kind: "text" },
    { from: "monitorCategory", to: "monitorCategory", kind: "text" },
    { from: "retryMode", to: "retryMode", kind: "text" }
  ];
  var DANGER_TOGGLE_MAP = [
    { from: "writeApiEnabled", to: TOGGLE.WRITE_API, label: "写接口总开关（🔴）" },
    { from: "hijackTimetable", to: TOGGLE.HIJACK_TIMETABLE, label: "课表注入（🟠）" },
    { from: "hijackListConflict", to: TOGGLE.HIJACK_LIST_CONFLICT, label: "列表冲突追加（🟠）" }
  ];
  function parseJson(raw) {
    if (raw === null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function asRecord(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v;
  }
  function slimCustomCourse(item) {
    const o = asRecord(item);
    if (o === null) return null;
    const name = typeof o["name"] === "string" ? o["name"].trim() : "";
    if (name === "") return null;
    const id = typeof o["id"] === "string" && o["id"] !== "" ? o["id"] : "";
    if (id === "") return null;
    return {
      id,
      name,
      teacher: typeof o["teacher"] === "string" ? o["teacher"] : "",
      place: typeof o["place"] === "string" ? o["place"] : "",
      color: typeof o["color"] === "string" ? o["color"] : "",
      enabled: o["enabled"] !== false
    };
  }
  function planMigration(snapshot, alreadyMigrated) {
    const report = [];
    const notices = [];
    if (alreadyMigrated) {
      return { entries: [], report: ["旧数据已迁移过，本次跳过。"], notices: [], empty: true };
    }
    const entries2 = [];
    const settings = asRecord(parseJson(snapshot.settings));
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
        const slim = [];
        let dropped = 0;
        for (const item of ccRaw) {
          const rec = slimCustomCourse(item);
          if (rec === null) dropped += 1;
          else slim.push(rec);
        }
        entries2.push({ key: BKXK_STORE_KEY.CUSTOM_COURSES, value: slim });
        report.push(`自定义课程 ${slim.length} 门`);
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
      const parsed = parseJson(blob.raw);
      if (parsed === null) continue;
      if (asRecord(parsed) === null) {
        notices.push(`旧${blob.label}不是对象，已跳过。`);
        continue;
      }
      entries2.push({ key: blob.newKey, value: parsed });
      report.push(blob.label);
    }
    if (entries2.length === 0) {
      report.push("旧数据里没有可迁移的内容。");
    }
    return { entries: entries2, report, notices, empty: entries2.length === 0 };
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
      log9.info("未发现旧版数据，跳过迁移");
      return [];
    }
    for (const e of plan.entries) {
      write(e.key, e.value);
    }
    write(MIGRATION_FLAG_KEY, true);
    lines.push(...plan.report, ...plan.notices);
    log9.info(`旧数据迁移完成：写入 ${plan.entries.length} 项`);
    for (const line of plan.report) log9.info(`迁移 · ${line}`);
    for (const line of plan.notices) log9.warn(`迁移 · ${line}`);
    return lines;
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
  var log10 = scoped("site/bkxk");
  var HOSTS2 = ["bkxk.szu.edu.cn"];
  var PAGES2 = ["*default/grablessons.do*", "*default/curriculum.do*"];
  var bkxkAdapter = {
    id: SITE_ID,
    name: "本科选课",
    hosts: HOSTS2,
    pages: PAGES2,
    // 标签页分批补齐（用户拍板的五个：任务 / 监控 / 自定义 / 设置 / 日志）：
    //   本批只有【设置】—— 用户反馈「本科选课的设置都放在单独标签页更好」，
    //   其余三个（任务 / 监控 / 自定义）在批 4 接入，【日志】是公共标签页、不用站点注册。
    tabs: [BKXK_SETTINGS_TAB],
    toggles: BKXK_TOGGLES,
    /**
     * 启动期：只做「读 storage / 写 storage」，不碰 DOM。
     * 迁移必须在这里跑完 —— 后面的 courses / list 模块初始化时就要读迁移结果。
     */
    earlyInit(ctx) {
      const lines = runMigration();
      registerBkxkSettings();
      if (lines.length > 0) {
        log10.info(`已从旧版迁移 ${lines.length} 条内容，详情见日志页`);
      } else {
        log10.debug(`无旧数据需要迁移（earlyInit @ ${ctx.url.pathname}）`);
      }
    },
    /** 挂载期：DOM 已就绪，可以安全地把配置推给运行时并报登录态。 */
    init(ctx) {
      applyBkxkSettings();
      const session = readSession();
      if (!session.loggedIn) {
        log10.warn("未读到有效登录态：学号或 token 缺失，功能接口会失败。请先在站内完成登录。");
      } else {
        log10.info(`站点已就绪：${sessionSummary(session)}`);
      }
      log10.info(`功能页=${String(ctx.isFeaturePage)}（设置标签页已就绪，其余标签页在批 4 接入）`);
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
  var log11 = scoped("main");
  var VERSION = true ? "0.1.0" : "0.0.0-dev";
  var BUILD_TIME = true ? "2026-10-03T17:17:05.745Z" : null;
  var BUILD_NO = true ? 21 : null;
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
    const panel = createPanel(style_default, buildEntries(siteTabs), {
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
    booted = { panel, adapterId: res.adapter?.id ?? null };
    log11.info(
      `深大人工具箱 ${VERSION_LABEL} 已装载（host=${url.hostname}，分派=${res.reason}，站点=${res.adapter?.id ?? "无"}，功能页=${res.autoExpand ? "是" : "否"}）`
    );
    res.adapter?.init?.({
      adapter: res.adapter,
      isFeaturePage: res.autoExpand,
      panel
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
        log11.debug(`站内跳转后不再属于支持范围，保持现有悬浮窗`);
        return;
      }
      log11.info(`站内跳转导致重新分派：${bootedFor} → ${location.href}`);
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
        log11.debug(`已执行启动期钩子：${res.adapter.id}`);
      } catch (err) {
        log11.error(`启动期钩子执行失败：${res.adapter.id}`, err);
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

