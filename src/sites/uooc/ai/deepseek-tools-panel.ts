import { el } from '../../../common/utils/dom.ts';
import { chatDetailed, type LlmConfig } from './llm.ts';
import { runDeepSeekTool, type DeepSeekFilePurpose, type DeepSeekTool } from './deepseek-tools.ts';
import type { DeepSeekReferenceFile } from './deepseek.ts';

type Action = DeepSeekTool | 'ask';
const actions: readonly [Action, string][] = [
  ['search', '搜索网页'], ['fetch', '抓取网页'], ['upload', '上传参考文件'], ['ask', '基于文件提问'],
  ['ocr', '识别文档或图片文字'], ['asr', '转写音频'], ['tts', '合成语音'],
];

export function mountDeepSeekTools(
  config: () => LlmConfig | null,
  addReference: (reference: string) => boolean,
  attachFile: (file: DeepSeekReferenceFile) => string | null,
) {
  const select = el('select', { class: 'sztb-select', attrs: { 'aria-label': 'DeepSeek 工具' } },
    ...actions.map(([value, text]) => el('option', { text, attrs: { value } })));
  const text = el('textarea', { class: 'sztb-input', attrs: { rows: 3, 'aria-label': '工具输入' } });
  const file = el('input', { attrs: { type: 'file', 'aria-label': 'DeepSeek 工具文件' } });
  const purpose = el('select', { class: 'sztb-select', attrs: { 'aria-label': '文件解析方式' } },
    el('option', { text: '提取文字', attrs: { value: 'text_recognition' } }),
    el('option', { text: '图文混排解析', attrs: { value: 'rich_layout_recognition' } }),
    el('option', { text: '图片、纯文本或表格', attrs: { value: 'user_data' } }));
  const voice = el('select', { class: 'sztb-select', attrs: { 'aria-label': '朗读音色' } },
    el('option', { text: 'Stella', attrs: { value: 'stella' } }),
    el('option', { text: 'Tide', attrs: { value: 'tide' } }));
  const fileId = el('input', { class: 'sztb-input', attrs: { placeholder: 'file-api-…', 'aria-label': 'DeepSeek 文件 ID' } });
  const output = el('textarea', { class: 'sztb-input', attrs: { rows: 5, readonly: true, hidden: true, 'aria-label': '工具结果' } });
  const audio = el('audio', { attrs: { controls: true, hidden: true }, style: { maxWidth: '100%' } });
  const status = el('div', { class: 'sztb-field-desc', attrs: { role: 'status' } });
  const run = el('button', { class: 'sztb-btn', text: '运行 DeepSeek 工具', attrs: { type: 'button' } });
  const stop = el('button', { class: 'sztb-btn', text: '停止工具', attrs: { type: 'button', disabled: true } });
  const add = el('button', { class: 'sztb-btn', text: '加入作答参考资料', attrs: { type: 'button', hidden: true } });
  const attach = el('button', { class: 'sztb-btn', text: '用此文件辅助作答', attrs: { type: 'button', hidden: true } });
  let uploaded: DeepSeekReferenceFile | undefined;
  let pending: AbortController | undefined;
  let audioUrl: string | undefined;

  function clearResult(): void {
    output.value = '';
    output.hidden = true;
    add.hidden = true;
    attach.hidden = true;
    uploaded = undefined;
    audio.hidden = true;
    if (audioUrl !== undefined) {
      audio.pause();
      audio.removeAttribute('src');
      URL.revokeObjectURL(audioUrl);
      audioUrl = undefined;
    }
  }

  function reset(): void {
    pending?.abort();
    pending = undefined;
    run.disabled = false;
    stop.disabled = true;
    file.value = '';
    fileId.value = '';
    text.value = '';
    status.textContent = '';
    clearResult();
  }

  function draw(): void {
    const action = select.value;
    file.hidden = !['upload', 'asr', 'ocr'].includes(action);
    file.accept = action === 'asr' ? '.wav,.ogg,.opus' : '';
    purpose.hidden = action !== 'upload' && action !== 'ocr';
    purpose.options[2]!.disabled = action === 'ocr';
    if (action === 'ocr' && purpose.value === 'user_data') purpose.value = 'text_recognition';
    voice.hidden = action !== 'tts';
    fileId.hidden = action !== 'ask';
    text.hidden = !['search', 'fetch', 'tts', 'ask'].includes(action);
    text.placeholder = action === 'search' ? '搜索词' : action === 'fetch' ? '公开网页 URL'
      : action === 'ask' ? '关于这个文件的问题' : '要朗读的文本';
  }

  select.addEventListener('change', () => {
    file.value = '';
    text.value = '';
    clearResult();
    status.textContent = '';
    draw();
  });
  stop.addEventListener('click', () => pending?.abort());
  attach.addEventListener('click', () => {
    if (uploaded === undefined) return;
    const issue = attachFile(uploaded);
    status.textContent = issue ?? '已绑定当前课程';
    attach.hidden = issue === null;
  });
  add.addEventListener('click', () => {
    const added = addReference(output.value);
    status.textContent = added ? '已加入参考资料，请保存方案' : '加入后超出参考资料上限，请先缩短已有资料';
    add.hidden = added;
  });
  run.addEventListener('click', () => {
    if (pending !== undefined) return;
    const cfg = config();
    if (cfg === null) return;
    const action = select.value as Action;
    if (action === 'ask' && (!text.value.trim() || !fileId.value.trim())) {
      status.textContent = '请输入问题和文件 ID';
      return;
    }
    const controller = new AbortController();
    pending = controller;
    clearResult();
    run.disabled = true;
    select.disabled = true;
    stop.disabled = false;
    status.textContent = '正在请求 DeepSeek…';
    void (async () => {
      try {
        const result = action === 'ask'
          ? { text: (await chatDetailed({ ...cfg, model: 'deepseek-flash' }, text.value.trim(), controller.signal,
              { fileId: fileId.value.trim() })).content }
          : await runDeepSeekTool(action, {
            text: text.value, file: file.files?.[0], purpose: purpose.value as DeepSeekFilePurpose,
            voice: voice.value === 'tide' ? 'tide' : 'stella',
          }, cfg.apiKey, controller.signal);
        if (pending !== controller) return;
        if ('uploadedFile' in result && result.uploadedFile) {
          uploaded = result.uploadedFile;
          fileId.value = uploaded.id;
          attach.hidden = false;
          select.value = 'ask';
          draw();
        }
        if ('audio' in result && result.audio) {
          audioUrl = URL.createObjectURL(result.audio);
          audio.src = audioUrl;
          audio.hidden = false;
        } else {
          output.value = result.text;
          output.hidden = false;
          add.hidden = action === 'upload' || !result.text.trim();
        }
        status.textContent = 'audio' in result && result.audio ? result.text : '请求完成';
      } catch (error) {
        if (pending !== controller) return;
        status.textContent = controller.signal.aborted ? '已停止等待'
          : error instanceof Error ? error.message : 'DeepSeek 工具请求失败';
      } finally {
        if (pending === controller) {
          pending = undefined;
          run.disabled = false;
          select.disabled = false;
          stop.disabled = true;
        }
      }
    })();
  });
  draw();
  const node = el('details', { class: 'sztb-field' },
    el('summary', { text: 'DeepSeek 独立工具' }), select, text, file, purpose, voice, fileId,
    el('div', { class: 'sztb-field-desc', text: '运行时会把所填内容或所选文件发送给 DeepSeek，部分接口按次或按用量计费。' }),
    el('div', { class: 'sztb-toolbar' }, run, stop), status, output, add, attach, audio);
  return {
    node,
    reset() { reset(); select.disabled = false; },
    openUpload() {
      node.open = true;
      if (pending === undefined) {
        select.value = 'upload';
        select.dispatchEvent(new Event('change'));
        file.focus();
      }
    },
  };
}
