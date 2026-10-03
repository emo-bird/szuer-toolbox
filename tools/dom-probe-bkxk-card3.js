/**
 * bkxk 选课页 DOM 只读采样 v6 —— 专查「已选课程的卡变高，占掉两行卡片位置」。
 *
 * 背景：批 3 片 1 第六轮手测反馈 —— 用户原话「已选课程会因为多了个已选的按钮导致行高变大
 * 而使此卡片会占用两行卡片的位置」。v5 已证明卡内不再横向溢出，所以 v6 只回答三个问题：
 *   Q1 已选卡（h5 里有「已选」类小标签）与普通卡的**卡片高度差多少**、差在哪个子元素上；
 *   Q2 那个小标签到底叫什么、在 DOM 的哪一层、文本多长、是不是它把 h5 从一行顶成两行；
 *   Q3 站点用的是 float 还是 flex 栅格（float 会让高卡片把**下一行的邻居**挤下去，
 *      症状正是「占掉两行卡片的位置」）—— 这决定修法是压高度还是改栅格。
 *
 * 怎么用：选课页 → **卡片类页签（如「本班课程」）**，卡片处于展开状态，
 *   页面上**同时存在已选的卡和未选的卡**（这是关键，否则没有对照组）。
 *   F12 → Console → 整段粘贴 → 回车 → 结果自动进剪贴板 → 存成 `local/capture/dom-v6.txt`。
 *   若 Edge 提示需要先允许粘贴：先单独输入 `allow pasting` 再回车。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage、不读 token。token/URL 已打码。
 * 输出预算 700 行，正常情况下远用不满。
 */
(() => {
  const out = [];
  let budget = 700;
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

  /** 判定「已选」：h5 子树里有小标签类元素且文本很短，或整卡文本里带「已选」 */
  const isChosen = (card) => {
    const h5 = card.querySelector('.cv-info > h5') || card.querySelector('h5');
    const short = h5 ? Array.from(h5.querySelectorAll('*')).some((e) => /^(已选|已加入|已选上)$/.test(txt(e))) : false;
    return short || /已选/.test(txt(card.querySelector('.cv-info') || card));
  };

  push('=== 0 环境 ===');
  push('url =', scrub(location.href));
  push('页面标题 =', document.title);
  push('注入块 .sztb-bkxk-block =', qa('.sztb-bkxk-block').length, '| 列 =', qa('.sztb-bkxk-col').length, '| 表头 =', qa('.sztb-bkxk-head').length);

  const cards = qa('.cv-course-card');
  const chosen = cards.filter(isChosen);
  const plain = cards.filter((c) => !isChosen(c));
  push('');
  push('=== A 分组计数（已选 vs 未选）===');
  push('卡片总数 =', cards.length, '| 判定为「已选」=', chosen.length, '| 未选 =', plain.length);
  if (chosen.length === 0 || plain.length === 0) {
    push('⚠️ 只有一组 —— 请确认这一屏里同时有已选和未选的卡，否则对照没有意义。');
  }
  push('已选卡高度 =', chosen.slice(0, 8).map((c) => n(c.getBoundingClientRect().height)).join(','));
  push('未选卡高度 =', plain.slice(0, 8).map((c) => n(c.getBoundingClientRect().height)).join(','));
  push('卡片计算高度 height =', cards.slice(0, 8).map((c) => getComputedStyle(c).height).join(','));

  push('');
  push('=== B 栅格：float 还是 flex（决定「占掉两行」的机制）===');
  const firstCard = cards[0];
  if (firstCard) {
    const parent = firstCard.parentElement;
    push('卡片父容器 =', tag(parent), '|', cs(parent, ['display', 'flex-wrap', 'width']));
    push('  .cv-course-card 自身 =', cs(firstCard, ['display', 'float', 'width', 'flex', 'margin', 'box-sizing']));
    push('  同行卡片 y 坐标 =', cards.slice(0, 8).map((c) => n(c.getBoundingClientRect().top)).join(','));
    push('  同行卡片 x 坐标 =', cards.slice(0, 8).map((c) => n(c.getBoundingClientRect().left)).join(','));
    push('  父容器计算高度 =', cs(parent, ['height', 'padding', 'overflow']), '| rect =', rect(parent));
    push('  父容器内子元素实际个数 =', parent.children.length);
    const gp = parent.parentElement;
    if (gp) push('  祖父 =', tag(gp), '|', cs(gp, ['display', 'height', 'overflow']), '| rect =', rect(gp));
  }

  push('');
  push('=== C 逐卡对照：h5 子树 + info 子元素高度（找差在哪一层）===');
  const dumpCard = (card, label, idx) => {
    const info = card.querySelector('.cv-info');
    const h5 = info ? info.querySelector(':scope > h5') : null;
    push(`--- ${label} #${idx} ---`);
    push('  card =', rect(card), '|', cs(card, ['height', 'padding', 'overflow', 'display']));
    if (info) push('  info =', rect(info), '|', cs(info, ['padding', 'margin', 'line-height', 'height']));
    if (h5) {
      push('  h5   =', rect(h5), '|', cs(h5, ['display', 'height', 'line-height', 'flex-wrap', 'align-items']));
      const h5kids = Array.from(h5.children);
      push('  h5 子元素数 =', h5kids.length);
      h5kids.slice(0, 6).forEach((k) => {
        push('    >', tag(k), rect(k), '| 文本 =', JSON.stringify(txt(k).slice(0, 24)), '|', cs(k, ['display', 'float', 'white-space', 'line-height', 'margin', 'position', 'width']));
      });
      // h5 里所有非空文本节点归属（判断是不是被拆成多行）
      push('  h5 文本全文 =', JSON.stringify(txt(h5).slice(0, 80)));
    } else {
      push('  h5 = (无)');
    }
    if (info) {
      const kids = Array.from(info.children);
      push('  info 子元素:', kids.length);
      kids.slice(0, 10).forEach((k) => {
        push('    >', tag(k), '高=' + n(k.getBoundingClientRect().height), '| 文本 =', JSON.stringify(txt(k).slice(0, 20)), '|', cs(k, ['display', 'margin-top', 'margin-bottom', 'line-height']));
      });
    }
  };
  chosen.slice(0, 3).forEach((c, i) => dumpCard(c, '已选卡', i));
  plain.slice(0, 3).forEach((c, i) => dumpCard(c, '未选卡', i));

  push('');
  push('=== D 「已选」那个小标签到底是什么 ===');
  const seen = new Set();
  chosen.slice(0, 4).forEach((card) => {
    const hits = Array.from(card.querySelectorAll('*')).filter((e) => e.children.length === 0 && /^(已选|已加入|已选上)$/.test(txt(e)));
    hits.forEach((e) => {
      const chain = [];
      for (let p = e; p && p !== card.parentElement; p = p.parentElement) chain.unshift(tag(p));
      const key = chain.join('>');
      if (seen.has(key)) return;
      seen.add(key);
      push('  标签 =', tag(e), '| 文本 =', JSON.stringify(txt(e)), '| rect =', rect(e));
      push('    父链 =', chain.join(' > '));
      push('    样式 =', cs(e, ['display', 'float', 'position', 'margin', 'padding', 'line-height', 'font-size', 'color', 'background-color', 'border']));
      push('    深色小标签? background-color 非透明 =', getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
      push('    父元素样式 =', cs(e.parentElement, ['display', 'float', 'line-height', 'height']));
    });
  });
  if (seen.size === 0) push('  （没抓到文本恰为「已选」的叶子元素 —— 看 B/C 段找线索）');

  push('');
  push('=== E 站点的行高 / 高度规则（我们在压哪些值）===');
  if (chosen[0]) {
    const h5 = chosen[0].querySelector('.cv-info > h5');
    if (h5) {
      const s = getComputedStyle(h5);
      for (const p of ['line-height', 'font-size', 'height', 'min-height', 'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom']) {
        push('  已选卡 h5', p, '=', s.getPropertyValue(p), '| important =', s.getPropertyPriority(p));
      }
      push('  已选卡 h5 内联 style =', JSON.stringify(h5.getAttribute('style')));
    }
  }
  if (plain[0]) {
    const h5 = plain[0].querySelector('.cv-info > h5');
    if (h5) {
      const s = getComputedStyle(h5);
      push('  未选卡 h5 line-height =', s.getPropertyValue('line-height'), '| height =', s.getPropertyValue('height'), '| margin-top =', s.getPropertyValue('margin-top'));
    }
  }
  push('  我们样式表在 =', document.getElementById('sztb-bkxk-list-style') !== null, '| 含卡片紧凑规则 =', (document.getElementById('sztb-bkxk-list-style')?.textContent || '').includes(':has(> .sztb-bkxk-block)'));

  push('');
  push('=== F 结论线索 ===');
  push('把本段文本整段发回给助手即可（预计 30-60 行）。');
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
