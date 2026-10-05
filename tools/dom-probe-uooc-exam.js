/**
 * UOOC 做题页 DOM 只读采样 v1 —— 专攻「题目区 / 输入控件 / 提交按钮 / 帧结构」。
 *
 * 存在意义（三个必须在动手前回答的问题）：
 *   Q-A 题目区是不是在 iframe 里？（抓包已知 `/exam/paper` 是 iframe 页，但不知道答题界面在哪一层）
 *   Q-B 填空题用的是 `<input>`、`<textarea>`、`contenteditable`，还是**富文本编辑器**？
 *       （富文本直接设 value 无效，必须走编辑器 API —— 见下面第 6 段）
 *   Q-C 选项怎么「选中」？是点 label、点 input、还是靠框架的合成事件？
 *
 * 怎么用（推荐流程，全程不把大文本塞进对话）：
 *   1. 打开一张测验卷（做题页），F12 → Console → 整段粘贴 → 回车；
 *   2. 脚本会自动尝试 `copy(...)` 把结果放进剪贴板（失败也没关系，它会挂在 `window.__szuSample`）；
 *   3. 新建文件 `local/capture/dom-uooc-exam.txt`，Ctrl+V 粘贴保存（`local/` 已在 .gitignore 里）；
 *   4. 告诉助手文件名即可，助手会跑 tools/dom_outline.mjs 把它压成几 KB 再看。
 *   若剪贴板没拿到：在 Console 里敲 `copy(__szuSample)`，或右键输出区「全选 → 复制」。
 *
 * 建议**跑两次**：一次在有选择题 + 填空题的卷面上（覆盖全部控件形态）。
 * 如果题目在 iframe 里，本脚本会自己走进同源帧去采样（第 0.1 段会说明进了几个帧）。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage、不提交任何东西。
 */
(() => {
  const out = [];
  let budget = 2200;
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
      // 值太长的（base64、内联样式、html 片段）只留长度，避免输出爆炸
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

  /** 缩进树：与 tools/dom_outline.mjs 的解析格式对齐（4 空格缩进 + tag attrs text=） */
  const tree = (el, depth, maxDepth, tag) => {
    if (depth > maxDepth || budget <= 0) return;
    const t = ownText(el);
    push(
      (tag ? tag + ' ' : '') +
        '    '.repeat(depth) +
        el.tagName.toLowerCase() +
        attrsOf(el) +
        (t ? ' text=' + JSON.stringify(short(t, 36)) : ''),
    );
    Array.from(el.children)
      .slice(0, 12)
      .forEach((c) => tree(c, depth + 1, maxDepth));
    if (el.children.length > 12) push('    '.repeat(depth + 1) + '…另有 ' + (el.children.length - 12) + ' 个子元素（已省略）');
  };

  /** 收集一个文档（含其 open shadow root）里的全部元素，用于直方图 */
  const allEls = (root, acc) => {
    const cur = acc || [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      cur.push(el);
      if (el.shadowRoot) allEls(el.shadowRoot, cur);
    }
    return cur;
  };

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
  };

  /** 同源帧收集（跨域帧访问会抛，静默跳过并记一笔） */
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
        if (!f.document) return; // 跨域
        walkFrames(f, path + ' > frame[' + i + ']');
      } catch {
        frames.push({ win: null, path: path + ' > frame[' + i + '] (跨域，不可访问)' });
      }
    });
  };

  try {
    walkFrames(window, 'top');

    push('=== 0. 环境 ===');
    push('url', location.pathname + location.search);
    push('readyState', document.readyState, '标题', JSON.stringify(short(document.title, 24)));
    push('window 尺寸', window.innerWidth + 'x' + window.innerHeight);

    push('');
    push('=== 0.1 帧清单（同源帧会被逐一采样） ===');
    frames.forEach((f) => {
      if (!f.win) {
        push(' ', f.path);
        return;
      }
      let href = '?';
      try {
        href = f.win.location.pathname + f.win.location.search;
      } catch {
        href = '(跨域)';
      }
      push(' ', f.path, '→', href, 'doc.url=', short(f.win.document.URL, 90));
    });

    frames.forEach((f) => {
      if (!f.win) return;
      const doc = f.win.document;
      if (!doc || !doc.body) return;
      const els = allEls(doc, []);

      push('');
      push('==================================================');
      push('=== 帧 ' + f.path + '  url=' + short(doc.URL, 100));
      push('==================================================');

      push('');
      push('=== 1. 类名直方图（名字里含题目/选项/测验关键词的，按次数降序，前 80） ===');
      const KEY = /que|quiz|exam|option|answer|blank|input|item|paper|choice|subjective|ti-|layui/i;
      const hist = new Map();
      els.forEach((el) => {
        cls(el)
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => {
            if (KEY.test(c)) hist.set(c, (hist.get(c) || 0) + 1);
          });
      });
      Array.from(hist.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .forEach(([c, n]) => push('  ' + c + ' ×' + n));

      push('');
      push('=== 2. 候选题目容器（常见选择器命中数） ===');
      const CAND = [
        '.queItems',
        '.queContainer',
        '.que-item',
        '.question',
        '.ti-q-c',
        '.ti-a',
        '.exam-item',
        '.subject-item',
        '.paper-item',
        '[class*="question"]',
        '[class*="ques"]',
        '[class*="timu"]',
        '[class*="ti_"]',
      ];
      CAND.forEach((sel) => {
        let n = -1;
        try {
          n = doc.querySelectorAll(sel).length;
        } catch {
          n = -1;
        }
        if (n > 0) push('  ' + sel + ' → ' + n);
      });

      push('');
      push('=== 3. 前 3 个最可能的题目容器（缩进树，深度 ≤4） ===');
      let containers = [];
      for (const sel of ['.queItems', '.queContainer', '.que-item', '.question', '.ti-q-c', '[class*="question"]']) {
        try {
          const got = Array.from(doc.querySelectorAll(sel));
          if (got.length) {
            containers = got;
            push('  （用选择器 ' + sel + ' 命中 ' + got.length + ' 个，取前 3 个展开）');
            break;
          }
        } catch {
          /* 选择器不合法则跳过 */
        }
      }
      if (!containers.length) push('  （未命中任何候选容器，请看第 3.1 段的手动候选）');
      containers.slice(0, 3).forEach((c, i) => {
        push('  --- 容器 #' + i + ' ' + rectOf(c) + ' ---');
        tree(c, 1, 4, '#');
      });

      push('');
      push('=== 3.1 按「文本里出现 1./2. 或 单选/多选/填空」定位的备选容器 ===');
      const textHits = els
        .filter((el) => /单选题|多选题|填空题|判断题|第\s*\d+\s*题/.test(ownText(el)))
        .slice(0, 6);
      textHits.forEach((el, i) => {
        const chain = [];
        let cur = el;
        for (let d = 0; d < 4 && cur && cur.tagName; d++) {
          chain.push(cur.tagName.toLowerCase() + (cls(cur) ? '.' + cls(cur).split(/\s+/).slice(0, 2).join('.') : ''));
          cur = cur.parentElement;
        }
        push('  #' + i + ' ' + JSON.stringify(short(ownText(el), 50)) + '  祖先链: ' + chain.join(' < '));
      });

      push('');
      push('=== 4. 输入控件清单（填空/简答到底用什么控件） ===');
      const counts = {};
      ['input', 'textarea', 'select', '[contenteditable="true"]', '[contenteditable=""]'].forEach((sel) => {
        try {
          counts[sel] = doc.querySelectorAll(sel).length;
        } catch {
          counts[sel] = -1;
        }
      });
      Object.entries(counts).forEach(([k, v]) => push('  ' + k + ' → ' + v));
      Array.from(doc.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""]'))
        .slice(0, 20)
        .forEach((el, i) => {
          push(
            '  [' + i + '] ' + el.tagName.toLowerCase() + attrsOf(el) + ' ' + rectOf(el) +
              ' 可见=' + (el.offsetParent !== null || el.getClientRects().length > 0),
          );
        });

      push('');
      push('=== 5. 富文本编辑器特征检测（命中说明不能直接设 value） ===');
      [
        ['wangEditor 容器 .w-e-text-container', '.w-e-text-container'],
        ['wangEditor 工具栏 .w-e-toolbar', '.w-e-toolbar'],
        ['wangEditor 内嵌 iframe .w-e-iframe', '.w-e-iframe'],
        ['UEditor .edui-editor', '.edui-editor'],
        ['UEditor body .edui-body-container', '.edui-body-container'],
        ['CKEditor .cke_contents', '.cke_contents'],
        ['quill .ql-editor', '.ql-editor'],
        ['summernote .note-editable', '.note-editable'],
        ['tinymce .tox-tinymce', '.tox-tinymce'],
      ].forEach(([label, sel]) => {
        let n = -1;
        try {
          n = doc.querySelectorAll(sel).length;
        } catch {
          /* 忽略 */
        }
        if (n > 0) push('  ⚠ ' + label + ' → ' + n);
      });
      push('  全局钩子：UE=' + typeof f.win.UE, 'wangEditor=' + typeof f.win.wangEditor, 'CKEDITOR=' + typeof f.win.CKEDITOR, 'tinymce=' + typeof f.win.tinymce);

      push('');
      push('=== 6. 按钮 / 可点元素（找「保存」「提交」「交卷」） ===');
      Array.from(doc.querySelectorAll('button, a, [role="button"], .layui-layer-btn a, [class*="btn"]'))
        .slice(0, 40)
        .forEach((el, i) => {
          const t = (el.textContent || '').trim();
          if (!t || t.length > 20) return;
          push('  [' + i + '] ' + el.tagName.toLowerCase() + attrsOf(el) + ' text=' + JSON.stringify(short(t, 20)) + ' ' + rectOf(el));
        });

      push('');
      push('=== 7. 选项元素的真实结构（前 2 组） ===');
      const optSel = ['input[type="radio"]', 'input[type="checkbox"]', '.option', '[class*="option"]', 'label'];
      for (const sel of optSel) {
        let got = [];
        try {
          got = Array.from(doc.querySelectorAll(sel));
        } catch {
          continue;
        }
        if (!got.length) continue;
        push('  --- ' + sel + ' 命中 ' + got.length + ' 个，前 2 个的祖先链 ---');
        got.slice(0, 2).forEach((el, i) => {
          const chain = [];
          let cur = el;
          for (let d = 0; d < 5 && cur && cur.tagName; d++) {
            chain.push(cur.tagName.toLowerCase() + (cls(cur) ? '.' + cls(cur).split(/\s+/).slice(0, 2).join('.') : ''));
            cur = cur.parentElement;
          }
          push('    #' + i + ' ' + attrsOf(el) + ' 祖先链: ' + chain.join(' < '));
        });
        if (sel === 'label') break;
      }

      push('');
      push('=== 8. 可疑的全局试卷数据（Angular/Vue 常把 state 挂在 window 上） ===');
      try {
        Object.keys(f.win)
          .filter((k) => /exam|paper|task|question|que|ti|uooc|__INIT|state|store|data/i.test(k))
          .slice(0, 40)
          .forEach((k) => {
            let t = typeof f.win[k];
            let extra = '';
            if (t === 'object' && f.win[k]) extra = ' keys=' + JSON.stringify(Object.keys(f.win[k]).slice(0, 12));
            push('  window.' + k + ' : ' + t + extra);
          });
        if (f.win.angular) push('  window.angular = 存在（AngularJS）');
        push('  内联脚本里的 data 变量：');
        Array.from(doc.querySelectorAll('script:not([src])'))
          .slice(0, 10)
          .forEach((s, i) => {
            const txt = s.textContent || '';
            const varHits = (txt.match(/(var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(\{|\[)/g) || []).slice(0, 6);
            const len = txt.length;
            push('    script[' + i + '] len=' + len + (varHits.length ? ' vars=' + JSON.stringify(varHits) : ''));
          });
      } catch (e) {
        push('  （读取 window 失败：' + short(e && e.message, 60) + '）');
      }
    });

    push('');
    push('=== 9. 输出统计 ===');
    push('总行数', out.length, '预算剩余', budget, budget <= 0 ? '⚠ 已截断，请到 Console 里看 copy(__szuSample) 的完整内容' : '（未截断）');

    const text = out.join('\n');
    window.__szuSample = text;
    try {
      copy(text);
      console.log('%c已复制到剪贴板，行数 ' + out.length, 'color:#0a0;font-weight:bold');
    } catch {
      console.log('%c剪贴板不可用，请敲 copy(__szuSample)', 'color:#c60;font-weight:bold');
    }
    console.log(text);
    return '采样完成，共 ' + out.length + ' 行（已挂到 window.__szuSample）';
  } catch (e) {
    console.error('采样失败：', e);
    return '采样失败：' + (e && e.message);
  }
})();
