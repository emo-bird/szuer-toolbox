/**
 * bkxk 选课页 DOM 只读采样 v7 —— 完整解剖「一张卡片的布局」，并找出星标与退选的真实身份。
 *
 * 背景与目的（v7 与 v5/v6 的差别）：
 *   v5 查了「内容溢出」、v6 查了「已选卡为什么高」，都是**带预设问题**的定向采样。
 *   v7 换成**完整解剖**：拿一张卡，把它内部的每一层（卡片 → .cv-info → 每个子元素 →
 *   h5 内部 → 按钮内部）连同 display / float / width / height / margin / padding /
 *   line-height / 字体 / 颜色 / position / z-index 全打出来，逐层编号。
 *   目的有三个无法靠定向采样回答的问题：
 *     Q1 用户看到的「星标按钮」到底是什么元素（v6 的 19 张卡里没抓到它）——
 *        是 button / i / svg / 背景图？在哪一层？在课名前面还是后面？
 *     Q2 那个「退选」到底是 button（有事件）还是纯文本 div，它旁边有没有兄弟节点
 *        （这决定「能不能搬进 h5」以及搬了会不会砸站点功能）；
 *     Q3 h5 内部到底有多少可用宽度、float 的 cv-info-title 占了多少、
 *        把两个小标签并排塞进 h5 需要动哪些属性。
 *
 * 怎么用：选课页 → **卡片类页签（如「本班课程」）**，卡片展开。
 *   强烈建议**先在一张已选卡上跑**（已选卡才有「已选」按钮与退选那一行）。
 *   F12 → Console → 整段粘贴 → 回车 → 结果自动进剪贴板 → 存成 `local/capture/dom-v7.txt`。
 *   若 Edge 提示需要先允许粘贴：先单独输入 `allow pasting` 再回车。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage、不读 token。token/URL 已打码。
 * 输出预算 1000 行，实际预计 120–200 行。
 */
(() => {
  const out = [];
  let budget = 1000;
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
  const n = (v) => Math.round(v);
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return `x=${n(r.left)} y=${n(r.top)} w=${n(r.width)} h=${n(r.height)} b=${n(r.bottom)}`;
  };
  const cs = (el, props) => {
    const s = getComputedStyle(el);
    return props.map((p) => `${p}=${s.getPropertyValue(p)}`).join(' ');
  };
  const scrub = (s) => String(s).replace(/(token=)([^&\s]+)/gi, (m, k, v) => k + v.slice(0, 4) + '****');
  const txt = (el) => (el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : '');

  const LAYOUT = ['display', 'float', 'clear', 'position', 'width', 'height', 'min-height', 'max-height', 'margin', 'padding', 'line-height', 'font-size', 'font-weight', 'text-align', 'overflow', 'vertical-align', 'z-index', 'box-sizing'];
  const BOX = ['display', 'float', 'position', 'width', 'height', 'margin', 'padding', 'line-height', 'flex', 'flex-wrap', 'align-items', 'justify-content', 'gap', 'order', 'z-index'];

  push('=== 0 环境 ===');
  push('url =', scrub(location.href));
  push('页面标题 =', document.title);
  push('注入块 .sztb-bkxk-block =', qa('.sztb-bkxk-block').length, '| 列 =', qa('.sztb-bkxk-col').length);
  push('卡片总数 =', qa('.cv-course-card').length, '| .cv-info =', qa('.cv-info').length);

  // 找一张「信息最全」的卡来解剖：优先带「已选」标签的，其次带注入块的
  const cards = qa('.cv-course-card');
  const score = (c) => {
    let s = 0;
    if (c.querySelector('.cv-info > h5 .cv-one')) s += 4;
    if (c.querySelector('.sztb-bkxk-block')) s += 2;
    s += c.querySelectorAll('.cv-info > *').length / 10;
    return s;
  };
  const target = cards.slice().sort((a, b) => score(b) - score(a))[0];

  push('');
  push('=== A 解剖对象 ===');
  if (!target) {
    push('⚠️ 页面上没有 .cv-course-card —— 请确认在卡片类页签（如「本班课程」）且卡片已展开。');
  } else {
    push('选中卡片 =', tag(target), '| rect =', rect(target));
    const chain = [];
    for (let p = target; p && p !== document.body; p = p.parentElement) chain.unshift(tag(p));
    push('父链 =', chain.join(' > '));
    push('卡片 class 全名 =', JSON.stringify(target.className));
    push('卡片 id =', JSON.stringify(target.id));
    push('卡片全部属性 =', Array.from(target.attributes).map((a) => `${a.name}="${a.value.slice(0, 40)}"`).join(' '));
    push('父容器 =', tag(target.parentElement), '|', cs(target.parentElement, BOX));
    push('父容器内卡片数 =', target.parentElement.children.length);
  }

  push('');
  push('=== B 逐层解剖（深度优先，每一层都有编号与全部布局属性）===');
  if (target) {
    const walk = (el, depth, idxPath) => {
      const kids = Array.from(el.children);
      const isText = kids.length === 0;
      const label = `${idxPath} ${tag(el)}`;
      push(label);
      push('    rect:', rect(el));
      push('    layout:', cs(el, LAYOUT));
      if (el !== target) push('    box:', cs(el, BOX));
      push('    inlineStyle:', JSON.stringify(el.getAttribute('style')));
      push('    text:', JSON.stringify(txt(el).slice(0, 50)));
      if (isText) {
        push('    ==> 叶子节点');
        // 检查是不是背景图 / 伪元素形式呈现的图标
        const s = getComputedStyle(el);
        push('    bgImage:', s.backgroundImage, '| bgColor:', s.backgroundColor);
        push('    border:', s.border, '| content:', JSON.stringify(el.getAttribute('data-content') || null));
        try {
          const before = getComputedStyle(el, '::before');
          const after = getComputedStyle(el, '::after');
          push('    ::before content =', before.content, '| ::after content =', after.content);
        } catch (e) {
          push('    ::before/::after = (读不到)');
        }
      }
      if (depth > 0) {
        kids.forEach((k, i) => walk(k, depth - 1, `${idxPath}.${i + 1}`));
      } else if (kids.length > 0) {
        push(`    ... 还有 ${kids.length} 个子元素（已达深度上限）`);
      }
    };
    walk(target, 5, 'B1');
  }

  push('');
  push('=== C 找「星标 / 收藏 / 心 / 星星」类元素（全页搜）===');
  const STAR_PAT = /星|收藏|关注|star|fav|favorite|bookmark|heart|★|☆|⭐/i;
  const hits = [];
  for (const el of qa('[class], [id], [title], [aria-label], button, i, svg, img')) {
    const bag = [el.className, el.id, el.getAttribute('title'), el.getAttribute('aria-label'), el.getAttribute('data-icon')]
      .filter((v) => typeof v === 'string')
      .join(' ');
    const t = txt(el);
    if (STAR_PAT.test(bag) || (t.length <= 4 && STAR_PAT.test(t))) {
      if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'I' || el.tagName === 'SVG' || el.tagName === 'IMG') {
        hits.push(el);
      }
    }
  }
  push('疑似星标元素数 =', hits.length, '（去重前）');
  const seenStar = new Set();
  hits.slice(0, 12).forEach((el) => {
    const chain = [];
    for (let p = el; p && p !== document.body; p = p.parentElement) chain.unshift(tag(p));
    const key = chain.join('>');
    if (seenStar.has(key)) return;
    seenStar.add(key);
    push('  ★', tag(el), '| rect =', rect(el), '| 文本 =', JSON.stringify(txt(el).slice(0, 16)));
    push('    父链 =', chain.join(' > '));
    push('    属性 =', Array.from(el.attributes).map((a) => `${a.name}="${String(a.value).slice(0, 30)}"`).join(' '));
    push('    样式 =', cs(el, ['display', 'float', 'position', 'width', 'height', 'margin', 'background-image', 'color', 'font-size', 'z-index']));
  });
  if (hits.length === 0) push('  （全页没找到星标类元素 —— 它可能是背景图、伪元素内容，或来自另一个扩展）');

  push('');
  push('=== D 「退选」的真实身份 ===');
  const tui = qa('button, div, a, span').filter((el) => el.children.length === 0 && /^退选$/.test(txt(el)));
  push('文本恰为「退选」的元素数 =', tui.length);
  tui.slice(0, 6).forEach((el, i) => {
    push(`  --- 退选 #${i + 1} ---`);
    push('    元素 =', tag(el), '| rect =', rect(el), '| display =', getComputedStyle(el).display);
    const chain = [];
    for (let p = el; p && p !== document.body; p = p.parentElement) chain.unshift(tag(p));
    push('    父链 =', chain.join(' > '));
    push('    全部属性 =', Array.from(el.attributes).map((a) => `${a.name}="${String(a.value).slice(0, 40)}"`).join(' '));
    push('    样式 =', cs(el, LAYOUT));
    push('    父元素 =', tag(el.parentElement), '| 父样式 =', cs(el.parentElement, BOX));
    push('    父元素全部子节点 =', Array.from(el.parentElement.childNodes).map((c) => (c.nodeType === 3 ? `#text(${JSON.stringify(txt(c).slice(0, 10))})` : tag(c))).join(' | '));
    // 事件信息：能不能看到站点绑了什么（jQuery 会把事件挂在元素上）
    const jq = el.jquery || el.parentElement.jquery;
    push('    jQuery 事件副本存在 =', jq !== undefined, '| 行内 onclick =', JSON.stringify(el.getAttribute('onclick')));
    push('    href/data-* =', Array.from(el.attributes).filter((a) => /^(href|data-|ng-|v-)/.test(a.name)).map((a) => `${a.name}="${String(a.value).slice(0, 40)}"`).join(' ') || '(无)');
  });
  if (tui.length === 0) push('  （没找到文本恰为「退选」的叶子元素）');

  push('');
  push('=== E h5 内部可用宽度测算（判断两个小标签能否并排）===');
  const h5s = qa('.cv-info > h5');
  push('.cv-info > h5 数量 =', h5s.length);
  if (h5s[0]) {
    const h5 = h5s[0];
    const hr = h5.getBoundingClientRect();
    push('样例 h5 =', tag(h5), '|', cs(h5, BOX));
    push('h5 宽度 =', n(hr.width));
    let used = 0;
    Array.from(h5.children).forEach((k) => {
      const kr = k.getBoundingClientRect();
      used += kr.width;
      push('  >', tag(k), '| rect =', rect(k), '| float =', getComputedStyle(k).float, '| display =', getComputedStyle(k).display, '| 文本 =', JSON.stringify(txt(k).slice(0, 14)));
    });
    push('h5 内子元素已占宽度合计 ≈', n(used), '| 剩余 ≈', n(hr.width - used));
    push('h5 文本节点 =', Array.from(h5.childNodes).map((c) => (c.nodeType === 3 ? `#text(${JSON.stringify(txt(c).slice(0, 12))})` : tag(c))).join(' | '));
  }

  push('');
  push('=== F 站点样式表里与 h5 / cv-tag / float 有关的规则 ===');
  try {
    let found = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        continue; // 跨域样式表读不到
      }
      for (const rule of Array.from(rules || [])) {
        const sel = rule.selectorText || '';
        if (!sel) continue;
        if (/cv-tag|cv-info-title|cv-btn|cv-one|cv-block-hide/i.test(sel)) {
          push('  ', sel, '{', String(rule.style.cssText).slice(0, 120), '}');
          found++;
          if (found >= 40) break;
        }
      }
      if (found >= 40) break;
    }
    push('命中的站点规则数 =', found);
  } catch (e) {
    push('  读站点样式表失败（可能是跨域）：', String(e));
  }

  push('');
  push('=== G 结论线索 ===');
  push('把本段文本整段发回给助手即可。预计 120–200 行。');
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
