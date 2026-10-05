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

/* 构建信息：2026-10-05T15:18:11.242Z（构建号 53） */

"use strict";(()=>{var zr=`/* ============================================================
   深大人工具箱 —— 悬浮窗基础样式
   本文件被 esbuild 以 --loader:.css=text 打成字符串，
   运行时整段塞进 shadow root 的 <style>。
   因为处在 Shadow DOM 内，天然不受宿主页面 CSS 影响，
   反向也绝不会污染宿主页面。
   ============================================================ */

:host,
.sztb-root {
  --sztb-accent: #1e6fff;
  --sztb-accent-hover: #175be0;
  --sztb-bg: #ffffff;
  --sztb-bg-alt: #f5f6f8;
  --sztb-border: #e3e5e9;
  --sztb-text: #1f2329;
  --sztb-text-dim: #8a9099;
  --sztb-danger: #e5484d;
  --sztb-warn: #f5a623;
  --sztb-ok: #30a46c;

  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sztb-text);
  box-sizing: border-box;
}

.sztb-root *,
.sztb-root *::before,
.sztb-root *::after {
  box-sizing: border-box;
}

/* ---------------------------------------------------------- 悬浮球 */
.sztb-ball {
  position: fixed;
  z-index: 2147483000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--sztb-accent);
  color: #fff;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  cursor: grab;
  user-select: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  transition: transform 0.15s ease, background 0.15s ease;
}

.sztb-root[data-collapsed="true"] .sztb-ball {
  display: flex;
}

.sztb-ball:hover {
  background: var(--sztb-accent-hover);
  transform: scale(1.06);
}

.sztb-ball:active {
  cursor: grabbing;
}

/* ---------------------------------------------------------- 面板 */
.sztb-panel {
  position: fixed;
  z-index: 2147483001;
  display: flex;
  flex-direction: column;
  background: var(--sztb-bg);
  border: 1px solid var(--sztb-border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  min-width: 260px;
  min-height: 180px;
}

.sztb-root[data-collapsed="true"] .sztb-panel {
  display: none;
}

/* ---------------------------------------------------------- 标题栏 */
.sztb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--sztb-bg-alt);
  border-bottom: 1px solid var(--sztb-border);
  cursor: move;
  user-select: none;
  flex: 0 0 auto;
}

.sztb-title {
  flex: 1 1 auto;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sztb-site {
  color: var(--sztb-text-dim);
  font-weight: 400;
}

.sztb-iconbtn {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--sztb-text-dim);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.sztb-iconbtn:hover {
  background: rgba(0, 0, 0, 0.07);
  color: var(--sztb-text);
}

/* ---------------------------------------------------------- 标签栏 */
.sztb-tabbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px 0;
  border-bottom: 1px solid var(--sztb-border);
  background: var(--sztb-bg);
  flex: 0 0 auto;
}

.sztb-tab {
  padding: 5px 10px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--sztb-text-dim);
  font-size: 12.5px;
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  white-space: nowrap;
}

.sztb-tab:hover {
  color: var(--sztb-text);
  background: var(--sztb-bg-alt);
}

.sztb-tab[aria-selected="true"] {
  color: var(--sztb-accent);
  border-bottom-color: var(--sztb-accent);
  font-weight: 600;
}

/**
 * 站点组与公共组之间的分组竖线。
 *
 * - \`align-self: center\` 而不是 \`stretch\`：标签按钮自带上下内边距，
 *   竖线只有它们高度的一部分才像「分组线」而不是「分割框」。
 * - 用固定 px 高度（约标签按钮高度的 60%）而不是百分比：
 *   \`flex-wrap\` 换行后每行的行高由内容决定，百分比会跟着抖。
 * - \`flex: 0 0 auto\` 防止它在窄面板里被压扁。
 * - 标签栏本身有 \`gap: 2px\`，所以左右各留 4px 即可得到 6px 的视觉间距。
 */
.sztb-tab-sep {
  align-self: center;
  flex: 0 0 auto;
  width: 1px;
  height: 14px;
  margin: 0 4px;
  background: var(--sztb-border);
}

/* ---------------------------------------------------------- 内容区 */
.sztb-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px;
}

.sztb-pane {
  display: none;
  flex-direction: column;
  gap: 8px;
}

.sztb-pane[data-active="true"] {
  display: flex;
}

/* ---------------------------------------------------------- 表单控件 */
.sztb-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
}

.sztb-row:hover {
  background: var(--sztb-bg-alt);
}

.sztb-row input[type="checkbox"] {
  flex: 0 0 auto;
  margin: 2px 0 0;
  width: 15px;
  height: 15px;
  accent-color: var(--sztb-accent);
  cursor: pointer;
}

.sztb-row-main {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-row-label {
  display: block;
  font-size: 13px;
  cursor: pointer;
}

.sztb-row-desc {
  display: block;
  color: var(--sztb-text-dim);
  font-size: 12px;
  margin-top: 1px;
  word-break: break-word;
}

.sztb-risk {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  vertical-align: 1px;
}

.sztb-risk[data-risk="trace"] {
  background: rgba(245, 166, 35, 0.16);
  color: #b3730a;
}

.sztb-risk[data-risk="irreversible"] {
  background: rgba(229, 72, 77, 0.14);
  color: var(--sztb-danger);
}

.sztb-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
  padding: 0 8px;
}

.sztb-field-label {
  font-size: 13px;
  color: var(--sztb-text);
}

/* 配置项提示：单独一行，紧跟在标签下面（不塞进输入框里） */
.sztb-field-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

.sztb-input,
.sztb-select {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--sztb-border);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--sztb-text);
  background: var(--sztb-bg);
  box-sizing: border-box;
}

.sztb-input:focus,
.sztb-select:focus {
  outline: none;
  border-color: var(--sztb-accent);
}

/* 空值时显示的灰色默认值 */
.sztb-input::placeholder {
  color: var(--sztb-text-dim);
  opacity: 0.8;
}

.sztb-select {
  cursor: pointer;
}

/* 校验提示：校验通过时用 hidden 收起来，不占高度 */
.sztb-field-hint {
  font-size: 12px;
  line-height: 1.45;
  color: #b3730a;
}

.sztb-field-hint[hidden] {
  display: none;
}

.sztb-field[data-invalid="true"] .sztb-input,
.sztb-field[data-invalid="true"] .sztb-select {
  border-color: #d9a340;
}

.sztb-btn {
  padding: 5px 12px;
  border: 1px solid var(--sztb-border);
  border-radius: 6px;
  background: var(--sztb-bg);
  color: var(--sztb-text);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
}

.sztb-btn:hover {
  background: var(--sztb-bg-alt);
}

.sztb-btn[data-variant="primary"] {
  background: var(--sztb-accent);
  border-color: var(--sztb-accent);
  color: #fff;
}

.sztb-btn[data-variant="primary"]:hover {
  background: var(--sztb-accent-hover);
}

.sztb-btn[data-variant="danger"] {
  background: var(--sztb-danger);
  border-color: var(--sztb-danger);
  color: #fff;
}

.sztb-group-title {
  margin: 10px 0 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sztb-text-dim);
}

.sztb-group-title:first-child {
  margin-top: 0;
}

.sztb-empty {
  padding: 16px 8px;
  text-align: center;
  color: var(--sztb-text-dim);
  font-size: 12.5px;
}

/* 段首说明文字：站点自己的设置标签页用它交代门禁规则 */
.sztb-note {
  margin: 0 0 8px;
  padding: 7px 9px;
  border-left: 2px solid var(--sztb-border);
  border-radius: 0 5px 5px 0;
  background: var(--sztb-bg-alt);
  color: var(--sztb-text-dim);
  font-size: 12px;
  line-height: 1.6;
}

/* ---------------------------------------------------------- 日志面板 */
.sztb-log {
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  flex: 1 1 auto;
}

.sztb-log-line[data-level="warn"] {
  color: #b3730a;
}

.sztb-log-line[data-level="error"] {
  color: var(--sztb-danger);
}

.sztb-log-line[data-level="debug"] {
  color: var(--sztb-text-dim);
}

.sztb-toolbar {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
  align-items: center;
}

/* ---------------------------------------------------------- Toast */
.sztb-toasts {
  position: fixed;
  z-index: 2147483003;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  pointer-events: none;
}

.sztb-toast {
  max-width: 260px;
  padding: 7px 11px;
  border-radius: 7px;
  background: rgba(31, 35, 41, 0.94);
  color: #fff;
  font-size: 12.5px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
  animation: sztb-toast-in 0.16s ease;
  word-break: break-word;
}

.sztb-toast[data-kind="error"] {
  background: var(--sztb-danger);
}

.sztb-toast[data-kind="warn"] {
  background: #b3730a;
}

.sztb-toast[data-kind="success"] {
  background: var(--sztb-ok);
}

@keyframes sztb-toast-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---------------------------------------------------------- 确认框 */
.sztb-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2147483002;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sztb-modal {
  width: 300px;
  max-width: calc(100vw - 32px);
  background: var(--sztb-bg);
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.sztb-modal-title {
  padding: 12px 14px 0;
  font-weight: 600;
  font-size: 13.5px;
}

.sztb-modal-title[data-danger="true"] {
  color: var(--sztb-danger);
}

.sztb-modal-body {
  padding: 8px 14px 14px;
  font-size: 12.5px;
  color: var(--sztb-text-dim);
  white-space: pre-wrap;
  word-break: break-word;
}

.sztb-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  background: var(--sztb-bg-alt);
  border-top: 1px solid var(--sztb-border);
}

/* ------------------------------------------ 登录态失效（全屏提示） */
/* 比确认框更重：遮罩再深一点、层级再高一点（万一确认框正开着） */
.sztb-auth-mask {
  z-index: 2147483003;
  background: rgba(0, 0, 0, 0.45);
}

/* 正文比确认框长，放宽一行；窄屏仍受 max-width 约束 */
.sztb-auth-box {
  width: 360px;
}

/* ---------------------------------------------------------- 缩放手柄 */
.sztb-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg,
    transparent 0 50%,
    var(--sztb-border) 50% 60%,
    transparent 60% 72%,
    var(--sztb-border) 72% 82%,
    transparent 82%
  );
}
`;var Lr={debug:10,info:20,warn:30,error:40},Ar=500,ec=0,At=[],Zn="info",Jn=new Set;function qe(t,e,n,o){let r={seq:ec+=1,time:Date.now(),level:t,scope:e,message:n,detail:o};At.push(r),At.length>Ar&&(At=At.slice(At.length-Ar));for(let s of[...Jn])try{s(r)}catch{}}function _r(t){Zn=t}function ye(){return Zn}function Qn(t){return Lr[t]>=Lr[Zn]}function Ze(){return At.filter(t=>Qn(t.level))}function Nr(){return At.length}function Or(){At=[]}function $r(t){return Jn.add(t),()=>{Jn.delete(t)}}function h(t){return{debug:(e,n)=>qe("debug",t,e,n),info:(e,n)=>qe("info",t,e,n),warn:(e,n)=>qe("warn",t,e,n),error:(e,n)=>qe("error",t,e,n)}}var nc="";function Je(t,e=2){return String(t).padStart(e,"0")}function oc(t){if(t===0)return nc;let e=new Date(t);return`${Je(e.getHours())}:${Je(e.getMinutes())}:${Je(e.getSeconds())}.${Je(e.getMilliseconds(),3)}`}function to(t){let e=t.level.toUpperCase().padEnd(5),n=`${oc(t.time)} ${e} [${t.scope}] ${t.message}`;return t.detail===void 0?n:`${n} ${rc(t.detail)}`}function rc(t){if(t===void 0)return"undefined";if(t===null)return"null";if(typeof t=="string")return t;if(typeof t=="number"||typeof t=="boolean"||typeof t=="bigint")return String(t);if(typeof t=="function")return`[Function ${t.name||"anonymous"}]`;if(t instanceof Error)return`${t.name}: ${t.message}`;let e=new WeakSet;try{return JSON.stringify(t,(n,o)=>{if(typeof o=="object"&&o!==null){if(e.has(o))return"[Circular]";e.add(o)}return typeof o=="function"?"[Function]":o})??String(t)}catch{return"[Unserializable]"}}function i(t,e={},...n){let o=document.createElement(t);if(e.class!==void 0)for(let r of e.class.split(/\s+/))r!==""&&o.classList.add(r);if(e.text!==void 0&&(o.textContent=e.text),e.attrs!==void 0)for(let[r,s]of Object.entries(e.attrs))s==null||s===!1||o.setAttribute(r,s===!0?"":String(s));if(e.style!==void 0)for(let[r,s]of Object.entries(e.style))s!=null&&o.style.setProperty(ic(r),String(s));if(e.data!==void 0)for(let[r,s]of Object.entries(e.data))o.dataset[r]=s;if(e.on!==void 0)for(let[r,s]of Object.entries(e.on))typeof s=="function"&&o.addEventListener(r,s);return sc(o,n),o}function sc(t,e){for(let n of e)n==null||n===!1||t.appendChild(typeof n=="string"?document.createTextNode(n):n)}function ot(t){for(;t.firstChild!==null;)t.removeChild(t.firstChild)}function ic(t){return t.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}function eo(t,e,n){return n<e?e:Math.min(n,Math.max(e,t))}function ac(t){return t==="interactive"||t==="complete"}function lc(){return ac(document.readyState)}function te(t){if(lc()){t();return}document.addEventListener("DOMContentLoaded",t,{once:!0})}var no="sztb:";function io(t){return t.startsWith(no)?t:no+t}var oo=class{name="memory";map=new Map;get(e){return this.map.get(e)}set(e,n){this.map.set(e,n)}delete(e){this.map.delete(e)}keys(){return[...this.map.keys()]}},ro=class{name="localStorage";get(e){let n=localStorage.getItem(e);if(n!==null)try{return JSON.parse(n)}catch{return}}set(e,n){localStorage.setItem(e,JSON.stringify(n))}delete(e){localStorage.removeItem(e)}keys(){let e=[];for(let n=0;n<localStorage.length;n+=1){let o=localStorage.key(n);o!==null&&e.push(o)}return e}},so=class{name="GM";get(e){return GM_getValue(e,void 0)}set(e,n){GM_setValue(e,n)}delete(e){GM_deleteValue(e)}keys(){return GM_listValues().filter(e=>e.startsWith(no))}};function ao(){let t=globalThis;return typeof t.GM_getValue=="function"&&typeof t.GM_setValue=="function"&&typeof t.GM_deleteValue=="function"&&typeof t.GM_listValues=="function"}function cc(){return ao()?new so:typeof localStorage<"u"?new ro:new oo}var Qe=cc();function Pr(){return Qe.name}function G(t,e){let n=Qe.get(io(t));return n===void 0||typeof n!=typeof e&&e!==null?e:n}function H(t,e){Qe.set(io(t),e)}function Dr(t){Qe.delete(io(t))}var ft="common";function tn(t){let e=[],n=[];for(let c of t)(c.siteId===ft?n:e).push(c);let o=Br(e),r=Br(n),s=[...o,...r],a=o.length>0&&r.length>0;return s.map((c,l)=>({entry:c,dividerBefore:a&&l===o.length}))}function Br(t){return[...t].sort((e,n)=>Hr(e)-Hr(n))}function Hr(t){return t.tab.order??1e3}function lo(t){return`ui:active-tab:${t}`}function co(t){for(let e of tn(t))if(e.entry.siteId!==ft)return e.entry.siteId;return ft}function Ur(t,e){let n=e(lo(co(t)));if(n===null)return null;for(let o of tn(t))if(o.entry.tab.id===n)return n;return null}var uo=h("ui/tabs"),en=class{tabbar;body;shadowRoot;options;mounted=new Map;current=null;constructor(e,n={}){this.shadowRoot=e,this.options=n,this.tabbar=i("nav",{class:"sztb-tabbar",attrs:{role:"tablist"}}),this.body=i("div",{class:"sztb-body"})}setTabs(e,n,o=null){this.destroyTabs();let r=tn(e);for(let a of r)a.dividerBefore&&this.tabbar.appendChild(uc()),this.mountTab(a.entry.tab,n);let s=r[0];if(s!==void 0){let a=o!==null&&this.mounted.has(o)?o:s.entry.tab.id;this.activate(a)}}mountTab(e,n){let o=document.createElement("style");o.dataset.tab=e.id,o.textContent=e.css??"",this.shadowRoot.appendChild(o);let r=i("button",{class:"sztb-tab",text:e.title,attrs:{type:"button",role:"tab","aria-selected":"false","data-tab":e.id},on:{click:()=>this.activate(e.id)}});this.tabbar.appendChild(r);let s=i("div",{class:"sztb-pane",attrs:{role:"tabpanel"},data:{tab:e.id}});this.body.appendChild(s);let a;try{let c=e.mount(s,n);typeof c=="function"&&(a=c)}catch(c){uo.error(`标签页 ${e.id} 挂载失败`,c),s.appendChild(i("div",{class:"sztb-empty",text:`该标签页加载失败：${String(c)}`}))}this.mounted.set(e.id,{tab:e,style:o,pane:s,...a!==void 0?{dispose:a}:{}})}activate(e){if(!this.mounted.has(e)){uo.warn(`激活了不存在的标签页 ${e}`);return}this.current=e;for(let n of this.tabbar.querySelectorAll(".sztb-tab"))n.setAttribute("aria-selected",String(n.dataset.tab===e));for(let n of this.body.querySelectorAll(".sztb-pane"))n.dataset.active=String(n.dataset.tab===e);this.options.onActivate?.(e)}activeTabId(){return this.current}has(e){return this.mounted.has(e)}destroyTabs(){for(let e of this.mounted.values())try{e.dispose?.()}catch(n){uo.warn(`标签页 ${e.tab.id} 卸载时抛错`,n)}this.mounted.clear(),this.current=null,ot(this.tabbar),ot(this.body);for(let e of this.shadowRoot.querySelectorAll("style[data-tab]"))e.remove()}destroy(){this.destroyTabs(),this.tabbar.remove(),this.body.remove()}};function uc(){return i("span",{class:"sztb-tab-sep",attrs:{role:"separator","aria-orientation":"vertical"}})}var po={width:344,height:430},Kt={width:260,height:180},Kr=37,Fr=21;function Gr(t){return typeof t=="object"&&t!==null&&typeof t.left=="number"&&typeof t.top=="number"}function nn(t,e){return{left:t.left+e.width-Fr-44/2,top:t.top+Kr/2-44/2}}function Vr(t,e){return{left:t.left+44/2+Fr-e.width,top:t.top+44/2-Kr/2}}function jr(t,e,n,o,r){let s=Math.max(8,o-e-8),a=Math.max(8,r-n-8);return{left:Math.min(Math.max(t.left,8),s),top:Math.min(Math.max(t.top,8),a)}}var dc=2600,on=class{host;root;timers=new Set;constructor(e){this.root=i("div",{class:"sztb-toasts"}),this.host=i("div",{class:"sztb-root"},this.root),e.appendChild(this.host),this.reposition()}show(e,n="info",o=dc){let r=i("div",{class:"sztb-toast",data:{kind:n},text:e});this.root.appendChild(r),this.reposition();let s=window.setTimeout(()=>{this.timers.delete(s),r.remove(),this.reposition()},o);this.timers.add(s)}reposition(){this.root.style.setProperty("top","10px"),this.root.style.setProperty("right","10px")}destroy(){for(let e of this.timers)window.clearTimeout(e);this.timers.clear(),ot(this.root),this.host.remove()}};var pc="Escape";function Yr(t,e){return new Promise(n=>{let o=e.danger===!0,r=!1,s=E=>{r||(r=!0,document.removeEventListener("keydown",a,!0),f.remove(),n(E))},a=E=>{E.key===pc&&(E.stopPropagation(),s(!1))},c=i("button",{class:"sztb-btn",text:e.confirmText??(o?"我确认，执行":"确定"),attrs:{type:"button","data-variant":o?"danger":"primary"},on:{click:()=>s(!0)}}),l=i("button",{class:"sztb-btn",text:e.cancelText??"取消",attrs:{type:"button"},on:{click:()=>s(!1)}}),u=i("div",{class:"sztb-modal"},i("div",{class:"sztb-modal-title",text:e.title,data:{danger:String(o)}}),i("div",{class:"sztb-modal-body",text:e.body}),i("div",{class:"sztb-modal-foot"},l,c)),f=i("div",{class:"sztb-modal-mask",on:{click:E=>{E.target===f&&s(!1)}}},u);t.appendChild(f),document.addEventListener("keydown",a,!0),c.focus()})}var Xr="sztb-auth-mask",fc="登录态已失效",mc=`选课站点已经把本次会话踢下线，继续抢课 / 监控不会成功。
请刷新网页并重新登录，然后回到【任务】页点【开始抢课】继续。`;function Wr(t){if(t.querySelector(`.${Xr}`)!==null)return;let e=i("button",{class:"sztb-btn",text:"稍后",attrs:{type:"button"}}),n=i("button",{class:"sztb-btn",text:"刷新网页重新登录",attrs:{type:"button","data-variant":"primary"},on:{click:()=>{location.reload()}}}),o=i("div",{class:"sztb-modal sztb-auth-box"},i("div",{class:"sztb-modal-title",text:fc,data:{danger:"true"}}),i("div",{class:"sztb-modal-body",text:mc}),i("div",{class:"sztb-modal-foot"},e,n)),r=i("div",{class:`sztb-modal-mask ${Xr}`},o);e.addEventListener("click",()=>{r.remove()}),t.appendChild(r),n.focus()}var qr=h("ui/panel"),Qr="ui:size",fo="ui:collapsed",Jr="ui:panel-pos";function gc(t){let e=G(t,null);return Gr(e)?e:null}function bc(){return{left:Math.max(8,window.innerWidth-po.width-16),top:84}}function hc(){let t=G(Qr,null);return t===null||typeof t.width!="number"||typeof t.height!="number"?{...po}:t}function sn(t,e,n){return jr(t,e,n,window.innerWidth,window.innerHeight)}function Zr(t,e,n){t.preventDefault(),t.stopPropagation();let o=t.clientX,r=t.clientY,s=t.pointerId,a=l=>{l.pointerId===s&&(l.preventDefault(),e(l.clientX-o,l.clientY-r,l))},c=l=>{l.pointerId===s&&(document.removeEventListener("pointermove",a,!0),document.removeEventListener("pointerup",c,!0),document.removeEventListener("pointercancel",c,!0),n())};document.addEventListener("pointermove",a,!0),document.addEventListener("pointerup",c,!0),document.addEventListener("pointercancel",c,!0)}function ts(t,e,n){let o=i("div",{class:"sztb-host"});o.style.setProperty("position","fixed"),o.style.setProperty("inset","0"),o.style.setProperty("width","0"),o.style.setProperty("height","0"),o.style.setProperty("z-index","2147483000");let r=o.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=t,r.appendChild(s);let a=g=>{g.stopPropagation()};r.addEventListener("keydown",a),r.addEventListener("keypress",a);let c=i("div",{class:"sztb-ball",text:"深",attrs:{title:"深大人工具箱（点击展开）"}}),l=i("span",{class:"sztb-title"},"深大人工具箱");n.siteName!==null&&l.appendChild(i("span",{class:"sztb-site",text:` · ${n.siteName}`}));let u=i("button",{class:"sztb-iconbtn",text:"—",attrs:{type:"button",title:"收起为悬浮球"}}),f=i("header",{class:"sztb-head"},l,u),E=new en(r,{onActivate:g=>{P=g,!D&&tt?.(g)}}),O=i("div",{class:"sztb-resize",attrs:{title:"拖拽调整大小"}}),C=i("div",{class:"sztb-panel"},f,E.tabbar,E.body,O),q=i("div",{class:"sztb-root"},c,C);r.appendChild(q);let I=new on(r),D=!1,tt,P=null,zt=G(fo,null),p=zt??!1,x=hc(),z=gc(Jr)??bc(),A=nn(z,x);function V(){x={width:Math.max(Kt.width,x.width),height:Math.max(Kt.height,x.height)},z=sn(z,x.width,x.height),A=sn(A,44,44),C.style.setProperty("left",`${z.left}px`),C.style.setProperty("top",`${z.top}px`),C.style.setProperty("width",`${x.width}px`),C.style.setProperty("height",`${x.height}px`),c.style.setProperty("left",`${A.left}px`),c.style.setProperty("top",`${A.top}px`),q.dataset.collapsed=String(p)}function et(g,w=!0){g!==p&&(p=g,w&&H(fo,p)),p?A=nn(z,x):(z=sn(Vr(A,x),x.width,x.height),A=nn(z,x)),V()}let B=!1;u.addEventListener("click",g=>{g.stopPropagation(),et(!0)}),c.addEventListener("click",g=>{if(B){B=!1,g.stopPropagation();return}et(!1)});function m(g,w,R,st){g.addEventListener("pointerdown",K=>{let it=w();B=!1,Zr(K,(Ut,J)=>{(Math.abs(Ut)>2||Math.abs(J)>2)&&(B=!0);let{w:Xe,h:Qt}=st();R(sn({left:it.left+Ut,top:it.top+J},Xe,Qt)),V()},()=>{B&&R(w())})})}m(c,()=>A,g=>{A=g},()=>({w:44,h:44})),m(f,()=>z,g=>{z=g,H(Jr,g)},()=>({w:x.width,h:x.height})),O.addEventListener("pointerdown",g=>{let w={...x},R=z.left,st=z.top;Zr(g,(K,it)=>{x={width:eo(w.width+K,Kt.width,Math.max(Kt.width,window.innerWidth-R-8)),height:eo(w.height+it,Kt.height,Math.max(Kt.height,window.innerHeight-st-8))},V()},()=>{H(Qr,x)})}),window.addEventListener("resize",()=>V());let v={element:o,collapse:()=>et(!0),expand:()=>et(!1),isCollapsed:()=>p,toast:(g,w)=>I.show(g,w??"info"),confirm:g=>Yr(r,g),alertAuthExpired:()=>Wr(r),activateTab:g=>E.activate(g),setTabs:g=>{let w=new Map;for(let K of g)w.set(K.tab.id,K.siteId);let R=co(g),st=P??Ur(g,K=>G(K,null));tt=K=>{E.has(K)&&H(lo(R),K)},D=!0;try{E.setTabs(g,_(w),st)}finally{D=!1}},destroy:()=>{try{E.destroy(),I.destroy()}catch(g){qr.warn("销毁悬浮窗时抛错",g)}o.remove()}};function _(g){return{get siteId(){let w=E.activeTabId();return w!==null?g.get(w)??ft:ft},host:v}}return V(),v.setTabs(e),(document.documentElement??document.body).appendChild(o),zt===null&&H(fo,!1),qr.info(`悬浮窗已装载：${e.length} 个标签页，初始${p?"折叠（沿用上次）":"展开"}，面板=(${Math.round(z.left)},${Math.round(z.top)})，球=(${Math.round(A.left)},${Math.round(A.top)})`),v}var an=new Map;function xe(t,e){return`${t}\0${e}`}function es(t,e){return`toggle:${t}:${e}`}function ns(t,e,n){for(let o of n)an.set(xe(t,o.id),{...o,siteId:t,siteName:e})}function go(t){let e=[];for(let n of an.values())n.siteId===t&&e.push(n);return e.sort(yc)}function yc(t,e){let n=t.group??"",o=e.group??"";return n!==o?n.localeCompare(o,"zh-Hans-CN"):t.label.localeCompare(e.label,"zh-Hans-CN")}function k(t,e){let n=an.get(xe(t,e));if(n===void 0)return!1;let o=G(es(t,e),null);return o===null?n.risk==="irreversible"?!1:n.default:o}function os(t,e,n){H(es(t,e),n)}function rs(t){return t==="irreversible"}function bo(t,e){let n=e.trim();return n===""||t.kind==="number"&&!Number.isFinite(Number(n))?t.default:n}function ss(t,e){let n=bo(t,e);return t.kind==="select"&&t.options!==void 0&&!t.options.some(r=>r.value===String(n))?`只能选：${t.options.map(r=>r.label).join(" / ")}`:t.validate?.(n)??null}function ln(t){return t==null?"":String(t)}var ke=new Map;function Ct(t){ke.set(xe(t.siteId,t.id),t)}function ho(t){let e=[];for(let n of ke.values())n.siteId===t&&e.push(n);return e}function is(){let t=[],e=new Set;for(let n of an.values())e.has(n.siteId)||(e.add(n.siteId),t.push(n.siteId));for(let n of ke.values())e.has(n.siteId)||(e.add(n.siteId),t.push(n.siteId));return t}function N(t,e){let o=ke.get(xe(t,e))?.default??void 0;return G(`value:${t}:${e}`,o)}function cn(t,e,n){H(`value:${t}:${e}`,n);let o=ke.get(xe(t,e));try{o?.apply?.(n)}catch{}}function as(t,e){let n=`value:${t}:${e}`;G(n,void 0)!==void 0&&Dr(n)}var xc={trace:"留痕",irreversible:"不可逆"};function ls(t){let e=i("input",{attrs:{type:"checkbox",id:`sztb-${t.id}`}});e.checked=t.checked;let n=i("label",{class:"sztb-row-label",text:t.label,attrs:{for:`sztb-${t.id}`}});t.risk!=="safe"&&n.appendChild(i("span",{class:"sztb-risk",text:xc[t.risk],data:{risk:t.risk}}));let o=i("div",{class:"sztb-row-main"},n,t.desc!==void 0?i("span",{class:"sztb-row-desc",text:t.desc}):null),r=!1;return e.addEventListener("change",()=>{let s=e.checked;(async()=>{if(r){e.checked=!s;return}r=!0;try{if(s&&t.risk==="irreversible"&&t.confirm!==void 0&&!await t.confirm({title:"开启不可逆功能",body:`${t.label}

${t.desc??""}

该功能会产生无法撤销的操作，确认开启？`.trim(),danger:!0,confirmText:"我确认，开启"})){e.checked=!1;return}await t.onChange(s)}catch{e.checked=!s}finally{r=!1}})()}),i("div",{class:"sztb-row"},e,o)}function kc(t,e){let n=ln(e.default),o=e.kind==="select"?i("select",{class:"sztb-select"}):i("input",{class:"sztb-input",attrs:{type:e.kind,placeholder:n}});if(e.kind==="select")for(let u of e.options??[])o.appendChild(i("option",{text:u.label,attrs:{value:u.value}}));let r=i("div",{class:"sztb-field-hint",attrs:{hidden:!0}}),s=i("div",{class:"sztb-field",data:{invalid:"false"}},i("label",{class:"sztb-field-label",text:e.label}),e.desc!==void 0?i("div",{class:"sztb-field-desc",text:e.desc}):null,o,r);function a(u){if(u===null){r.hidden=!0,r.textContent="",s.dataset.invalid="false";return}r.hidden=!1,r.textContent=u,s.dataset.invalid="true"}function c(){let u=o.value,f=bo(e,u);cn(t,e.id,f),o.value=ln(f),a(ss(e,u))}let l=ln(N(t,e.id));if(o.value=e.kind==="select"&&l===""?n:l,e.kind==="select")o.addEventListener("change",c);else{let u=o;u.addEventListener("blur",c),u.addEventListener("keydown",f=>{f.key==="Enter"&&c()}),u.addEventListener("input",()=>a(null))}return s}function ee(t,e,n){let o=document.createDocumentFragment();e!==null&&o.appendChild(i("div",{class:"sztb-group-title",text:e}));let r=go(t),s=ho(t);if(r.length>0){o.appendChild(i("div",{class:"sztb-group-title",text:"功能开关"}));let a=new Map;for(let c of r){let l=c.group??"",u=a.get(l);u===void 0?a.set(l,[c]):u.push(c)}for(let[c,l]of a){c!==""&&o.appendChild(i("div",{class:"sztb-group-title",text:c}));for(let u of l)o.appendChild(ls({id:`${u.siteId}-${u.id}`,label:u.label,...u.desc!==void 0?{desc:u.desc}:{},checked:k(u.siteId,u.id),risk:u.risk,confirm:f=>n.host.confirm(f),onChange:f=>{os(u.siteId,u.id,f),n.host.toast(`${u.label} 已${f?"开启":"关闭"}${f&&rs(u.risk)?"（不可逆功能，请谨慎使用）":""}`,f?"success":"info")}}))}}if(s.length>0){o.appendChild(i("div",{class:"sztb-group-title",text:"参数设置"}));for(let a of s)o.appendChild(kc(t,a))}return o}function cs(t){return go(t).length>0||ho(t).length>0}function yo(t){return i("div",{class:"sztb-empty",text:t})}function us(t){return i("div",{class:"sztb-empty",text:`${t} 的设置已移到它自己的【设置】标签页`})}var ds=t=>t,ps=()=>!1;function fs(t){ds=t}function ms(t){ps=t}function Tc(t,e){ot(t);let n=is().filter(r=>cs(r));if(n.length===0){t.appendChild(yo("当前没有已注册的功能开关"));return}let o=0;for(let r of n){let s=ds(r);if(ps(r)){t.appendChild(us(s));continue}t.appendChild(ee(r,s,e)),o+=1}o===0&&t.appendChild(yo("所有站点的设置都在它们自己的标签页里"))}var gs={id:"common:settings",title:"全局设置",order:10,mount(t,e){Tc(t,e)}};var Cc=["gm","exec","modern"];function Sc(t,e){return e==="gm"?t.hasGm:e==="exec"?t.hasExec:e==="modern"?t.hasClipboard:!1}function Ec(t){return Cc.filter(e=>Sc(t,e))}function vc(){return{hasGm:typeof globalThis.GM_setClipboard=="function",hasClipboard:typeof navigator<"u"&&navigator.clipboard!==void 0,hasExec:typeof document<"u"&&typeof document.execCommand=="function"}}function wc(t){let e=document.createElement("textarea");e.value=t,e.setAttribute("readonly",""),e.style.position="fixed",e.style.top="-1000px",e.style.left="-1000px",e.style.opacity="0",document.body.appendChild(e);let n=typeof document.getSelection=="function"?document.getSelection():null,o=[];if(n!==null)for(let s=0;s<n.rangeCount;s++)o.push(n.getRangeAt(s).cloneRange());let r=!1;try{e.select(),r=document.execCommand("copy")}catch{r=!1}if(e.remove(),n!==null){n.removeAllRanges();for(let s of o)n.addRange(s)}return r}async function un(t){let e=Ec(vc());if(e.length===0)return{ok:!1,method:"none",detail:"当前环境没有任何可用的剪贴板写入方式"};let n="none",o="";for(let r of e){n=r;try{if(r==="gm")return globalThis.GM_setClipboard(t),{ok:!0,method:r,detail:""};if(r==="exec"){if(wc(t))return{ok:!0,method:r,detail:""};o="document.execCommand(copy) 返回 false";continue}return await navigator.clipboard.writeText(t),{ok:!0,method:r,detail:""}}catch(s){o=`${r} 失败：${String(s)}`}}return{ok:!1,method:n,detail:o}}var Ic=["debug","info","warn","error"];async function Mc(){let t=Ze().map(to).join(`
`);await un(t)}var Rc=`
.sztb-log-wrap { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; }
.sztb-log { overflow: auto; flex: 1 1 auto; }
.sztb-log-empty { padding: 20px 8px; text-align: center; color: var(--sztb-text-dim); font-size: 12.5px; }
`;function zc(t){let e=i("select",{class:"sztb-input",style:{width:"auto"}});for(let I of Ic){let D=i("option",{text:I,attrs:{value:I}});I===ye()&&(D.selected=!0),e.appendChild(D)}e.addEventListener("change",()=>{_r(e.value),C()});let n=i("button",{class:"sztb-btn",text:"清空",attrs:{type:"button"},on:{click:()=>{Or(),C()}}}),o=i("button",{class:"sztb-btn",text:"复制全文",attrs:{type:"button"},on:{click:()=>{Mc()}}}),r=i("div",{class:"sztb-log"}),s=i("div",{class:"sztb-log-empty"}),a=i("div",{class:"sztb-log-wrap"},i("div",{class:"sztb-toolbar"},e,n,o),r,s);t.appendChild(a);let c=8,l=!0,u=()=>r.scrollTop+r.clientHeight>=r.scrollHeight-c;r.addEventListener("scroll",()=>{l=u()});function f(){r.scrollTop=r.scrollHeight}function E(I){return i("div",{class:"sztb-log-line",text:to(I),data:{level:I.level}})}function O(){let I=r.childElementCount;if(r.style.display=I===0?"none":"",s.style.display=I===0?"":"none",I>0)return;let D=Nr(),tt=Ze().length,P=D-tt;s.textContent=D===0?"暂无日志。":`当前没有等级 ≥ ${ye()} 的日志（缓冲里另有 ${P} 条被过滤掉了）。`}function C(){let I=l||u();ot(r);for(let D of Ze())r.appendChild(E(D));O(),I&&f(),l=I}C();let q=$r(I=>{Qn(I.level)&&(r.style.display==="none"&&(r.style.display=""),s.style.display="none",r.appendChild(E(I)),r.childElementCount>520&&r.firstElementChild?.remove(),l&&f())});return()=>{q()}}var bs={id:"common:log",title:"日志",order:90,css:Rc,mount(t){return zc(t)}};var _t={intervalMs:{min:0,max:6e4,def:500,recommended:200},retryIntervalMs:{min:0,max:6e4,def:1500,recommended:200},pollIntervalMs:{min:0,max:6e4,def:1500,recommended:200}};function yt(t,e){let n=_t[t],o;return typeof e=="number"?o=e:typeof e=="string"&&e.trim()!==""?o=Number(e.trim()):o=Number.NaN,Number.isFinite(o)||(o=n.def),Math.min(n.max,Math.max(n.min,o))}function Te(t,e){return e<_t[t].recommended}var pn=h("core/http"),To=_t.intervalMs.recommended,Lc=_t.intervalMs.def,hs=10,Nt={MONITOR_HIT:-10,HIGH:0,NORMAL:10},ko=class extends Error{status;responseText;constructor(e,n,o){super(e),this.name="HttpError",this.status=n,this.responseText=o}},Co=Lc,St=[],Ac=0,dn=!1,xo=null,xs=0;function So(t){let e=yt("intervalMs",t);e!==t&&pn.warn(`请求间隔 ${t} 超出可接受范围，已夹到 ${e}ms`),Te("intervalMs",e)&&pn.warn(`请求间隔 ${e}ms 低于建议下限 ${To}ms；校园站对高频请求零容忍，实测会被直接终止会话，请自行确认风险`),Co=e}function fn(){return Co}function mn(){return St.length}function ks(){if(xo!==null||dn||St.length===0)return;let t=Math.max(0,xs-Date.now());xo=setTimeout(()=>{xo=null,_c()},t)}function _c(){if(dn||St.length===0)return;let t=0;for(let n=1;n<St.length;n+=1){let o=St[n],r=St[t];(o.priority<r.priority||o.priority===r.priority&&o.seq<r.seq)&&(t=n)}let e=St.splice(t,1)[0];dn=!0,xs=Date.now()+Co,Promise.resolve().then(()=>e.task()).then(n=>e.resolve(n),n=>e.reject(n)).then(()=>{dn=!1,ks()})}function Nc(t,e){return St.length>=hs?Promise.reject(new Error(`请求队列已满（上限 ${hs}），本条已丢弃`)):new Promise((n,o)=>{St.push({task:t,priority:typeof e=="number"&&Number.isFinite(e)?e:Nt.NORMAL,seq:Ac++,resolve:n,reject:o}),ks()})}function Oc(t){if(t!==void 0)return typeof t=="string"?t:t instanceof URLSearchParams?t.toString():JSON.stringify(t)}function $c(){let e=globalThis.unsafeWindow;if(e!==null&&typeof e=="object"){let n=e.fetch;if(typeof n=="function")return{fn:n,owner:e}}return typeof fetch=="function"?{fn:fetch,owner:globalThis}:null}async function Pc(t,e){let n=$c();if(n===null)throw new Error("当前环境没有可用的 fetch");let o={method:t.method??"GET",credentials:"include",...t.headers!==void 0?{headers:t.headers}:{},...e!==void 0?{body:e}:{},__szuSkip:!0},r=await n.fn.call(n.owner,t.url,o),s=await r.text();return{status:r.status,statusText:r.statusText,text:s,finalUrl:r.url}}async function ne(t){let e=Oc(t.data),n=Date.now(),o=await Nc(()=>Pc(t,e),t.priority),r=Date.now()-n,s=null;if(t.responseType==="json")try{s=JSON.parse(o.text)}catch{throw pn.error(`期望 JSON 但解析失败 ${t.method??"GET"} ${ys(t.url)} → ${o.status}`),new ko("响应不是合法 JSON",o.status,o.text)}return pn.debug(`${t.method??"GET"} ${ys(t.url)} → ${o.status} (${r}ms, ${o.text.length}B)`),{...o,elapsedMs:r,json:s}}function ys(t){try{let e=new URL(t);return`${e.pathname}${e.hash}`}catch{return t.split("?")[0]??t}}function Ts(t){let e=new URLSearchParams;for(let[n,o]of Object.entries(t))o!=null&&e.set(n,String(o));return e.toString()}var Cs=null;function Ss(t){Cs=t}function at(t,e){return i("div",{class:"sztb-row"},i("div",{class:"sztb-row-main"},i("span",{class:"sztb-row-label",text:t}),i("span",{class:"sztb-row-desc",text:e})))}function Dc(t){function e(){ot(t);let o=Cs?.()??null;if(o===null){t.appendChild(i("div",{class:"sztb-empty",text:"状态信息尚未注入"}));return}t.appendChild(i("div",{class:"sztb-group-title",text:"本页"})),t.appendChild(at("URL",o.href)),t.appendChild(at("站点分派",o.resolution)),t.appendChild(at("命中适配器",o.adapterId??"（无，仅公共标签页）")),t.appendChild(at("是否注入",o.inject?"是":"否")),t.appendChild(at("自动展开",o.autoExpand?"是":"否")),t.appendChild(at("标签页数量",String(o.tabCount))),t.appendChild(i("div",{class:"sztb-group-title",text:"已注册站点"})),t.appendChild(at("适配器",o.registeredAdapters.length>0?o.registeredAdapters.join("、"):"（无）")),t.appendChild(i("div",{class:"sztb-group-title",text:"运行环境"})),t.appendChild(at("脚本版本",o.version)),t.appendChild(at("构建时间",o.buildTime??"（开发模式，未注入）")),t.appendChild(at("存储后端",Pr())),t.appendChild(at("GM 存储可用",ao()?"是":"否（已降级）")),t.appendChild(at("请求间隔",`${fn()}ms（建议不低于 ${To}ms）`)),t.appendChild(at("队列排队中",String(mn()))),t.appendChild(at("日志等级",ye()));let r=i("button",{class:"sztb-btn",text:"刷新",attrs:{type:"button"},on:{click:e}});t.appendChild(r)}e();let n=window.setInterval(e,2e3);return()=>window.clearInterval(n)}var Es={id:"common:status",title:"状态",order:95,mount(t){return Dc(t)}};var Bc=new Map;var ws=()=>null;function Is(t){ws=t}function Hc(t){let e=[...t];return e.length<=2?"•".repeat(e.length):e.length<=6?`${e[0]}${"•".repeat(e.length-2)}${e[e.length-1]}`:`${e.slice(0,2).join("")}${"•".repeat(4)}${e.slice(-2).join("")}`}function Eo(t,e){return i("div",{class:"sztb-row"},i("div",{class:"sztb-row-main"},i("span",{class:"sztb-row-label",text:t}),i("span",{class:"sztb-row-desc",text:e})))}function vs(t,e){let n=e.loggedIn===!0?"已登录":e.loggedIn===!1?"未登录":"未知（尚不支持该站点）";t.appendChild(i("div",{class:"sztb-group-title",text:`状态：${n}`})),e.source!==void 0&&t.appendChild(Eo("探测手段",e.source));for(let o of e.fields??[])t.appendChild(Eo(o.label,o.secret===!0?Hc(o.value):o.value));e.error!==void 0&&t.appendChild(Eo("失败原因",e.error))}function Uc(t){let e=0,n=!1;async function o(){let s=++e;ot(t);let a=ws();if(a===null){t.appendChild(i("div",{class:"sztb-empty",text:"当前页面未命中任何站点适配器，没有登录态可探测。"}));return}let c=Bc.get(a);if(c===void 0){t.appendChild(i("div",{class:"sztb-empty",text:`站点「${a}」尚未提供登录态探测器。
登录态形态依赖站点接口（UOOC 需抓包确认，见需求文档 Q-M），将在该站点适配器落地时接入。`}));return}t.appendChild(i("div",{class:"sztb-empty",text:"探测中…"}));try{let l=await c();if(n||s!==e)return;ot(t),vs(t,l)}catch(l){if(n||s!==e)return;ot(t),vs(t,{loggedIn:"unknown",error:String(l)})}}o();let r=i("button",{class:"sztb-btn",text:"重新探测",attrs:{type:"button"},on:{click:()=>{o()}}});return t.appendChild(r),()=>{n=!0}}var Ms={id:"common:login",title:"登录态",order:92,mount(t){return Uc(t)}};function Kc(t){let e=t.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*");return new RegExp(`^${e}$`)}var Rs=new Map;function zs(t,e){let n=Rs.get(t);return n===void 0&&(n=Kc(t),Rs.set(t,n)),n.test(e)}function Fc(t,e){return zs(e.toLowerCase(),t.toLowerCase())}function Gc(t,e){let n=`${t.pathname}${t.search}${t.hash}`;return zs(e,n)}function Ls(t,e){return e.some(n=>Fc(t,n))}function As(t,e){return e.some(n=>Gc(t,n))}function _s(t,e){let n=t.toLowerCase(),o=e.toLowerCase();return n===o||n.endsWith(`.${o}`)}var vo=["szu.edu.cn"],Vc="sztb-demo",oe=[];function gn(t){let e=oe.findIndex(n=>n.id===t.id);if(e>=0){oe[e]=t;return}oe.push(t)}function re(){return oe}function jc(t){return oe.find(e=>e.id===t)}function Ce(t){return`${t}:settings`}function Ns(t){let e=jc(t);return e===void 0?!1:e.tabs.some(n=>n.id===Ce(t))}var Yc={inject:!1,adapter:null,autoExpand:!1,reason:"none"};function wo(t,e=oe){let n=t.hash.includes(Vc);for(let o of e)if(Ls(t.hostname,o.hosts))return{inject:!0,adapter:o,autoExpand:Xc(t,o),reason:"adapter"};if(n){let o=e.find(r=>r.id==="demo");if(o!==void 0)return{inject:!0,adapter:o,autoExpand:!0,reason:"debug-flag"}}return vo.some(o=>_s(t.hostname,o))?{inject:!0,adapter:null,autoExpand:!1,reason:"root-domain"}:Yc}function Xc(t,e){return e.pages.length===0?!0:As(t,e.pages)}var bn=h("site/demo"),Wc=`
.demo-box { display: flex; flex-direction: column; gap: 8px; }
.demo-hint { color: var(--sztb-text-dim); font-size: 12px; }
`;function Se(t,e,n){return i("button",{class:"sztb-btn",text:t,attrs:{type:"button",...n!==void 0?{"data-variant":n}:{}},on:{click:()=>{e()}}})}var qc={id:"demo:playground",title:"演示",order:100,css:Wc,mount(t,e){let n=i("div",{class:"demo-box"},i("div",{class:"demo-hint",text:"这个标签页只在本机测试时出现，用来验证框架各部件是否正常。"}),Se("弹一条 Toast",()=>e.host.toast("这是一条测试提示","success")),Se("弹二次确认（危险）",async()=>{let o=await e.host.confirm({title:"危险操作确认",body:`这是演示用的二次确认框。
确认后会弹一条 Toast。`,danger:!0});e.host.toast(o?"你点了确认":"你取消了",o?"warn":"info")}),Se("写一条日志",()=>{bn.info("来自演示标签页的日志",{siteId:e.siteId,queue:mn()}),e.host.toast("已写入日志，切到「日志」标签页查看")}),Se("排一个请求（走限流队列）",async()=>{e.host.toast(`请求已入队（间隔 ${fn()}ms）`);try{let o=await ne({url:`${location.origin}/?_sztb_probe=${Date.now()}`,method:"GET"});bn.info(`探测请求返回 ${o.status}`,{elapsedMs:o.elapsedMs}),e.host.toast(`返回 ${o.status}，耗时 ${o.elapsedMs}ms`,"success")}catch(o){bn.warn("探测请求失败",o),e.host.toast("请求失败，详见日志","error")}}),Se("折叠悬浮窗",()=>e.host.collapse()));t.appendChild(n)}},Os={id:"demo",name:"演示站点",hosts:["localhost","127.0.0.1","*.localhost"],pages:["*"],tabs:[qc],toggles:[{id:"demo-safe",label:"只读示例开关",desc:"🟢 只读类，任何时候都能勾。",risk:"safe",default:!0,group:"演示"},{id:"demo-trace",label:"留痕示例开关",desc:"🟠 会在站点留下访问记录，默认关闭。",risk:"trace",default:!0,group:"演示"},{id:"demo-irreversible",label:"不可逆示例开关",desc:"🔴 勾选后会弹二次确认（提交类操作的门禁演示）。",risk:"irreversible",default:!0,group:"演示"}],init(t){bn.info(`演示适配器已启用：isFeaturePage=${String(t.isFeaturePage)}`)}};var Io=h("uooc/settings"),L="uooc",U={RATE_2X:"rate-2x",MUTE:"mute",KEEP_PLAYING:"keep-playing",AUTO_NEXT:"auto-next",AUTO_PROGRESS:"auto-progress",AUTO_SOLVE:"auto-solve"},mt={NEXT_SCOPE:"nextScope",PROGRESS_MIN:"progressMin",PROGRESS_MAX:"progressMax"},Ft={min:"30",max:"90"},$s=[{id:U.RATE_2X,label:"二倍速",desc:"锁在 2 倍速，在播放器里改回去会被扳回",risk:"safe",default:!0,group:"视频"},{id:U.MUTE,label:"静音",desc:"锁在静音，取消会被扳回",risk:"safe",default:!0,group:"视频"},{id:U.KEEP_PLAYING,label:"防暂停",desc:"暂停会被立刻恢复（含你自己按的暂停）",risk:"safe",default:!0,group:"视频"},{id:U.AUTO_NEXT,label:"自动连播",desc:"播完自动打开目录里的下一个视频",risk:"trace",default:!1,group:"视频"},{id:U.AUTO_PROGRESS,label:"进度上报",desc:"按下面的随机间隔，替你把视频进度报给站点",risk:"irreversible",default:!1,group:"视频"},{id:U.AUTO_SOLVE,label:"自动作答",desc:"连播遇到没做过的测验时自动作答（还没实现，先占位）",risk:"irreversible",default:!1,group:"测验"}];function Ps(){Ct({siteId:L,id:mt.NEXT_SCOPE,label:"连播范围",desc:"连播到本章结束后",default:"chapter",kind:"select",options:[{value:"chapter",label:"止于本章"},{value:"all",label:"跨章继续"}]}),Ct({siteId:L,id:mt.PROGRESS_MIN,label:"上报间隔下限",desc:"秒。和下面的上限一起决定随机区间",default:Ft.min,kind:"number",validate:t=>hn(t,5,3600)}),Ct({siteId:L,id:mt.PROGRESS_MAX,label:"上报间隔上限",desc:"秒。改完立刻按新区间重新计时",default:Ft.max,kind:"number",validate:t=>hn(t,5,3600)})}function hn(t,e,n){let o=Number(t);return!Number.isFinite(o)||!Number.isInteger(o)?`要填整数秒（${e} ~ ${n}）`:o<e||o>n?`要填 ${e} ~ ${n} 之间的秒数`:null}function Ds(){let t=N(L,mt.NEXT_SCOPE);t!=="chapter"&&t!=="all"&&Io.warn(`连播范围取值异常（${t}），按「止于本章」处理`);let e=N(L,mt.PROGRESS_MIN),n=N(L,mt.PROGRESS_MAX);hn(e,5,3600)!==null&&Io.warn(`上报间隔下限取值异常（${e}），按 ${Ft.min} 秒处理`),hn(n,5,3600)!==null&&Io.warn(`上报间隔上限取值异常（${n}），按 ${Ft.max} 秒处理`)}var Jc=Ce("uooc"),Bs={id:Jc,title:"设置",order:200,mount(t,e){t.appendChild(ee("uooc",null,e))}};function Zc(){let e=globalThis.unsafeWindow;return e!==null&&typeof e=="object"?e:null}function Mo(){return Zc()??globalThis}function Hs(){try{let t=Mo().sessionStorage;if(t!==null&&typeof t=="object")return t}catch{}try{return typeof sessionStorage>"u"?null:sessionStorage}catch{return null}}var Ot=h("uooc/catalog"),Qc=10;var tu=60,eu=80,Gs=`[ng-click="goSource(source, 'section')"]`,Vs='[ng-click="toggleChapter(chapterItem)"]',Us='[ng-click="toggleChapter(sectionItem)"]',js='li[ng-repeat="chapterItem in chapterList"]',Lo='li[ng-repeat="sectionItem in chapterItem.children"]',nu=/^\d+$/;function ve(t){return typeof t=="object"&&t!==null}function yn(t){return t==null?"":String(t)}function Ks(t){let e=typeof t=="number"?t:Number(t);return Number.isFinite(e)?e:-1}function Fs(t){return t===!0||t===1||t==="1"||t==="true"}function Ro(t){return t instanceof HTMLElement?t:null}function Ao(t,e=document){let n=[];for(let o of e.querySelectorAll(t))o instanceof HTMLElement&&n.push(o);return n}function Ee(t,e){return Ro(e.querySelector(t))}function Ys(){let e=Mo().angular;return!ve(e)||typeof e.element!="function"?null:e}function _o(t){let e=Ys();if(e===null)return null;try{let n=e.element(t);if(n==null)return null;let o=n.scope();return ve(o)?o:null}catch{return null}}function we(t=location.hash){let n=(t.startsWith("#")?t.slice(1):t).split("/").filter(s=>s!==""),o=s=>{let a=n[s];return a!==void 0&&nu.test(a)?a:""},r=o(0);return r===""?null:{cid:r,chapterId:o(1),sectionId:o(2),resourceId:o(3)}}function zo(t){let n=_o(t)?.source;if(!ve(n))return null;let o=yn(n.id),r=Ks(n.type);if(o===""||r<0)return null;let s=Ks(n.video_pos);return{id:o,type:r,isTask:Fs(n.is_task),taskId:yn(n.task_id),title:yn(n.title),finished:Fs(n.finished),videoPos:s>0?s:0}}function ou(){return Ao(Gs)}function Xs(){return Ao(js)}function ru(t){return Ao(Lo,t)}function su(t){let e=Xs();for(let n of e)if(n.getAttribute("id")===t)return n;for(let n of e){let o=_o(n)?.chapterItem;if(ve(o)&&yn(o.id)===t)return n}return null}function iu(t,e){for(let n=0;n<t.length;n++)if(t[n]?.getAttribute("id")===e)return n;return-1}function Ws(){if(Ys()===null)return{kind:"stop",reason:"页面上没有 angular，读不到目录"};let t=we();if(t===null||t.chapterId==="")return{kind:"stop",reason:"当前不在学习页的资源路由上"};let e=su(t.chapterId);if(e===null)return{kind:"stop",reason:`目录里找不到章 ${t.chapterId}（目录可能还没加载完）`};let n=ru(e);if(t.sectionId===""){let l=n[0];if(l!==void 0){let f=Ee(Us,l);if(f!==null)return Ot.info("连播：进入下一章的第一节"),f.click(),{kind:"rendered"}}let u=Ee(Vs,e);return u===null?{kind:"stop",reason:`章 ${t.chapterId} 上没有可点的标题节点`}:(u.click(),{kind:"rendered"})}let o=iu(n,t.sectionId),r=o>=0?n[o]:void 0,s=ou(),a=s;if(r!==void 0){let l=s.filter(u=>u.closest(Lo)===r);l.length>0&&(a=l)}let c=-1;if(t.resourceId!==""){for(let l=0;l<a.length;l++){let u=zo(a[l]);if(u!==null&&u.id===t.resourceId){c=l;break}}c<0&&Ot.warn(`hash 里的资源 ${t.resourceId} 不在已渲染的目录里，从本节开头重新找`)}for(let l=c+1;l<a.length;l++){let u=a[l],f=zo(u);if(f===null)continue;if(f.type===Qc){if(f.finished||f.videoPos>0){Ot.info(`跳过已看过的视频 ${f.id}${f.title===""?"":`（${f.title}）`}`);continue}return Ot.info(`连播：打开下一个视频 ${f.id}${f.title===""?"":`（${f.title}）`}`),u.click(),{kind:"clicked",id:f.id,title:f.title}}if(f.type===eu){if(f.finished){Ot.info(`跳过已做过的测验 ${f.taskId}`);continue}return{kind:"quiz",taskId:f.taskId,title:f.title}}let E=f.type===tu?"文档":"附件";Ot.info(`跳过${E} ${f.id}${f.title===""?"":`（${f.title}）`}`)}if(r===void 0)return{kind:"stop",reason:`章 ${t.chapterId} 里找不到节 ${t.sectionId}`};if(o+1<n.length){let l=n[o+1],u=Ee(Us,l);return u===null?{kind:"stop",reason:"下一个节上没有可点的标题节点"}:(Ot.info(`连播：本节没有可播的资源，进入下一个节 ${l.getAttribute("id")??""}`),u.click(),{kind:"rendered"})}return{kind:"chapter-end"}}function qs(){let t=we();if(t===null)return!1;let e=Xs(),n=e.findIndex(s=>s.getAttribute("id")===t.chapterId);if(n<0||n+1>=e.length)return!1;let o=e[n+1],r=Ee(Vs,o);return r===null?!1:(Ot.info(`连播：跨到下一章 ${o.getAttribute("id")??""}`),r.click(),!0)}var au=15;function Js(){return Ee(`${Gs}.active`,document)}function Zs(t){let e=we();if(e===null)return null;let n=Ro(t.closest(js)),o=Ro(t.closest(Lo)),r=n?.getAttribute("id")??e.chapterId,s=o?.getAttribute("id")??e.sectionId,a=zo(t)?.id??e.resourceId;return r===""||s===""||a===""?null:{cid:e.cid,chapterId:r,sectionId:s,resourceId:a}}function Qs(t,e){let n=_o(t);for(let o=0;n!==null&&o<au;o+=1){for(let s of e){let a=n[s];if(typeof a=="function")return a}let r=n.$parent;n=ve(r)?r:null}return null}var Et=h("uooc/progress"),lu="/home/learn/markVideoLearn",cu=["LearnMark","learnMark","markVideoLearn"],uu=[["hidemsg_","true"],["network","2"],["source","1"],["subsection_id","0"]],ti=5,xn=3600,Me=null,No="",Re=null,Ie=0;function ei(t){return t instanceof Error?t.message:String(t)}function kn(t,e,n,o){let r=typeof t=="number"?t:Number.parseInt(String(t??""),10);return Number.isFinite(r)?Math.min(o,Math.max(n,Math.trunc(r))):e}function ni(){let t=kn(N(L,mt.PROGRESS_MIN),kn(Ft.min,30,ti,xn),ti,xn),e=kn(N(L,mt.PROGRESS_MAX),kn(Ft.max,90,t,xn),t,xn);return{min:t,max:e}}function du(){let{min:t,max:e}=ni(),n=e-t;return(t+Math.random()*n)*1e3}function pu(){let t=we(),e=t===null?"":`${t.cid}/${t.chapterId}/${t.sectionId}/${t.resourceId}`,n=k(L,U.AUTO_PROGRESS)?"1":"0",{min:o,max:r}=ni();return`${e}|${n}|${o}-${r}`}function oi(){Re!==null&&(clearTimeout(Re),Re=null)}function ri(){if(oi(),!k(L,U.AUTO_PROGRESS))return;let t=du();Re=setTimeout(mu,t),Et.debug(`进度上报：${Math.round(t/1e3)} 秒后再报一次`)}async function fu(t){let e=Js();if(e===null){Et.warn("进度上报：目录里找不到当前资源（`.active`），这次跳过");return}let n=Zs(e);if(n===null){Et.warn("进度上报：拿不到 课程/章/节/资源 id，这次跳过");return}let o={chapter_id:n.chapterId,cid:n.cid,resource_id:n.resourceId,section_id:n.sectionId,video_length:t.duration.toFixed(2),video_pos:t.currentTime.toFixed(2)};for(let[s,a]of uu)o[s]=a;let r=Qs(t,cu);if(r!==null)try{r(o),Ie+=1,Et.info(`进度上报（站点函数，第 ${Ie} 次）：${o.video_pos}s / ${o.video_length}s`);return}catch(s){Et.warn(`站点函数上报抛错（${ei(s)}），这次改走直连`)}try{let s=await ne({url:lu,method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},data:Ts(o),priority:Nt.NORMAL});if(Ie+=1,s.status<200||s.status>=300){Et.warn(`进度上报（直连）返回 ${s.status}（第 ${Ie} 次）：${s.text.slice(0,120)}`);return}Et.info(`进度上报（直连，第 ${Ie} 次）：${o.video_pos}s / ${o.video_length}s`)}catch(s){Et.warn(`进度上报（直连）请求失败：${ei(s)}`)}}function mu(){if(Re=null,!k(L,U.AUTO_PROGRESS))return;let t=Me;t!==null&&!t.paused&&!t.ended&&t.currentTime>0&&t.readyState>=2&&fu(t),ri()}function si(t){let e=pu();t===Me&&e===No||(t!==Me&&Et.debug("进度上报：扫到新的播放器，重新计时"),Me=t,No=e,ri())}function ii(){oi(),Me=null,No=""}var lt=h("uooc/video"),ai="player_html5_api",Ae=2,gu=200,bu=2e3,li=5e3,hu=8,ci=5e3,gi=8e3,yu=15e3,ui=new WeakMap,di=new WeakSet,Ne=new WeakSet;function Le(t){return t!==null&&t.tagName==="VIDEO"?t:null}function Po(t){let e=[],n=0;return()=>{let o=Date.now();if(o<n)return!1;for(;e.length>0&&o-e[0]>li;)e.shift();return e.length>=hu?(n=o+ci,e.length=0,lt.warn(`${t}在 ${li/1e3} 秒内被反复改回，暂停纠正 ${ci/1e3} 秒`),!1):(e.push(o),!0)}}var xu=Po("二倍速"),ku=Po("静音"),Tu=Po("防失焦"),pi=0,ze=null;function Cu(){let t=Le(document.getElementById(ai));if(t!==null)return t;let e=Le(document.querySelector("video"));if(e!==null)return e;if(ze!==null&&ze.isConnected)return ze;let n=Date.now();if(n-pi<bu)return null;pi=n,ze=null;for(let o of Array.from(document.querySelectorAll("iframe"))){let r=null;try{r=o.contentDocument}catch{continue}if(r===null)continue;let s=Le(r.getElementById(ai))??Le(r.querySelector("video"));if(s!==null)return ze=s,lt.debug("播放器在同源 iframe 内，已切换查找目标"),s}return null}var bi=0,ie=0,Tn=0,Oo=0,Gt=null,_e=0,fi=700,mi=40,hi=45e3;function $t(){Gt!==null&&(clearTimeout(Gt),Gt=null),Tn=0,Oo=0,_e=0}function $o(t){Gt!==null&&clearTimeout(Gt),Gt=setTimeout(Su,t)}function Su(){if(Gt=null,Tn===0)return;if(Oo>=mi){lt.warn(`连播放弃：已经走了 ${mi} 步还没找到可播的视频`),$t();return}if(Date.now()>Tn){lt.warn(`连播放弃：这一轮开了 ${Math.round(hi/1e3)} 秒还没找到可播的视频`),$t();return}Oo+=1;let t=Ws();switch(t.kind){case"clicked":bi=Date.now()+gi,ie=Date.now(),_e=Date.now(),$t();return;case"quiz":lt.info(`连播停在测验 ${t.taskId}${t.title===""?"":`（${t.title}）`}：没做过的测验不会自动跳过`),k(L,U.AUTO_SOLVE)&&lt.warn("「自动作答」只做了开关，功能还没实现，先停在这一题"),$t();return;case"rendered":$o(fi);return;case"chapter-end":if(N(L,mt.NEXT_SCOPE)!=="all"){lt.info("已到本章最后一个视频（连播范围＝止于本章），停在这里"),$t();return}if(qs()){$o(fi);return}lt.info("目录里后面没有视频了，连播结束"),$t();return;default:lt.warn(`连播中断：${t.reason}`),$t();return}}function yi(){k(L,U.AUTO_NEXT)&&(Date.now()<bi||($t(),Tn=Date.now()+hi,$o(0)))}function Eu(t){_e!==0&&(Date.now()-_e<gi+4e3||t.currentTime<=3||t.ended||!t.paused||Ne.has(t)||(lt.info(`落点停在 ${Math.round(t.currentTime)}s 一直没播起来，按「看过的视频」继续往后跳`),_e=0,yi()))}function vu(t){if(ie===0)return;if(Date.now()-ie>yu){ie=0;return}if(t.ended||!t.paused&&!t.ended){ie=0;return}if(t.readyState<2)return;ie=0,Ne.add(t);let e=t.play();e!==void 0&&typeof e.catch=="function"&&e.catch(n=>{lt.warn(`连播后自动播放被拒绝：${n instanceof Error?n.message:String(n)}`)})}function xi(t){let e=ui.get(t)??{rate:!1,mute:!1};!t.paused&&!t.ended&&Ne.add(t);let n=k(L,U.RATE_2X);if(n){if(t.playbackRate!==Ae)try{t.playbackRate=Ae,e.rate=!0}catch{}}else e.rate&&t.playbackRate===Ae&&(t.playbackRate=1,e.rate=!1);let o=k(L,U.MUTE);o?t.muted||(t.muted=!0,e.mute=!0):e.mute&&t.muted&&(t.muted=!1,e.mute=!1),ui.set(t,e),vu(t),Eu(t),si(t),di.has(t)||(di.add(t),lt.info(`播放器助手已就绪：二倍速=${n?"开":"关"}，静音=${o?"开":"关"}，防失焦=${k(L,U.KEEP_PLAYING)?"开":"关"}，自动连播=${k(L,U.AUTO_NEXT)?"开":"关"}，进度上报=${k(L,U.AUTO_PROGRESS)?"开":"关"}（当前速率 ${t.playbackRate}x）`))}function wu(t){if(!k(L,U.KEEP_PLAYING)||!Ne.has(t)||t.ended||t.readyState<2||!Tu())return;let e=t.play();e!==void 0&&typeof e.catch=="function"&&e.catch(n=>{lt.debug(`抢播被拒绝：${n instanceof Error?n.message:String(n)}`)})}function se(t){let e=Le(t.target);if(e!==null)switch(t.type){case"play":case"playing":Ne.add(e),xi(e);return;case"pause":wu(e);return;case"ended":yi();return;case"ratechange":if(k(L,U.RATE_2X)&&e.playbackRate!==Ae&&xu())try{e.playbackRate=Ae}catch{}return;case"volumechange":k(L,U.MUTE)&&!e.muted&&ku()&&(e.muted=!0);return;default:return}}var Iu=["play","playing","pause","ended","ratechange","volumechange"];function ki(){let t=null,e=!1,n=()=>{if(e)return;let a=Cu();a!==null&&xi(a)},o=()=>{e||t!==null||(t=window.setTimeout(()=>{t=null,n()},gu))};n();let r=new MutationObserver(o);r.observe(document.documentElement,{childList:!0,subtree:!0});let s=()=>n();return document.addEventListener("loadstart",s,!0),document.addEventListener("loadedmetadata",s,!0),document.addEventListener("play",se,!0),document.addEventListener("playing",se,!0),document.addEventListener("pause",se,!0),document.addEventListener("ratechange",se,!0),document.addEventListener("volumechange",se,!0),window.addEventListener("hashchange",o),window.addEventListener("popstate",o),lt.debug("视频助手已挂载（二倍速 / 静音 / 防失焦）"),()=>{e=!0,ii(),t!==null&&(window.clearTimeout(t),t=null),r.disconnect(),document.removeEventListener("loadstart",s,!0),document.removeEventListener("loadedmetadata",s,!0);for(let a of Iu)document.removeEventListener(a,se,!0);window.removeEventListener("hashchange",o),window.removeEventListener("popstate",o)}}var Ti=h("site/uooc"),Mu=["uooc.net.cn","*.uooc.net.cn"],Ru=["/home/learn/index*","/home/learn/new/*","/exam/*"],zu="/home/learn/",Ci={id:L,name:"UOOC 优课联盟",hosts:Mu,pages:Ru,tabs:[Bs],toggles:$s,earlyInit(){Ps()},init(t){Ds();let e=location.pathname.startsWith(zu);e?ki():Ti.debug(`非学习页（${location.pathname}），本次不启动视频助手`),Ti.info(`UOOC 适配器已启用：isFeaturePage=${String(t.isFeaturePage)}，路径=${location.pathname}，视频助手=${e?"已挂载":"未挂载"}`)}};var Lu=h("bkxk/settings"),S="bkxk",M={WRITE_API:"write-api",HIJACK_TIMETABLE:"hijack-timetable",HIJACK_LIST_CONFLICT:"hijack-list-conflict",LIST_INJECT:"list-inject",CUSTOM_COURSES:"custom-courses"},X={INTERVAL_MS:"intervalMs",RETRY_INTERVAL_MS:"retryIntervalMs",POLL_INTERVAL_MS:"pollIntervalMs",BATCH_CODE:"batchCode",MONITOR_MODE:"monitorMode",RETRY_MODE:"retryMode"},Au=["monitorCategory"],Si=[{id:M.WRITE_API,label:"写接口总开关（抢课）",desc:"开启后才会真正提交选课请求。这类操作不可撤销，且会在学校系统留痕。默认关闭；打开时需要二次确认。",risk:"irreversible",default:!1,group:"选课"},{id:M.HIJACK_TIMETABLE,label:"课表注入",desc:"把自定义课程合并进 teachingTime.do 的响应，让站点自己把它画进课表。需要拦截页面请求，会改变站点看到的返回内容。默认开启。",risk:"trace",default:!0,group:"课表"},{id:M.HIJACK_LIST_CONFLICT,label:"列表冲突追加",desc:"在站点自己算好的 isConflict 之上，追加上自定义课程造成的冲突。只追加、不清除站点原值。需要拦截页面请求，会改变站点看到的返回内容。默认开启。",risk:"trace",default:!0,group:"选课列表"},{id:M.LIST_INJECT,label:"列表注入（教学班ID / 抢课按钮）",desc:"在选课列表的每个教学班旁补上教学班ID 与「添加抢课 / 添加监控」两个按钮。点击只写本地队列，不发送任何请求。关掉后已注入的块会立即移除。",risk:"safe",default:!0,group:"选课列表"},{id:M.CUSTOM_COURSES,label:"自定义课程",desc:"本地维护一份不属于培养方案、但你想让它出现在课表上的课程。",risk:"safe",default:!0,group:"课表"}];function Ei(){for(let t of Au)as(S,t);Do(X.INTERVAL_MS,"intervalMs","请求间隔（毫秒）","全局串行队列里相邻两条请求的最小间隔。"),Do(X.RETRY_INTERVAL_MS,"retryIntervalMs","抢课重试间隔（毫秒）","一轮抢课跑完等多久再开下一轮。"),Do(X.POLL_INTERVAL_MS,"pollIntervalMs","监控轮询间隔（毫秒）","监控模式下一轮查容量到下一轮的间隔。"),Ct({siteId:S,id:X.BATCH_CODE,label:"选课批次码",desc:"留空则自动从页面会话里读取（studentInfo.electiveBatch.code）。手动填用于会话里读不到的场景。",default:"",kind:"text"}),Ct({siteId:S,id:X.MONITOR_MODE,label:"监控模式",desc:"决定监控怎么拿数据。类别监控请求少、粒度粗；单独监控逐课查容量、更精确但请求多。",default:"category",kind:"select",options:[{value:"category",label:"类别监控（拉类别列表，一次拿一类）"},{value:"single",label:"单独监控（逐课查容量，精确）"}]}),Ct({siteId:S,id:X.RETRY_MODE,label:"重试策略",desc:"抢课任务失败之后怎么处理。",default:"smart",kind:"select",options:[{value:"smart",label:"智能 —— 只对可能成功的失败重试"},{value:"never",label:"失败即停 —— 不重试"},{value:"always",label:"持续重试 —— 失败一律重试"}]})}function Do(t,e,n,o){let r=_t[e];Ct({siteId:S,id:t,label:n,desc:`${o}建议不低于 ${r.recommended}ms。`,default:String(r.def),kind:"number",validate:s=>{let a=yt(e,s);return Te(e,a)?`低于建议下限 ${r.recommended}ms。校园站对高频请求零容忍，实测会被直接终止会话 —— 请自行确认风险。`:null},...e==="intervalMs"?{apply:_u}:{}})}function _u(t){So(yt("intervalMs",t))}function vi(){let t=N(S,X.INTERVAL_MS),e=yt("intervalMs",t);Te("intervalMs",e)&&Lu.warn(`请求间隔被设为 ${e}ms，低于建议下限 ${_t.intervalMs.recommended}ms`),So(e)}var wi=h("bkxk/session"),Oe="01",Ii={studentCode:"",batchCode:null,campus:Oe,token:"",loggedIn:!1};function Nu(t){if(t===null||t==="")return null;let e;try{e=JSON.parse(t)}catch{return null}if(e===null||typeof e!="object"||Array.isArray(e))return null;let n=e,o=typeof n.code=="string"?n.code:n.code!==void 0&&n.code!==null?String(n.code):"",r=null,s=n.electiveBatch;if(s!==null&&typeof s=="object"&&!Array.isArray(s)){let a=s.code;a!=null&&String(a)!==""&&(r=String(a))}if(r===null){let a=n.electiveBatchCode;a!=null&&String(a)!==""&&(r=String(a))}return{studentCode:o,batchCode:r,data:e}}function Ou(t){if(t===null||t==="")return Oe;try{let e=JSON.parse(t);if(e!==null&&typeof e=="object"&&!Array.isArray(e)){let n=e.code;if(n!=null&&String(n)!=="")return String(n)}}catch{}return Oe}function $u(t){let e=Nu(t.studentInfo),n=e?.studentCode??"",o=t.token??"";return{studentCode:n,batchCode:e?.batchCode??null,campus:Ou(t.campus),token:o,loggedIn:n!==""&&o!==""}}function Cn(){let t=Hs();if(t===null)return wi.warn("读不到 sessionStorage，按未登录处理"),Ii;try{return $u({studentInfo:t.getItem("studentInfo"),campus:t.getItem("currentCampus"),token:t.getItem("token")})}catch(e){return wi.warn("读取会话失败，按未登录处理",e),Ii}}function Mi(t){return t.loggedIn?`已登录（学号 ****${t.studentCode.length>4?t.studentCode.slice(-4):t.studentCode}，批次 ${t.batchCode??"未知"}，校区 ${t.campus}）`:"未登录（学号或 token 缺失）"}var vt="custom:courses",zi="bkxk:customCourses",Ri=["#e8f2fd","#fdf0e8","#e8fdf0","#f2e8fd","#fdfde8","#fde8f0"];function Pu(t){let e=Ri.length,n=Number.isFinite(t)?Math.floor(t):0,o=Ri[(n%e+e)%e];return o===void 0?"#e8f2fd":o}function Du(t){return t===null||typeof t!="object"||Array.isArray(t)?null:t}function $e(t){return typeof t=="string"?t:""}function Bu(t){let e=Du(t);if(e===null)return null;let n=$e(e.name).trim();if(n==="")return null;let o=$e(e.id);return o===""?null:{id:o,name:n,teacher:$e(e.teacher),place:$e(e.place),color:$e(e.color),enabled:e.enabled!==!1}}function Pe(t){if(!Array.isArray(t))return[];let e=[];for(let n of t){let o=Bu(n);o!==null&&e.push(o)}return e}function Sn(){return Pe(G(vt,[]))}function Bo(t){return t.filter(e=>e.enabled)}function Li(t,e){let n=Number.isFinite(t)?Math.floor(t):0,o=Number.isFinite(e)?Math.floor(Math.abs(e)*1e3)%1e3:0;return`c${String(n)}-${String(o).padStart(3,"0")}`}function Ai(t,e,n){let o={id:n,name:e.name.trim(),teacher:e.teacher.trim(),place:e.place.trim(),color:Pu(t.length),enabled:!0};return[...t,o]}function _i(t,e,n){return t.map(o=>o.id===e?{...o,name:n.name.trim(),teacher:n.teacher.trim(),place:n.place.trim()}:o)}function Ni(t,e){return t.filter(n=>n.id!==e)}function Oi(t,e,n){return t.map(o=>o.id===e?{...o,enabled:n}:o)}function $i(t){H(vt,t)}var Vt=h("bkxk/legacy"),Hu="szubkxk.settings.v2",Ho="szubkxk.v2.",Uo={CUSTOM_COURSES:"customCourses",MONITOR:"monitor",TASKS:"tasks"},Pt={MONITOR:"bkxk:monitor",TASKS:"bkxk:tasks"},Bi=zi,Ko="migrate:bkxk:v2",Pi="migrate:bkxk:custom-to-common",Uu=[{from:"intervalMs",to:"intervalMs",kind:"number"},{from:"retryIntervalMs",to:"retryIntervalMs",kind:"number"},{from:"pollIntervalMs",to:"pollIntervalMs",kind:"number"},{from:"batchCode",to:"batchCode",kind:"text"},{from:"monitorMode",to:"monitorMode",kind:"text"},{from:"retryMode",to:"retryMode",kind:"text"}],Ku=[{from:"writeApiEnabled",to:M.WRITE_API,label:"写接口总开关（🔴）"},{from:"hijackTimetable",to:M.HIJACK_TIMETABLE,label:"课表注入（🟠）"},{from:"hijackListConflict",to:M.HIJACK_LIST_CONFLICT,label:"列表冲突追加（🟠）"}];function Fo(t){if(t===null||t==="")return null;try{return JSON.parse(t)}catch{return null}}function Di(t){return t===null||typeof t!="object"||Array.isArray(t)?null:t}function Fu(t,e){let n=[],o=[];if(e)return{entries:[],report:["旧数据已迁移过，本次跳过。"],notices:[],empty:!0};let r=[],s=Di(Fo(t.settings));if(s===null&&t.settings!==null&&o.push("旧设置 `szubkxk.settings.v2` 无法解析，已跳过。"),s!==null){for(let l of Uu){let u=s[l.from];if(u!=null){if(l.kind==="number"){let f=typeof u=="number"?u:Number(u);if(!Number.isFinite(f)||f<=0){o.push(`旧设置 ${l.from} 的值 ${String(u)} 不是有效正数，未迁移。`);continue}r.push({key:`value:bkxk:${l.to}`,value:String(Math.floor(f))})}else{let f=String(u);if(f==="")continue;r.push({key:`value:bkxk:${l.to}`,value:f})}n.push(`设置 ${l.from} → ${l.to}`)}}for(let l of Ku)s[l.from]===!0&&o.push(`旧版曾开启「${l.label}」。按风险门禁约定**不会**自动为你打开，如需继续使用请在设置页手动勾选一次。`)}let a=Fo(t.customCourses);if(a!==null)if(Array.isArray(a)){let l=Pe(a),u=a.length-l.length;r.push({key:vt,value:l}),n.push(`自定义课程 ${l.length} 门 → ${vt}`),u>0&&o.push(`有 ${u} 条自定义课程缺少 name / id，已丢弃。`)}else o.push("旧自定义课程不是数组，已跳过。");let c=[{raw:t.monitor,newKey:Pt.MONITOR,label:"监控进度"},{raw:t.tasks,newKey:Pt.TASKS,label:"任务进度"}];for(let l of c){let u=Fo(l.raw);if(u!==null){if(Di(u)===null){o.push(`旧${l.label}不是对象，已跳过。`);continue}r.push({key:l.newKey,value:u}),n.push(l.label)}}return r.length===0&&n.push("旧数据里没有可迁移的内容。"),{entries:r,report:n,notices:o,empty:r.length===0}}function Gu(t,e){let n=Array.isArray(t)?t.length:0,o=Pe(t);if(o.length===0)return{entries:[],report:[],notices:[],empty:!0};let r=[];n>o.length&&r.push(`站点键里有 ${n-o.length} 条自定义课程缺少 name / id，搬运时丢弃。`);let s=Pe(e);return s.length>0?(r.push(`通用键 ${vt} 里已有 ${s.length} 门自定义课程，站点键里的 ${o.length} 门**未搬运**（避免覆盖）。如需保留，请自行导出后合并。`),{entries:[],report:[],notices:r,empty:!0}):{entries:[{key:vt,value:o}],report:[`自定义课程 ${o.length} 门：${Bi} → ${vt}`],notices:r,empty:!1}}function Hi(){if(G(Pi,!1))return[];let t=G(Bi,null),e=G(vt,[]),n=Gu(t,e);if(H(Pi,!0),n.empty){for(let o of n.notices)Vt.warn(`搬运 · ${o}`);return[]}for(let o of n.entries)H(o.key,o.value);Vt.info(`自定义课程搬运完成：${n.report.join("；")}`);for(let o of n.notices)Vt.warn(`搬运 · ${o}`);return[...n.report,...n.notices]}function Vu(){let t=(()=>{try{let o=globalThis.unsafeWindow?.localStorage;return o!==void 0?o:globalThis.localStorage??null}catch{return null}})();if(t===null)return{settings:null,customCourses:null,monitor:null,tasks:null};let e=n=>{try{return t.getItem(n)}catch{return null}};return{settings:e(Hu),customCourses:e(Ho+Uo.CUSTOM_COURSES),monitor:e(Ho+Uo.MONITOR),tasks:e(Ho+Uo.TASKS)}}function Ui(){if(G(Ko,!1))return[];let t=Vu(),e=Fu(t,!1),n=[];if(e.empty&&e.notices.length===0)return H(Ko,!0),Vt.info("未发现旧版数据，跳过迁移"),[];for(let o of e.entries)H(o.key,o.value);H(Ko,!0),n.push(...e.report,...e.notices),Vt.info(`旧数据迁移完成：写入 ${e.entries.length} 项`);for(let o of e.report)Vt.info(`迁移 · ${o}`);for(let o of e.notices)Vt.warn(`迁移 · ${o}`);return n}var ju={一:1,二:2,三:3,四:4,五:5,六:6,日:7,天:7},De=["","星期一","星期二","星期三","星期四","星期五","星期六","星期日"],En=18,Yu=/(\d+)(?:\s*-\s*(\d+))?\s*周\s*(?:[（(]\s*(单|双)\s*[)）])?/,Xu=/星期\s*([一二三四五六日天])/,Wu=/(\d+)(?:\s*-\s*(\d+))?\s*节/;function Fi(t,e){return e===null?!0:e==="单"?t%2===1:t%2===0}function qu(t){if(typeof t!="string"||t==="")return null;let e=Yu.exec(t);if(e===null)return null;let n=Number(e[1]),o=e[2]===void 0?n:Number(e[2]);if(!Number.isFinite(n)||!Number.isFinite(o)||n<1||n>o)return null;let r=e[3];return{weekFrom:n,weekTo:o,parity:r==="单"||r==="双"?r:null}}function Ju(t){if(typeof t!="string")return null;let e=t.trim();if(e==="")return null;let n=qu(e);if(n===null)return null;let o=Wu.exec(e);if(o===null)return null;let r=Number(o[1]),s=o[2]===void 0?r:Number(o[2]);if(!Number.isFinite(r)||!Number.isFinite(s))return null;let a=Xu.exec(e),c=a===null?null:ju[a[1]??""]??null;return{weekFrom:n.weekFrom,weekTo:n.weekTo,parity:n.parity,day:c,sectionFrom:r,sectionTo:Math.max(r,s),place:e.slice(o.index+o[0].length).trim(),raw:t}}function wt(t){if(typeof t!="string"||t.trim()==="")return[];let e=[];for(let n of t.split(/[,，]/)){let o=Ju(n);o!==null&&e.push(o)}return e}function Ki(t,e){return!Number.isFinite(e)||e<t.weekFrom||e>t.weekTo?!1:Fi(e,t.parity)}function Zu(t,e){return t.sectionFrom<=e.sectionTo&&e.sectionFrom<=t.sectionTo}function Qu(t,e){if(t.day===null||e.day===null||t.day!==e.day||!Zu(t,e))return!1;let n=Math.max(t.weekFrom,e.weekFrom),o=Math.min(t.weekTo,e.weekTo);for(let r=n;r<=o;r+=1)if(Ki(t,r)&&Ki(e,r))return!0;return!1}function vn(t,e){let n=wt(t),o=wt(e);if(n.length===0||o.length===0)return!1;for(let r of n)for(let s of o)if(Qu(r,s))return!0;return!1}function Gi(t,e,n,o=En){let r=Number.isFinite(o)&&o>0?Math.floor(o):En,s="";for(let a=1;a<=r;a+=1)s+=a>=t&&a<=e&&Fi(a,n)?"1":"0";return s}function Go(t){let e=t.weekFrom===t.weekTo?`${t.weekFrom}周`:`${t.weekFrom}-${t.weekTo}周`;return t.parity===null?e:`${e}(${t.parity})`}function td(t){return t.sectionFrom===t.sectionTo?`${t.sectionFrom}节`:`${t.sectionFrom}-${t.sectionTo}节`}function Vi(t){let e=[Go(t)],n=t.day===null?"":De[t.day]??"";n!==""&&e.push(n),e.push(td(t));let o=t.place.trim();return o!==""&&e.push(o),e.join(" ")}function ji(t){let e=0;for(let n of t)n.length>e&&(e=n.length);return e}function ed(t){return t.map(e=>({...e,segs:wt(e.place)}))}function ae(){return k(S,M.CUSTOM_COURSES)?ed(Bo(Sn())):[]}function Yi(t){let e=Bo(t),n=0;for(let o=0;o<e.length;o+=1){let r=e[o];if(r!==void 0)for(let s=o+1;s<e.length;s+=1){let a=e[s];a!==void 0&&vn(r.place,a.place)&&(n+=1)}}return n}var nd="sztb-bkxk-tt-tag",Xi="data-sztb-tt";var Wi=`[${Xi}]`,od=`<span class="${nd}" ${Xi}="1">自定义</span>`;function wn(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function qi(t){return`${wn(t)}${od}`}function Be(){return typeof unsafeWindow<"u"?unsafeWindow:globalThis}function Ji(){let t=Be();return t===null||typeof t!="object"&&typeof t!="function"?{}:t}var In=h("bkxk/hijack"),rd="szu-custom-",sd=/elective\/(?:programCourse|unProgramCourse|publicCourse|recommendedCourse|queryCourse|course|minorCourse|retakeCourse|sportCourse)\.do/i,id=/elective\/teachingTime\.do/i;function Zi(t){return typeof t!="string"||t===""?null:id.test(t)?"timetable":sd.test(t)?"list":null}function Mn(t){return k(S,t==="timetable"?M.HIJACK_TIMETABLE:M.HIJACK_LIST_CONFLICT)}function le(t){return t===null||typeof t!="object"||Array.isArray(t)?null:t}function Vo(t){return Array.isArray(t)?t:null}function ad(t){let e=Number(t);return Number.isFinite(e)?e:0}function ld(t,e){if(typeof t!="string"||t==="")return[];let n=[];for(let o of e)o.enabled&&vn(t,o.place)&&n.push(o);return n}function cd(t){return t.map(e=>`自定义课程：${e.name}(${e.place})`).join("；")}function ud(t,e){let n=le(t);if(n===null)return{json:t,changed:0};let o=Vo(n.dataList);if(o===null)return{json:t,changed:0};let r=Math.max(En,ji(dd(o))),s=0;for(let a of e)if(a.enabled)for(let c=0;c<a.segs.length;c++){let l=a.segs[c];l===void 0||l.day===null||(o.push(pd(a,l,c,r)),s++)}return s>0&&(n.totalCount=ad(n.totalCount)+s),{json:t,changed:s}}function dd(t){let e=[];for(let n of t){let o=le(n);if(o===null)continue;let r=o.week;typeof r=="string"&&r!==""&&e.push(r)}return e}function pd(t,e,n,o){return{dayOfWeekName:e.day===null?"":De[e.day]??"",teachingClassID:`${rd}${t.id}-${n}`,courseNumber:"",studentCode:"",courseName:qi(t.name),courseIndex:"",teacherName:wn(t.teacher),teachingPlace:wn(e.place),sportCode:null,timeType:"1",sportName:null,studyMode:"01",weekName:Go(e),beginSection:String(e.sectionFrom),endSection:String(e.sectionTo),week:Gi(e.weekFrom,e.weekTo,e.parity,o),dayOfWeek:e.day===null?"":String(e.day),wid:null,szuCustom:!0}}function fd(t,e){let n=le(t);if(n===null)return{json:t,changed:0};let o=Vo(n.dataList);if(o===null)return{json:t,changed:0};let r=0;for(let s of o){let a=le(s);if(a===null)continue;let c=Vo(a.tcList),l=c===null?[a]:c.map(le).filter(md);for(let u of l){let f=u.teachingPlace;if(typeof f!="string"||f==="")continue;let E=ld(f,e);if(E.length===0)continue;let O=cd(E),C=u.conflictDesc;u.isConflict="1",u.conflictDesc=typeof C=="string"&&C!==""?`${C}；${O}`:O,u.szuCustomConflict=!0,r++}}return{json:t,changed:r}}function md(t){return t!==null}function gd(t,e,n){if(e===""||n.length===0)return null;let o;try{o=JSON.parse(e)}catch{return null}let r=le(o);if(r===null||String(r.code)!=="1")return null;let s=t==="timetable"?ud(r,n):fd(r,n);return s.changed===0?null:(In.info(`[接管] ${t} 改写了 ${s.changed} 处`),JSON.stringify(s.json))}function Qi(t,e){if(!Mn(t))return null;let n=gd(t,e,ae());return n!==null&&t==="timetable"&&(ta=!0),n}var ta=!1;function ea(){return ta}function bd(t){let e=Zi(typeof t.responseURL=="string"?t.responseURL:null);if(e===null)return!1;let n=typeof t.responseType=="string"?t.responseType:"";if(n!==""&&n!=="text"&&n!=="json")return!1;let o;try{o=typeof t.responseText=="string"?t.responseText:""}catch{return!1}if(o==="")return!1;let r=Qi(e,o);if(r===null)return!1;try{Object.defineProperty(t,"responseText",{configurable:!0,get:()=>r}),n==="json"&&Object.defineProperty(t,"response",{configurable:!0,get:()=>JSON.parse(r)})}catch{return In.warn("接管响应失败（无法改写 responseText）"),!1}return!0}function hd(t){function e(){let n=new t;return n.addEventListener("readystatechange",()=>{n.readyState===4&&bd(n)}),n}return e.prototype=t.prototype,e}function yd(t=Be()){let e=t;if(e.__szuXhrInstalled===!0)return!1;let n=e.XMLHttpRequest;return typeof n!="function"?!1:(e.XMLHttpRequest=hd(n),e.__szuXhrInstalled=!0,!0)}function xd(t=Be()){let e=t;if(e.__szuFetchInstalled===!0)return!1;let n=e.fetch;if(typeof n!="function")return!1;let o=e.Response,r=(s,a)=>{let c=n(s,a);if(a!=null&&a.__szuSkip===!0)return c;let l=typeof s=="string"?s:s?.url??"",u=Zi(l);return u===null?c:c.then(async f=>{let E=await f.text(),O=Qi(u,E);if(O===null)return f;if(typeof o!="function")return In.warn("接管响应失败（环境里没有 Response 构造器）"),f;let C=o;return new C(O,{status:f.status,statusText:f.statusText,headers:f.headers})})};return e.fetch=r,e.__szuFetchInstalled=!0,!0}function na(t=Be()){let e=yd(t),n=xd(t);return(e||n)&&In.info(`响应接管已安装（XHR=${String(e)} fetch=${String(n)}）`),e||n}var jo="sztb-bkxk-list-style",oa=`
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
`;function ce(){let t=Cn(),e=N(S,X.BATCH_CODE),n=typeof e=="string"?e.trim():"";return{studentCode:t.studentCode,batchCode:t.batchCode===null||t.batchCode===""?n:t.batchCode,campus:t.campus,token:t.token,loggedIn:t.loggedIn}}function ue(){return typeof location>"u"?"":location.origin}var ra=h("bkxk/api"),kd="/xsxkapp/sys/xsxkapp/",dt={PROGRAM_COURSE:"elective/programCourse.do",PUBLIC_COURSE:"elective/publicCourse.do",RECOMMENDED_COURSE:"elective/recommendedCourse.do",QUERY_COURSE:"elective/queryCourse.do",COURSE_RESULT:"elective/courseResult.do",CAPACITY:"elective/teachingclass/capacity.do",TEACHING_TIME:"elective/teachingTime.do",NO_ARRANGED:"elective/noArranged.do",VOLUNTEER:"elective/volunteer.do"};var Rn={FANKC:"方案内",FAWKC:"方案外",TJKC:"本班",XGXK:"校公选",CXKC:"重修",TYKC:"体育",FXKC:"辅修",MOOC:"慕课"},sa={FANKC:dt.PROGRAM_COURSE,FAWKC:dt.PROGRAM_COURSE,TJKC:dt.RECOMMENDED_COURSE,XGXK:dt.PUBLIC_COURSE,CXKC:dt.PROGRAM_COURSE,TYKC:dt.PROGRAM_COURSE,FXKC:dt.PROGRAM_COURSE,MOOC:dt.PUBLIC_COURSE},$={OK:"ok",BUSINESS:"business",UNAUTHENTICATED:"unauthenticated",UNKNOWN:"unknown"},Yo={SUCCESS:"1",BUSINESS_ERROR:"2",UNAUTHENTICATED:"302"},Td=/登录|认证/,Cd=2e4;function Sd(t){return t===401||t===403}function Ed(t){let e={kind:$.UNKNOWN,code:null,msg:"",data:null,json:null};if(Sd(t.status))return{...e,kind:$.UNAUTHENTICATED,msg:`HTTP ${t.status}`};let n=null;try{n=JSON.parse(t.text)}catch{return{...e,kind:$.UNKNOWN,msg:"响应不是 JSON"}}if(n===null||typeof n!="object"||Array.isArray(n))return{...e,kind:$.UNKNOWN,msg:"JSON 顶层不是对象"};let o=n,r=o.code,s=r==null?null:String(r),a=o.msg===void 0||o.msg===null?"":String(o.msg),c;return s===Yo.SUCCESS?c=$.OK:s===Yo.BUSINESS_ERROR?c=$.BUSINESS:s===Yo.UNAUTHENTICATED||Td.test(a)?c=$.UNAUTHENTICATED:c=$.UNKNOWN,{kind:c,code:s,msg:a,data:o.data===void 0?null:o.data,json:n}}function jt(t,e){return`${e}${kd}${t}`}function vd(t,e){let n=typeof e=="number"?e:Date.now();return`${t}${t.includes("?")?"&":"?"}timestamp=${n}`}function wd(t){let e=[];for(let[n,o]of Object.entries(t))e.push(`${encodeURIComponent(n)}=${encodeURIComponent(o==null?"":String(o))}`);return e.join("&")}function zn(t){let e={data:{operationType:"1",studentCode:String(t.studentCode),electiveBatchCode:String(t.electiveBatchCode),teachingClassId:String(t.teachingClassId),isMajor:t.isMajor===void 0||t.isMajor===null?"1":String(t.isMajor),campus:t.campus===void 0||t.campus===null?"01":String(t.campus),teachingClassType:String(t.teachingClassType)}};return`addParam=${encodeURIComponent(JSON.stringify(e))}`}function ia(t,e){return wd({teachingClassId:t,batchCode:e})}function aa(t){let e={data:{studentCode:String(t.studentCode),campus:t.campus===void 0||t.campus===null?"01":String(t.campus),electiveBatchCode:String(t.electiveBatchCode),isMajor:t.isMajor===void 0||t.isMajor===null?"1":String(t.isMajor),teachingClassType:String(t.teachingClassType),checkConflict:"2",checkCapacity:"2",queryContent:t.queryContent===void 0?"YCJX:2,MOOC:2,":String(t.queryContent)},pageSize:String(t.pageSize===void 0?10:t.pageSize),pageNumber:String(t.pageNumber===void 0?0:t.pageNumber),order:t.order===void 0?"":String(t.order),orderBy:t.orderBy===void 0?"courseNumber":String(t.orderBy)};return`querySetting=${encodeURIComponent(JSON.stringify(e))}`}function Id(t){return{token:String(t),"X-Requested-With":"XMLHttpRequest"}}function la(t){if(t===null||typeof t!="object")return null;let e=t;if(e.mainClassCapacity===void 0||e.mainClassCapacity===null||e.mainElectiveNumber===void 0||e.mainElectiveNumber===null)return null;let n=Number(e.mainClassCapacity),o=Number(e.mainElectiveNumber);return!Number.isFinite(n)||!Number.isFinite(o)?null:n-o}function ca(t){let e=null,n={},o=Cd;function r(s,a){if(o<=0||a>6||s===null||typeof s!="object")return;if(Array.isArray(s)){for(let u of s)r(u,a+1);return}o-=1;let c=s,l=c.electiveBatchCode;typeof l=="string"&&l!==""&&(n[l]=(n[l]??0)+1,e===null&&(e=l));for(let u of Object.values(c))r(u,a+1)}return r(t,0),{batchCode:e,counts:n}}function Md(t){let e=t.text??"",n=`
──────── [未识别返回] ────────
action: ${t.action}
url: ${t.url}
body: ${t.body??""}
code: ${t.code??""} | msg: ${t.msg}
长度: ${e.length} 字符
原文:
${e}
──────────────────────────────
`;return ra.error(`未识别返回（已全量落档） code=${t.code??""}${t.msg!==""?` msg=${t.msg}`:""}`),console.log(`%c${n}`,"color:#c00"),n}async function Yt(t){let e=t.token??"",n=t.extraHeaders??{},o=e!==""?{...Id(e),...n}:{...n};t.body!==void 0&&(o["Content-Type"]="application/x-www-form-urlencoded");let r=t.timestamp===!0?vd(t.url):t.url;ra.info(`[请求] ${t.action} ${t.url}`);let s=await ne({url:r,method:t.method??"POST",headers:o,...t.body!==void 0?{data:t.body}:{},...t.priority!==void 0?{priority:t.priority}:{}}),a=Ed({status:s.status,text:s.text});return a.kind===$.UNKNOWN&&Md({action:t.action,url:r,body:t.body??"",text:s.text,code:a.code,msg:a.msg}),{status:s.status,text:s.text,cls:a,raw:s}}var He=h("bkxk/courses");function _n(t){return t===null||typeof t!="object"||Array.isArray(t)?{}:t}function Rd(...t){for(let e of t)if(e!=null&&!(typeof e=="string"&&e===""))return e;return null}function xt(...t){let e=Rd(...t);return e===null?"":typeof e=="string"?e:String(e)}function zd(t){if(typeof t=="number")return Number.isFinite(t)?t:null;if(typeof t=="string"){if(t.trim()==="")return null;let e=Number(t);return Number.isFinite(e)?e:null}return null}function Ld(t){if(typeof t=="boolean")return t;if(typeof t=="number")return t===1?!0:t===0?!1:null;if(typeof t=="string"){if(t==="1"||t==="true")return!0;if(t==="0"||t==="false")return!1}return null}function Ln(...t){for(let e of t){let n=zd(e);if(n!==null)return n}return null}function An(...t){for(let e of t){let n=Ld(e);if(n!==null)return n}return null}function ua(t,e){let n=_n(t),o=_n(e);return{teachingClassID:xt(n.teachingClassID,o.teachingClassID),courseNumber:xt(n.courseNumber,o.courseNumber),courseName:xt(n.courseName,o.courseName),teacherName:xt(n.teacherName,o.teacherName),teachingPlace:xt(n.teachingPlace,o.teachingPlace),courseTotalNumber:Ln(n.courseTotalNumber,o.courseTotalNumber),classCapacity:Ln(n.classCapacity,o.classCapacity),numberOfFirstVolunteer:Ln(n.numberOfFirstVolunteer,o.numberOfFirstVolunteer),courseIndex:xt(n.courseIndex,o.courseIndex),isMooc:An(n.isMooc,o.isMooc),isFull:An(n.isFull,o.isFull),isConflict:An(n.isConflict,o.isConflict),isFavorite:An(n.isFavorite,o.isFavorite),typeName:xt(n.typeName,o.typeName),courseNatureName:xt(n.courseNatureName,o.courseNatureName),departmentName:xt(n.departmentName,o.departmentName),credit:Ln(n.credit,o.credit),campus:xt(n.campus,o.campus)}}function Ad(t){let n=_n(t).tcList;return Array.isArray(n)?n.map(o=>ua(o,t)):[ua(t,t)]}function _d(t){let e=_n(t).dataList;return Array.isArray(e)?e:null}function Nd(t){let e=_d(t);if(e===null)return He.warn("列表响应里没有顶层 dataList，返回空列表（站点改版？端点形态变了？）"),[];let n=[];for(let o of e)n.push(...Ad(o));return He.info(`列表响应 ${e.length} 项 → ${n.length} 个教学班`),n}function da(t){return t.classCapacity===null||t.numberOfFirstVolunteer===null?null:t.classCapacity-t.numberOfFirstVolunteer}function Od(){return typeof location<"u"&&typeof location.origin=="string"?location.origin:""}async function pa(t){let e=u=>({ok:!1,kind:$.UNKNOWN,code:null,msg:u,classes:[],batchCode:null,status:0,raw:null}),n=t.origin??Od();if(n==="")return He.warn("取不到 origin，放弃拉取课程列表"),e("取不到 origin");if(t.studentCode==="")return He.warn("会话里没有学号，放弃拉取课程列表"),e("缺少学号");if(t.batchCode===null||t.batchCode==="")return He.warn("没有选课批次码，放弃拉取课程列表"),e("缺少选课批次码");let o=jt(sa[t.category],n),r=aa({studentCode:t.studentCode,electiveBatchCode:t.batchCode,teachingClassType:t.category,campus:t.campus??Oe,...t.pageSize===void 0?{}:{pageSize:t.pageSize},...t.pageNumber===void 0?{}:{pageNumber:t.pageNumber}}),a=await(t.send??Yt)({url:o,action:`列表:${t.category}`,body:r,token:t.token??""}),c={code:a.cls.code,msg:a.cls.msg,batchCode:null,status:a.status,raw:a};if(a.cls.kind!==$.OK)return{ok:!1,kind:a.cls.kind,classes:[],...c};let l=Nd(a.cls.json);return{ok:!0,kind:a.cls.kind,classes:l,...c,batchCode:ca(a.cls.json).batchCode}}var $d=/^\d{15,24}$/;function Xo(t){return typeof t=="string"&&$d.test(t)}function It(t){return t==null?"":t.replace(/\s+/g," ").replace(/^[·\s]+/,"").trim()}function ma(t){for(let e of t)if(Xo(e))return e;return null}var Pd={programBody:"FANKC",unProgramBody:"FAWKC",recommendBody:"TJKC",publicBody:"XGXK",retakeBody:"CXKC",sportBody:"TYKC",minorBody:"FXKC",moocBody:"MOOC",schoolBody:"XGXK"};function ga(t){if(t==null)return"";let e=Pd[t];return e===void 0?"":e}var ba="pending";function Nn(t){return t===null||typeof t!="object"||Array.isArray(t)?null:t}function Z(t){return typeof t=="string"?t:typeof t=="number"&&Number.isFinite(t)?String(t):""}function Xt(t,e){return typeof t=="number"&&Number.isFinite(t)?t:e}function Dd(t,e){return typeof t=="boolean"?t:e}function ha(t){let e=Nn(t),n=e===null?null:e.items;if(!Array.isArray(n))return{seq:0,items:[]};let o=[];for(let r of n){let s=Nn(r);if(s===null)continue;let a=Z(s.teachingClassID);a!==""&&o.push({id:Z(s.id),seq:Xt(s.seq,0),teachingClassID:a,courseName:Z(s.courseName),teacherName:Z(s.teacherName),category:Z(s.category),priority:Xt(s.priority,0),enabled:Dd(s.enabled,!0),status:Z(s.status)===""?ba:Z(s.status),retryMode:Z(s.retryMode),attempts:Xt(s.attempts,0),lastMsg:Z(s.lastMsg),lastKind:Z(s.lastKind),addedAt:Xt(s.addedAt,0)})}return{seq:Xt(e?.seq,o.length),items:o}}function ya(t){let e=Nn(t),n=e===null?null:e.items;if(!Array.isArray(n))return{items:[],hitCount:0};let o=[];for(let r of n){let s=Nn(r);if(s===null)continue;let a=Z(s.teachingClassID);a!==""&&o.push({teachingClassID:a,courseName:Z(s.courseName),teacherName:Z(s.teacherName),teachingPlace:Z(s.teachingPlace),category:Z(s.category),remain:typeof s.remain=="number"&&Number.isFinite(s.remain)?s.remain:null,checkedAt:typeof s.checkedAt=="number"&&Number.isFinite(s.checkedAt)?s.checkedAt:null,hits:Xt(s.hits,0),lastMsg:Z(s.lastMsg)})}return{items:o,hitCount:Xt(e?.hitCount,0)}}function Ue(t,e){return t.items.some(n=>n.teachingClassID===e)}function Ke(t,e){return t.items.some(n=>n.teachingClassID===e)}function Bd(t,e){if(Ue(t,e.tcId))return{store:t,added:!1};let n=t.seq+1,o={id:`t${n}`,seq:n,teachingClassID:e.tcId,courseName:It(e.courseName),teacherName:It(e.teacherName),category:e.category,priority:0,enabled:!0,status:ba,retryMode:e.retryMode,attempts:0,lastMsg:"",lastKind:"",addedAt:e.now};return{store:{seq:n,items:[...t.items,o]},added:!0}}function xa(t,e){if(Ke(t,e.tcId))return{store:t,added:!1};let n={teachingClassID:e.tcId,courseName:It(e.courseName),teacherName:It(e.teacherName),teachingPlace:It(e.teachingPlace),category:e.category,remain:null,checkedAt:null,hits:0,lastMsg:""};return{store:{...t,items:[...t.items,n]},added:!0}}function ka(t,e){let n=t.items.filter(o=>o.teachingClassID!==e);return n.length===t.items.length?{store:t,removed:!1}:{store:{...t,items:n},removed:!0}}function Hd(t,e){let n=t.items.filter(o=>o.teachingClassID!==e);return n.length===t.items.length?{store:t,removed:!1}:{store:{...t,items:n},removed:!0}}function Ta(t,e){if(Ue(t,e.tcId)){let{store:o}=Hd(t,e.tcId);return{store:o,on:!1}}let{store:n}=Bd(t,e);return{store:n,on:!0}}function Wo(t){return t?"移除抢课":"添加抢课"}function qo(t){return t?"移除监控":"添加监控"}function Ca(t){return t==null?"":It(t.replace(/^\s*\[\d+\]\s*/,""))}function Sa(t){return`教学班ID ${t}`}function Ea(t){let n=(It(t).split(",")[0]??"").split(" ").filter(r=>r!==""),o=n[n.length-1];return o===void 0||o.endsWith("节")||o.endsWith("周")?"":o}var Jo="cv-delete-volunteer",Zo="collection-img";function va(t){return t?"none":"h5"}function wa(t){return t?"none":"title-before"}var fa=[Zo,"cv-info-title","cv-one",Jo];function Ia(t){let e=n=>{let o=fa.indexOf(n);return o===-1?fa.length:o};return[...t].map((n,o)=>({key:n,index:o})).sort((n,o)=>e(n.key)-e(o.key)||n.index-o.index).map(n=>n.key)}function Qo(t){let e="";for(let n of t)n.length>e.length&&(e=n);return e}var Dt={SINGLE:"single",CATEGORY:"category"},Ma={category:"按类别（列表接口整页拉，请求少）",single:"逐个教学班（capacity 接口，直观但请求多）"};function $n(t){return t===Dt.SINGLE?Dt.SINGLE:Dt.CATEGORY}var tr=4,er=50;function Ra(t){let e=new Map,n=0;for(let r of t){if(r.category===""){n+=1;continue}let s=e.get(r.category);s===void 0?e.set(r.category,[r]):s.push(r)}let o=[];for(let[r,s]of e)o.push({category:r,items:s});return{groups:o,skipped:n}}function nr(t){return t.filter(e=>e.remain!==null&&e.remain>0)}function or(t){return t===null?"未知":t<=0?"无余量":`余 ${String(t)}`}function za(t){return t===null?"unknown":t>0?"has":"none"}function La(t){let e=ya(t);return{items:e.items.map(n=>({...n,hits:On(n.hits)})),hitCount:On(e.hitCount)}}function On(t){return Number.isFinite(t)?Math.max(0,Math.trunc(t)):0}function Aa(t){return{items:t.items.map(e=>({teachingClassID:e.teachingClassID,courseName:e.courseName,teacherName:e.teacherName,teachingPlace:e.teachingPlace,category:e.category,remain:e.remain,checkedAt:e.checkedAt,hits:e.hits,lastMsg:e.lastMsg})),hitCount:On(t.hitCount)}}function Wt(t,e,n,o,r){let s=!1,a=!1,c=t.items.map(l=>{if(l.teachingClassID!==e)return l;a=!0;let u=n!==null&&n>0;return u&&(s=!0),{...l,remain:n,checkedAt:o,hits:u?l.hits+1:l.hits,...r===void 0?{}:{lastMsg:r}}});return a?{store:{...t,items:c},hit:s}:{store:t,hit:!1}}function _a(t,e){return e<=0?t:{...t,hitCount:On(t.hitCount)+e}}function Pn(t,e){let n=t.items.filter(o=>o.teachingClassID!==e);return n.length===t.items.length?{store:t,removed:!1}:{store:{...t,items:n},removed:!0}}function Na(){return{items:[],hitCount:0}}function Oa(t,e,n){let o=!1,r=t.items.map(s=>s.teachingClassID!==e?s:(o=!0,{...s,...n}));return o?{...t,items:r}:t}function $a(t){return{items:t.items.map(e=>({...e,hits:0,remain:null,checkedAt:null,lastMsg:""})),hitCount:0}}function rr(t,e){return t.items.find(n=>n.teachingClassID===e)??null}function Dn(t,e){if(t===null||t<=0)return"从未";let n=e-t;return n<0||n<3e3?"刚刚":n<6e4?`${String(Math.floor(n/1e3))} 秒前`:n<36e5?`${String(Math.floor(n/6e4))} 分钟前`:`${String(Math.floor(n/36e5))} 小时前`}function sr(t,e){let n=t.items.length;if(n===0)return"监控列表为空";let o=t.items.reduce((r,s)=>s.checkedAt===null?r:r===null||s.checkedAt>r?s.checkedAt:r,null);return`${String(n)} 条监控（累计命中 ${String(t.hitCount)} 次，最近检查 ${Dn(o,e)}）`}function Pa(t,e){return t.map(n=>`${e(n.teachingClassID)} ${or(n.remain)}`).join("；")}var W=h("bkxk/monitor"),Rt=null;function Da(t){Rt=t}var ir=new Set;function Hn(t){return ir.add(t),()=>{ir.delete(t)}}function de(){for(let t of[...ir])try{t()}catch(e){W.warn("监控订阅回调抛错（已忽略）",e)}}function rt(){return La(G(Pt.MONITOR,null))}function Bt(t){H(Pt.MONITOR,Aa(t)),de()}function qt(t){let e=t(rt());return Bt(e),e}function Ba(){return $n(N(S,X.MONITOR_MODE))}function Ud(){return yt("pollIntervalMs",N(S,X.POLL_INTERVAL_MS))}var Mt=!1,Fe=null,Bn=null,Ha=null,Ua=0;function Ka(){return{polling:Mt,lastPollAt:Ha,pollCount:Ua}}function Kd(t){return new Promise(e=>{Bn=e,Fe=setTimeout(()=>{Fe=null,Bn=null,e()},t)})}function Fd(){Fe!==null&&(clearTimeout(Fe),Fe=null);let t=Bn;Bn=null,t!==null&&t()}function Fa(){if(Mt)return!1;let t=rt();return t.items.length===0?(Rt?.toast("监控列表为空，先到选课列表里点「监控该教学班」","warn"),!1):(Mt=!0,W.info(`开始监控轮询（${Ba()}），监控项 ${String(t.items.length)} 条`),Rt?.toast(`开始监控（${String(t.items.length)} 条）`,"success"),de(),Gd(),!0)}function Un(){return Mt?(Mt=!1,Fd(),W.info("已停止监控轮询"),Rt?.toast("已停止监控轮询","info"),de(),!0):!1}function ar(){return Mt}async function Gd(){try{for(;Mt;){if(await lr(),!Mt)return;await Kd(Ud())}}catch(t){Mt=!1,W.error("监控轮询异常结束",t),Rt?.toast("监控轮询异常，已停止（详见日志）","error")}finally{de()}}async function lr(){Ha=Date.now(),Ua+=1;let t=rt();if(t.items.length===0)return de(),{checked:0,hits:[]};let e=Ba()==="single"?await Vd(t):await Xd(t);return await qd(e),de(),e}async function Vd(t){let e=t,n=[];for(let o of t.items){let r=await jd(e,o.teachingClassID);e=r.store,n.push(r.row)}return{checked:n.length,hits:nr(n)}}async function jd(t,e){let n=ce();if(n.batchCode==="")return W.warn(`查容量跳过 ${e}：批次码为空（请刷新选课页）`),{store:t,row:{teachingClassID:e,remain:null,kind:"nobatch",msg:"批次码为空（请刷新选课页）"}};let o,r,s=null;try{let c=await Yt({url:jt(dt.CAPACITY,ue()),action:`查容量 ${e}`,method:"POST",body:ia(e,n.batchCode),token:n.token,priority:Nt.NORMAL});o=c.cls.kind,r=c.cls.msg,o===$.OK&&(s=la(c.cls.data))}catch(c){let l=c instanceof Error?c.message:String(c);W.warn(`查容量请求异常：${e}`,c);let u=Wt(t,e,null,Date.now(),`请求异常：${l}`);return Bt(u.store),{store:u.store,row:{teachingClassID:e,remain:null,kind:"exception",msg:l}}}if(o!==$.OK){cr(o),W.warn(`查容量失败（${o}）：${e} ${r}`);let c=Wt(t,e,null,Date.now(),r);return Bt(c.store),{store:c.store,row:{teachingClassID:e,remain:null,kind:o,msg:r}}}let a=Wt(t,e,s,Date.now());return Bt(a.store),{store:a.store,row:{teachingClassID:e,remain:s,kind:"ok"}}}async function Yd(t){let e=ce(),n=[];for(let o=0;o<tr;o+=1){let r;try{r=await pa({category:t,studentCode:e.studentCode,batchCode:e.batchCode===""?null:e.batchCode,token:e.token,pageNumber:o,pageSize:er,origin:ue()})}catch(s){return W.warn(`类别 ${t} 请求异常（pageNumber=${String(o)}）`,s),n.length>0?n:null}if(r.kind!==$.OK)return cr(r.kind),W.warn(`类别 ${t} 拉取失败（pageNumber=${String(o)}，${r.kind}）：${r.msg}`),n.length>0?n:null;for(let s of r.classes)n.push(s);if(r.classes.length<er)return n}return W.warn(`类别 ${t} 超过 ${String(tr)} 页上限，只用前 ${String(n.length)} 条比对`),n}async function Xd(t){let{groups:e,skipped:n}=Ra(t.items);if(n>0&&W.warn(`类别监控：跳过 ${String(n)} 条缺类别代码的监控项（无法按类别查询）`),e.length===0)return W.warn("类别监控：监控项都缺类别代码，无法按类别查询"),{checked:0,hits:[]};let o=t,r=[];for(let s of e){let a=await Yd(s.category);if(a===null){for(let l of s.items)r.push({teachingClassID:l.teachingClassID,remain:null,kind:"fail"}),o=Wt(o,l.teachingClassID,null,Date.now(),"按类别查询失败").store,Bt(o);continue}let c=new Map;for(let l of a)c.set(l.teachingClassID,l);for(let l of s.items){let u=c.get(l.teachingClassID),f=u===void 0?null:da(u);o=(u===void 0?Wt(o,l.teachingClassID,null,Date.now(),"按类别查询未找到该教学班"):Wt(o,l.teachingClassID,f,Date.now())).store,Bt(o),r.push({teachingClassID:l.teachingClassID,remain:f,kind:u===void 0?"notfound":"ok"})}}return{checked:r.length,hits:nr(r)}}function cr(t){return t!==$.UNAUTHENTICATED?!1:(Un(),W.error("登录态失效，已停止监控轮询"),Rt?.toast("登录态失效，已停止监控，请刷新页面重新登录","error"),Rt?.alertAuthExpired(),!0)}function Wd(t,e){let n=rr(t,e);return n===null||n.courseName===""?e:n.courseName}async function qd(t){if(t.hits.length===0)return;let e=_a(rt(),t.hits.length);Bt(e);let n=Pa(t.hits,o=>Wd(e,o));if(W.info(`监控命中余量：${n}`),Rt?.toast(`发现余量：${n}`,"success"),!k(S,M.WRITE_API)){W.warn("监控命中余量，但写接口总开关未开启，只提醒不自动抢");return}for(let o of t.hits){let r=rr(rt(),o.teachingClassID);r!==null&&await ur(r)}}async function ur(t){if(!k(S,M.WRITE_API))return{ok:!1,reason:"write-disabled"};let e=ce();if(e.batchCode===""||e.studentCode==="")return{ok:!1,reason:"no-session"};if(t.category==="")return{ok:!1,reason:"no-category"};let n=zn({studentCode:e.studentCode,electiveBatchCode:e.batchCode,teachingClassId:t.teachingClassID,campus:e.campus,teachingClassType:t.category});try{let o=await Yt({url:jt(dt.VOLUNTEER,ue()),action:`监控自动抢 ${t.teachingClassID}`,method:"POST",body:n,token:e.token,priority:Nt.MONITOR_HIT});if(o.cls.kind===$.OK){let s=t.courseName===""?t.teachingClassID:t.courseName;W.info(`监控自动抢成功 ${s}`),Rt?.toast(`监控抢到：${s}`,"success");let a=Pn(rt(),t.teachingClassID);return a.removed&&Bt(a.store),{ok:!0,reason:""}}let r=o.cls.msg===""?o.cls.kind:o.cls.msg;return qt(s=>Oa(s,t.teachingClassID,{lastMsg:r})),W.warn(`监控自动抢未成功（${o.cls.kind}）：${r}`),cr(o.cls.kind),{ok:!1,reason:o.cls.kind,msg:r}}catch(o){let r=o instanceof Error?o.message:String(o);return W.warn(`监控自动抢请求异常：${t.teachingClassID}`,o),{ok:!1,reason:"exception",msg:r}}}var T={PENDING:"pending",RUNNING:"running",SUCCESS:"success",FAILED:"failed"},gt={SMART:"smart",NEVER:"never",ALWAYS:"always"},Ge={smart:"智能",never:"失败即停",always:"持续重试"},ct={OK:"ok",RETRYABLE:"retryable",TERMINAL:"terminal",AUTH:"auth",UNKNOWN:"unknown"},dr="登录态失效，请刷新页面重新登录",Jd=/已满|满员|容量|人数/,Zd=/已选|已添加|选中|重复|冲突|学分|门数|门课|限选|性别|年级|不允许|未开放|无权限|不在|已经存在|存在选课结果/;function ja(t){let e=t==null?"":String(t);return Jd.test(e)?ct.RETRYABLE:Zd.test(e)?ct.TERMINAL:ct.UNKNOWN}function pr(t,e){return t===gt.ALWAYS?!0:t===gt.NEVER?!1:e===ct.RETRYABLE||e===ct.UNKNOWN}function Ya(t){return t===gt.SMART||t===gt.NEVER||t===gt.ALWAYS}function Qd(t){return Ya(t)?t:gt.SMART}function tp(t){return t===T.SUCCESS?T.SUCCESS:t===T.FAILED?T.FAILED:T.PENDING}function ep(t){return t.enabled&&(t.status===T.PENDING||t.status===T.RUNNING)}function Kn(t){return[...t].filter(e=>ep(e)).sort((e,n)=>e.priority!==n.priority?e.priority-n.priority:e.seq-n.seq)}function fr(t){return{seq:t.seq,items:t.items.map(e=>e.status===T.RUNNING?{...e,status:T.PENDING}:e)}}function Xa(t){let e=ha(t);return{seq:e.seq,items:e.items.map(n=>np(n))}}function np(t){let e=t.lastKind===ct.AUTH||t.lastMsg===dr,n=tp(t.status);return{...t,status:e&&n===T.FAILED?T.PENDING:n,retryMode:Qd(t.retryMode),...e?{lastMsg:"",lastKind:""}:{}}}function mr(t,e){return t.items.find(n=>n.id===e)??null}function pe(t,e,n){let o=!1,r=t.items.map(s=>s.id!==e?s:(o=!0,{...s,...n}));return o?{...t,items:r}:t}function Wa(t,e,n){return Ya(n)?pe(t,e,{retryMode:n}):t}function qa(t,e){let n=mr(t,e);if(n===null)return{store:t,enabled:!1};let o=!n.enabled;return{store:o&&n.status===T.FAILED?pe(t,e,{enabled:o,status:T.PENDING}):pe(t,e,{enabled:o}),enabled:o}}function Ja(t,e){let n=t.items.filter(o=>o.id!==e);return n.length===t.items.length?{store:t,removed:!1}:{store:{...t,items:n},removed:!0}}function Za(){return{seq:0,items:[]}}function Qa(t){let e=0,n=t.items.map(o=>!o.enabled||o.status!==T.FAILED?o:(e+=1,{...o,status:T.PENDING,attempts:0,lastMsg:"",lastKind:""}));return e===0?{store:t,cleared:e}:{store:{...t,items:n},cleared:e}}function tl(t){return{seq:t.seq,items:t.items.map(e=>e.status===T.SUCCESS?{...e,attempts:0,lastMsg:""}:{...e,status:T.PENDING,attempts:0,lastMsg:""})}}var op={pending:"待抢",running:"抢课中",success:"已抢到",failed:"已停止"};function el(t){return op[t]??t}function nl(t){return t===T.SUCCESS?"ok":t===T.FAILED?"bad":t===T.RUNNING?"run":"wait"}var rp={ok:"正常",retryable:"可重试",terminal:"终结性",auth:"登录态",unknown:"未识别"};function Ve(t){return rp[t]??t}function ol(t){if(t.length===0)return"队列为空";let e=l=>t.filter(u=>u.status===l).length,n=[],o=e(T.PENDING),r=e(T.RUNNING),s=e(T.SUCCESS),a=e(T.FAILED);o>0&&n.push(`待抢 ${String(o)}`),r>0&&n.push(`抢课中 ${String(r)}`),s>0&&n.push(`已抢到 ${String(s)}`),a>0&&n.push(`已停止 ${String(a)}`);let c=t.filter(l=>!l.enabled).length;return c>0&&n.push(`未勾选 ${String(c)}`),`${String(t.length)} 条（${n.join(" · ")}）`}var Ga=-9,Va=9;function Fn(t){let e=typeof t=="number"?t:Number(t);if(!Number.isFinite(e))return 0;let n=Math.trunc(e);return n<Ga?Ga:n>Va?Va:n}function gr(t,e,n){return pe(t,e,{priority:Fn(n)})}function Gn(t){return t<0?`优先级 ${String(t)}（比默认更先抢）`:t>0?`优先级 ${String(t)}（比默认更后抢）`:"优先级 0（默认）"}function rl(t){return t<0?"更先抢":t>0?"更后抢":"默认"}var ut=h("bkxk/tasks"),kt=null;function sl(t){kt=t}var br=new Set;function Vn(t){return br.add(t),()=>{br.delete(t)}}function hr(){for(let t of[...br])try{t()}catch(e){ut.warn("任务订阅回调抛错（已忽略）",e)}}function Q(){return Xa(G(Pt.TASKS,null))}function jn(t){H(Pt.TASKS,fr(t)),hr()}function Tt(t){let e=t(Q());return jn(e),e}var bt=!1;function il(){return bt}function al(){if(!k(S,M.WRITE_API))return ut.warn("写接口总开关未开启，拒绝开始抢课"),kt?.toast("写接口总开关未开启，请先到【设置】里打开","warn"),{ok:!1,reason:"write-disabled",count:0};if(bt)return{ok:!1,reason:"already-running",count:0};let t=Qa(Q());t.cleared>0&&(jn(t.store),ut.info(`开始前清洗了 ${String(t.cleared)} 条「已勾选但上次跑失败」的任务，它们会重新参与`));let e=Kn(Q().items);return e.length===0?(kt?.toast("没有可抢的任务（都没勾选，或都已抢到）","warn"),{ok:!1,reason:"no-task",count:0}):(bt=!0,ut.info(`开始抢课，任务数 ${String(e.length)}`),kt?.toast(`开始抢课（${String(e.length)} 条）`,"success"),ip(),{ok:!0,reason:"",count:e.length})}function ll(){if(!bt)return!1;bt=!1;let t=Q(),e=fr(t);return e.items.some((o,r)=>o!==t.items[r])?jn(e):hr(),ut.info("已停止抢课"),kt?.toast("已停止抢课","info"),!0}function sp(t){return new Promise(e=>{setTimeout(e,t)})}async function ip(){try{for(;bt;){if(Kn(Q().items).length===0){bt=!1,ut.info("全部任务已结束"),kt?.toast("全部任务已结束","info");return}if(await ap(),!bt)return;let t=yt("retryIntervalMs",N(S,X.RETRY_INTERVAL_MS));await sp(t)}}catch(t){bt=!1,ut.error("抢课循环异常结束",t),kt?.toast("抢课循环异常，已停止（详见日志）","error")}finally{hr()}}async function ap(){let t=Kn(Q().items);for(let e of t){if(!bt)return;let n=mr(Q(),e.id);n===null||!n.enabled||await lp(n)}}function Ht(t,e){jn(pe(Q(),t,e))}async function lp(t){let e=ce();if(e.batchCode===""||e.studentCode===""){Ht(t.id,{status:T.FAILED,lastMsg:"缺少学号或选课批次码，请在设置中补全",lastKind:ct.TERMINAL}),ut.error(`抢课中止：缺少学号或批次码 ${t.teachingClassID}`);return}if(t.category===""){Ht(t.id,{status:T.FAILED,lastMsg:"未能识别该教学班的类别代码，请重新在列表中点击「添加抢课」",lastKind:ct.TERMINAL}),ut.error(`抢课中止：类别代码未知 ${t.teachingClassID}`);return}Ht(t.id,{status:T.RUNNING,attempts:t.attempts+1});let n=zn({studentCode:e.studentCode,electiveBatchCode:e.batchCode,teachingClassId:t.teachingClassID,campus:e.campus,teachingClassType:t.category}),o,r;try{let a=await Yt({url:jt(dt.VOLUNTEER,ue()),action:`抢课 ${t.teachingClassID}`,method:"POST",body:n,token:e.token,priority:Nt.HIGH});o=a.cls.kind,r=a.cls.msg}catch(a){let c=a instanceof Error?a.message:String(a),l=pr(t.retryMode,ct.UNKNOWN);Ht(t.id,{status:l?T.PENDING:T.FAILED,lastMsg:`请求异常：${c}`,lastKind:ct.UNKNOWN}),ut.warn(`抢课请求异常（${l?"稍后重试":"已停手"}）：${t.teachingClassID}`,a);return}if(o===$.OK){Ht(t.id,{status:T.SUCCESS,lastMsg:r,lastKind:ct.OK});let a=t.courseName===""?t.teachingClassID:t.courseName;ut.info(`抢课成功 ${a}`),kt?.toast(`抢课成功：${a}`,"success");return}if(o===$.UNAUTHENTICATED){bt=!1,Ht(t.id,{status:T.FAILED,lastMsg:dr,lastKind:ct.AUTH}),ut.error("登录态失效，已停止全部任务"),kt?.toast("登录态失效，已停止全部任务，请刷新页面重新登录","error"),kt?.alertAuthExpired();return}let s=o===$.BUSINESS?ja(r):ct.UNKNOWN;if(pr(t.retryMode,s))Ht(t.id,{status:T.PENDING,lastMsg:r,lastKind:s}),ut.warn(`抢课未成功，稍后重试（${Ve(s)}）：${r}`);else{Ht(t.id,{status:T.FAILED,lastMsg:r,lastKind:s});let a=Ge[t.retryMode]??t.retryMode;ut.warn(`抢课失败，已按「${a}」停手（${Ve(s)}）：${r}`)}}var ht=h("site/bkxk/list"),cp="grablessons.do",up=120,dl=400,dp="抢课模块",xr=".cv-course-card",Wn=".cv-info",pl=".cv-row",fl=".cv-body",pp=".cv-setting-col",fp=".cv-title-col, .cv-course";function Yn(t){t.preventDefault(),t.stopPropagation()}function yr(t){return It(t===null?"":t.textContent)}function Jt(t,e){for(let n of t.querySelectorAll(e))if(n.closest(Wn)===t)return n;return null}function mp(t){return Jt(t,".sztb-bkxk-block")!==null}function ml(t,e){let n=t.getAttribute(e);return n===null?"":n.trim()}function gp(t){let e=[];for(let n of t.querySelectorAll("[tcid]"))n.closest(Wn)===t&&e.push(ml(n,"tcid"));return ma(e)}function bp(t){let e=[];for(let n of t.querySelectorAll("[tcid]")){let o=ml(n,"tcid");Xo(o)&&(e.includes(o)||e.push(o))}return e}function gl(t){let e=t;for(let n=0;n<10&&e!==null;n++){if(e.classList.contains("cv-body"))return ga(e.id);e=e.parentElement}return""}function bl(t){return t===null?"":yr(t.querySelector(fp))}function hp(t){let e=Jt(t,"div[title]");return Ea(e===null?"":e.getAttribute("title"))}function yp(t,e){let n=Jt(t,".cv-info-title"),o=n===null?"":n.getAttribute("title")??n.textContent,r=t.closest(".cv-row");return{tcId:e,courseName:bl(r),teacherName:Ca(o),category:gl(t),teachingPlace:hp(t)}}function xp(t,e){return{tcId:e,courseName:bl(t),teacherName:yr(t.querySelector(".cv-teacher-col")),category:gl(t),teachingPlace:yr(t.querySelector(".cv-time-col"))}}function Xn(t){let e=[t.courseName,t.teacherName].filter(o=>o!==""),n=e.length===0?t.tcId:e.join(" / ");return t.category===""?`${n}（类别未识别）`:n}async function kp(t,e){let n=await un(t);if(n.ok){ht.info(`已复制教学班ID ${t} 到剪贴板（方式：${n.method}）`),e.toast("已复制教学班ID","success");return}ht.warn(`复制教学班ID 失败：${n.detail}（可手动选中那一行复制）`),e.toast("复制失败，请手动选中复制","warn")}function hl(t,e){t.textContent=Wo(e),t.classList.toggle("sztb-bkxk-btn-on",e)}function yl(t,e){t.textContent=qo(e),t.classList.toggle("sztb-bkxk-btn-on",e)}function cl(){let t=document.querySelectorAll("[data-sztb-tcid]");if(t.length===0)return;let e=Q(),n=rt();for(let o of t){let r=o.getAttribute("data-sztb-tcid")??"",s=o.querySelector('button[data-role="grab"]');s!==null&&hl(s,Ue(e,r));let a=o.querySelector('button[data-role="monitor"]');a!==null&&yl(a,Ke(n,r))}}function Tp(t,e,n){let o=!1;Tt(r=>{let s=Ta(r,{...t,now:Date.now(),retryMode:N(S,X.RETRY_MODE)});return o=s.on,s.store}),hl(n,o),o?(ht.info(`已加入抢课队列：${Xn(t)}（本轮只入队，不会发送任何请求）`),e.panel.toast(`已加入抢课队列：${t.courseName===""?t.tcId:t.courseName}`,"success")):(ht.info(`已移出抢课队列：${Xn(t)}（站点上已经选到的课不会被退掉）`),e.panel.toast("已移出抢课队列（不会退掉已经选上的课）","info"))}function Cp(t,e,n){let o=!1;qt(r=>Ke(r,t.tcId)?(o=!1,ka(r,t.tcId).store):(o=!0,xa(r,{...t,now:Date.now()}).store)),yl(n,o),o?(ht.info(`已加入监控列表：${Xn(t)}（到监控页点【开始监控】才会轮询）`),e.panel.toast("已加入监控","success")):(ht.info(`已移出监控列表：${Xn(t)}`),e.panel.toast("已移出监控","info"))}function xl(t,e){let n=i("div",{class:"sztb-bkxk-id",text:Sa(t.tcId),attrs:{title:`点击复制：${t.tcId}`},on:{click:l=>{Yn(l),kp(t.tcId,e.panel)}}}),o=Ue(Q(),t.tcId),r=i("button",{class:`sztb-bkxk-btn${o?" sztb-bkxk-btn-on":""}`,text:Wo(o),attrs:{type:"button","data-role":"grab"},on:{click:l=>{Yn(l),Tp(t,e,r)}}}),s=Ke(rt(),t.tcId),a=i("button",{class:`sztb-bkxk-btn${s?" sztb-bkxk-btn-on":""}`,text:qo(s),attrs:{type:"button","data-role":"monitor"},on:{click:l=>{Yn(l),Cp(t,e,a)}}}),c=i("div",{class:"sztb-bkxk-block",attrs:{"data-sztb-tcid":t.tcId}},n,i("div",{class:"sztb-bkxk-ops"},r,a));return c.addEventListener("click",Yn),c}function Sp(){if(document.getElementById(jo)!==null)return;let t=i("style",{attrs:{id:jo}});t.textContent=oa,(document.head??document.documentElement).appendChild(t)}function Ep(t,e){if(e.budget>=dl||mp(t))return;let n=gp(t);if(n===null){ht.debug("卡片 .cv-info 未取到教学班 id，跳过（站点结构可能已变）");return}let o=yp(t,n),r=xl(o,e);t.insertBefore(r,t.firstChild),e.budget+=1,kl(t)}function vp(t,e){if(e.budget>=dl||t.querySelector(xr)!==null||t.querySelector(":scope > .sztb-bkxk-col")!==null)return;let n=t.querySelector(pp);if(n===null)return;let o=bp(n);if(o.length===0){ht.debug("列表行未取到教学班 id，跳过（站点结构可能已变）");return}let r=i("div",{class:"sztb-bkxk-col"});for(let s of o)r.appendChild(xl(xp(t,s),e)),e.budget+=1;t.appendChild(r)}function wp(){for(let t of document.querySelectorAll(fl)){if(t.querySelector(`:scope > ${pl} > .sztb-bkxk-col`)===null)continue;let e=t.parentElement?.querySelector(":scope > .cv-head")??null;e!==null&&e.querySelector(":scope > .sztb-bkxk-col")===null&&e.appendChild(i("div",{class:"sztb-bkxk-col sztb-bkxk-head",text:dp}))}}function kl(t){let e=Jt(t,".cv-info-title"),n=Jt(t,`.${Zo}`);if(n!==null&&e!==null){let s=e.previousElementSibling===n;wa(s)==="title-before"&&e.parentElement?.insertBefore(n,e)}let o=Jt(t,`.${Jo}`),r=Jt(t,"h5");if(o!==null&&r!==null){let s=o.parentElement===r;va(s)==="h5"&&r.appendChild(o),Ip(r)}}function Ip(t){let e=Array.from(t.children);if(e.length<2)return;let n=e.map(s=>Qo(Array.from(s.classList))),o=Ia(n);if(n.every((s,a)=>s===o[a]))return;let r=new Map;for(let s of e){let a=Qo(Array.from(s.classList)),c=r.get(a);c===void 0?r.set(a,[s]):c.push(s)}for(let s of o){let c=r.get(s)?.shift();c!==void 0&&t.appendChild(c)}}function Mp(){for(let t of document.querySelectorAll(`${xr} ${Wn}`))kl(t)}function Rp(){let t=document.querySelectorAll(".sztb-bkxk-block, .sztb-bkxk-col, .sztb-bkxk-head");if(t.length!==0){for(let e of t)e.remove();ht.info(`列表注入开关已关闭：移除 ${String(t.length)} 个注入节点`)}}function ul(t){if(!k(S,M.LIST_INJECT)){Rp();return}t.budget=0,Sp();for(let e of document.querySelectorAll(`${xr} ${Wn}`))Ep(e,t);for(let e of document.querySelectorAll(`${fl} > ${pl}`))vp(e,t);wp(),Mp()}function Tl(t){if(!location.pathname.includes(cp))return ht.debug(`当前不是选课页（${location.pathname}），跳过列表注入`),()=>{};let e={panel:t,budget:0},n=null,o=null,r=()=>{o===null&&(o=window.setTimeout(()=>{o=null,ul(e)},up))},s=[Vn(cl),Hn(cl)];return te(()=>{ul(e),n=new MutationObserver(r),n.observe(document.body,{childList:!0,subtree:!0}),ht.info(`选课列表注入已就绪：抢课队列 ${String(Q().items.length)} 条 / 监控 ${String(rt().items.length)} 条（本轮点击只入队，不发请求）`)}),()=>{for(let a of s)a();n?.disconnect(),n=null,o!==null&&(window.clearTimeout(o),o=null)}}var kr="sztb-bkxk-tt-style",Cl=`
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
`;var Tr="myCourseTable",Sl=".cv-my-course",Cr="cv-course-card-single",mb=`.${Cr}`,El=3;function vl(t){return t.hijackOn&&t.tried<t.maxTries&&t.enabledCourses>0&&t.siteCards>0&&t.tags===0}var fe=h("site/bkxk/timetable"),zp="curriculum.do",Lp=20,Ap=500,_p=300,Sr="CVQueryCurriculum",Er={tried:0},wl=!1;function vr(t=document){return t.getElementById(Tr)??t.querySelector(Sl)}function Np(t){return t.querySelectorAll(`.${Cr}`).length}function Op(t){return t.querySelectorAll(Wi).length}function Il(){if(document.getElementById(kr)!==null)return;let t=i("style",{attrs:{id:kr}});t.textContent=Cl,(document.head??document.documentElement).appendChild(t)}function Rl(t){let e=Ji()[Sr];return e===void 0||typeof e.init!="function"?(fe.warn(`站点没有 ${Sr}.init（改版了？）—— 这一轮的自定义课程不会出现，刷新页面可重来`),!1):(fe.info(`请站点重新请求一次课表（${t}；上一发响应${ea()?"已被我们改写":"我们没赶上"}）⇒ ${Sr}.init()`),e.init.call(e),!0)}function Ml(t){let e=ae().length,n=Np(t),o=Op(t);return vl({hijackOn:Mn("timetable"),tried:Er.tried,maxTries:El,enabledCourses:e,siteCards:n,tags:o})?(Er.tried+=1,Rl(`站点已经画完 ${String(n)} 张卡片、里面没有我们的标记（第 ${String(Er.tried)} 次）`)):(!wl&&o>0&&(wl=!0,fe.info(`站点画出的课表里已经带上我们的标记 ${String(o)} 个（自定义课程 ${String(e)} 门）`)),!1)}function zl(){return vr()===null||ae().length===0||!Mn("timetable")?0:Rl("你在【自定义】里改了课程")?1:0}function Ll(){if(!location.pathname.includes(zp))return fe.debug(`当前不是课表页（${location.pathname}），跳过课表接管`),()=>{};let t=null,e=null,n=null,o=0,r=()=>{e===null&&(e=window.setTimeout(()=>{e=null;let a=vr();a!==null&&(Il(),Ml(a))},_p))},s=()=>{let a=vr();if(a===null){o+=1,o<Lp?n=window.setTimeout(s,Ap):fe.warn(`未找到课表容器 #${Tr}，放弃接管（站点的课表可能还没出数据）`);return}Il();let c=ae();fe.info(`课表页接管就绪：自定义课程 ${String(c.length)} 门；课表由站点自己画，我们只加「自定义」标签`),Ml(a),t=new MutationObserver(r),t.observe(a,{childList:!0,subtree:!0})};return te(s),()=>{t?.disconnect(),t=null,e!==null&&(window.clearTimeout(e),e=null),n!==null&&(window.clearTimeout(n),n=null)}}var Al=`
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
`;var me=h("bkxk/tasks-tab"),$p="bkxk:tasks",Pp=[gt.SMART,gt.NEVER,gt.ALWAYS],Dp=1e3,_l={id:$p,title:"任务",order:100,css:Al,mount(t,e){return Bp(t,e)}};function Bp(t,e){let n=i("div",{class:"sztb-note",text:"这里管抢课队列。列表页点【添加抢课】只入队，必须回本页点【开始抢课】才会真正发请求。抢课是不可逆操作（会直接产生选课结果），点之前请确认【设置】里的写接口总开关是你想要的状态。"}),o=i("div",{class:"sztb-note sztb-bkxk-tk-warn"});o.hidden=!0;let r=i("div",{class:"sztb-group-title"}),s=i("div",{class:"sztb-bkxk-tk-now"});s.hidden=!0;let a=i("button",{class:"sztb-btn",text:"开始抢课",attrs:{type:"button","data-variant":"primary"}}),c=i("button",{class:"sztb-btn",text:"停止",attrs:{type:"button"}}),l=i("button",{class:"sztb-btn",text:"重置未成功",attrs:{type:"button"}}),u=i("button",{class:"sztb-btn",text:"清空队列",attrs:{type:"button","data-variant":"danger"}}),f=i("div",{class:"sztb-toolbar"},a,c,l,u),E=i("div",{class:"sztb-group-title"}),O=i("div");t.appendChild(n),t.appendChild(o),t.appendChild(r),t.appendChild(s),t.appendChild(f),t.appendChild(E),t.appendChild(O);function C(){let p=Q().items,x=il();if(r.textContent=ol(p),E.textContent=`队列（${String(p.length)} 条）`,s.hidden=!x,x){let z=p.filter(A=>A.enabled&&(A.status===T.PENDING||A.status===T.RUNNING)).length;s.textContent=`抢课进行中：还剩 ${String(z)} 条待抢。抢到的任务会留在队列里（不会自动移出）。循环跑在本页里，关掉页面就等于停止抢课。`}if(c.disabled=!x,a.disabled=x,O.textContent="",p.length===0){O.appendChild(i("div",{class:"sztb-empty",text:"队列是空的。到选课页的课程卡片上点【添加抢课】就会出现在这里。"}));return}for(let z of p)O.appendChild(D(z))}function q(){let p=k(S,M.WRITE_API);return o.hidden=p,p||(o.textContent="写接口总开关未开启：点【开始抢课】不会发出任何请求。要真的抢课，请到【设置】页打开「写接口总开关（抢课）」。"),p}function I(p){let x=Rn[p.category];return[p.teacherName===""?"教师未知":p.teacherName,x??(p.category===""?"类别未知":p.category),`已试 ${String(p.attempts)} 次`,p.teachingClassID].join(" ｜ ")}function D(p){let x=i("div",{class:"sztb-bkxk-tk-item",data:p.enabled?{}:{off:"true"}}),z=i("div",{class:"sztb-bkxk-tk-top"}),A=i("input",{attrs:{type:"checkbox",title:"这条任务是否参与抢课"}});A.checked=p.enabled,A.addEventListener("change",()=>{Tt(R=>qa(R,p.id).store),me.info(`${p.enabled?"取消勾选":"勾选"}任务「${p.courseName===""?p.teachingClassID:p.courseName}」`),C()}),z.appendChild(A);let V=i("div",{class:"sztb-bkxk-tk-main"});V.appendChild(i("span",{class:"sztb-bkxk-tk-name",text:p.courseName||"（课名未知）"})),V.appendChild(i("span",{class:"sztb-bkxk-tk-meta",text:I(p)}));let et=i("span",{class:"sztb-bkxk-tk-meta"});p.lastMsg===""?et.textContent=Gn(p.priority):(et.textContent=`${Ve(p.lastKind)}：${p.lastMsg}`,p.lastKind!=="ok"&&p.lastKind!=="retryable"&&et.classList.add("sztb-bkxk-tk-warn")),V.appendChild(et),z.appendChild(V),z.appendChild(i("span",{class:"sztb-bkxk-tk-badge",text:el(p.status),data:{state:nl(p.status)}})),x.appendChild(z);let B=i("div",{class:"sztb-bkxk-tk-ops"});B.appendChild(i("span",{class:"sztb-bkxk-tk-prio-label",text:rl(p.priority),attrs:{title:Gn(p.priority)}}));let m=i("button",{class:"sztb-btn sztb-bkxk-tk-tiny",text:"−",attrs:{type:"button",title:"优先级 -1（更先抢）"}});m.addEventListener("click",()=>{Tt(R=>gr(R,p.id,Fn(p.priority-1))),C()});let v=i("span",{class:"sztb-bkxk-tk-prio",text:String(p.priority),attrs:{title:Gn(p.priority)}}),_=i("button",{class:"sztb-btn sztb-bkxk-tk-tiny",text:"＋",attrs:{type:"button",title:"优先级 +1（更后抢）"}});_.addEventListener("click",()=>{Tt(R=>gr(R,p.id,Fn(p.priority+1))),C()}),B.appendChild(m),B.appendChild(v),B.appendChild(_);let g=i("select",{class:"sztb-select sztb-bkxk-tk-mode",attrs:{title:"失败后怎么处理"}});for(let R of Pp){let st=i("option",{text:Ge[R]??R});st.value=R,g.appendChild(st)}g.value=Ge[p.retryMode]===void 0?gt.SMART:p.retryMode,g.addEventListener("change",()=>{Tt(R=>Wa(R,p.id,g.value)),me.info(`任务「${p.courseName||p.teachingClassID}」的重试策略改为 ${g.value}`),C()}),B.appendChild(g);let w=i("button",{class:"sztb-btn sztb-bkxk-tk-tiny",text:"删除",attrs:{type:"button"}});return w.addEventListener("click",()=>{Tt(R=>Ja(R,p.id).store),me.info(`已从队列删除任务「${p.courseName||p.teachingClassID}」`),C()}),B.appendChild(w),x.appendChild(B),x}a.addEventListener("click",()=>{q()||me.warn("写接口总开关未开，拒绝开始");let p=al();!p.ok&&p.reason==="already-running"&&e.host.toast("已经在抢课中了","info"),C()}),c.addEventListener("click",()=>{ll()||e.host.toast("当前没有在抢课","info"),C()}),l.addEventListener("click",()=>{let p=Q().items.filter(x=>x.status===T.FAILED).length;if(p===0){e.host.toast("没有需要重置的任务","info");return}e.host.confirm({title:`重置 ${String(p)} 条未成功的任务`,body:"会把「已停止」的任务改回待抢，并清空它们的重试次数与失败原因。已抢到的任务不受影响，也不会被重新提交。",confirmText:"重置",cancelText:"取消"}).then(x=>{x&&(Tt(z=>tl(z)),me.info(`已重置 ${String(p)} 条未成功的任务`),e.host.toast("已重置","success"),C())})}),u.addEventListener("click",()=>{let p=Q().items.length;if(p===0){e.host.toast("队列已经是空的","info");return}e.host.confirm({title:`清空队列（${String(p)} 条）`,body:"会把整个抢课队列删掉。已经抢到的课不受影响（那是站点那边的选课结果），但队列里的记录、优先级与重试次数都会丢失，无法撤销。",danger:!0,confirmText:"清空",cancelText:"取消"}).then(x=>{x&&(Tt(()=>Za()),me.info(`已清空抢课队列（${String(p)} 条）`),e.host.toast("已清空队列","success"),C())})});let tt=Vn(C);q(),C();let P=k(S,M.WRITE_API),zt=window.setInterval(()=>{let p=k(S,M.WRITE_API);p!==P&&(P=p,q(),C())},Dp);return()=>{tt(),window.clearInterval(zt)}}var Nl=`
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
`;var qn=h("bkxk/monitor-tab"),Hp="bkxk:monitor",Up=1e3,Kp={"write-disabled":"写接口总开关未开启，现在不会抢","no-session":"读不到学号或批次码，请刷新选课页后重试","no-category":"这条监控项没有类别代码，无法抢 —— 请到列表页重新点一次「监控该教学班」",unauthenticated:"登录态失效，请刷新页面重新登录"},Ol={id:Hp,title:"监控",order:120,css:Nl,mount(t,e){return Fp(t,e)}};function Fp(t,e){let n=i("div",{class:"sztb-note",text:"这里盯余量。列表页点【监控该教学班】加入监控项，回本页点【开始监控】才会开始查询。轮询跑在本页里，关掉页面就等于停止监控。"}),o=i("div",{class:"sztb-note sztb-bkxk-mo-warn"});o.hidden=!0;let r=i("div",{class:"sztb-bkxk-mo-row"});r.appendChild(i("span",{text:"查询模式"}));let s=i("select",{class:"sztb-select sztb-bkxk-mo-mode"});for(let m of[Dt.CATEGORY,Dt.SINGLE]){let v=i("option",{text:Ma[m]??m});v.value=m,s.appendChild(v)}r.appendChild(s),s.addEventListener("change",()=>{cn(S,X.MONITOR_MODE,s.value),qn.info(`监控模式改为 ${s.value}`),P()});let a=i("span",{class:"sztb-bkxk-mo-meta"});r.appendChild(a);let c=i("div",{class:"sztb-group-title"}),l=i("div",{class:"sztb-bkxk-mo-now"});l.hidden=!0;let u=i("button",{class:"sztb-btn",text:"开始监控",attrs:{type:"button","data-variant":"primary"}}),f=i("button",{class:"sztb-btn",text:"停止",attrs:{type:"button"}}),E=i("button",{class:"sztb-btn",text:"立即检查",attrs:{type:"button"}}),O=i("button",{class:"sztb-btn",text:"重置统计",attrs:{type:"button"}}),C=i("button",{class:"sztb-btn",text:"清空列表",attrs:{type:"button","data-variant":"danger"}}),q=i("div",{class:"sztb-toolbar"},u,f,E,O,C),I=i("div",{class:"sztb-group-title"}),D=i("div");t.appendChild(n),t.appendChild(o),t.appendChild(r),t.appendChild(c),t.appendChild(l),t.appendChild(q),t.appendChild(I),t.appendChild(D);let tt=new Map;function P(){tt.clear();let m=$n(N(S,X.MONITOR_MODE));s.value=m;let v=m===Dt.CATEGORY;a.textContent=v?"自动按监控列表里出现过的类别逐类拉列表（请求少）。":"每条监控各查一次容量（精确，但请求数是监控条数）。";let _=rt(),g=Ka(),w=Date.now();c.textContent=sr(_,w),I.textContent=`监控项（${String(_.items.length)} 条）`;let R=ar();if(u.disabled=R,f.disabled=!R,l.hidden=!R,R&&(l.textContent=`监控进行中（${m===Dt.CATEGORY?"按类别":"逐个教学班"}）：已跑 ${String(g.pollCount)} 轮，上次检查 ${Dn(g.lastPollAt,w)}。命中余量时会提醒你；写接口总开关开着的话会直接帮你抢。`),D.textContent="",_.items.length===0){D.appendChild(i("div",{class:"sztb-empty",text:"没有监控项。到选课页的课程卡片上点【监控该教学班】就会出现在这里。"}));return}for(let st of _.items)D.appendChild(A(st,w))}function zt(){let m=Date.now();for(let[v,_]of tt){let g=rt().items.find(w=>w.teachingClassID===v);_.textContent=p(g,m)}c.textContent=sr(rt(),m)}function p(m,v){return m===void 0?"":`上次检查 ${Dn(m.checkedAt,v)}`}function x(){let m=k(S,M.WRITE_API);return o.hidden=m,m||(o.textContent="写接口总开关未开启：监控命中也只会提醒，不会自动抢。要自动抢，请到【设置】页打开「写接口总开关（抢课）」。"),m}function z(m){let v=Rn[m.category],_=[m.teacherName===""?"教师未知":m.teacherName];return _.push(v??(m.category===""?"类别未知":m.category)),_.push(`累计命中 ${String(m.hits)} 次`),_.join(" ｜ ")}function A(m,v){let _=i("div",{class:"sztb-bkxk-mo-item"}),g=i("div",{class:"sztb-bkxk-mo-top"}),w=i("div",{class:"sztb-bkxk-mo-main"});w.appendChild(i("span",{class:"sztb-bkxk-mo-name",text:m.courseName||"（课名未知）"})),w.appendChild(i("span",{class:"sztb-bkxk-mo-meta",text:z(m)}));let R=i("span",{class:"sztb-bkxk-mo-meta",text:p(m,v)});tt.set(m.teachingClassID,R),w.appendChild(R),m.lastMsg!==""&&w.appendChild(i("span",{class:"sztb-bkxk-mo-meta sztb-bkxk-mo-warn",text:`上次抢课：${m.lastMsg}`})),g.appendChild(w);let st=m.remain!==null&&m.remain>0;g.appendChild(i("span",{class:st?"sztb-bkxk-mo-badge sztb-bkxk-mo-hit":"sztb-bkxk-mo-badge",text:or(m.remain),data:{state:String(za(m.remain))}})),_.appendChild(g);let K=i("div",{class:"sztb-bkxk-mo-ops"}),it=i("button",{class:"sztb-btn sztb-bkxk-mo-tiny",text:"抢课",attrs:{type:"button",title:"立刻对这条发一次抢课请求"}});it.addEventListener("click",()=>{it.disabled=!0,ur(m).then(J=>{if(!J.ok){if(J.reason==="exception"){e.host.toast(`请求异常：${J.msg??""}`,"error");return}e.host.toast(Kp[J.reason]??`未成功（${J.reason}）${J.msg??""}`,"warn")}}).finally(()=>{it.disabled=!1,P()})}),K.appendChild(it);let Ut=i("button",{class:"sztb-btn sztb-bkxk-mo-tiny",text:"移除",attrs:{type:"button"}});return Ut.addEventListener("click",()=>{qt(J=>Pn(J,m.teachingClassID).store),qn.info(`已移出监控列表：${m.courseName||m.teachingClassID}`),P()}),K.appendChild(Ut),_.appendChild(K),_}u.addEventListener("click",()=>{Fa(),P()}),f.addEventListener("click",()=>{Un()||e.host.toast("当前没有在监控","info"),P()}),E.addEventListener("click",()=>{if(ar()){e.host.toast("轮询正在跑，请先【停止】，或等这一轮结束","warn");return}E.disabled=!0,lr().then(m=>{let v=m.hits.length;e.host.toast(v===0?`检查了 ${String(m.checked)} 条，没有余量`:`检查了 ${String(m.checked)} 条，发现 ${String(v)} 条有余量`,v===0?"info":"success")}).finally(()=>{E.disabled=!1,P()})}),O.addEventListener("click",()=>{qt(m=>$a(m)),qn.info("已重置监控统计（余量、检查时间、命中次数与上次抢课结果）"),e.host.toast("已重置统计，下次检查会重新填","success"),P()}),C.addEventListener("click",()=>{let m=rt().items.length;if(m===0){e.host.toast("监控列表已经是空的","info");return}e.host.confirm({title:`清空监控列表（${String(m)} 条）`,body:"会移除全部监控项，并停掉轮询。已经抢到的课不受影响，但监控记录无法恢复。",danger:!0,confirmText:"清空",cancelText:"取消"}).then(v=>{v&&(Un(),qt(()=>Na()),qn.info(`已清空监控列表（${String(m)} 条）`),e.host.toast("已清空监控列表","success"),P())})});let V=Hn(P);x(),P();let et=k(S,M.WRITE_API),B=window.setInterval(()=>{let m=k(S,M.WRITE_API);m!==et&&(et=m,x(),P()),zt()},Up);return()=>{V(),window.clearInterval(B)}}var ge={WEEK_MIN:1,WEEK_MAX:52,SECTION_MIN:1,SECTION_MAX:20,MAX_SEGMENTS:8},Gp={weekFrom:"1",weekTo:"18",parity:"",day:"1",sectionFrom:"1",sectionTo:"2",place:""};function je(){return{...Gp}}function pt(t){let e=t.trim();if(!/^-?\d+$/.test(e))return null;let n=Number(e);return Number.isSafeInteger(n)?n:null}function Vp(t){return{weekFrom:String(t.weekFrom),weekTo:String(t.weekTo),parity:t.parity===null?"":t.parity,day:t.day===null?"":String(t.day),sectionFrom:String(t.sectionFrom),sectionTo:String(t.sectionTo),place:t.place}}function $l(t){return wt(t).map(e=>Vp(e))}function Pl(t){let{WEEK_MIN:e,WEEK_MAX:n,SECTION_MIN:o,SECTION_MAX:r}=ge,s=pt(t.weekFrom),a=pt(t.weekTo);if(s===null||a===null||s<e||a>n||s>n||a<e)return`周次要填 ${String(e)}-${String(n)} 之间的整数`;if(s>a)return"周次起止颠倒：起始周不能大于结束周";let c=pt(t.sectionFrom),l=pt(t.sectionTo);return c===null||l===null||c<o||l>r||c>r||l<o?`节次要填 ${String(o)}-${String(r)} 之间的整数`:c>l?"节次起止颠倒：起始节不能大于结束节":pt(t.day)===null||(pt(t.day)??0)<1||(pt(t.day)??0)>7?"请选择星期几":t.place.trim()===""?"请填地点（例如 致理楼L1-707）":null}function Dl(t,e){if(t.trim()==="")return"请填课程名";if(e.length===0)return"至少填一段上课时间";if(e.length>ge.MAX_SEGMENTS)return`最多 ${String(ge.MAX_SEGMENTS)} 段`;for(let n=0;n<e.length;n+=1){let o=e[n];if(o===void 0)continue;let r=Pl(o);if(r!==null)return(e.length>1?`第 ${String(n+1)} 段：`:"")+r}return null}function jp(t){if(Pl(t)!==null)return null;let e=pt(t.weekFrom),n=pt(t.weekTo),o=pt(t.sectionFrom),r=pt(t.sectionTo),s=pt(t.day);if(e===null||n===null||o===null||r===null||s===null)return null;let a=t.parity===""?null:t.parity,c=t.place.trim();return{weekFrom:e,weekTo:n,parity:a,day:s,sectionFrom:o,sectionTo:r,place:c,raw:Vi({weekFrom:e,weekTo:n,parity:a,day:s,sectionFrom:o,sectionTo:r,place:c})}}function Bl(t){let e=[];for(let n of t){let o=jp(n);if(o===null)return null;e.push(o)}return e.map(n=>n.raw).join(",")}var Hl=`
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
`;var Zt=h("bkxk/custom-tab"),Yp="bkxk:custom",Xp=[["","每周"],["单","单周"],["双","双周"]],Ul={id:Yp,title:"自定义",order:150,css:Hl,mount(t,e){Wp(t,e)}};function Wp(t,e){let n=Sn(),o=null,r=[je()],s=i("div",{class:"sztb-note",text:"「自定义课程」已在【设置】里关闭：这些课不会参与列表页的冲突追加，也不会注入课表。要使用请到【设置】页打开它，再切回本页。"});s.hidden=!0;let a=i("div"),c=i("div",{class:"sztb-group-title",text:"添加自定义课程"}),l=i("input",{class:"sztb-input",attrs:{type:"text",placeholder:"例：线性代数（重修）",maxlength:40}}),u=i("input",{class:"sztb-input",attrs:{type:"text",placeholder:"可空，例：张三",maxlength:30}}),f=i("div"),E=i("button",{class:"sztb-btn",attrs:{type:"button"},text:"再加一段"}),O=i("button",{class:"sztb-btn",attrs:{type:"button","data-variant":"primary"},text:"添加"}),C=i("button",{class:"sztb-btn",attrs:{type:"button"},text:"取消编辑"});C.hidden=!0;let q=i("div",{class:"sztb-field-hint"});q.hidden=!0;let I=i("div",{class:"sztb-note sztb-bkxk-warn"});I.hidden=!0;let D=i("div",{class:"sztb-group-title",text:"已添加"}),tt=i("div"),P=i("button",{class:"sztb-btn",attrs:{type:"button","data-variant":"danger"},text:"清空全部"}),zt=i("div",{class:"sztb-toolbar"},E,O,C),p=i("div",{class:"sztb-toolbar"},P),x=i("div",{class:"sztb-field"});x.appendChild(i("label",{class:"sztb-field-label",text:"上课时间"})),x.appendChild(f);let z=i("div",{class:"sztb-note",text:"课程名与地点必填，教师可空。时间用下面的下拉与数字框填 —— 不用也不能手写时间文本（写错了自己也不知道）。这里加的课会参与 ① 列表页的冲突提示 ② 课表页（站点自己画的课表里会带上「自定义」标签）。"});a.appendChild(z),a.appendChild(c),a.appendChild(et("课程名",l)),a.appendChild(et("教师",u)),a.appendChild(x),a.appendChild(zt),a.appendChild(q),a.appendChild(I),a.appendChild(D),a.appendChild(tt),a.appendChild(p),t.appendChild(s),t.appendChild(a);function A(){let d=k(S,M.CUSTOM_COURSES);return s.hidden=d,a.hidden=!d,d}function V(){return A()?!0:(e.host.toast("「自定义课程」已在【设置】里关闭","warn"),!1)}function et(d,y){let b=i("div",{class:"sztb-field"});return b.appendChild(i("label",{class:"sztb-field-label",text:d})),b.appendChild(y),b}function B(d){q.textContent=d,q.hidden=!1}function m(){q.textContent="",q.hidden=!0}function v(d,y){let b=r[d];b!==void 0&&(r[d]={...b,...y})}function _(d,y){let b=i("input",{class:"sztb-input sztb-bkxk-num",attrs:{type:"text",inputmode:"numeric",maxlength:2}});return b.value=d,b.addEventListener("input",()=>{y(b.value)}),b}function g(d,y){let b=i("option",{text:y});return b.value=d,b}function w(d,y){let b=i("select",{class:"sztb-select sztb-bkxk-parity"});for(let[F,nt]of Xp)b.appendChild(g(F,nt));return b.value=d,b.addEventListener("change",()=>{y(b.value)}),b}function R(d,y){let b=i("select",{class:"sztb-select sztb-bkxk-parity"});b.appendChild(g("","—"));for(let F=1;F<=7;F+=1)b.appendChild(g(String(F),De[F]??""));return b.value=d,b.addEventListener("change",()=>{y(b.value)}),b}function st(d,y){let b=i("input",{class:"sztb-input",attrs:{type:"text",placeholder:"例：致理楼L1-707",maxlength:60}});return b.value=d,b.addEventListener("input",()=>{y(b.value)}),b}function K(...d){let y=i("div",{class:"sztb-bkxk-line"});for(let b of d)y.appendChild(typeof b=="string"?i("span",{class:"sztb-bkxk-amp",text:b}):b);return y}function it(d,y){return[i("span",{class:"sztb-bkxk-key",text:d}),y]}function Ut(d,y){let b=i("div",{class:"sztb-bkxk-seg"}),F=i("div",{class:"sztb-bkxk-seghead"});if(F.appendChild(i("span",{text:`第 ${String(d+1)} 段`})),r.length>1){let j=i("button",{class:"sztb-btn",attrs:{type:"button"},text:"删除这段"});j.addEventListener("click",()=>{r.splice(d,1),J()}),F.appendChild(j)}b.appendChild(F);let nt=i("div",{class:"sztb-bkxk-grid"});for(let j of it("周次",K(_(y.weekFrom,Y=>{v(d,{weekFrom:Y})}),"到",_(y.weekTo,Y=>{v(d,{weekTo:Y})}),w(y.parity,Y=>{v(d,{parity:Y})}))))nt.appendChild(j);for(let j of it("星期",K(R(y.day,Y=>{v(d,{day:Y})}))))nt.appendChild(j);for(let j of it("节次",K(_(y.sectionFrom,Y=>{v(d,{sectionFrom:Y})}),"到",_(y.sectionTo,Y=>{v(d,{sectionTo:Y})}),"节")))nt.appendChild(j);for(let j of it("地点",K(st(y.place,Y=>{v(d,{place:Y})}))))nt.appendChild(j);return b.appendChild(nt),b}function J(){f.textContent="";for(let d=0;d<r.length;d+=1){let y=r[d];y!==void 0&&f.appendChild(Ut(d,y))}}function Xe(){c.scrollIntoView({block:"start"})}function Qt(){o=null,l.value="",u.value="",r=[je()],J(),m(),c.textContent="添加自定义课程",O.textContent="添加",C.hidden=!0}function ql(){if(!V())return;let d=l.value.trim(),y=Dl(d,r);if(y!==null){B(y),e.host.toast(y,"warn");return}let b=Bl(r);if(b===null){let Lt="时间填得不完整，请检查周次 / 节次 / 星期 / 地点";B(Lt),e.host.toast(Lt,"warn");return}let F=wt(b);if(F.length!==r.length){Zt.warn(`生成的时间文本与解析结果对不上：${b}（解析出 ${String(F.length)} 段，表单有 ${String(r.length)} 段）`);let Lt="时间文本生成异常，已取消本次提交（请把这条日志报给开发者）";B(Lt),e.host.toast(Lt,"error");return}let nt={name:d,teacher:u.value.trim(),place:b},j=o,Y=j===null?Ai(n,nt,Li(Date.now(),Math.random())):_i(n,j,nt);We(Y),Qt(),Zt.info(`${j===null?"添加":"修改"}自定义课程「${d}」（${b}）`),e.host.toast(j===null?"已添加":"已保存修改","success")}function Jl(d){if(!V())return;let y=$l(d.place);if(o=d.id,l.value=d.name,u.value=d.teacher,y.length===0){r=[je()];let b="这门课原本的时间文本解析不出，已按默认值回填，请重新填写";B(b),e.host.toast(b,"warn"),Zt.warn(`自定义课程「${d.name}」的 place 解析不出：${d.place}`)}else r=y.map(b=>({...b})),m();J(),c.textContent=`修改：${d.name}`,O.textContent="保存修改",C.hidden=!1,Xe()}function Zl(d){let y=i("div",{class:"sztb-bkxk-item",data:d.enabled?{}:{off:"true"}}),b=i("span",{class:"sztb-bkxk-color"});b.style.background=d.color,y.appendChild(b);let F=i("input",{attrs:{type:"checkbox",title:"参与冲突计算与课表注入"}});F.checked=d.enabled,F.addEventListener("change",()=>{if(!V()){F.checked=d.enabled;return}We(Oi(n,d.id,F.checked)),Zt.info(`${F.checked?"启用":"停用"}自定义课程「${d.name}」`)}),y.appendChild(F);let nt=i("div",{class:"sztb-bkxk-itemmain"});nt.appendChild(i("span",{class:"sztb-bkxk-name",text:d.name})),nt.appendChild(i("span",{class:"sztb-bkxk-meta",text:d.teacher===""?d.place:`${d.teacher} ｜ ${d.place}`}));let j=wt(d.place).length;nt.appendChild(i("span",{class:j===0?"sztb-bkxk-meta sztb-bkxk-bad":"sztb-bkxk-meta",text:j===0?"时间未解析：这门课不会参与冲突计算，也不会注入课表（建议【修改】重填）":`解析出 ${String(j)} 段`})),y.appendChild(nt);let Y=i("div",{class:"sztb-bkxk-ops"}),Lt=i("button",{class:"sztb-btn",attrs:{type:"button"},text:"修改"});Lt.addEventListener("click",()=>{Jl(d)});let Rr=i("button",{class:"sztb-btn",attrs:{type:"button","data-variant":"danger"},text:"删除"});return Rr.addEventListener("click",()=>{if(!V())return;let Ql=o===d.id;We(Ni(n,d.id)),Ql&&Qt(),Zt.info(`删除自定义课程「${d.name}」`),e.host.toast("已删除","success")}),Y.appendChild(Lt),Y.appendChild(Rr),y.appendChild(Y),y}function Ir(){if(tt.textContent="",D.textContent=`已添加（${String(n.length)} 门）`,n.length===0){tt.appendChild(i("div",{class:"sztb-empty",text:"还没有自定义课程。上面填一门，点【添加】。"})),p.hidden=!0;return}p.hidden=!1;for(let d of n)tt.appendChild(Zl(d))}function Mr(){let d=Yi(n);if(d<=0){I.hidden=!0,I.textContent="";return}I.hidden=!1,I.textContent=`自定义课程之间有 ${String(d)} 处时间冲突（不影响使用，只是提醒）`}function We(d){n=d,$i(d),Ir(),Mr(),zl()>0&&Zt.info("已请站点重画课表（这次带的课程就是你刚改的）")}E.addEventListener("click",()=>{if(V()){if(r.length>=ge.MAX_SEGMENTS){let d=`最多 ${String(ge.MAX_SEGMENTS)} 段`;B(d),e.host.toast(d,"warn");return}r.push(je()),J()}}),O.addEventListener("click",()=>{ql()}),C.addEventListener("click",()=>{Qt(),Xe()}),P.addEventListener("click",()=>{if(!V())return;let d=n.length;e.host.confirm({title:"清空自定义课程",body:`确定要删除全部 ${String(d)} 门自定义课程吗？删除后无法恢复。`,danger:!0,confirmText:"全部删除"}).then(y=>{y&&(We([]),Qt(),Zt.info(`清空自定义课程：删除 ${String(d)} 门`),e.host.toast("已清空","success"))})}),J(),Ir(),Mr(),A()}var qp=Ce("bkxk"),Kl={id:qp,title:"设置",order:200,mount(t,e){t.appendChild(i("div",{class:"sztb-note",text:"🟢 随时可开关；🟠 / 🔴 需要你显式勾选才生效，开启前请先读一遍说明。本页参数改动即刻生效，不用刷新页面。"})),t.appendChild(ee("bkxk",null,e))}};var be=h("site/bkxk"),Jp=["bkxk.szu.edu.cn"],Zp=["*default/grablessons.do*","*default/curriculum.do*"],Fl={id:S,name:"本科选课",hosts:Jp,pages:Zp,tabs:[_l,Ol,Ul,Kl],toggles:Si,earlyInit(t){na();let e=Ui();Ei();let n=Hi();e.length>0&&be.info(`已从旧版迁移 ${e.length} 条内容，详情见日志页`),n.length>0&&be.info(`自定义课程已搬到通用键（${n.length} 条说明见日志页）`),e.length===0&&n.length===0&&be.debug(`无旧数据需要迁移（earlyInit @ ${t.url.pathname}）`)},init(t){vi(),sl(t.panel),Da(t.panel);let e=Cn();e.loggedIn?be.info(`站点已就绪：${Mi(e)}`):be.warn("未读到有效登录态：学号或 token 缺失，功能接口会失败。请先在站内完成登录。"),be.info(`功能页=${String(t.isFeaturePage)}（任务 / 监控 / 自定义 / 设置四个站点标签页已就绪）`),Tl(t.panel),Ll()}};function Gl(){gn(Os),gn(Ci),gn(Fl);for(let t of re())t.toggles!==void 0&&t.toggles.length>0&&ns(t.id,t.name,t.toggles)}var Ye=h("main"),wr="0.1.0",jl="2026-10-05T15:18:11.242Z",Vl=53,Yl=Vl===null?`v${wr}`:`v${wr}#${Vl}`;function Qp(){Gl(),fs(t=>re().find(e=>e.id===t)?.name??t),Is(()=>he?.adapterId??null),ms(Ns)}var he=null,Xl=[{siteId:ft,tab:gs},{siteId:ft,tab:bs},{siteId:ft,tab:Ms},{siteId:ft,tab:Es}];function tf(t){return[...Xl,...t]}function Wl(t,e){he!==null&&(he.panel.destroy(),he=null);let n=e.adapter!==null?e.adapter.tabs.map(r=>({siteId:e.adapter.id,tab:r})):[],o=ts(zr,tf(n),{siteName:e.adapter?.name??null});Ss(()=>({href:location.href,host:location.host,resolution:e.reason,adapterId:e.adapter?.id??null,inject:e.inject,autoExpand:e.autoExpand,tabCount:n.length+Xl.length,registeredAdapters:re().map(r=>r.id),buildTime:jl,version:wr})),he={panel:o,adapterId:e.adapter?.id??null},Ye.info(`深大人工具箱 ${Yl} 已装载（host=${t.hostname}，分派=${e.reason}，站点=${e.adapter?.id??"无"}，功能页=${e.autoExpand?"是":"否"}）`),e.adapter?.init?.({adapter:e.adapter,isFeaturePage:e.autoExpand,panel:o})}function ef(){let t=location.href,e=()=>{let n=new URL(location.href),o=wo(n);if((o.adapter?.id??null)===(he?.adapterId??null)&&o.inject){t=location.href;return}if(!o.inject){Ye.debug("站内跳转后不再属于支持范围，保持现有悬浮窗");return}Ye.info(`站内跳转导致重新分派：${t} → ${location.href}`),t=location.href,Wl(n,o)};window.addEventListener("hashchange",e),window.addEventListener("popstate",e)}function nf(){if(window.top!==window.self){console.info("[深大人工具箱] 当前是子框架，跳过（@noframes 兜底）");return}console.info(`[深大人工具箱] ${Yl} 启动，href=${location.href}，构建于 ${jl??"未知"}`),Qp();let t=new URL(location.href),e=wo(t);if(!e.inject){console.info(`[深大人工具箱] 不注入：host=${t.hostname} 既不属于任何适配器（${re().map(n=>n.hosts.join("|")).join(" , ")}），也不在根域 ${vo.join("/")} 下`);return}if(e.adapter?.earlyInit!==void 0)try{e.adapter.earlyInit({adapter:e.adapter,url:t}),Ye.debug(`已执行启动期钩子：${e.adapter.id}`)}catch(n){Ye.error(`启动期钩子执行失败：${e.adapter.id}`,n)}te(()=>{Wl(t,e),ef()})}try{nf()}catch(t){console.error("[深大人工具箱] 启动失败",t)}})();

