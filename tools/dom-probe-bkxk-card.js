/**
 * bkxk 选课页 DOM 只读采样 v4 —— 专攻「教学班卡片（.cv-course-card）」与「类别页签」。
 *
 * 背景：v3 已经采到两种行形态（列表类「行=教学班」、卡片类「行=课程 + 展开的教学班卡片」），
 * 但卡片的内部结构没采到，而卡片上的按钮/教学班ID 要插在那里。
 *
 * 怎么用：选课页 F12 → Console → 整段粘贴 → 回车 → 结果自动进剪贴板，
 * 存成 `local/capture/dom-card-<页签>.txt` 后告诉助手文件名。
 *
 * **请在两个页签各跑一次**：
 *   1. 「本班课程」（卡片是已选教学班，卡上有「退选」）
 *   2. 「方案内课程」或「校公选课」（卡片里应有未选教学班，卡上是「选择」）—— 若那页没有展开的卡片，
 *      先手动点开一个「课程详情」，让卡片出现再跑。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage。token 已打码。
 */
(() => {
  const out = [];
  let budget = 1200;
  const push = (...a) => {
    if (budget > 0) {
      budget--;
      out.push(a.join(' '));
    }
  };
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const cls = (el) => (typeof el.className === 'string' ? el.className : '');
  const scrub = (s) => String(s).replace(/(token=)([^&\s]+)/gi, (m, k, v) => k + v.slice(0, 4) + '****');
  const short = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
  const attrsOf = (el) => {
    const got = [];
    for (const a of Array.from(el.attributes)) got.push(a.name + '=' + JSON.stringify(short(a.value, 40)));
    return got.length ? ' [' + got.join(' ') + ']' : '';
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
  const chainOf = (el) => {
    const chain = [];
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      chain.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (cls(p) ? '.' + cls(p).split(/\s+/)[0] : ''));
    }
    return chain.join(' > ');
  };
  const tree = (el, depth, maxDepth) => {
    if (depth > maxDepth || budget <= 0) return;
    const t = ownText(el);
    push('    '.repeat(depth) + el.tagName.toLowerCase() + attrsOf(el) + (t ? ' text=' + JSON.stringify(short(t, 36)) : ''));
    Array.from(el.children)
      .slice(0, 14)
      .forEach((c) => tree(c, depth + 1, maxDepth));
    if (el.children.length > 14) push('    '.repeat(depth + 1) + '…另有 ' + (el.children.length - 14) + ' 个子元素');
  };

  try {
    push('=== 0. 环境 ===');
    push('url', scrub(location.pathname + location.search), 'readyState', document.readyState);

    push('');
    push('=== A. 类别页签 #cvPageHeadTab ===');
    const tabbar = document.getElementById('cvPageHeadTab');
    if (tabbar) {
      push('标签栏 ' + tabbar.tagName.toLowerCase() + attrsOf(tabbar) + ' 子元素=' + tabbar.children.length);
      Array.from(tabbar.children).forEach((li, i) => {
        const inner = li.querySelector('a') || li;
        push(
          '  [' + i + '] ' + li.tagName.toLowerCase() + attrsOf(li) +
            ' 文本=' + JSON.stringify(short((li.textContent || '').trim(), 20)) +
            ' 内层=' + inner.tagName.toLowerCase() + attrsOf(inner) +
            ' 是否激活=' + (/(^|\s)(cv-active|active|on)(\s|$)/.test(cls(li) + ' ' + cls(inner)) ? '可能是' : '否'),
        );
      });
    } else {
      push('#cvPageHeadTab 不存在');
    }
    push('  各类别容器是否存在：');
    for (const id of ['cvRecommendCourse', 'cvProgramCourse', 'cvUnProgramCourse', 'cvPublicCourse', 'cvRetakeCourse', 'cvSportCourse', 'cvMinorCourse', 'cvMoocCourse', 'cvSchoolCourse']) {
      const el = document.getElementById(id);
      push('    #' + id + ' → ' + (el ? el.tagName.toLowerCase() + attrsOf(el) + ' 可见=' + (el.offsetParent !== null) : '不存在'));
    }

    push('');
    push('=== B. 教学班卡片 .cv-course-card（前 2 个，深度 5） ===');
    const cards = qa('.cv-course-card');
    push('数量 ' + cards.length);
    cards.slice(0, 2).forEach((c, i) => {
      push('--- 卡片' + i + ' 父链 ' + chainOf(c));
      tree(c, 0, 5);
      const tcidEl = c.querySelector('[tcid]');
      push('    卡片内带 tcid 的元素：' + (tcidEl ? tcidEl.tagName.toLowerCase() + attrsOf(tcidEl) : '无'));
    });

    push('');
    push('=== C. 关键类的所在层级与数量 ===');
    for (const sel of ['.cv-info', '.cv-info-title', '.cv-caption-red', '.cv-caption-text', '.cv-isfull', '.cv-operate', '.cv-btn-chose', '.cv-btn-cancel', '.cv-delete-volunteer', '.cv-course-card', '.cv-expand', '.cv-setting-col', '.cv-time-col', '.cv_extinfo_span']) {
      const els = qa(sel);
      push('  ' + sel + ' 数量=' + els.length);
      if (els[0]) {
        push('     首个父链 ' + chainOf(els[0]));
        push('     首个自身 ' + els[0].tagName.toLowerCase() + attrsOf(els[0]) + ' 文本=' + JSON.stringify(short((els[0].textContent || '').trim(), 40)));
      }
    }

    push('');
    push('=== D. .cv-time-col 与 .cv_extinfo_span 的内容 ===');
    qa('.cv-time-col').slice(0, 3).forEach((el, i) => {
      push('  .cv-time-col[' + i + '] 文本=' + JSON.stringify(short((el.textContent || '').trim(), 60)) + ' 子元素=' + el.children.length);
      tree(el, 2, 3);
    });
    qa('.cv_extinfo_span').slice(0, 3).forEach((el, i) => {
      push('  .cv_extinfo_span[' + i + '] 文本=' + JSON.stringify(short((el.textContent || '').trim(), 60)) + ' 父链 ' + chainOf(el.parentElement || el));
    });

    push('');
    push('=== E. 教学班行的 .cv-setting-col 内部（前 2 个，深度 4） ===');
    qa('.cv-row > .cv-setting-col').slice(0, 2).forEach((el, i) => {
      push('--- .cv-setting-col[' + i + '] 父链 ' + chainOf(el.parentElement));
      tree(el, 0, 4);
    });

    push('');
    push('=== F. 行属性对比（列表类 2 行 / 卡片类 2 行，全属性） ===');
    const rows = qa('.cv-row');
    push('行总数 ' + rows.length + '；其中含 a.cv-choice 的 ' + rows.filter((r) => r.querySelector('a.cv-choice')).length);
    rows.slice(0, 2).forEach((r, i) => push('  行' + i + ' ' + r.tagName.toLowerCase() + attrsOf(r) + ' 父链 ' + chainOf(r.parentElement)));
    rows.filter((r) => r.querySelector('a.cv-choice')).slice(0, 2).forEach((r, i) => push('  教学班行' + i + ' ' + attrsOf(r) + ' 父链 ' + chainOf(r.parentElement)));

    push('');
    push('=== G. 表头「操作」列与被我们加列影响的列（computed 宽/float） ===');
    qa('.cv-head').slice(0, 2).forEach((head, hi) => {
      push('  .cv-head[' + hi + '] 列数=' + head.children.length);
      Array.from(head.children).forEach((col, i) => {
        const cs = getComputedStyle(col);
        push('    ' + i + ' ' + cls(col) + ' 文本=' + JSON.stringify(short((col.textContent || '').trim(), 10)) + ' computed{w:' + cs.width + ' float:' + cs.float + ' flex:' + cs.flexBasis + '}');
      });
    });
  } catch (e) {
    push('!!! 采样抛错：' + (e && e.message ? e.message : String(e)));
  }

  if (budget <= 0) push('\n[注意：命中输出预算 1200 行，末尾被截断]');
  const text = out.join('\n');
  window.__szuSample = text;
  try {
    if (typeof copy === 'function') copy(text);
  } catch (e) {
    /* 剪贴板失败就用 copy(__szuSample) */
  }
  console.log(text);
  console.log('\n[共 ' + out.length + ' 行；已尝试复制到剪贴板]');
  return text.length + ' 字符，' + out.length + ' 行';
})();
