/**
 * 选课列表注入（批 3 `list` 模块的第一片）。
 *
 * 本轮范围（用户 m00940 拍板的**最小切片**）：
 *   ✅ 在两种行形态上都注入「教学班ID」一行 + 「添加抢课」「添加监控」两个按钮；
 *   ✅ 点击**只入队**（写 storage）+ 视觉反馈 + 日志，**不发任何请求**；
 *   ✅ 监听站点重绘（页签切换、翻页都是 XHR + 重绘），重绘后自动补注入；
 *   ❌ 真正发送抢课 / 跑监控 —— 批 4 的 tasks / monitor 模块。
 *
 * 两种行形态（采样实测，见 docs/开发文档.md §4.1）：
 *   · 卡片形态：`div.cv-body > div.cv-row > section > div.cv-course-card > div.cv-info`
 *     —— 一个 `.cv-row` 是**一门课**，卡片是它的**教学班详情**，
 *     而一个卡片里可能有**多个 `.cv-info`**（一个教学班一个：教师、时间、退选按钮各一份）。
 *     所以注入单元是 `.cv-info`，不是卡片。
 *   · 列表形态：`div.cv-body > div.cv-row`（12 列，最后一列 `.cv-setting-col` 里有
 *     `a.cv-choice[tcid]`）—— 一个行一门课，末列追加一个我们的列。
 *
 * 为什么「注入单元 = 教学班」而不是「= 行」：行/卡片的 id 只反映**第一个**教学班，
 * 而抢课、退课、容量接口要的都是**某一个**教学班的 id。多教学班的卡片上，
 * 按卡片取 id 会把第二个教学班的操作挂到第一个的 id 上 —— 这是会下错单的错误。
 *
 * 幂等：**靠「存在性」判重，不靠自定义属性**。站点重绘会把我们连根拔掉，
 * 那时属性也一起没了；查 DOM 里有没有我们的块，两种情况都对。
 *
 * ⚠️ 本轮**不判断写接口开关**：这里只入队，不发请求，所以不存在「关了还写」的问题。
 * 真正的门禁在批 4 的执行引擎里（`TOGGLE.WRITE_API` + 二次确认）。
 * 本模块自己的门禁是 `TOGGLE.LIST_INJECT`（🟢，默认开）：每一轮扫描都重新读一次，
 * 关掉即移除已注入的节点 —— 不需要刷新页面才能看到效果。
 */

import { scoped } from '../../common/core/log.ts';
import { read, write } from '../../common/core/storage.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { el, whenDomReady } from '../../common/utils/dom.ts';
import { copyText } from '../../common/utils/clipboard.ts';
import { LIST_CSS, LIST_STYLE_ID } from './list-style.ts';
import { BKXK_STORE_KEY } from './legacy.ts';
import { SITE_ID, TOGGLE, VALUE } from './settings.ts';
import {
  addMonitor,
  addTask,
  categoryOfBodyId,
  cleanText,
  grabButtonLabel,
  hasMonitor,
  hasTask,
  idLineText,
  isTcId,
  monitorButtonLabel,
  placeFromTimeText,
  pickTcId,
  readMonitorStore,
  readTaskStore,
  removeMonitor,
  teacherFromTitle,
  type MonitorStore,
  type TargetInfo,
  type TaskStore,
} from './list-model.ts';
import type { PanelApi } from '../types.ts';

const log = scoped('site/bkxk/list');

/** 选课页路径片段（与适配器 `pages` 的判据同源） */
const LIST_PAGE_MARK = 'grablessons.do';

/** 站点重绘后等一拍再扫：站点是先插空容器再填内容，抢跑会扫到空壳 */
const RESCAN_DELAY_MS = 120;

/** 单次扫描最多注入多少块（防站点异常时把我们拖死；正常一页几十块） */
const MAX_BLOCKS_PER_SCAN = 400;

const HEAD_TEXT = '抢课模块';
const CARD_SELECTOR = '.cv-course-card';
const INFO_SELECTOR = '.cv-info';
const ROW_SELECTOR = '.cv-row';
const BODY_SELECTOR = '.cv-body';
const SETTING_COL_SELECTOR = '.cv-setting-col';
const TITLE_CELL_SELECTOR = '.cv-title-col, .cv-course';

interface Ctx {
  readonly panel: PanelApi;
  /** 抢课队列（读时规范化，点击后写回） */
  tasks: TaskStore;
  monitor: MonitorStore;
  /** 本次扫描已注入的块数 */
  budget: number;
}

// ------------------------------------------------------------ 纯 DOM 小工具

/** 吞掉事件：站点在行/卡片上有自己的「选择」处理，多一个块绝不能触发它 */
function swallow(ev: Event): void {
  ev.preventDefault();
  ev.stopPropagation();
}

function textOf(node: Element | null): string {
  return cleanText(node === null ? '' : node.textContent);
}

/**
 * 取「属于 `unit` 自己」的后代，跳过嵌套在更深一层 `.cv-info` 里的元素。
 *
 * 需要它的原因：卡片上一个 `.cv-info` 里可能**嵌套另一个 `.cv-info`**
 * （第二个教学班的详情）。`unit.querySelector()` 会先命中外层自己的元素，
 * 但 `unit.querySelectorAll()` 会把里层的也算成自己的 ——
 * 加列、取 tcId 都不能被里层的元素带偏。
 */
function ownDescendant(unit: HTMLElement, selector: string): HTMLElement | null {
  for (const node of unit.querySelectorAll<HTMLElement>(selector)) {
    if (node.closest(INFO_SELECTOR) === unit) return node;
  }
  return null;
}

/** `unit` 自己（不含嵌套教学班）是不是已经注入过了 */
function ownsBlock(unit: HTMLElement): boolean {
  return ownDescendant(unit, '.sztb-bkxk-block') !== null;
}

/** 属性名大小写不敏感地取一个属性值 */
function attr(node: Element, name: string): string {
  const v = node.getAttribute(name);
  return v === null ? '' : v.trim();
}

/** `unit` 自己的教学班 id：取它自己身上的 `tcid`（退选按钮 / 选择按钮 / 课程图标） */
function tcIdIn(unit: HTMLElement): string | null {
  const candidates: string[] = [];
  for (const node of unit.querySelectorAll<HTMLElement>('[tcid]')) {
    if (node.closest(INFO_SELECTOR) !== unit) continue;
    candidates.push(attr(node, 'tcid'));
  }
  return pickTcId(candidates);
}

/** 容器（行 / 设置列）里的全部教学班 id，按出现顺序去重 */
function tcIdsIn(node: HTMLElement): string[] {
  const out: string[] = [];
  for (const node2 of node.querySelectorAll<HTMLElement>('[tcid]')) {
    const id = attr(node2, 'tcid');
    if (!isTcId(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * 沿父链找 `.cv-body`，用**容器 id** 定类别。
 *
 * 绝不能用「当前激活的页签」定类别：采样实测多个页签的列表会**同时留在 DOM 里**
 * （方案内页的采样里躺着 7 行本班课程 + 10 行方案内课程），用激活页签会把
 * 隐藏列表里的教学班标成错的 `teachingClassType`。
 */
function categoryFor(node: HTMLElement): string {
  let cur: HTMLElement | null = node;
  for (let i = 0; i < 10 && cur !== null; i++) {
    if (cur.classList.contains('cv-body')) return categoryOfBodyId(cur.id);
    cur = cur.parentElement;
  }
  return '';
}

/** 课程名：卡片页的行上是 `.cv-course`，列表页的行上是 `.cv-title-col` */
function courseNameOf(row: Element | null): string {
  if (row === null) return '';
  return textOf(row.querySelector(TITLE_CELL_SELECTOR));
}

/** 上课时间地点：卡片上是带 `title` 的那个 div，列表页是 `.cv-time-col` */
function placeOfUnit(unit: HTMLElement): string {
  const timeEl = ownDescendant(unit, 'div[title]');
  return placeFromTimeText(timeEl === null ? '' : timeEl.getAttribute('title'));
}

/** 登录态没读到也别拦着入队 —— 入队本身不碰网络（见文件头） */

function infoForUnit(unit: HTMLElement, tcId: string): TargetInfo {
  const titleEl = ownDescendant(unit, '.cv-info-title');
  const rawTitle = titleEl === null ? '' : titleEl.getAttribute('title') ?? titleEl.textContent;
  const row = unit.closest('.cv-row');
  return {
    tcId,
    courseName: courseNameOf(row),
    teacherName: teacherFromTitle(rawTitle),
    category: categoryFor(unit),
    teachingPlace: placeOfUnit(unit),
  };
}

function infoForRow(row: HTMLElement, tcId: string): TargetInfo {
  return {
    tcId,
    courseName: courseNameOf(row),
    teacherName: textOf(row.querySelector('.cv-teacher-col')),
    category: categoryFor(row),
    teachingPlace: textOf(row.querySelector('.cv-time-col')),
  };
}

// ------------------------------------------------------------ 交互

function targetText(info: TargetInfo): string {
  const parts = [info.courseName, info.teacherName].filter((s) => s !== '');
  const label = parts.length === 0 ? info.tcId : parts.join(' / ');
  return info.category === '' ? `${label}（类别未识别）` : label;
}

/**
 * 复制教学班ID。
 *
 * ⚠️ **不能只用 `navigator.clipboard`**：bkxk 是 `http://` 页面（非安全上下文），
 * Chromium 在那里根本不暴露它 —— 第五轮手测报的
 * `Error: 当前环境没有 navigator.clipboard` 就是这个原因。
 * 现在走 `copyText()`（GM_setClipboard → execCommand → 剪贴板 API 三条路依次退）。
 */
async function copyId(tcId: string, panel: PanelApi): Promise<void> {
  const res = await copyText(tcId);
  if (res.ok) {
    log.info(`已复制教学班ID ${tcId} 到剪贴板（方式：${res.method}）`);
    panel.toast('已复制教学班ID', 'success');
    return;
  }
  // 复制失败不是致命错误：ID 行整块可选中（user-select: all），用户能手动拖选
  log.warn(`复制教学班ID 失败：${res.detail}（可手动选中那一行复制）`);
  panel.toast('复制失败，请手动选中复制', 'warn');
}

function onGrab(info: TargetInfo, ctx: Ctx, btn: HTMLButtonElement): void {
  if (hasTask(ctx.tasks, info.tcId)) {
    ctx.panel.toast('这个教学班已经在抢课队列里了（不重复添加）', 'info');
    return;
  }
  const res = addTask(ctx.tasks, {
    ...info,
    now: Date.now(),
    retryMode: getValue<string>(SITE_ID, VALUE.RETRY_MODE),
  });
  if (!res.added) return;
  ctx.tasks = res.store;
  write(BKXK_STORE_KEY.TASKS, ctx.tasks);
  btn.textContent = grabButtonLabel(true);
  btn.classList.add('sztb-bkxk-btn-on');
  log.info(`已加入抢课队列：${targetText(info)}（本轮只入队，不会发送任何请求）`);
  ctx.panel.toast(`已加入抢课队列：${info.courseName === '' ? info.tcId : info.courseName}`, 'success');
}

function onMonitorToggle(info: TargetInfo, ctx: Ctx, btn: HTMLButtonElement): void {
  const wasOn = hasMonitor(ctx.monitor, info.tcId);
  if (wasOn) {
    ctx.monitor = removeMonitor(ctx.monitor, info.tcId).store;
    log.info(`已移出监控列表：${targetText(info)}`);
    ctx.panel.toast('已移出监控', 'info');
  } else {
    ctx.monitor = addMonitor(ctx.monitor, { ...info, now: Date.now() }).store;
    log.info(`已加入监控列表：${targetText(info)}（本轮只入队，不会轮询）`);
    ctx.panel.toast('已加入监控', 'success');
  }
  write(BKXK_STORE_KEY.MONITOR, ctx.monitor);
  btn.textContent = monitorButtonLabel(!wasOn);
  btn.classList.toggle('sztb-bkxk-btn-on', !wasOn);
}

function buildBlock(info: TargetInfo, ctx: Ctx): HTMLElement {
  const idLine = el('div', {
    class: 'sztb-bkxk-id',
    text: idLineText(info.tcId),
    attrs: { title: `点击复制：${info.tcId}` },
    on: {
      click: (ev) => {
        swallow(ev);
        void copyId(info.tcId, ctx.panel);
      },
    },
  });

  const queued = hasTask(ctx.tasks, info.tcId);
  const grab = el('button', {
    class: `sztb-bkxk-btn${queued ? ' sztb-bkxk-btn-on' : ''}`,
    text: grabButtonLabel(queued),
    attrs: { type: 'button' },
    on: {
      click: (ev) => {
        swallow(ev);
        onGrab(info, ctx, grab);
      },
    },
  });

  const monitored = hasMonitor(ctx.monitor, info.tcId);
  const mon = el('button', {
    class: `sztb-bkxk-btn${monitored ? ' sztb-bkxk-btn-on' : ''}`,
    text: monitorButtonLabel(monitored),
    attrs: { type: 'button' },
    on: {
      click: (ev) => {
        swallow(ev);
        onMonitorToggle(info, ctx, mon);
      },
    },
  });

  const block = el('div', {
    class: 'sztb-bkxk-block',
    attrs: { 'data-sztb-tcid': info.tcId },
  }, idLine, el('div', { class: 'sztb-bkxk-ops' }, grab, mon));

  // 整块兜一层：万一以后有子元素忘了 swallow，也不会冒泡到站点的行/卡片处理器
  block.addEventListener('click', swallow);
  return block;
}

// ------------------------------------------------------------ 注入

function injectStyle(): void {
  if (document.getElementById(LIST_STYLE_ID) !== null) return;
  const style = el('style', { attrs: { id: LIST_STYLE_ID } });
  style.textContent = LIST_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/** 卡片形态：注入单元是 `.cv-info`（= 一个教学班） */
function enhanceUnit(unit: HTMLElement, ctx: Ctx): void {
  if (ctx.budget >= MAX_BLOCKS_PER_SCAN) return;
  if (ownsBlock(unit)) return;
  const tcId = tcIdIn(unit);
  if (tcId === null) {
    log.debug('卡片 .cv-info 未取到教学班 id，跳过（站点结构可能已变）');
    return;
  }
  const info = infoForUnit(unit, tcId);
  const block = buildBlock(info, ctx);
  // 注入点在**卡片最前面**（教师名那一行之前）—— v0.17 用户手测后指定。
  // 原先插在 `.cv-caption-red` 之后，而它实测位于 `div.cv-info > h5 > div.cv-caption-red`，
  // 也就是塞进了站点的单行容器 `<h5>` 里：块宽度不受卡片约束，部分卡片因此把内容顶到卡片外。
  // 放到 `.cv-info` 的第一个子位置，块就成了卡片的普通块级子元素，宽度自然被卡片约束。
  unit.insertBefore(block, unit.firstChild);
  ctx.budget += 1;
}

/** 列表形态：注入单元是整行，块放在行末新加的一列里 */
function enhanceRow(row: HTMLElement, ctx: Ctx): void {
  if (ctx.budget >= MAX_BLOCKS_PER_SCAN) return;
  // 卡片页的行：教学班在卡片里，由 enhanceUnit 负责，这里不重复插列
  if (row.querySelector(CARD_SELECTOR) !== null) return;
  if (row.querySelector(`:scope > .sztb-bkxk-col`) !== null) return;
  const cell = row.querySelector<HTMLElement>(SETTING_COL_SELECTOR);
  if (cell === null) return;
  const ids = tcIdsIn(cell);
  if (ids.length === 0) {
    log.debug('列表行未取到教学班 id，跳过（站点结构可能已变）');
    return;
  }
  const col = el('div', { class: 'sztb-bkxk-col' });
  for (const tcId of ids) {
    col.appendChild(buildBlock(infoForRow(row, tcId), ctx));
    ctx.budget += 1;
  }
  row.appendChild(col);
}

/** 给被加过列的容器补表头列（站点重绘后表头可能先到、后到，所以每轮都对一次） */
function syncHeads(): void {
  for (const body of document.querySelectorAll<HTMLElement>(BODY_SELECTOR)) {
    if (body.querySelector(`:scope > ${ROW_SELECTOR} > .sztb-bkxk-col`) === null) continue;
    const head = body.parentElement?.querySelector<HTMLElement>(':scope > .cv-head') ?? null;
    if (head === null) continue;
    if (head.querySelector(':scope > .sztb-bkxk-col') !== null) continue;
    head.appendChild(el('div', { class: 'sztb-bkxk-col sztb-bkxk-head', text: HEAD_TEXT }));
  }
}

/**
 * 把我们注入的节点全部摘掉（关开关时用）。
 *
 * 只认带 `sztb-bkxk-` 前缀的类名 —— 站点自己的类都是 `cv-` 开头，
 * 不会误删。摘掉之后站点行里会留下一个空 `div`（我们没有改它的行结构），
 * 无害；重绘后连空壳也没了。
 */
function removeInjected(): void {
  const nodes = document.querySelectorAll('.sztb-bkxk-block, .sztb-bkxk-col, .sztb-bkxk-head');
  if (nodes.length === 0) return;
  for (const node of nodes) node.remove();
  log.info(`列表注入开关已关闭：移除 ${String(nodes.length)} 个注入节点`);
}

function scan(ctx: Ctx): void {
  if (!isEnabled(SITE_ID, TOGGLE.LIST_INJECT)) {
    removeInjected();
    return;
  }
  ctx.budget = 0;
  injectStyle();
  for (const unit of document.querySelectorAll<HTMLElement>(`${CARD_SELECTOR} ${INFO_SELECTOR}`)) {
    enhanceUnit(unit, ctx);
  }
  for (const row of document.querySelectorAll<HTMLElement>(`${BODY_SELECTOR} > ${ROW_SELECTOR}`)) {
    enhanceRow(row, ctx);
  }
  syncHeads();
}

/**
 * 启动列表注入。返回一个停止函数（供将来做「关掉功能即时生效」时用）。
 *
 * 只在选课页生效：课表页（`curriculum.do`）也有 `.cv-row` 之类的东西，
 * 不是我们该动的地方。
 */
export function startListInjection(panel: PanelApi): () => void {
  if (!location.pathname.includes(LIST_PAGE_MARK)) {
    log.debug(`当前不是选课页（${location.pathname}），跳过列表注入`);
    return () => undefined;
  }

  const ctx: Ctx = {
    panel,
    tasks: readTaskStore(read<unknown>(BKXK_STORE_KEY.TASKS, null)),
    monitor: readMonitorStore(read<unknown>(BKXK_STORE_KEY.MONITOR, null)),
    budget: 0,
  };

  let observer: MutationObserver | null = null;
  let timer: number | null = null;

  const schedule = (): void => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      scan(ctx);
    }, RESCAN_DELAY_MS);
  };

  whenDomReady(() => {
    scan(ctx);
    // 站点的页签切换 / 翻页全是 XHR + 重绘，必须跟着补注入
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    log.info(
      `选课列表注入已就绪：抢课队列 ${String(ctx.tasks.items.length)} 条 / ` +
        `监控 ${String(ctx.monitor.items.length)} 条（本轮点击只入队，不发请求）`,
    );
  });

  return () => {
    observer?.disconnect();
    observer = null;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}
