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
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      szu.edu.cn
// @connect      uooc.net.cn
// @connect      *
// @run-at       document-idle
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

/* 构建信息：2026-10-03T12:47:27.336Z */

"use strict";
(() => {
  // src/common/ui/style.css
  var style_default = '/* ============================================================\n   深大人工具箱 —— 悬浮窗基础样式\n   本文件被 esbuild 以 --loader:.css=text 打成字符串，\n   运行时整段塞进 shadow root 的 <style>。\n   因为处在 Shadow DOM 内，天然不受宿主页面 CSS 影响，\n   反向也绝不会污染宿主页面。\n   ============================================================ */\n\n:host,\n.sztb-root {\n  --sztb-accent: #1e6fff;\n  --sztb-accent-hover: #175be0;\n  --sztb-bg: #ffffff;\n  --sztb-bg-alt: #f5f6f8;\n  --sztb-border: #e3e5e9;\n  --sztb-text: #1f2329;\n  --sztb-text-dim: #8a9099;\n  --sztb-danger: #e5484d;\n  --sztb-warn: #f5a623;\n  --sztb-ok: #30a46c;\n\n  all: initial;\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--sztb-text);\n  box-sizing: border-box;\n}\n\n.sztb-root *,\n.sztb-root *::before,\n.sztb-root *::after {\n  box-sizing: border-box;\n}\n\n/* ---------------------------------------------------------- 悬浮球 */\n.sztb-ball {\n  position: fixed;\n  z-index: 2147483000;\n  width: 44px;\n  height: 44px;\n  border-radius: 50%;\n  background: var(--sztb-accent);\n  color: #fff;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  font-size: 15px;\n  font-weight: 600;\n  cursor: grab;\n  user-select: none;\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);\n  transition: transform 0.15s ease, background 0.15s ease;\n}\n\n.sztb-root[data-collapsed="true"] .sztb-ball {\n  display: flex;\n}\n\n.sztb-ball:hover {\n  background: var(--sztb-accent-hover);\n  transform: scale(1.06);\n}\n\n.sztb-ball:active {\n  cursor: grabbing;\n}\n\n/* ---------------------------------------------------------- 面板 */\n.sztb-panel {\n  position: fixed;\n  z-index: 2147483001;\n  display: flex;\n  flex-direction: column;\n  background: var(--sztb-bg);\n  border: 1px solid var(--sztb-border);\n  border-radius: 10px;\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);\n  overflow: hidden;\n  min-width: 260px;\n  min-height: 180px;\n}\n\n.sztb-root[data-collapsed="true"] .sztb-panel {\n  display: none;\n}\n\n/* ---------------------------------------------------------- 标题栏 */\n.sztb-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  background: var(--sztb-bg-alt);\n  border-bottom: 1px solid var(--sztb-border);\n  cursor: move;\n  user-select: none;\n  flex: 0 0 auto;\n}\n\n.sztb-title {\n  flex: 1 1 auto;\n  font-weight: 600;\n  font-size: 13px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.sztb-site {\n  color: var(--sztb-text-dim);\n  font-weight: 400;\n}\n\n.sztb-iconbtn {\n  flex: 0 0 auto;\n  width: 22px;\n  height: 22px;\n  padding: 0;\n  border: none;\n  border-radius: 5px;\n  background: transparent;\n  color: var(--sztb-text-dim);\n  font-size: 14px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.sztb-iconbtn:hover {\n  background: rgba(0, 0, 0, 0.07);\n  color: var(--sztb-text);\n}\n\n/* ---------------------------------------------------------- 标签栏 */\n.sztb-tabbar {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 2px;\n  padding: 6px 8px 0;\n  border-bottom: 1px solid var(--sztb-border);\n  background: var(--sztb-bg);\n  flex: 0 0 auto;\n}\n\n.sztb-tab {\n  padding: 5px 10px;\n  border: none;\n  border-bottom: 2px solid transparent;\n  background: transparent;\n  color: var(--sztb-text-dim);\n  font-size: 12.5px;\n  cursor: pointer;\n  border-radius: 6px 6px 0 0;\n  white-space: nowrap;\n}\n\n.sztb-tab:hover {\n  color: var(--sztb-text);\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-tab[aria-selected="true"] {\n  color: var(--sztb-accent);\n  border-bottom-color: var(--sztb-accent);\n  font-weight: 600;\n}\n\n/* ---------------------------------------------------------- 内容区 */\n.sztb-body {\n  flex: 1 1 auto;\n  overflow: auto;\n  padding: 10px;\n}\n\n.sztb-pane {\n  display: none;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.sztb-pane[data-active="true"] {\n  display: flex;\n}\n\n/* ---------------------------------------------------------- 表单控件 */\n.sztb-row {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 7px 8px;\n  border-radius: 6px;\n}\n\n.sztb-row:hover {\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-row input[type="checkbox"] {\n  flex: 0 0 auto;\n  margin: 2px 0 0;\n  width: 15px;\n  height: 15px;\n  accent-color: var(--sztb-accent);\n  cursor: pointer;\n}\n\n.sztb-row-main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.sztb-row-label {\n  display: block;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.sztb-row-desc {\n  display: block;\n  color: var(--sztb-text-dim);\n  font-size: 12px;\n  margin-top: 1px;\n  word-break: break-word;\n}\n\n.sztb-risk {\n  display: inline-block;\n  margin-left: 6px;\n  padding: 0 5px;\n  border-radius: 4px;\n  font-size: 11px;\n  font-weight: 600;\n  vertical-align: 1px;\n}\n\n.sztb-risk[data-risk="trace"] {\n  background: rgba(245, 166, 35, 0.16);\n  color: #b3730a;\n}\n\n.sztb-risk[data-risk="irreversible"] {\n  background: rgba(229, 72, 77, 0.14);\n  color: var(--sztb-danger);\n}\n\n.sztb-field {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  margin-bottom: 8px;\n}\n\n.sztb-field > span {\n  font-size: 12px;\n  color: var(--sztb-text-dim);\n}\n\n.sztb-input {\n  width: 100%;\n  padding: 5px 8px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 6px;\n  font-size: 13px;\n  font-family: inherit;\n  color: var(--sztb-text);\n  background: var(--sztb-bg);\n}\n\n.sztb-input:focus {\n  outline: none;\n  border-color: var(--sztb-accent);\n}\n\n.sztb-btn {\n  padding: 5px 12px;\n  border: 1px solid var(--sztb-border);\n  border-radius: 6px;\n  background: var(--sztb-bg);\n  color: var(--sztb-text);\n  font-size: 12.5px;\n  font-family: inherit;\n  cursor: pointer;\n}\n\n.sztb-btn:hover {\n  background: var(--sztb-bg-alt);\n}\n\n.sztb-btn[data-variant="primary"] {\n  background: var(--sztb-accent);\n  border-color: var(--sztb-accent);\n  color: #fff;\n}\n\n.sztb-btn[data-variant="primary"]:hover {\n  background: var(--sztb-accent-hover);\n}\n\n.sztb-btn[data-variant="danger"] {\n  background: var(--sztb-danger);\n  border-color: var(--sztb-danger);\n  color: #fff;\n}\n\n.sztb-group-title {\n  margin: 10px 0 2px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--sztb-text-dim);\n}\n\n.sztb-group-title:first-child {\n  margin-top: 0;\n}\n\n.sztb-empty {\n  padding: 16px 8px;\n  text-align: center;\n  color: var(--sztb-text-dim);\n  font-size: 12.5px;\n}\n\n/* ---------------------------------------------------------- 日志面板 */\n.sztb-log {\n  font-family: Consolas, "Cascadia Mono", monospace;\n  font-size: 11.5px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n  word-break: break-all;\n  margin: 0;\n  flex: 1 1 auto;\n}\n\n.sztb-log-line[data-level="warn"] {\n  color: #b3730a;\n}\n\n.sztb-log-line[data-level="error"] {\n  color: var(--sztb-danger);\n}\n\n.sztb-log-line[data-level="debug"] {\n  color: var(--sztb-text-dim);\n}\n\n.sztb-toolbar {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n  align-items: center;\n}\n\n/* ---------------------------------------------------------- Toast */\n.sztb-toasts {\n  position: fixed;\n  z-index: 2147483003;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  align-items: flex-end;\n  pointer-events: none;\n}\n\n.sztb-toast {\n  max-width: 260px;\n  padding: 7px 11px;\n  border-radius: 7px;\n  background: rgba(31, 35, 41, 0.94);\n  color: #fff;\n  font-size: 12.5px;\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);\n  animation: sztb-toast-in 0.16s ease;\n  word-break: break-word;\n}\n\n.sztb-toast[data-kind="error"] {\n  background: var(--sztb-danger);\n}\n\n.sztb-toast[data-kind="warn"] {\n  background: #b3730a;\n}\n\n.sztb-toast[data-kind="success"] {\n  background: var(--sztb-ok);\n}\n\n@keyframes sztb-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n/* ---------------------------------------------------------- 确认框 */\n.sztb-modal-mask {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483002;\n  background: rgba(0, 0, 0, 0.35);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.sztb-modal {\n  width: 300px;\n  max-width: calc(100vw - 32px);\n  background: var(--sztb-bg);\n  border-radius: 10px;\n  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);\n  overflow: hidden;\n}\n\n.sztb-modal-title {\n  padding: 12px 14px 0;\n  font-weight: 600;\n  font-size: 13.5px;\n}\n\n.sztb-modal-title[data-danger="true"] {\n  color: var(--sztb-danger);\n}\n\n.sztb-modal-body {\n  padding: 8px 14px 14px;\n  font-size: 12.5px;\n  color: var(--sztb-text-dim);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.sztb-modal-foot {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  padding: 10px 14px;\n  background: var(--sztb-bg-alt);\n  border-top: 1px solid var(--sztb-border);\n}\n\n/* ---------------------------------------------------------- 缩放手柄 */\n.sztb-resize {\n  position: absolute;\n  right: 0;\n  bottom: 0;\n  width: 14px;\n  height: 14px;\n  cursor: nwse-resize;\n  background: linear-gradient(\n    135deg,\n    transparent 0 50%,\n    var(--sztb-border) 50% 60%,\n    transparent 60% 72%,\n    var(--sztb-border) 72% 82%,\n    transparent 82%\n  );\n}\n';

  // src/common/core/log.ts
  var LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };
  var CAPACITY = 500;
  var seq = 0;
  var buffer = [];
  var minLevel = "info";
  var listeners = /* @__PURE__ */ new Set();
  function push(level, scope, message, detail) {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
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
  function entries() {
    return [...buffer];
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
  function allToggles() {
    return [...toggleRegistry.values()];
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
  var valueRegistry = /* @__PURE__ */ new Map();
  function valuesOf(siteId) {
    const out = [];
    for (const item of valueRegistry.values()) {
      if (item.siteId === siteId) out.push(item);
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
     */
    setTabs(tabs, ctx) {
      this.destroyTabs();
      const sorted = [...tabs].sort((a, b) => (a.order ?? 1e3) - (b.order ?? 1e3));
      for (const tab of sorted) {
        this.mountTab(tab, ctx);
      }
      const first = sorted[0];
      if (first !== void 0) {
        const keep = this.current !== null && this.mounted.has(this.current) ? this.current : first.id;
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
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        node.remove();
        this.reposition();
      }, durationMs);
      this.timers.add(timer);
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
  var BALL_POS_KEY = "ui:ball-pos";
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
    const tabView = new TabView(shadow);
    const resizeHandle = el("div", { class: "sztb-resize", attrs: { title: "拖拽调整大小" } });
    const panelEl = el("div", { class: "sztb-panel" }, head, tabView.tabbar, tabView.body, resizeHandle);
    const root = el("div", { class: "sztb-root" }, ball, panelEl);
    shadow.appendChild(root);
    const toasts = new ToastStack(shadow);
    const storedCollapsed = read(COLLAPSED_KEY, null);
    let collapsed = storedCollapsed ?? false;
    let size = readSize();
    let panelPos = readPos(PANEL_POS_KEY) ?? defaultPanelPos();
    let ballPos = readPos(BALL_POS_KEY) ?? ballPosFromPanel(panelPos, size);
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
      if (collapsed && readPos(BALL_POS_KEY) === null) {
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
        write(BALL_POS_KEY, p);
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
        const map = /* @__PURE__ */ new Map();
        for (const entry of next) map.set(entry.tab.id, entry.siteId);
        tabView.setTabs(
          next.map((e) => e.tab),
          makeContext(map)
        );
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
          return active !== null ? siteToId.get(active) ?? "common" : "common";
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

  // src/common/ui/tabs/settings.ts
  var siteNameOf = (id) => id;
  function setSiteNameResolver(fn) {
    siteNameOf = fn;
  }
  function renderValue(siteId, def) {
    const input = el("input", {
      class: "sztb-input",
      attrs: { type: def.kind, placeholder: def.desc ?? "" }
    });
    input.value = String(getValue(siteId, def.id) ?? "");
    input.addEventListener("change", () => {
      setValue(siteId, def.id, input.value);
    });
    return el("div", { class: "sztb-field" }, el("span", { text: def.label }), input);
  }
  function renderTab(root, ctx) {
    clear2(root);
    const toggles = allToggles();
    if (toggles.length === 0) {
      root.appendChild(el("div", { class: "sztb-empty", text: "当前没有已注册的功能开关" }));
      return;
    }
    const bySite = /* @__PURE__ */ new Map();
    for (const item of toggles) {
      const list = bySite.get(item.siteId);
      if (list === void 0) bySite.set(item.siteId, [item]);
      else list.push(item);
    }
    for (const [siteId, list] of bySite) {
      root.appendChild(el("div", { class: "sztb-group-title", text: `${list[0]?.siteName ?? siteNameOf(siteId)}` }));
      const byGroup = /* @__PURE__ */ new Map();
      for (const item of list) {
        const g = item.group ?? "";
        const arr = byGroup.get(g);
        if (arr === void 0) byGroup.set(g, [item]);
        else arr.push(item);
      }
      for (const [group, items] of byGroup) {
        if (group !== "") {
          root.appendChild(el("div", { class: "sztb-group-title", text: group }));
        }
        for (const item of items) {
          root.appendChild(
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
      for (const def of valuesOf(siteId)) {
        root.appendChild(renderValue(siteId, def));
      }
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
    const emptyHint = el("div", { class: "sztb-log-empty" });
    const wrap = el(
      "div",
      { class: "sztb-log-wrap" },
      el("div", { class: "sztb-toolbar" }, levelSelect, clearBtn, copyBtn),
      pre,
      emptyHint
    );
    root.appendChild(wrap);
    let autoScroll = true;
    pre.addEventListener("scroll", () => {
      autoScroll = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
    });
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
      emptyHint.style.display = count === 0 ? "" : "none";
      if (count > 0) return;
      const buffered = entries().length;
      emptyHint.textContent = buffered === 0 ? "暂无日志。" : `当前没有等级 ≥ ${getLevel()} 的日志（缓冲里还有 ${buffered} 条被过滤掉了）。`;
    }
    function repaint() {
      clear2(pre);
      for (const entry of entries()) pre.appendChild(line(entry));
      syncEmptyHint();
      pre.scrollTop = pre.scrollHeight;
    }
    repaint();
    const off = subscribe((entry) => {
      if (pre.style.display === "none") pre.style.display = "";
      emptyHint.style.display = "none";
      pre.appendChild(line(entry));
      if (pre.childElementCount > 520) pre.firstElementChild?.remove();
      if (autoScroll) pre.scrollTop = pre.scrollHeight;
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

  // src/common/core/http.ts
  var log3 = scoped("core/http");
  var MIN_INTERVAL_MS = 200;
  var DEFAULT_INTERVAL_MS = 500;
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
  var queueTail = Promise.resolve();
  var lastStartedAt = 0;
  var pendingCount = 0;
  function getIntervalMs() {
    return intervalMs;
  }
  function queueDepth() {
    return pendingCount;
  }
  function sleep(ms) {
    return new Promise((resolve2) => setTimeout(resolve2, ms));
  }
  function enqueue(task) {
    pendingCount += 1;
    const run = queueTail.then(async () => {
      const wait = lastStartedAt + intervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStartedAt = Date.now();
      try {
        return await task();
      } finally {
        pendingCount -= 1;
      }
    });
    queueTail = run.then(
      () => void 0,
      () => void 0
    );
    return run;
  }
  function toBody(data) {
    if (data === void 0) return void 0;
    if (typeof data === "string") return data;
    if (data instanceof URLSearchParams) return data.toString();
    return JSON.stringify(data);
  }
  function hasGmRequest() {
    return typeof globalThis["GM_xmlhttpRequest"] === "function";
  }
  function viaGm(req, body) {
    return new Promise((resolve2, reject) => {
      GM_xmlhttpRequest({
        method: req.method ?? "GET",
        url: req.url,
        ...req.headers !== void 0 ? { headers: req.headers } : {},
        ...body !== void 0 ? { data: body } : {},
        ...req.timeoutMs !== void 0 ? { timeout: req.timeoutMs } : {},
        onload: (res) => {
          resolve2({
            status: res.status,
            statusText: res.statusText,
            text: res.responseText,
            finalUrl: res.finalUrl || req.url
          });
        },
        onerror: () => reject(new Error("网络错误（GM_xmlhttpRequest onerror）")),
        ontimeout: () => reject(new Error(`请求超时（>${req.timeoutMs ?? 0}ms）`)),
        onabort: () => reject(new Error("请求被中止"))
      });
    });
  }
  async function viaFetch(req, body) {
    const init = {
      method: req.method ?? "GET",
      ...req.headers !== void 0 ? { headers: req.headers } : {},
      ...body !== void 0 ? { body } : {}
    };
    const res = await fetch(req.url, init);
    const text = await res.text();
    return { status: res.status, statusText: res.statusText, text, finalUrl: res.url };
  }
  async function request(req) {
    const body = toBody(req.data);
    const started = Date.now();
    const raw = await enqueue(() => hasGmRequest() ? viaGm(req, body) : viaFetch(req, body));
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
    log3.debug(`${req.method ?? "GET"} ${safePath(req.url)} → ${raw.status} (${elapsedMs}ms, ${raw.text.length}B)`);
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
      root.appendChild(row("请求间隔", `${getIntervalMs()}ms（硬下限 ${MIN_INTERVAL_MS}ms）`));
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
    const timer = window.setInterval(repaint, 2e3);
    return () => window.clearInterval(timer);
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
    let seq2 = 0;
    let disposed = false;
    async function repaint() {
      const mine = ++seq2;
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
        if (disposed || mine !== seq2) return;
        clear2(root);
        renderState(root, state);
      } catch (err) {
        if (disposed || mine !== seq2) return;
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

  // src/main.ts
  var log5 = scoped("main");
  var VERSION = true ? "0.1.0" : "0.0.0-dev";
  var BUILD_TIME = true ? "2026-10-03T12:47:27.336Z" : null;
  function registerSites() {
    registerAdapter(demoAdapter);
    setSiteNameResolver((siteId) => allAdapters().find((a) => a.id === siteId)?.name ?? siteId);
    setCurrentSiteResolver(() => booted?.adapterId ?? null);
    for (const adapter of allAdapters()) {
      if (adapter.toggles !== void 0 && adapter.toggles.length > 0) {
        registerToggles(adapter.id, adapter.name, adapter.toggles);
      }
    }
  }
  var booted = null;
  function buildEntries(siteTabs) {
    const common = [
      { siteId: "common", tab: settingsTab },
      { siteId: "common", tab: logTab },
      { siteId: "common", tab: loginTab },
      { siteId: "common", tab: statusTab }
    ];
    return [...common, ...siteTabs];
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
      tabCount: siteTabs.length + 4,
      registeredAdapters: allAdapters().map((a) => a.id),
      buildTime: BUILD_TIME,
      version: VERSION
    }));
    booted = { panel, adapterId: res.adapter?.id ?? null };
    log5.info(
      `深大人工具箱 v${VERSION} 已装载（host=${url.hostname}，分派=${res.reason}，站点=${res.adapter?.id ?? "无"}，功能页=${res.autoExpand ? "是" : "否"}）`
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
        log5.debug(`站内跳转后不再属于支持范围，保持现有悬浮窗`);
        return;
      }
      log5.info(`站内跳转导致重新分派：${bootedFor} → ${location.href}`);
      bootedFor = location.href;
      boot(url, res);
    };
    window.addEventListener("hashchange", onNavigate);
    window.addEventListener("popstate", onNavigate);
  }
  function main() {
    if (window.top !== window.self) {
      console.debug("[深大人工具箱] 当前是子框架，跳过（@noframes 兜底）");
      return;
    }
    console.debug(
      `[深大人工具箱] v${VERSION} 启动，href=${location.href}，构建于 ${BUILD_TIME ?? "未知"}`
    );
    registerSites();
    const url = new URL(location.href);
    const res = resolve(url);
    if (!res.inject) {
      console.debug(
        `[深大人工具箱] 不注入：host=${url.hostname} 既不属于任何适配器（${allAdapters().map((a) => a.hosts.join("|")).join(" , ")}），也不在根域 ${SUPPORTED_ROOT_DOMAINS.join("/")} 下`
      );
      return;
    }
    boot(url, res);
    watchNavigation();
  }
  try {
    main();
  } catch (err) {
    console.error("[深大人工具箱] 启动失败", err);
  }
})();

