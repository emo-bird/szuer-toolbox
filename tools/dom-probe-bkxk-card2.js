/**
 * bkxk 选课页 DOM 只读采样 v5 —— 专查「卡片页：内容溢出卡片外」与「压行高没生效」两件事。
 *
 * 背景：批 3 片 1 第五轮手测反馈 —— ① 卡片内容依旧溢出卡片外；② 卡片内容行高没有减少。
 * v5 只回答两个几何问题：
 *   Q1 到底是哪个元素比卡片还宽 / 还高（找出溢出的真凶，可能是站点自己的元素）；
 *   Q2 我们那组紧凑规则（`.cv-info:has(> .sztb-bkxk-block)` 下的 padding/margin/line-height）
 *      在真机上到底匹配到了吗、算出来的值是多少、卡片高度有没有差别。
 *
 * 怎么用：选课页（**卡片类页签，如「本班课程」，卡片要处于展开状态**）
 *   F12 → Console → 整段粘贴 → 回车 → 结果自动进剪贴板 → 存成 `local/capture/dom-v5.txt`。
 * 若 Edge 提示需要先允许粘贴：先单独输入 `allow pasting` 再回车。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage。token 已打码。
 */
(() => {
  const out = [];
  let budget = 900;
  const push = (...a) => {
    if (budget > 0) {
      budget--;
      out.push(a.join(' '));
    }
  };
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const cls = (el) => (typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '');
  const tag = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls(el) ? '.' + cls(el) : '');
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return `x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)} r=${Math.round(r.right)} b=${Math.round(r.bottom)}`;
  };
  const cs = (el, props) => {
    const s = getComputedStyle(el);
    return props.map((p) => `${p}=${s.getPropertyValue(p)}`).join(' ');
  };
  const scrub = (s) => String(s).replace(/(token=)([^&\s]+)/gi, (m, k, v) => k + v.slice(0, 4) + '****');

  push('=== 0 环境 ===');
  push('url =', scrub(location.href));
  push('ua =', navigator.userAgent);
  push('注入块数量 .sztb-bkxk-block =', qa('.sztb-bkxk-block').length);
  push('注入列数量 .sztb-bkxk-col =', qa('.sztb-bkxk-col').length);
  push('注入表头数量 .sztb-bkxk-head =', qa('.sztb-bkxk-head').length);

  push('');
  push('=== A 我们的样式表在不在、内容是否是最新的 ===');
  const styleEl = document.getElementById('sztb-bkxk-list-style');
  push('style 元素 id=sztb-bkxk-list-style 存在 =', styleEl !== null);
  if (styleEl) {
    const css = styleEl.textContent || '';
    push('CSS 字节数 =', css.length);
    push('含 .sztb-bkxk-ops 规则 =', css.includes('.sztb-bkxk-ops'));
    push('含 nowrap 的 ops 规则 =', css.includes('flex-wrap: nowrap') || css.includes('flex-wrap:nowrap'));
    push('含卡片紧凑规则 :has(> .sztb-bkxk-block) =', css.includes(':has(> .sztb-bkxk-block)'));
    push('紧凑规则里出现过的选择器:', (css.match(/[^{}]*:has\(> \.sztb-bkxk-block\)[^{}]*/g) || []).map((s) => s.trim()).join(' | '));
  }
  push('我们样式表的运行位置 =', styleEl && styleEl.parentElement ? tag(styleEl.parentElement) : '(无)');

  push('');
  push('=== B :has() 匹配到了吗（这是行高没减少的第一嫌疑）===');
  push('全部 .cv-info =', qa('.cv-info').length);
  push('.cv-info:has(> .sztb-bkxk-block) =', qa('.cv-info:has(> .sztb-bkxk-block)').length);
  push('.cv-course-card:has(> .sztb-bkxk-block) =', qa('.cv-course-card:has(> .sztb-bkxk-block)').length);
  push('块的父元素是不是 .cv-info：逐个看下面 C 段的第一行');
  push('.cv-info:has(> h5) =', qa('.cv-info:has(> h5)').length);

  push('');
  push('=== C 每个注入块：父链 / 块与容器与卡片的几何 / 父元素计算样式 ===');
  const blocks = qa('.sztb-bkxk-block').slice(0, 3);
  if (blocks.length === 0) push('（页面上没有注入块 —— 请确认开关「列表注入」是开的、且这是卡片类页签）');
  blocks.forEach((b, i) => {
    push(`--- 块 ${i + 1} ---`);
    const chain = [];
    for (let p = b; p && p !== document.body; p = p.parentElement) chain.unshift(tag(p));
    push('父链 =', chain.join(' > '));
    push('块自身 rect =', rect(b), '|', cs(b, ['display', 'width', 'height', 'margin', 'padding', 'line-height', 'white-space', 'box-sizing']));
    const ops = b.querySelector('.sztb-bkxk-ops');
    if (ops) push('  .sztb-bkxk-ops =', rect(ops), '|', cs(ops, ['display', 'flex-wrap', 'white-space', 'height']));
    const idEl = b.querySelector('.sztb-bkxk-id');
    if (idEl) push('  .sztb-bkxk-id =', rect(idEl), '|', cs(idEl, ['display', 'white-space', 'height']));
    for (const btn of Array.from(b.querySelectorAll('.sztb-bkxk-btn'))) {
      push('  .sztb-bkxk-btn =', rect(btn), '|', cs(btn, ['display', 'white-space', 'flex', 'height']));
    }
    const info = b.parentElement;
    push('父元素 =', tag(info), rect(info), '|', cs(info, ['display', 'padding', 'margin', 'line-height', 'height', 'overflow', 'position']));
    const card = b.closest('.cv-course-card') || info;
    push('所在卡片 =', tag(card), rect(card), '|', cs(card, ['display', 'height', 'overflow', 'position', 'padding']));
    // Q1 真凶：卡片内比卡片宽的（或超出卡片右边界 / 下边界）元素
    const cr = card.getBoundingClientRect();
    const offenders = [];
    for (const el of Array.from(card.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > cr.right + 1 || r.bottom > cr.bottom + 1) {
        offenders.push(`${tag(el)} rect(${rect(el)}) [${cs(el, ['display', 'width', 'position', 'float', 'white-space', 'overflow'])}]`);
      }
      if (offenders.length >= 6) break;
    }
    push('  超出卡片边界的元素 =', offenders.length ? '' : '（无）');
    for (const o of offenders) push('   ', o);
  });

  push('');
  push('=== D 卡片内部纵向占位：有注入块的卡 vs 没有的卡 ===');
  const allInfos = qa('.cv-info');
  const withBlock = allInfos.filter((el) => el.querySelector(':scope > .sztb-bkxk-block'));
  const without = allInfos.filter((el) => !el.querySelector(':scope > .sztb-bkxk-block'));
  const dumpInfo = (el, label) => {
    push(label, tag(el), rect(el), '|', cs(el, ['padding-top', 'padding-bottom', 'margin-top', 'margin-bottom', 'line-height', 'height']));
    for (const child of Array.from(el.children).slice(0, 8)) {
      push('   >', tag(child), rect(child), '|', cs(child, ['display', 'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'line-height', 'height']));
    }
  };
  if (withBlock[0]) dumpInfo(withBlock[0], '有块的 .cv-info');
  if (without[0]) dumpInfo(without[0], '无块的 .cv-info（对照）');
  push('有块 .cv-info 高度样本 =', withBlock.slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height)).join(','));
  push('无块 .cv-info 高度样本 =', without.slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height)).join(','));
  const cards = qa('.cv-course-card');
  push('卡片总数 =', cards.length, '| 高度样本 =', cards.slice(0, 10).map((el) => Math.round(el.getBoundingClientRect().height)).join(','));
  push('卡片计算高度样本 =', cards.slice(0, 10).map((el) => getComputedStyle(el).height).join(','));

  push('');
  push('=== E 站点自己的样式有没有卡死（!important / 内联）===');
  const probe = withBlock[0] || allInfos[0];
  if (probe) {
    push('探测元素 =', tag(probe));
    const s = getComputedStyle(probe);
    for (const p of ['padding-top', 'padding-bottom', 'margin-top', 'margin-bottom', 'line-height']) {
      push('  ', p, '=', s.getPropertyValue(p), '| important =', s.getPropertyPriority(p));
    }
    push('  内联 style =', JSON.stringify(probe.getAttribute('style')));
    const h5 = probe.querySelector(':scope > h5');
    if (h5) {
      push('  > h5 =', tag(h5), '|', cs(h5, ['margin-top', 'margin-bottom', 'line-height', 'height', 'display']), '| 内联 =', JSON.stringify(h5.getAttribute('style')));
      const h5s = getComputedStyle(h5);
      push('  > h5 line-height important =', h5s.getPropertyPriority('line-height'), '| margin-top important =', h5s.getPropertyPriority('margin-top'));
    }
  }
  // 是否有比我们更靠后的样式表能覆盖我们（同特异性下后者胜）
  push('样式表顺序 =', Array.from(document.styleSheets).map((sh, i) => `${i}:${sh.ownerNode && sh.ownerNode.id ? sh.ownerNode.id : '(inline/link)'}`).join(' '));

  push('');
  push('=== F 结论线索汇总 ===');
  push('把本文本整段发回给助手即可。');
  push('=== END ===');

  const text = out.join('\n');
  try {
    copy(text);
    window.__szuSample = text;
    console.log('已复制到剪贴板，长度 =', text.length);
  } catch (e) {
    console.warn('自动复制失败，请手动全选本段输出复制：', e);
  }
  console.log(text);
  return text.length;
})();
