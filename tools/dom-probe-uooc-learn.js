/**
 * UOOC 学习页 DOM 只读采样 v1 —— 专攻「播放器 / 目录树 / 连播怎么找下一个视频」。
 *
 * 存在意义（U3 自动连播在动手前必须回答的问题）：
 *   Q-A 播放器元素到底叫什么？是不是 `/home/learn/*` 里所有版本都用 `#player_html5_api`？
 *       （两个参考脚本都用它，但那两个脚本都是老脚本，需要确认现状）
 *   Q-B 目录树长什么样？「当前正在播的那一项」靠什么标记？（参考脚本用 `.basic.active`）
 *   Q-C 一个目录项里，靠什么判断它是不是视频？（参考脚本用 `span.icon-video`）
 *   Q-D 「下一个视频」在 DOM 上怎么走到？同级兄弟、子列表、还是跨 <ul>？
 *   Q-E 目录项有没有携带 catalog_id / resource_id 这类稳定标识（有的话就不用猜相邻节点）？
 *
 * 怎么用（推荐流程，全程不把大文本塞进对话）：
 *   1. 打开旧版学习页（`/home/learn/index#/...`）并让视频**正在播放**，
 *      F12 → Console → 整段粘贴 → 回车；
 *   2. 脚本会自动尝试 `copy(...)`（失败也没关系，结果挂在 `window.__szuLearnSample`）；
 *   3. 新建文件 `local/capture/dom-uooc-learn-旧.txt`，Ctrl+V 保存（`local/` 已在 .gitignore）；
 *   4. 新版学习页（`/home/learn/new/{cid}`）再来一次，存成 `dom-uooc-learn-新.txt`；
 *   5. 告诉助手文件名即可，助手会跑 tools/dom_outline.mjs 压成几 KB 再看。
 *
 * 建议在**视频播放中**采样：这样「当前项」的高亮类一定在身上，目录树也一定是展开的。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage、不动播放器。
 */
(() => {
  const out = [];
  let budget = 1600;
  const push = (...a) => {
    if (budget > 0) {
      budget--;
      out.push(a.join(' '));
    }
  };
  const short = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
  const cls = (el) => (typeof el.className === 'string' ? el.className : '');
  const attrsOf = (el) => {
    const got = [];
    for (const a of Array.from(el.attributes)) {
      const v = a.value.length > 60 ? `<len=${a.value.length}>` : a.value;
      got.push(a.name + '=' + JSON.stringify(short(v, 40)));
    }
    return got.length ? ' [' + got.join(' ') + ']' : '';
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
  };

  /** 缩进树：与 tools/dom_outline.mjs 的解析格式对齐（4 空格缩进 + tag attrs text=） */
  const tree = (el, depth, maxDepth) => {
    if (depth > maxDepth || budget <= 0) return;
    const t = ownText(el);
    push(
      '    '.repeat(depth) +
        el.tagName.toLowerCase() +
        attrsOf(el) +
        (t ? ' text=' + JSON.stringify(short(t, 36)) : ''),
    );
    Array.from(el.children)
      .slice(0, 14)
      .forEach((c) => tree(c, depth + 1, maxDepth));
  };

  /** 从元素往上写一条祖先链，用于判断「这个节点属于哪种容器」 */
  const pathOf = (el, maxDepth) => {
    const chain = [];
    let cur = el;
    let i = 0;
    while (cur && cur.tagName !== 'BODY' && i < maxDepth) {
      chain.unshift(cur.tagName.toLowerCase() + (cls(cur) ? '.' + cls(cur).split(/\s+/).join('.') : ''));
      cur = cur.parentElement;
      i++;
    }
    return chain.join(' > ');
  };

  // ---------------------------------------------------------------- 帧收集
  const frames = [];
  const walkFrames = (win, path) => {
    frames.push({ win, path });
    let list = [];
    try {
      list = Array.from(win.frames);
    } catch {
      return;
    }
    list.forEach((f, i) => {
      try {
        if (!f.document) return;
        walkFrames(f, path + ' > frame[' + i + ']');
      } catch {
        /* 跨域 */
      }
    });
  };
  walkFrames(window, 'top');

  push('=== 0. 环境 ===');
  push('href :', location.href);
  push('pathname :', location.pathname);
  push('hash :', location.hash);
  push('版本判定 :', /\/home\/learn\/new\//.test(location.pathname) ? '新版学习页' : '旧版学习页');
  push('title :', short(document.title, 80));
  push('angular :', typeof window.angular);
  push('frames :', String(frames.length), frames.map((f) => f.path).join(' , '));

  for (const fr of frames) {
    let doc = null;
    try {
      doc = fr.win.document;
    } catch {
      continue;
    }
    if (!doc) continue;

    push('');
    push('===== 帧 ' + fr.path + ' ' + short(String(fr.win.location.href), 100) + ' =====');

    // ------------------------------------------------------------ 1. 播放器
    push('');
    push('=== 1. 播放器元素 ===');
    const vids = Array.from(doc.querySelectorAll('video'));
    push('video 命中数 :', String(vids.length));
    const byId = doc.getElementById('player_html5_api');
    push('#player_html5_api :', byId ? byId.tagName.toLowerCase() : '（不存在）');
    vids.slice(0, 3).forEach((v, i) => {
      push(
        `  [${i}]`,
        'id=' + JSON.stringify(v.id),
        'class=' + JSON.stringify(short(cls(v), 60)),
        'readyState=' + String(v.readyState),
        'duration=' + (Number.isFinite(v.duration) ? v.duration.toFixed(2) : String(v.duration)),
        'currentTime=' + v.currentTime.toFixed(2),
        'playbackRate=' + String(v.playbackRate),
        'muted=' + String(v.muted),
        'paused=' + String(v.paused),
        rectOf(v),
      );
      push('      src=', short(v.currentSrc || v.src || '', 160));
      push('      祖先链=', pathOf(v, 6));
    });

    // -------------------------------------------------- 2. video.js 控件
    push('');
    push('=== 2. 播放器控件（video.js 特征） ===');
    const vjsSel = ['.vjs-big-play-button', '.vjs-control-bar', '.vjs-play-control', '.vjs-playback-rate', '.video-js'];
    for (const s of vjsSel) {
      const hit = doc.querySelectorAll(s);
      push('  ' + s + ' → ' + String(hit.length) + (hit[0] ? '  ' + rectOf(hit[0]) + attrsOf(hit[0]) : ''));
    }
    const vjsClasses = new Map();
    for (const el of Array.from(doc.querySelectorAll('[class*="vjs-"]'))) {
      for (const c of cls(el).split(/\s+/)) {
        if (c.startsWith('vjs-')) vjsClasses.set(c, (vjsClasses.get(c) || 0) + 1);
      }
    }
    push('  vjs-* 类名直方图 : ' + [...vjsClasses.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + '×' + n).join(' , '));

    // ------------------------------------------------------- 3. 目录树定位
    push('');
    push('=== 3. 目录树候选容器（选择器命中数） ===');
    const treeSel = [
      '.basic', '.basic.active', '.basic.uncomplete', '.icon-video', 'span.icon-video',
      '.unfoldInfo', '.catalog', '.catalogItem', '.chapter', '.section', '.learn-list',
      'ul', 'li', '[ng-repeat]', '[class*="icon-"]', '[class*="catalog"]', '[class*="chapter"]',
    ];
    for (const s of treeSel) {
      let n = 0;
      try {
        n = doc.querySelectorAll(s).length;
      } catch {
        continue;
      }
      push('  ' + s + ' → ' + String(n));
    }

    // ------------------------------------------------ 4. 当前播放项与相邻项
    push('');
    push('=== 4. 当前项 / 相邻项 ===');
    const actives = ['.basic.active', '.active', '[class*="active"]'].map((s) => {
      try {
        return { s, els: Array.from(doc.querySelectorAll(s)) };
      } catch {
        return { s, els: [] };
      }
    });
    for (const a of actives) {
      push('  ' + a.s + ' → ' + String(a.els.length));
      if (a.s !== '.basic.active') continue;
      a.els.slice(0, 1).forEach((el) => {
        push('    当前项 文本=' + JSON.stringify(short(ownText(el) || el.textContent.trim(), 40)));
        push('    当前项 路径=' + pathOf(el, 8));
        push('    当前项 属性=' + attrsOf(el));
        push('    当前项 是否含 span.icon-video = ' + String(Boolean(el.querySelector('span.icon-video'))));
        const prev = el.previousElementSibling;
        const next = el.nextElementSibling;
        push('    前兄弟=' + (prev ? prev.tagName.toLowerCase() + JSON.stringify(short(ownText(prev) || prev.textContent.trim(), 24)) + ' 含视频图标=' + String(Boolean(prev.querySelector('span.icon-video'))) : '无'));
        push('    后兄弟=' + (next ? next.tagName.toLowerCase() + JSON.stringify(short(ownText(next) || next.textContent.trim(), 24)) + ' 含视频图标=' + String(Boolean(next.querySelector('span.icon-video'))) : '无'));
        const parent = el.parentElement;
        if (parent) {
          push('    父节点=' + parent.tagName.toLowerCase() + attrsOf(parent) + ' 子元素数=' + String(parent.children.length));
          const gp = parent.parentElement;
          if (gp) push('    祖父节点=' + gp.tagName.toLowerCase() + attrsOf(gp) + ' 子元素数=' + String(gp.children.length));
        }
      });
    }

    // ------------------------------------------------------- 5. 目录缩进树
    push('');
    push('=== 5. 目录缩进树（第一个含 .basic 的容器，深度 ≤5） ===');
    const firstBasic = doc.querySelector('.basic');
    if (firstBasic) {
      let container = firstBasic;
      for (let i = 0; i < 4 && container.parentElement; i++) {
        if (container.parentElement.querySelectorAll('.basic').length > 1) container = container.parentElement;
      }
      push('  容器=' + container.tagName.toLowerCase() + attrsOf(container) + ' .basic 数=' + String(container.querySelectorAll('.basic').length));
      tree(container, 0, 5);
    } else {
      push('  （页面里没有 .basic —— 目录树结构与本脚本假设不符，请看第 3 段的命中数）');
    }

    // ------------------------------------------------------- 6. 图标类型清单
    push('');
    push('=== 6. 图标 / 类型标记 ===');
    const iconClasses = new Map();
    for (const el of Array.from(doc.querySelectorAll('[class*="icon"]'))) {
      for (const c of cls(el).split(/\s+/)) {
        if (c.includes('icon')) iconClasses.set(c, (iconClasses.get(c) || 0) + 1);
      }
    }
    push('  ' + [...iconClasses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => k + '×' + n).join(' , '));
    const iconSamples = new Map();
    for (const el of Array.from(doc.querySelectorAll('[class*="icon"]'))) {
      const c = cls(el).split(/\s+/).find((x) => x.includes('icon'));
      if (!c || iconSamples.has(c)) continue;
      iconSamples.set(c, (ownText(el) || short(el.getAttribute('title') || '', 20) || '').trim());
    }
    for (const [k, v] of iconSamples) push('    ' + k + ' → ' + JSON.stringify(short(v, 30)));

    // ------------------------------------------------------- 7. 目录项标识
    push('');
    push('=== 7. 目录项是否携带稳定标识 ===');
    const basics = Array.from(doc.querySelectorAll('.basic')).slice(0, 6);
    basics.forEach((el, i) => {
      const ids = [];
      for (const a of Array.from(el.attributes)) {
        if (/^data-|ng-|href|id$/.test(a.name)) ids.push(a.name + '=' + JSON.stringify(short(a.value, 40)));
      }
      const inner = el.querySelector('[data-id],[data-catalog-id],[data-resource-id],[href]');
      push(`  [${i}] ${attrsOf(el)}`);
      push(`      data/ng/href/锚点 : ${ids.length ? ids.join(' ') : '无'}`);
      if (inner) push(`      内部可点节点 : ${inner.tagName.toLowerCase()}${attrsOf(inner)}`);
      const kids = Array.from(el.children).slice(0, 8).map((c) => c.tagName.toLowerCase() + (cls(c) ? '.' + cls(c).split(/\s+/)[0] : ''));
      push(`      子元素 : ${kids.join(' , ')}`);
    });

    // ------------------------------------------------------- 8. Angular scope
    push('');
    push('=== 8. Angular scope 键名（只列键，不列值） ===');
    if (typeof window.angular !== 'undefined') {
      const ctrl = doc.querySelector('[ng-controller]');
      if (ctrl) {
        push('  ng-controller 元素 : ' + ctrl.tagName.toLowerCase() + ' ' + attrsOf(ctrl));
        try {
          const scope = window.angular.element(ctrl).scope();
          const keys = Object.keys(scope).filter((k) => !k.startsWith('$'));
          push('  scope 自有键 : ' + short(keys.join(', '), 400));
        } catch (e) {
          push('  取 scope 失败 : ' + short(String(e && e.message), 80));
        }
      } else {
        push('  （没有 [ng-controller] 元素）');
      }
    } else {
      push('  （window.angular 不存在，本帧不是 AngularJS）');
    }

    push('');
  }

  push('=== 9. 统计 ===');
  push('输出行数 :', String(out.length));
  push('剩余预算 :', String(budget));

  const text = out.join('\n');
  try {
    window.__szuLearnSample = text;
  } catch {
    /* ignore */
  }
  try {
    copy(text);
    console.log('[采样完成] 已复制到剪贴板，' + out.length + ' 行。若没复制成功，敲 copy(__szuLearnSample)');
  } catch {
    console.log('[采样完成] ' + out.length + ' 行，请敲 copy(__szuLearnSample) 或手动全选复制');
  }
  console.log(text);
})();
