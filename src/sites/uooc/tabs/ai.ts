import { el } from '../../../common/utils/dom.ts';
import { copyText } from '../../../common/utils/clipboard.ts';
import { backendName } from '../../../common/core/storage.ts';
import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { isQuizRunning, quizTidOnPage, runQuizAnswer, stopQuizAnswer, subscribeQuizRun } from '../ai/index.ts';
import { testConnection, validateLlmEndpoint } from '../ai/llm.ts';
import {
  DEEPSEEK_FLASH, DEEPSEEK_MAX_LOCAL_INPUT, DEEPSEEK_MAX_OUTPUT, DEEPSEEK_ORIGIN, DEEPSEEK_PRO,
  deepSeekFileExpired, deepSeekModel, deepSeekOptions, isDeepSeekEndpoint, THINKING_MODES,
} from '../ai/deepseek.ts';
import { mountDeepSeekTools } from '../ai/deepseek-tools-panel.ts';
import { deleteDeepSeekFile } from '../ai/deepseek-tools.ts';
import { monitorState, QUIZ_PHASE_TEXT, subscribeMonitor } from '../ai/monitor.ts';
import { mountRunnerSettings } from '../ai/runner-settings.ts';
import {
  GROUP, SITE_ID, activeAiProfile, aiConfig, aiProfiles, aiProfileSecret, exportAiProfiles,
  courseReferenceFile, referenceCourseId, removeAiProfile, removeReferenceFileBindings, saveAiProfile,
  selectAiProfile, setCourseReferenceFile,
} from '../settings.ts';
import type { AiProfile } from '../settings.ts';

function button(text: string, click: (event: MouseEvent) => void, primary = false): HTMLButtonElement {
  return el('button', {
    class: 'sztb-btn',
    text,
    attrs: { type: 'button', ...(primary ? { 'data-variant': 'primary' } : {}) },
    on: { click },
  });
}

function input(id: string, type = 'text', attrs: Record<string, string> = {}): HTMLInputElement {
  return el('input', { class: 'sztb-input', attrs: { id: `sztb-ai-${id}`, type, ...attrs } });
}

function checkboxRow(control: HTMLInputElement, label: string): HTMLLabelElement {
  return el('label', { class: 'sztb-row' }, control,
    el('span', { class: 'sztb-row-label', text: label }));
}

function field(label: string, control: HTMLInputElement | HTMLSelectElement, ...description: HTMLElement[]): HTMLElement {
  return el('div', { class: 'sztb-field' },
    el('label', { class: 'sztb-field-label', text: label, attrs: { for: control.id } }),
    control,
    ...description,
  );
}

function hint(text = '', live = false): HTMLDivElement {
  return el('div', { class: 'sztb-field-desc', text, attrs: live ? { role: 'status' } : {} });
}

function mountProvider(root: HTMLElement, ctx: TabContext): { hasChanges(): boolean; dispose(): void } {
  let profile = activeAiProfile();
  let creating = false;
  let dirty = false;
  let removeKey = false;
  let test: AbortController | undefined;
  let hideKeyTimer: number | undefined;
  let disposed = false;
  let courseId = referenceCourseId();
  let deletingFile = false;

  const profileSelect = el('select', { class: 'sztb-select', attrs: { id: 'sztb-ai-profile' } });
  const name = input('name', 'text', { maxlength: '40' });
  const baseUrl = input('endpoint', 'url', { placeholder: 'https://api.example.com/v1', 'aria-describedby': 'sztb-ai-endpoint-hint' });
  const model = input('model', 'text', { placeholder: '服务商提供的模型 ID' });
  const apiKey = input('key', 'password', { autocomplete: 'new-password', spellcheck: 'false', 'aria-describedby': 'sztb-ai-key-hint' });
  const timeout = input('timeout', 'number', { min: '1', max: '2147483', step: 'any' });
  const concurrency = el('select', { class: 'sztb-select', attrs: { id: 'sztb-ai-concurrency' } });
  for (let value = 1; value <= 8; value++) {
    concurrency.add(el('option', { text: String(value), attrs: { value: String(value) } }));
  }
  const format = el('select', { class: 'sztb-select', attrs: { id: 'sztb-ai-format' } },
    el('option', { text: '兼容文本', attrs: { value: 'text' } }),
    el('option', { text: 'JSON（服务支持时）', attrs: { value: 'json' } }),
  );
  const vision = el('input', { attrs: { type: 'checkbox', id: 'sztb-ai-vision' } });
  const thinking = el('select', { class: 'sztb-select', attrs: { id: 'sztb-ai-thinking' } },
    ...THINKING_MODES.map((value, index) => el('option', {
      text: ['跟随模型', '关闭', '低', '高', '最高'][index], attrs: { value },
    })));
  const search = el('input', { attrs: { type: 'checkbox' } });
  const readUrl = el('input', { attrs: { type: 'checkbox' } });
  const safety = el('input', { attrs: { type: 'checkbox' } });
  const maxTokens = input('max-tokens', 'number', { min: '1', max: String(DEEPSEEK_MAX_OUTPUT), step: '1', placeholder: '跟随模型' });
  const inputLimit = input('input-limit', 'number', { min: '1', max: String(DEEPSEEK_MAX_LOCAL_INPUT), step: '1', placeholder: '留空由接口判断' });
  const context = el('textarea', {
    class: 'sztb-input', attrs: { id: 'sztb-ai-context', rows: 4, maxlength: DEEPSEEK_MAX_LOCAL_INPUT },
  });
  const modelHint = hint();
  const fileHint = hint();
  const fileStatus = hint('', true);
  const removeFile = button('解除课程绑定', () => {
    if (courseId === null || courseId !== referenceCourseId()) return;
    try {
      setCourseReferenceFile(courseId);
      updatePreview();
      fileStatus.textContent = '已解除当前课程绑定，文件仍留在 DeepSeek。';
    } catch {
      fileStatus.textContent = '无法解除课程绑定，请检查脚本存储设置。';
    }
  });
  const deleteFile = button('删除云端文件', () => {
    if (deletingFile || courseId === null || courseId !== referenceCourseId()) return;
    const targetCourse = courseId;
    const file = courseReferenceFile(targetCourse);
    if (file === undefined || !isDeepSeekEndpoint(baseUrl.value)) return;
    const key = draftKey({ ...profile, baseUrl: baseUrl.value.trim() });
    if (!key) {
      fileStatus.textContent = '请先填写当前 DeepSeek 账号的 API Key。';
      return;
    }
    deletingFile = true;
    updatePreview();
    void (async () => {
      try {
        const confirmed = await ctx.host.confirm({
          title: '删除 DeepSeek 云端文件？',
          body: `将永久删除「${file.name}」并解除使用该文件的课程绑定。`,
          confirmText: '永久删除',
          danger: true,
        });
        if (!confirmed || disposed || targetCourse !== referenceCourseId() ||
          courseReferenceFile(targetCourse)?.id !== file.id ||
          !isDeepSeekEndpoint(baseUrl.value) || key !== draftKey({ ...profile, baseUrl: baseUrl.value.trim() })) return;
        fileStatus.textContent = '正在删除云端文件…';
        await deleteDeepSeekFile(file.id, key);
        try {
          removeReferenceFileBindings(file.id);
        } catch {
          throw new Error('云端文件已删除，本机绑定清理失败，请手动解除课程绑定');
        }
        if (!disposed && courseId === targetCourse) fileStatus.textContent = '云端文件已删除，相关课程绑定已解除。';
      } catch (err) {
        if (!disposed && courseId === targetCourse) {
          fileStatus.textContent = err instanceof Error ? err.message : '无法确认云端文件是否删除。';
        }
      } finally {
        deletingFile = false;
        if (!disposed) updatePreview();
      }
    })();
  });
  const uploadFile = button('上传作答参考文件', () => {
    if (courseId !== null && courseId === referenceCourseId()) tools.openUpload();
  });
  const advanced = el('details', { class: 'sztb-field' },
    el('summary', { text: 'DeepSeek 思考与上下文' }),
    field('思考强度', thinking),
    checkboxRow(search, '联网搜索'),
    checkboxRow(readUrl, '阅读参考资料里的公开链接'),
    checkboxRow(safety, '内容安全审核'),
    modelHint,
    field('最大输出 Token', maxTokens),
    field('文本输入上限（字符）', inputLimit),
    el('div', { class: 'sztb-field-label', text: '作答参考文件' }),
    fileHint,
    el('div', { class: 'sztb-toolbar' }, uploadFile, removeFile, deleteFile),
    fileStatus,
    el('label', { class: 'sztb-field-label', text: '作答参考资料', attrs: { for: context.id } }),
    context,
    hint('参考资料会随每道题发送。联网工具可能另行计费，开启后使用兼容文本协议。'),
  );
  const endpointHint = hint();
  endpointHint.id = 'sztb-ai-endpoint-hint';
  const keyHint = hint();
  keyHint.id = 'sztb-ai-key-hint';
  const status = hint('', true);
  const diagnostics = hint('', true);
  const keyPreview = el('code', { class: 'sztb-field-desc', attrs: { hidden: true } });
  keyPreview.style.overflowWrap = 'anywhere';
  const tools = mountDeepSeekTools(
    () => {
      const draft = readDraft();
      return draft === null || !isDeepSeekEndpoint(draft.baseUrl) ? null : { ...draft, apiKey: draftKey(draft) };
    },
    (reference) => {
      const next = [context.value.trim(), reference.trim()].filter(Boolean).join('\n\n');
      if (next.length > context.maxLength) return false;
      context.value = next;
      advanced.open = true;
      markDirty();
      return true;
    },
    (file) => {
      if (deletingFile) return '请等待云端文件删除完成';
      if (courseId === null || courseId !== referenceCourseId()) return '请先打开对应课程的学习页，再上传并绑定文件';
      if (!isDeepSeekEndpoint(baseUrl.value) || deepSeekModel(model.value.trim()) !== DEEPSEEK_FLASH) {
        return '请将模型设为 deepseek-flash 后绑定文件';
      }
      try {
        setCourseReferenceFile(courseId, file);
        advanced.open = true;
        updatePreview();
        return null;
      } catch {
        return '无法保存课程文件，请检查脚本存储设置';
      }
    },
  );

  function concealKey(): void {
    if (hideKeyTimer !== undefined) window.clearTimeout(hideKeyTimer);
    hideKeyTimer = undefined;
    apiKey.type = 'password';
    keyPreview.textContent = '';
    keyPreview.hidden = true;
    showBtn.textContent = '显示密钥';
    showBtn.setAttribute('aria-pressed', 'false');
  }

  function selectedKey(): string {
    return creating ? '' : aiProfileSecret(profile.id, profile.baseUrl);
  }

  function updatePreview(): void {
    const endpoint = validateLlmEndpoint(baseUrl.value);
    endpointHint.textContent = endpoint.issue ?? `请求地址 ${endpoint.url}`;
    endpointHint.style.overflowWrap = 'anywhere';
    baseUrl.setAttribute('aria-invalid', String(baseUrl.value.trim() !== '' && endpoint.url === undefined));
    const saved = selectedKey();
    apiKey.placeholder = saved && !removeKey ? '已保存，填写可替换' : '按服务商要求填写';
    keyHint.textContent = backendName() === 'GM' ? '密钥保存在脚本管理器的独立存储中。' : '当前环境只在本次页面会话中保存密钥。';
    showBtn.disabled = !apiKey.value && (!saved || removeKey);
    clearBtn.disabled = !apiKey.value && (!saved || removeKey);
    saveBtn.disabled = !dirty;
    resetBtn.disabled = !dirty;
    const official = isDeepSeekEndpoint(baseUrl.value);
    const raw = model.value.trim();
    const selected = deepSeekModel(raw);
    const flash = selected === DEEPSEEK_FLASH;
    advanced.hidden = !official;
    tools.node.hidden = !official;
    search.disabled = readUrl.disabled = safety.disabled = official && !flash;
    thinking.disabled = official && !flash && selected !== DEEPSEEK_PRO;
    vision.disabled = official && selected === DEEPSEEK_PRO;
    const referenceFile = courseReferenceFile(courseId);
    uploadFile.disabled = deletingFile || !flash || courseId === null;
    removeFile.hidden = referenceFile === undefined;
    deleteFile.hidden = referenceFile === undefined;
    removeFile.disabled = deleteFile.disabled = deletingFile;
    fileHint.textContent = courseId === null ? '请打开对应课程的学习页绑定文件。'
      : referenceFile === undefined ? '当前课程尚未绑定文件。可上传 PDF、Word 或 PPT。'
        : deepSeekFileExpired(referenceFile) ? `${referenceFile.name} 已过期，请重新上传或移除。`
          : `${referenceFile.name} · 已绑定当前课程${flash ? '' : '，切换至 DeepSeek Flash 后启用'}`;
    modelHint.textContent = !flash ? '联网、读链接和高级内容审核适用于 deepseek-flash。'
      : raw !== selected ? `此旧模型 ID 会按 deepseek-flash 请求。`
      : search.checked || readUrl.checked ? '联网工具开启时，兼容文本协议会替代接口 JSON 模式。' : '';
  }

  function cancelTest(): void {
    test?.abort();
    test = undefined;
    testBtn.disabled = false;
    diagnostics.textContent = '';
  }

  function load(next: AiProfile): void {
    fileStatus.textContent = '';
    cancelTest();
    tools.reset();
    concealKey();
    profile = next;
    dirty = creating;
    removeKey = false;
    profileSelect.replaceChildren(...aiProfiles().map((item) => el('option', {
      text: item.name, attrs: { value: item.id },
    })));
    if (creating) profileSelect.add(el('option', { text: '新方案（未保存）', attrs: { value: next.id } }));
    profileSelect.value = next.id;
    name.value = next.name;
    baseUrl.value = next.baseUrl;
    model.value = next.model;
    apiKey.value = '';
    timeout.value = String(next.timeoutMs / 1000);
    concurrency.value = String(next.concurrency);
    format.value = next.responseFormat;
    vision.checked = next.vision;
    thinking.value = next.deepSeek?.thinking ?? 'auto';
    search.checked = next.deepSeek?.search ?? false;
    readUrl.checked = next.deepSeek?.readUrl ?? false;
    safety.checked = next.deepSeek?.safety ?? false;
    maxTokens.value = next.deepSeek?.maxTokens?.toString() ?? '';
    inputLimit.value = next.deepSeek?.inputLimit?.toString() ?? '';
    context.value = next.deepSeek?.context ?? '';
    deleteBtn.disabled = creating || aiProfiles().length <= 1;
    status.textContent = creating ? '填写方案名称、接口地址与模型 ID 后保存。' : '';
    updatePreview();
  }

  function markDirty(event?: Event): void {
    cancelTest();
    if (event?.target === baseUrl || event?.target === apiKey) tools.reset();
    if (event?.target !== apiKey || apiKey.type !== 'text') concealKey();
    dirty = true;
    status.textContent = '有未保存的修改。';
    updatePreview();
  }

  function readDraft(): AiProfile | null {
    const endpoint = validateLlmEndpoint(baseUrl.value);
    if (endpoint.url === undefined) {
      status.textContent = endpoint.issue;
      baseUrl.focus();
      return null;
    }
    if (name.value.trim() === '' || model.value.trim() === '') {
      status.textContent = '请填写方案名称和模型 ID。';
      (name.value.trim() === '' ? name : model).focus();
      return null;
    }
    const timeoutMs = Math.round(timeout.valueAsNumber * 1000);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 2147483647) {
      status.textContent = '请填写有效的超时秒数（至少 1 秒）。';
      timeout.focus();
      return null;
    }
    const official = isDeepSeekEndpoint(baseUrl.value);
    if (official && (!maxTokens.checkValidity() || !inputLimit.checkValidity())) {
      status.textContent = '请按输入框范围填写正整数，或留空使用默认值。';
      (!maxTokens.checkValidity() ? maxTokens : inputLimit).focus();
      return null;
    }
    const deepSeek = official ? deepSeekOptions({
      thinking: thinking.value, search: search.checked, readUrl: readUrl.checked, safety: safety.checked,
      maxTokens: maxTokens.valueAsNumber, inputLimit: inputLimit.valueAsNumber, context: context.value,
    }) : undefined;
    return {
      id: profile.id,
      name: name.value.trim(),
      baseUrl: baseUrl.value.trim(),
      model: model.value.trim(),
      timeoutMs,
      concurrency: Number(concurrency.value),
      responseFormat: format.value === 'json' ? 'json' : 'text',
      vision: vision.checked && !vision.disabled,
      ...(deepSeek === undefined ? {} : { deepSeek }),
    };
  }

  function draftKey(draft: AiProfile): string {
    if (apiKey.value.trim() !== '') return apiKey.value.trim();
    const prior = validateLlmEndpoint(profile.baseUrl).url;
    const next = validateLlmEndpoint(draft.baseUrl).url;
    const sameOrigin = prior !== undefined && next !== undefined && new URL(prior).origin === new URL(next).origin;
    return !removeKey && sameOrigin ? selectedKey() : '';
  }

  const newBtn = button('新建方案', () => {
    if (dirty) {
      status.textContent = '请先保存或取消当前修改。';
      return;
    }
    creating = true;
    load({
      id: `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      name: '', baseUrl: '', model: '', timeoutMs: 60000, concurrency: 1, responseFormat: 'text', vision: false,
    });
    name.focus();
  });
  const deleteBtn = button('删除方案', () => {
    if (dirty) {
      status.textContent = '请先保存或取消当前修改。';
      return;
    }
    const removed = profile;
    void ctx.host.confirm({
      title: '删除模型方案',
      body: `删除「${removed.name}」及其保存的密钥？`,
      confirmText: '删除方案',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed || disposed || profile.id !== removed.id || dirty) return;
      try {
        removeAiProfile(removed.id);
        load(activeAiProfile());
        status.textContent = '方案已删除。';
      } catch {
        status.textContent = '无法删除方案，请检查脚本管理器的存储设置。';
      }
    });
  });
  const exportBtn = button('复制方案 JSON', (event) => {
    if (!event.isTrusted) return;
    void (async () => {
      try {
        const result = await copyText(exportAiProfiles());
        if (disposed) return;
        status.textContent = result.ok
          ? '已复制保存的模型方案。导出省略密钥、接口查询参数与片段。'
          : '无法复制方案，请检查剪贴板权限。';
      } catch {
        if (!disposed) status.textContent = '无法读取或复制方案。';
      }
    })();
  });
  const showBtn = button('显示密钥', (event) => {
    if (!event.isTrusted) return;
    if (apiKey.type === 'text' || !keyPreview.hidden) {
      concealKey();
      return;
    }
    if (apiKey.value !== '') apiKey.type = 'text';
    else {
      keyPreview.textContent = selectedKey();
      keyPreview.hidden = false;
    }
    showBtn.textContent = '隐藏密钥';
    showBtn.setAttribute('aria-pressed', 'true');
    hideKeyTimer = window.setTimeout(concealKey, 8000);
  });
  showBtn.setAttribute('aria-pressed', 'false');
  const clearBtn = button('清除密钥', () => {
    apiKey.value = '';
    removeKey = true;
    markDirty();
    status.textContent = '保存后清除本方案的密钥。';
  });
  const saveBtn = button('保存方案', () => {
    const draft = readDraft();
    if (draft === null) return;
    try {
      const key = apiKey.value.trim() || (removeKey ? '' : undefined);
      saveAiProfile(draft, key);
      creating = false;
      load(activeAiProfile());
      status.textContent = '方案已保存，下次作答会使用此配置。';
    } catch {
      status.textContent = '保存失败，请检查脚本管理器的存储设置。';
    }
  }, true);
  const resetBtn = button('取消修改', () => {
    creating = false;
    load(activeAiProfile());
  });
  const deepSeekPreset = button('填入 DeepSeek 官方配置', () => {
    if (!isDeepSeekEndpoint(baseUrl.value)) apiKey.value = '';
    if (!name.value.trim() || name.value === '默认方案') name.value = 'DeepSeek Flash';
    baseUrl.value = DEEPSEEK_ORIGIN;
    model.value = DEEPSEEK_FLASH;
    markDirty();
    advanced.open = true;
    tools.reset();
    status.textContent = '已填入官方接口和 Flash 模型。填写 API Key 后保存。';
  });
  const testBtn = button('测试连接', () => {
    const draft = readDraft();
    if (draft === null) return;
    cancelTest();
    const controller = new AbortController();
    test = controller;
    testBtn.disabled = true;
    diagnostics.textContent = '正在发送自带样题测试接口…';
    void testConnection({ ...draft, apiKey: draftKey(draft) }, controller.signal).then((result) => {
      if (test !== controller || disposed) return;
      test = undefined;
      testBtn.disabled = false;
      diagnostics.textContent = result.detail;
    });
  });

  profileSelect.addEventListener('change', () => {
    if (dirty) {
      profileSelect.value = profile.id;
      status.textContent = '请先保存或取消当前修改。';
      return;
    }
    try {
      selectAiProfile(profileSelect.value);
      load(activeAiProfile());
      status.textContent = `已切换到「${profile.name}」。`;
    } catch {
      profileSelect.value = profile.id;
      status.textContent = '无法切换方案，请检查脚本管理器的存储设置。';
    }
  });
  for (const control of [name, baseUrl, model, apiKey, timeout, maxTokens, inputLimit, context]) control.addEventListener('input', markDirty);
  for (const control of [format, concurrency, vision, thinking, search, readUrl, safety]) control.addEventListener('change', markDirty);

  // 单独隔离密钥控件，避免宿主页面通过外层面板的开放 Shadow DOM 读到密码值。
  const secretHost = el('div');
  secretHost.attachShadow({ mode: 'closed' }).append(
    el('style', { text: `
      .sztb-field { display: grid; gap: 3px; margin-bottom: 10px; padding: 0 8px; }
      .sztb-field-label { font-size: calc(13px * var(--sztb-font-scale, 1)); }
      .sztb-field-desc { color: var(--sztb-text-dim); font-size: calc(12px * var(--sztb-font-scale, 1)); line-height: 1.45; }
      .sztb-toolbar { display: flex; gap: 6px; flex-wrap: wrap; }
      .sztb-input, .sztb-btn {
        box-sizing: border-box; font: inherit; color: var(--sztb-text); background: var(--sztb-bg);
        border: 1px solid var(--sztb-border); border-radius: 6px; padding: 5px 8px;
      }
      .sztb-input { width: 100%; min-width: 0; }
      .sztb-btn { cursor: pointer; }
      .sztb-btn:disabled { opacity: .5; cursor: default; }
    ` }),
    field('API Key', apiKey, keyHint, keyPreview, el('div', { class: 'sztb-toolbar' }, showBtn, clearBtn)),
  );
  root.append(el('section', { class: 'sztb-field' },
    el('div', { class: 'sztb-group-title', text: '模型配置' }),
    field('当前方案', profileSelect, el('div', { class: 'sztb-toolbar' }, newBtn, deleteBtn, exportBtn)),
    field('方案名称', name),
    field('接口地址', baseUrl, endpointHint, deepSeekPreset),
    field('模型 ID', model),
    secretHost,
    field('单次超时（秒）', timeout),
    field('同时请求数', concurrency, hint('默认 1。接口限流时可降低并发数。')),
    field('输出格式', format),
    checkboxRow(vision, '允许将题目图片发送给支持图片输入的模型'),
    advanced,
    el('div', { class: 'sztb-toolbar' }, saveBtn, resetBtn, testBtn),
    status,
    diagnostics,
    tools.node,
  ));
  load(profile);
  function updateCourse(): void {
    const next = referenceCourseId();
    if (next === courseId) return;
    courseId = next;
    fileStatus.textContent = '';
    tools.reset();
    updatePreview();
  }
  window.addEventListener('hashchange', updateCourse);
  window.addEventListener('popstate', updateCourse);

  return {
    hasChanges: () => dirty,
    dispose() {
      disposed = true;
      window.removeEventListener('hashchange', updateCourse);
      window.removeEventListener('popstate', updateCourse);
      tools.reset();
      cancelTest();
      concealKey();
      apiKey.value = '';
    },
  };
}

export const UOOC_AI_TAB: TabRegistration = {
  id: `${SITE_ID}:ai`,
  title: 'AI 作答',
  order: 220,
  mount(root: HTMLElement, ctx: TabContext): () => void {
    const status = hint('', true);
    function start(mode?: 'draft'): void {
      const tid = quizTidOnPage();
      if (tid === null) {
        status.textContent = '请先打开一个测验。';
        return;
      }
      if (mode !== 'draft' && provider.hasChanges()) {
        status.textContent = '请先保存或取消当前模型配置修改。';
        return;
      }
      if (mode !== 'draft' && aiConfig() === null) {
        status.textContent = '请先保存接口地址和模型 ID。';
        return;
      }
      void runQuizAnswer(tid, ctx.host, undefined, mode);
    }

    const runBtn = button('开始作答', () => start(), true);
    const restoreBtn = button('恢复草稿', () => start('draft'));
    const stopBtn = button('停止 AI', stopQuizAnswer);
    const reviewBtn = button('查看逐题审核', () => ctx.host.activateTab('uooc:monitor'));
    root.append(el('section', { class: 'sztb-field' },
      el('div', { class: 'sztb-group-title', text: '当前测验' }),
      hint('完成回填后可检查答案，提交前需要确认。'),
      el('div', { class: 'sztb-toolbar' }, runBtn, restoreBtn, stopBtn, reviewBtn),
      status,
    ));
    root.append(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AI] }));
    const provider = mountProvider(root, ctx);
    mountRunnerSettings(root);
    const sync = (): void => {
      const running = isQuizRunning();
      runBtn.disabled = running;
      restoreBtn.disabled = running;
      stopBtn.disabled = !running;
      const quiz = monitorState().quiz;
      status.textContent = quiz === null
        ? (running ? '正在等待试卷加载并读取题目…' : '请在测验页面启动 AI 作答。')
        : `${QUIZ_PHASE_TEXT[quiz.phase]} · 已处理 ${quiz.done}/${quiz.total} 题${quiz.message ? ` · ${quiz.message}` : ''}`;
    };
    sync();
    const offRun = subscribeQuizRun(sync);
    const offProgress = subscribeMonitor(sync);
    return () => { offRun(); offProgress(); provider.dispose(); };
  },
};
