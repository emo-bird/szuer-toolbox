/**
 * 本科选课自己的【自定义课程】标签页。
 *
 * 【它是干什么的】用户在这里维护「课表上没有、但实际要上的课」（重修、慕课、外院课…），
 * 这些课不是学校选的课，站点自己不知道，所以由本工具带进两处：
 *   ① 列表页响应里追加冲突描述（`hijack.ts` 的 `augmentList`）；
 *   ② 课表页响应里追加一行（站点自己画，我们给这一行的课名加「自定义」标签，见 `tt-mark.ts`）。
 *
 * 【为什么提前做】原计划排在批 4。批 3 的 `hijack` / `timetable` 写完才发现：
 * 验收它们**必须先有自定义课程数据**，而全项目当时没有任何写入入口（数据层是只读的），
 * 连手测都做不成 —— 用户拍板把它提前到本轮（需求文档 Q-F 早已定「UI 版 = 纯表单」，
 * 旧仓库 `ui.js:441-540` 那个「时间地点」文本框正是 Q-F 要否掉的「纯靠文本识别」）。
 *
 * 【录入方式：结构化表单，不让人写时间文本】周次起止 / 单双周 / 星期 / 节次起止 / 地点
 * 分开填，提交时由 `custom-form.ts` → `time.ts` 的 `placeTextFor` **生成**站点格式的
 * `place` 串。存储里仍然只有 `place` 一个真源（`segs` 不落盘），所以将来解析口径改了，
 * 历史数据自动跟着变，不需要数据迁移。
 *
 * 【编辑回填的反向路径】`draftsFromText(course.place)` 把 `place` 拆回表单。
 * 它可能返回空数组（原文本解析不出）—— 那时**必须**告诉用户「已按默认值回填、请重填」，
 * 不能装作读出来了。
 *
 * 【改完立刻重画课表】增删改只动 storage，站点 DOM 一个字节都没变 ⇒
 * `timetable.ts` 的 MutationObserver 不会触发，用户会以为「加了课却没出现」。
 * 所以每次改动都调 `refreshTimetable()`（不在课表页时它静默返回 0）。
 *
 * 【总开关】设置里的「自定义课程」（🟢）关掉时整页禁用（用户拍板 A）：
 * 只显示一行提示、表单不可填；同时 `custom.ts:readEnabledCustomCourses()` 返回空数组，
 * 于是接管与注入也一并停用。
 */

import { el } from '../../../common/utils/dom.ts';
import {
  appendCourse,
  makeCourseId,
  readCustomCourses,
  removeCourse,
  setCourseEnabled,
  updateCourse,
  writeCustomCourses,
} from '../../../common/custom/courses.ts';
import type { CustomCourse, CustomCourseDraft } from '../../../common/custom/courses.ts';
import { scoped } from '../../../common/core/log.ts';
import { isEnabled } from '../../../common/core/settings.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { countSelfConflicts } from '../custom.ts';
import {
  DRAFT_LIMITS,
  draftsFromText,
  emptySegment,
  placeFromDraft,
  validateDraft,
} from '../custom-form.ts';
import type { ParityChoice, SegmentDraft } from '../custom-form.ts';
import { SITE_ID, TOGGLE } from '../settings.ts';
import { refreshTimetable } from '../timetable.ts';
import { CN_WEEKDAY, parsePlace } from '../time.ts';
import { CUSTOM_TAB_CSS } from './custom-style.ts';

const log = scoped('bkxk/custom-tab');

/** 本标签页的 id。任务 / 监控两页将来接在 100 / 120，本页 150，【设置】200。 */
const BKXK_CUSTOM_TAB_ID = 'bkxk:custom';

/** 单双周下拉（取值必须与 `ParityChoice` 一致） */
const PARITY_OPTIONS: readonly (readonly [ParityChoice, string])[] = [
  ['', '每周'],
  ['单', '单周'],
  ['双', '双周'],
];

export const BKXK_CUSTOM_TAB: TabRegistration = {
  id: BKXK_CUSTOM_TAB_ID,
  title: '自定义',
  order: 150,
  css: CUSTOM_TAB_CSS,
  mount(root: HTMLElement, ctx: TabContext): void {
    mountCustomTab(root, ctx);
  },
};

function mountCustomTab(root: HTMLElement, ctx: TabContext): void {
  let courses: readonly CustomCourse[] = readCustomCourses();
  let editingId: string | null = null;
  let segs: SegmentDraft[] = [emptySegment()];

  // ── 总开关关闭时的样子 ────────────────────────────────────────────────
  const offNote = el('div', {
    class: 'sztb-note',
    text:
      '「自定义课程」已在【设置】里关闭：这些课不会参与列表页的冲突追加，' +
      '也不会注入课表。要使用请到【设置】页打开它，再切回本页。',
  });
  offNote.hidden = true;

  // ── 可用态 ────────────────────────────────────────────────────────────
  const body = el('div');

  // 表单
  const formTitle = el('div', { class: 'sztb-group-title', text: '添加自定义课程' });

  const nameInput = el('input', {
    class: 'sztb-input',
    attrs: { type: 'text', placeholder: '例：线性代数（重修）', maxlength: 40 },
  });
  const teacherInput = el('input', {
    class: 'sztb-input',
    attrs: { type: 'text', placeholder: '可空，例：张三', maxlength: 30 },
  });

  const segBox = el('div');
  const addSegBtn = el('button', {
    class: 'sztb-btn',
    attrs: { type: 'button' },
    text: '再加一段',
  });
  const submitBtn = el('button', {
    class: 'sztb-btn',
    attrs: { type: 'button', 'data-variant': 'primary' },
    text: '添加',
  });
  const cancelBtn = el('button', {
    class: 'sztb-btn',
    attrs: { type: 'button' },
    text: '取消编辑',
  });
  cancelBtn.hidden = true;

  const hint = el('div', { class: 'sztb-field-hint' });
  hint.hidden = true;

  const warnBox = el('div', { class: 'sztb-note sztb-bkxk-warn' });
  warnBox.hidden = true;

  // 列表
  const listTitle = el('div', { class: 'sztb-group-title', text: '已添加' });
  const listBox = el('div');
  const clearBtn = el('button', {
    class: 'sztb-btn',
    attrs: { type: 'button', 'data-variant': 'danger' },
    text: '清空全部',
  });

  const formToolbar = el('div', { class: 'sztb-toolbar' }, addSegBtn, submitBtn, cancelBtn);
  const listToolbar = el('div', { class: 'sztb-toolbar' }, clearBtn);

  const segField = el('div', { class: 'sztb-field' });
  segField.appendChild(el('label', { class: 'sztb-field-label', text: '上课时间' }));
  segField.appendChild(segBox);

  const noteTop = el('div', {
    class: 'sztb-note',
    text:
      '课程名与地点必填，教师可空。时间用下面的下拉与数字框填 —— ' +
      '不用也不能手写时间文本（写错了自己也不知道）。' +
      '这里加的课会参与 ① 列表页的冲突提示 ② 课表页（站点自己画的课表里会带上「自定义」标签）。',
  });

  body.appendChild(noteTop);
  body.appendChild(formTitle);
  body.appendChild(field('课程名', nameInput));
  body.appendChild(field('教师', teacherInput));
  body.appendChild(segField);
  body.appendChild(formToolbar);
  body.appendChild(hint);
  body.appendChild(warnBox);
  body.appendChild(listTitle);
  body.appendChild(listBox);
  body.appendChild(listToolbar);

  root.appendChild(offNote);
  root.appendChild(body);

  // ── 总开关 ────────────────────────────────────────────────────────────
  /** 重新读一次总开关并切换显示；返回「当前是否可用」 */
  function applyGate(): boolean {
    const on = isEnabled(SITE_ID, TOGGLE.CUSTOM_COURSES);
    offNote.hidden = on;
    body.hidden = !on;
    return on;
  }

  /** 每个会改动数据的动作前都过一遍：开关被关掉时拒绝写入并提示 */
  function guard(): boolean {
    if (applyGate()) return true;
    ctx.host.toast('「自定义课程」已在【设置】里关闭', 'warn');
    return false;
  }

  // ── 小工具 ────────────────────────────────────────────────────────────
  function field(label: string, control: HTMLElement): HTMLElement {
    const box = el('div', { class: 'sztb-field' });
    box.appendChild(el('label', { class: 'sztb-field-label', text: label }));
    box.appendChild(control);
    return box;
  }

  function showHint(text: string): void {
    hint.textContent = text;
    hint.hidden = false;
  }

  function hideHint(): void {
    hint.textContent = '';
    hint.hidden = true;
  }

  function patchSeg(index: number, patch: Partial<SegmentDraft>): void {
    const cur = segs[index];
    if (cur === undefined) return;
    segs[index] = { ...cur, ...patch };
  }

  function numInput(value: string, onChange: (v: string) => void): HTMLInputElement {
    const input = el('input', {
      class: 'sztb-input sztb-bkxk-num',
      attrs: { type: 'text', inputmode: 'numeric', maxlength: 2 },
    });
    input.value = value;
    input.addEventListener('input', () => {
      onChange(input.value);
    });
    return input;
  }

  function optionEl(value: string, label: string): HTMLOptionElement {
    const opt = el('option', { text: label });
    opt.value = value;
    return opt;
  }

  function paritySelect(value: ParityChoice, onChange: (v: ParityChoice) => void): HTMLSelectElement {
    const sel = el('select', { class: 'sztb-select sztb-bkxk-parity' });
    for (const [v, label] of PARITY_OPTIONS) sel.appendChild(optionEl(v, label));
    sel.value = value;
    sel.addEventListener('change', () => {
      onChange(sel.value as ParityChoice);
    });
    return sel;
  }

  function daySelect(value: string, onChange: (v: string) => void): HTMLSelectElement {
    const sel = el('select', { class: 'sztb-select sztb-bkxk-parity' });
    sel.appendChild(optionEl('', '—'));
    for (let d = 1; d <= 7; d += 1) sel.appendChild(optionEl(String(d), CN_WEEKDAY[d] ?? ''));
    sel.value = value;
    sel.addEventListener('change', () => {
      onChange(sel.value);
    });
    return sel;
  }

  function placeInput(value: string, onChange: (v: string) => void): HTMLInputElement {
    const input = el('input', {
      class: 'sztb-input',
      attrs: { type: 'text', placeholder: '例：致理楼L1-707', maxlength: 60 },
    });
    input.value = value;
    input.addEventListener('input', () => {
      onChange(input.value);
    });
    return input;
  }

  function line(...nodes: readonly (Node | string)[]): HTMLElement {
    const box = el('div', { class: 'sztb-bkxk-line' });
    for (const n of nodes) box.appendChild(typeof n === 'string' ? el('span', { class: 'sztb-bkxk-amp', text: n }) : n);
    return box;
  }

  function gridRow(key: string, control: HTMLElement): readonly HTMLElement[] {
    return [el('span', { class: 'sztb-bkxk-key', text: key }), control];
  }

  // ── 表单：段 ──────────────────────────────────────────────────────────
  function buildSegRow(index: number, draft: SegmentDraft): HTMLElement {
    const block = el('div', { class: 'sztb-bkxk-seg' });

    const head = el('div', { class: 'sztb-bkxk-seghead' });
    head.appendChild(el('span', { text: `第 ${String(index + 1)} 段` }));
    if (segs.length > 1) {
      const del = el('button', {
        class: 'sztb-btn',
        attrs: { type: 'button' },
        text: '删除这段',
      });
      del.addEventListener('click', () => {
        segs.splice(index, 1);
        renderSegs();
      });
      head.appendChild(del);
    }
    block.appendChild(head);

    const grid = el('div', { class: 'sztb-bkxk-grid' });

    for (const node of gridRow(
      '周次',
      line(
        numInput(draft.weekFrom, (v) => {
          patchSeg(index, { weekFrom: v });
        }),
        '到',
        numInput(draft.weekTo, (v) => {
          patchSeg(index, { weekTo: v });
        }),
        paritySelect(draft.parity, (v) => {
          patchSeg(index, { parity: v });
        }),
      ),
    )) {
      grid.appendChild(node);
    }

    for (const node of gridRow(
      '星期',
      line(
        daySelect(draft.day, (v) => {
          patchSeg(index, { day: v });
        }),
      ),
    )) {
      grid.appendChild(node);
    }

    for (const node of gridRow(
      '节次',
      line(
        numInput(draft.sectionFrom, (v) => {
          patchSeg(index, { sectionFrom: v });
        }),
        '到',
        numInput(draft.sectionTo, (v) => {
          patchSeg(index, { sectionTo: v });
        }),
        '节',
      ),
    )) {
      grid.appendChild(node);
    }

    for (const node of gridRow(
      '地点',
      line(
        placeInput(draft.place, (v) => {
          patchSeg(index, { place: v });
        }),
      ),
    )) {
      grid.appendChild(node);
    }

    block.appendChild(grid);
    return block;
  }

  function renderSegs(): void {
    segBox.textContent = '';
    for (let i = 0; i < segs.length; i += 1) {
      const d = segs[i];
      if (d === undefined) continue;
      segBox.appendChild(buildSegRow(i, d));
    }
  }

  /**
   * 把面板滚到表单标题那一行（课程名输入框紧随其下）。
   *
   * ⚠️ 这里**不能**写 `root.scrollTop = 0` —— `root` 是标签页自己的容器，
   * 真正滚动的是外层的 `.sztb-body`（`overflow: auto`）。对 root 设 scrollTop
   * 是个静默的空操作：不报错，也不起作用（v0.25 修的就是这个）。
   * `scrollIntoView` 会自己去找最近的可滚动祖先，所以不必知道面板内部结构，
   * 将来面板结构改了这里也不用跟着改。
   *
   * 用默认的即时滚动（不用 smooth）：面板小、滚动距离短，动画反而像卡了一下，
   * 也避免用户连点两次时两段动画互相打断。
   */
  function scrollToForm(): void {
    formTitle.scrollIntoView({ block: 'start' });
  }

  // ── 表单：提交 / 重置 / 回填 ──────────────────────────────────────────
  function resetForm(): void {
    editingId = null;
    nameInput.value = '';
    teacherInput.value = '';
    segs = [emptySegment()];
    renderSegs();
    hideHint();
    formTitle.textContent = '添加自定义课程';
    submitBtn.textContent = '添加';
    cancelBtn.hidden = true;
  }

  function submit(): void {
    if (!guard()) return;
    const name = nameInput.value.trim();
    const err = validateDraft(name, segs);
    if (err !== null) {
      showHint(err);
      ctx.host.toast(err, 'warn');
      return;
    }
    const place = placeFromDraft(segs);
    if (place === null) {
      const msg = '时间填得不完整，请检查周次 / 节次 / 星期 / 地点';
      showHint(msg);
      ctx.host.toast(msg, 'warn');
      return;
    }
    // 自检：生成与解析必须互为逆运算（`custom-form.ts` 的硬约定）。
    // 不该失败；真失败说明两处口径漂了，宁可拒收也不能写进一份解析不出的数据。
    const parsed = parsePlace(place);
    if (parsed.length !== segs.length) {
      log.warn(
        `生成的时间文本与解析结果对不上：${place}（解析出 ${String(parsed.length)} 段，表单有 ${String(segs.length)} 段）`,
      );
      const msg = '时间文本生成异常，已取消本次提交（请把这条日志报给开发者）';
      showHint(msg);
      ctx.host.toast(msg, 'error');
      return;
    }

    const draft: CustomCourseDraft = { name, teacher: teacherInput.value.trim(), place };
    const editing = editingId;
    const next =
      editing === null
        ? appendCourse(courses, draft, makeCourseId(Date.now(), Math.random()))
        : updateCourse(courses, editing, draft);

    mutate(next);
    resetForm();
    log.info(`${editing === null ? '添加' : '修改'}自定义课程「${name}」（${place}）`);
    ctx.host.toast(editing === null ? '已添加' : '已保存修改', 'success');
  }

  function beginEdit(course: CustomCourse): void {
    if (!guard()) return;
    const drafts = draftsFromText(course.place);
    editingId = course.id;
    nameInput.value = course.name;
    teacherInput.value = course.teacher;
    if (drafts.length === 0) {
      segs = [emptySegment()];
      const msg = '这门课原本的时间文本解析不出，已按默认值回填，请重新填写';
      showHint(msg);
      ctx.host.toast(msg, 'warn');
      log.warn(`自定义课程「${course.name}」的 place 解析不出：${course.place}`);
    } else {
      segs = drafts.map((d) => ({ ...d }));
      hideHint();
    }
    renderSegs();
    formTitle.textContent = `修改：${course.name}`;
    submitBtn.textContent = '保存修改';
    cancelBtn.hidden = false;
    scrollToForm();
  }

  // ── 列表 ──────────────────────────────────────────────────────────────
  function buildItem(course: CustomCourse): HTMLElement {
    const item = el('div', { class: 'sztb-bkxk-item', data: course.enabled ? {} : { off: 'true' } });

    const color = el('span', { class: 'sztb-bkxk-color' });
    color.style.background = course.color;
    item.appendChild(color);

    const toggle = el('input', { attrs: { type: 'checkbox', title: '参与冲突计算与课表注入' } });
    toggle.checked = course.enabled;
    toggle.addEventListener('change', () => {
      if (!guard()) {
        toggle.checked = course.enabled;
        return;
      }
      mutate(setCourseEnabled(courses, course.id, toggle.checked));
      log.info(`${toggle.checked ? '启用' : '停用'}自定义课程「${course.name}」`);
    });
    item.appendChild(toggle);

    const main = el('div', { class: 'sztb-bkxk-itemmain' });
    main.appendChild(el('span', { class: 'sztb-bkxk-name', text: course.name }));
    main.appendChild(
      el('span', {
        class: 'sztb-bkxk-meta',
        text: course.teacher === '' ? course.place : `${course.teacher} ｜ ${course.place}`,
      }),
    );
    const parsedCount = parsePlace(course.place).length;
    main.appendChild(
      el('span', {
        class: parsedCount === 0 ? 'sztb-bkxk-meta sztb-bkxk-bad' : 'sztb-bkxk-meta',
        text:
          parsedCount === 0
            ? '时间未解析：这门课不会参与冲突计算，也不会注入课表（建议【修改】重填）'
            : `解析出 ${String(parsedCount)} 段`,
      }),
    );
    item.appendChild(main);

    const ops = el('div', { class: 'sztb-bkxk-ops' });
    const editBtn = el('button', { class: 'sztb-btn', attrs: { type: 'button' }, text: '修改' });
    editBtn.addEventListener('click', () => {
      beginEdit(course);
    });
    const delBtn = el('button', {
      class: 'sztb-btn',
      attrs: { type: 'button', 'data-variant': 'danger' },
      text: '删除',
    });
    delBtn.addEventListener('click', () => {
      if (!guard()) return;
      const wasEditing = editingId === course.id;
      mutate(removeCourse(courses, course.id));
      if (wasEditing) resetForm();
      log.info(`删除自定义课程「${course.name}」`);
      ctx.host.toast('已删除', 'success');
    });
    ops.appendChild(editBtn);
    ops.appendChild(delBtn);
    item.appendChild(ops);

    return item;
  }

  function renderList(): void {
    listBox.textContent = '';
    listTitle.textContent = `已添加（${String(courses.length)} 门）`;
    if (courses.length === 0) {
      listBox.appendChild(
        el('div', { class: 'sztb-empty', text: '还没有自定义课程。上面填一门，点【添加】。' }),
      );
      listToolbar.hidden = true;
      return;
    }
    listToolbar.hidden = false;
    for (const c of courses) listBox.appendChild(buildItem(c));
  }

  function renderConflicts(): void {
    const n = countSelfConflicts(courses);
    if (n <= 0) {
      warnBox.hidden = true;
      warnBox.textContent = '';
      return;
    }
    warnBox.hidden = false;
    warnBox.textContent = `自定义课程之间有 ${String(n)} 处时间冲突（不影响使用，只是提醒）`;
  }

  // ── 唯一的写入出口 ────────────────────────────────────────────────────
  function mutate(next: readonly CustomCourse[]): void {
    courses = next;
    writeCustomCourses(next);
    renderList();
    renderConflicts();
    // 只动 storage 不会触发站点的 MutationObserver，必须主动请站点重画一次课表
    if (refreshTimetable() > 0) log.info('已请站点重画课表（这次带的课程就是你刚改的）');
  }

  // ── 事件 ──────────────────────────────────────────────────────────────
  addSegBtn.addEventListener('click', () => {
    if (!guard()) return;
    if (segs.length >= DRAFT_LIMITS.MAX_SEGMENTS) {
      const msg = `最多 ${String(DRAFT_LIMITS.MAX_SEGMENTS)} 段`;
      showHint(msg);
      ctx.host.toast(msg, 'warn');
      return;
    }
    segs.push(emptySegment());
    renderSegs();
  });

  submitBtn.addEventListener('click', () => {
    submit();
  });

  cancelBtn.addEventListener('click', () => {
    resetForm();
    // 取消后表单调回「添加」并缩回一段，视图也回到表单开头，免得停在下半屏
    scrollToForm();
  });

  clearBtn.addEventListener('click', () => {
    if (!guard()) return;
    const n = courses.length;
    void ctx.host
      .confirm({
        title: '清空自定义课程',
        body: `确定要删除全部 ${String(n)} 门自定义课程吗？删除后无法恢复。`,
        danger: true,
        confirmText: '全部删除',
      })
      .then((ok) => {
        if (!ok) return;
        mutate([]);
        resetForm();
        log.info(`清空自定义课程：删除 ${String(n)} 门`);
        ctx.host.toast('已清空', 'success');
      });
  });

  // ── 首次渲染 ──────────────────────────────────────────────────────────
  renderSegs();
  renderList();
  renderConflicts();
  applyGate();
}
