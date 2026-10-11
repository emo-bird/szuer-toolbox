/**
 * bkxk 选课列表的「DOM 读取层」（从 list.ts 拆出，C2 批4）。
 *
 * 只放「从站点行/卡片里读出教学班信息」的零副作用读取：吞事件 / 干净文本 /
 * 归属判定（ownDescendant / ownsBlock）/ tcid 抽取 / 类别容器定位 / info 组装。
 * 一切写 DOM、改 store、弹按钮状态的逻辑都不在这里；模型判据走 list-model.ts。
 */

import {
  cleanText,
  isTcId,
  pickTcId,
  categoryOfBodyId,
  placeFromTimeText,
  teacherFromTitle,
  type TargetInfo,
} from './list-model.ts';

// ------------------------------------------------------------ 选择器

/** 教学班详情块（嵌套会出现，归属判定靠它） */
export const INFO_SELECTOR = '.cv-info';
/** 课程名位置：列表页是 .cv-title-col，卡片页是 .cv-course */
const TITLE_CELL_SELECTOR = '.cv-title-col, .cv-course';

// ------------------------------------------------------------ 纯 DOM 小工具

/** 吞掉事件：站点在行/卡片上有自己的「选择」处理，多一个块绝不能触发它 */
export function swallow(ev: Event): void {
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
export function ownDescendant(unit: HTMLElement, selector: string): HTMLElement | null {
  for (const node of unit.querySelectorAll<HTMLElement>(selector)) {
    if (node.closest(INFO_SELECTOR) === unit) return node;
  }
  return null;
}

/** `unit` 自己（不含嵌套教学班）是不是已经注入过了 */
export function ownsBlock(unit: HTMLElement): boolean {
  return ownDescendant(unit, '.sztb-bkxk-block') !== null;
}

/** 属性名大小写不敏感地取一个属性值 */
function attr(node: Element, name: string): string {
  const v = node.getAttribute(name);
  return v === null ? '' : v.trim();
}

/** `unit` 自己的教学班 id：取它自己身上的 `tcid`（退选按钮 / 选择按钮 / 课程图标） */
export function tcIdIn(unit: HTMLElement): string | null {
  const candidates: string[] = [];
  for (const node of unit.querySelectorAll<HTMLElement>('[tcid]')) {
    if (node.closest(INFO_SELECTOR) !== unit) continue;
    candidates.push(attr(node, 'tcid'));
  }
  return pickTcId(candidates);
}

/** 容器（行 / 设置列）里的全部教学班 id，按出现顺序去重 */
export function tcIdsIn(node: HTMLElement): string[] {
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

export function infoForUnit(unit: HTMLElement, tcId: string): TargetInfo {
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

export function infoForRow(row: HTMLElement, tcId: string): TargetInfo {
  return {
    tcId,
    courseName: courseNameOf(row),
    teacherName: textOf(row.querySelector('.cv-teacher-col')),
    category: categoryFor(row),
    teachingPlace: textOf(row.querySelector('.cv-time-col')),
  };
}
