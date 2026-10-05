/**
 * UOOC 学习页目录树专项采样 v1 —— 只为一件事：**U3 自动连播怎么找「下一个视频」**。
 *
 * 为什么还要再采一次：
 *   上一版 `tools/dom-probe-uooc-learn.js` 的结论是 —— 旧版目录树是
 *   `div.panel-catalog > ul.rank-1 > li.catalogItem > ul.rank-2 > li > div.resourcelist > div.basic`，
 *   资源项 `ng-click="goSource(source,'section')"`。但**新版学习页里 `.basic` 命中数是 0**，
 *   整套结构对不上；而新版只看到一条线索：类名里出现 `level_2_resourcelist_item_icon`。
 *   本脚本就是去把「两个版本的目录树到底长什么样、资源项靠什么标识、哪些是视频」问清楚。
 *
 * 怎么用：
 *   1. 打开学习页（旧版 `/home/learn/index#/...`，或新版 `/home/learn/new/{cid}#/...`）；
 *   2. **让视频正在播放**（或刚播完），这样「当前项」的高亮类一定在身上；
 *   3. F12 → Console → 整段粘贴 → 回车（会自动尝试 `copy()`）；
 *   4. 存成 `local/capture/dom-uooc-catalog-旧.txt` / `-新.txt`（UTF-8），告诉助手文件名即可。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage、不动播放器。
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
  const short = (s, n) => {
    const t = String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  const cls = (el) => (typeof el.className === 'string' ? el.className : '');
  const attrsOf = (el) => {
    const got = [];
    for (const a of Array.from(el.attributes)) {
      got.push(a.name + '=' + JSON.stringify(a.value.length > 70 ? `<len=${a.value.length}>` : short(a.value, 50)));
    }
    return got.length ? ' [' + got.join(' ') + ']' : '';
  };
  const ownText = (el) => short(el.textContent, 46);
  const pathOf = (el, maxDepth) => {
    const chain = [];
    let cur = el;
    let i = 0;
    while (cur && cur.tagName !== 'BODY' && i < maxDepth) {
      chain.unshift(
        cur.tagName.toLowerCase() +
          (cls(cur)
            ? '.' +
              cls(cur)
                .split(/\s+/)
                .filter((c) => !/^(ng-|vjs-)/.test(c))
                .join('.')
            : ''),
      );
      cur = cur.parentElement;
      i++;
    }
    return chain.join(' > ');
  };
  const scopeKeys = (el, win) => {
    try {
      const ng = win.angular;
      if (!ng) return null;
      const s = ng.element(el).scope();
      if (!s) return null;
      return Object.keys(s).filter((k) => !k.startsWith('$') && !k.startsWith('ng'));
    } catch {
      return null;
    }
  };
  const describeScopeField = (obj, field) => {
    if (!obj || typeof obj !== 'object' || !(field in obj)) return null;
    const v = obj[field];
    if (Array.isArray(v)) {
      return `  ${field}: Array(len=${v.length})` + (v.length ? ` firstKeys=[${Object.keys(v[0] || {}).join(',')}]` : '');
    }
    if (v && typeof v === 'object') return `  ${field}: Object keys=[${Object.keys(v).join(',')}]`;
    return `  ${field}: ${typeof v} = ${short(v, 60)}`;
  };

  // -------------------------------------------------------------- 帧收集
  const frames = [];
  const walk = (win, path) => {
    let href = '';
    try {
      href = String(win.location.href);
    } catch {
      return;
    }
    if (href.includes('/ai/studybuddy')) return; // 站点自带的 AI 助手 iframe，与目录树无关
    frames.push({ win, path });
    let list = [];
    try {
      list = Array.from(win.frames);
    } catch {
      return;
    }
    list.forEach((f, i) => {
      try {
        if (f.document) walk(f, path + ' > frame[' + i + ']');
      } catch {
        /* 跨域 */
      }
    });
  };
  walk(window, 'top');

  push('=== A. 环境 ===');
  push('href :', location.href);
  push('pathname :', location.pathname);
  push('hash :', location.hash);
  push('hash 段 :', JSON.stringify(location.hash.replace(/^#\/?/, '').split('/')));
  push('版本判定 :', /\/home\/learn\/new\//.test(location.pathname) ? '新版学习页' : '旧版学习页');
  push('angular :', typeof window.angular);
  push('参与采样的帧 :', frames.map((f) => f.path).join(' , '));

  for (const fr of frames) {
    let doc = null;
    try {
      doc = fr.win.document;
    } catch {
      continue;
    }
    if (!doc) continue;

    push('');
    push('===== 帧 ' + fr.path + ' =====');

    // ------------------------------------------- B. 从 video 往上找 scope
    push('');
    push('=== B. 从 video 逐层向上的 scope（找管理目录的控制器） ===');
    const v = doc.getElementById('player_html5_api') || doc.querySelector('video');
    if (!v) {
      push('  （本帧没有 video）');
    } else {
      let cur = v;
      for (let i = 0; i < 12 && cur; i++) {
        const keys = scopeKeys(cur, fr.win);
        if (keys && keys.length) {
          push(`  [${i}] ${pathOf(cur, 3)}`);
          push(`      scope 键(${keys.length}) : ${short(keys.join(', '), 320)}`);
          try {
            const s = fr.win.angular.element(cur).scope();
            for (const f of ['source', 'unitSource', 'sectionItem', 'chapterItem', 'chapterList', 'section', 'chapter', 'task', 'videoUrl']) {
              const d = describeScopeField(s, f);
              if (d) push('    ' + d.trim().replace(/^/, '    '));
            }
          } catch {
            /* ignore */
          }
        }
        cur = cur.parentElement;
      }
    }

    // --------------------------------------------- C. 所有 ng-controller
    push('');
    push('=== C. 页面里的 ng-controller 元素 ===');
    const ctrls = Array.from(doc.querySelectorAll('[ng-controller]'));
    push('  数量 :', String(ctrls.length));
    ctrls.slice(0, 8).forEach((el, i) => {
      const keys = scopeKeys(el, fr.win);
      push(`  [${i}] ${el.tagName.toLowerCase()}${attrsOf(el)}`);
      push(`      scope 键 : ${keys ? short(keys.join(', '), 300) : '（取不到）'}`);
    });

    // ------------------------------------------------ D. 目录候选计数
    push('');
    push('=== D. 目录候选（class 关键词命中数） ===');
    const kws = [
      'catalog', 'chapter', 'resourcelist', 'level_1', 'level_2', 'level_3', 'unit',
      'rank', 'source', 'newlearn', 'panel', 'tree', 'item',
    ];
    for (const kw of kws) {
      let n = 0;
      try {
        n = doc.querySelectorAll(`[class*="${kw}"]`).length;
      } catch {
        continue;
      }
      if (!n) continue;
      const first = doc.querySelector(`[class*="${kw}"]`);
      push(`  [class*="${kw}"] → ${n}  e.g. ${first ? first.tagName.toLowerCase() + attrsOf(first) : ''}`);
    }
    // 类名全量直方图（只看含关键词的）
    const hist = new Map();
    for (const el of Array.from(doc.querySelectorAll('[class]'))) {
      for (const c of cls(el).split(/\s+/)) {
        if (!c || /^(ng-|vjs-|edui)/.test(c)) continue;
        if (/catalog|chapter|section|unit|source|level|rank|item|list|panel|newlearn/i.test(c)) {
          hist.set(c, (hist.get(c) || 0) + 1);
        }
      }
    }
    push('  关键词类名直方图 : ' + [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, n]) => k + '×' + n).join(' , '));

    // --------------------------------------------------- E. ng-repeat 清单
    push('');
    push('=== E. 带 ng-repeat 的元素（目录树多半在这里） ===');
    const reps = Array.from(doc.querySelectorAll('[ng-repeat]')).slice(0, 24);
    push('  ng-repeat 总数 :', String(doc.querySelectorAll('[ng-repeat]').length), '（列前 24 个）');
    reps.forEach((el, i) => {
      push(`  [${i}] ${el.tagName.toLowerCase()}${attrsOf(el)}`);
      push(`      class=${JSON.stringify(short(cls(el), 70))} text=${JSON.stringify(ownText(el))}`);
      const kids = Array.from(el.children)
        .slice(0, 6)
        .map((c) => c.tagName.toLowerCase() + (cls(c) ? '.' + cls(c).split(/\s+/).slice(0, 3).join('.') : ''));
      push(`      子元素 : ${kids.join(' , ')}`);
    });

    // ------------------------------------------- F. 资源项候选 + 它的 scope
    push('');
    push('=== F. 资源项候选（带 icon / 可点的最小单元） ===');
    const cand = Array.from(
      doc.querySelectorAll('[class*="resourcelist"], [class*="level_2"], [class*="tag-source"], .basic'),
    ).slice(0, 12);
    push('  候选数 :', String(cand.length));
    cand.forEach((el, i) => {
      push(`  [${i}] ${el.tagName.toLowerCase()}${attrsOf(el)}`);
      push(`      class=${JSON.stringify(short(cls(el), 70))} text=${JSON.stringify(ownText(el))}`);
      const icons = Array.from(el.querySelectorAll('[class*="icon"], [class*="ico"]'))
        .slice(0, 4)
        .map((x) => x.tagName.toLowerCase() + '[' + short(cls(x), 40) + ']');
      if (icons.length) push(`      图标节点 : ${icons.join(' , ')}`);
      const keys = scopeKeys(el, fr.win);
      if (keys) {
        push(`      scope 键 : ${short(keys.join(', '), 260)}`);
        try {
          const s = fr.win.angular.element(el).scope();
          for (const f of ['source', 'item', 'unit', 'unitSource', 'chapterItem', 'sectionItem']) {
            const d = describeScopeField(s, f);
            if (d) push('      ' + d.trim());
          }
          const sc = s && (s.source || s.item);
          if (sc && typeof sc === 'object') {
            push('      item 键 : ' + Object.keys(sc).join(', '));
            push('      item 值 : ' + JSON.stringify(
              Object.fromEntries(
                Object.entries(sc)
                  .filter(([, val]) => typeof val !== 'object')
                  .slice(0, 14),
              ),
            ).slice(0, 400));
          }
        } catch {
          /* ignore */
        }
      }
    });
  }

  push('');
  push('=== G. 统计 ===');
  push('输出行数 :', String(out.length));
  push('剩余预算 :', String(budget));

  const text = out.join('\n');
  try {
    window.__szuCatalogSample = text;
  } catch {
    /* ignore */
  }
  try {
    copy(text);
    console.log('[采样完成] 已复制到剪贴板，' + out.length + ' 行。若没复制成功，敲 copy(__szuCatalogSample)');
  } catch {
    console.log('[采样完成] ' + out.length + ' 行，请敲 copy(__szuCatalogSample)');
  }
  console.log(text);
})();
