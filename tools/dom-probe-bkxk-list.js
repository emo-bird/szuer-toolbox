/**
 * bkxk 选课页 DOM 只读采样 v3 —— 专攻「教学班行」结构，**带输出预算防爆**。
 *
 * v2 的教训：树深度 6 × 每层 24 个子元素是指数级，实测跑出几百 KB（已废弃）。
 * v3 加了三道闸：总行数预算 1400、子树深度 ≤3、每层子元素 ≤12，并在末尾提示是否被截断。
 *
 * 怎么用（推荐流程，全程不把大文本塞进对话）：
 *   1. 选课页 F12 → Console → 整段粘贴 → 回车；
 *   2. 脚本会自动尝试 `copy(...)` 把结果放进剪贴板（失败也没关系，它会挂在 `window.__szuSample`）；
 *   3. 新建文件 `local/capture/dom-<页签>.txt`，Ctrl+V 粘贴保存（`local/` 已在 .gitignore 里）；
 *   4. 告诉助手文件名即可。
 *   若剪贴板没拿到：在 Console 里敲 `copy(__szuSample)`，或右键输出区「全选 → 复制」。
 *
 * 页签要**各跑一次**：校公选课 / MOOC（列表类）、本班课程（卡片类）——两种行形态结构不同。
 *
 * 红线：只读。不点按钮、不发请求、不改 DOM、不写 storage。URL 里的 token 已打码。
 */
(() => {
  const out = [];
  let budget = 1400;
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
    for (const a of Array.from(el.attributes)) {
      got.push(a.name + '=' + JSON.stringify(short(a.value, 40)));
    }
    return got.length ? ' [' + got.join(' ') + ']' : '';
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();

  const tree = (el, depth, maxDepth) => {
    if (depth > maxDepth || budget <= 0) return;
    const t = ownText(el);
    push('    '.repeat(depth) + el.tagName.toLowerCase() + attrsOf(el) + (t ? ' text=' + JSON.stringify(short(t, 36)) : ''));
    Array.from(el.children)
      .slice(0, 12)
      .forEach((c) => tree(c, depth + 1, maxDepth));
    if (el.children.length > 12) push('    '.repeat(depth + 1) + '…另有 ' + (el.children.length - 12) + ' 个子元素（已省略）');
  };

  /** 只打一层：每个直接子元素一行 */
  const layer = (el) => {
    Array.from(el.children).forEach((c, i) => {
      const t = ownText(c);
      push('  [' + i + '] ' + c.tagName.toLowerCase() + attrsOf(c) + (t ? ' text=' + JSON.stringify(short(t, 40)) : ''));
    });
  };

  try {
    push('=== 0. 环境 ===');
    push('url', scrub(location.pathname + location.search));
    push('readyState', document.readyState, '标题', JSON.stringify(short(document.title, 20)));

    push('');
    push('=== A. 类名直方图（含 cv 的类，按次数降序，前 90） ===');
    const hist = new Map();
    for (const el of qa('[class]')) {
      for (const c of cls(el).split(/\s+/)) if (c && c.indexOf('cv') !== -1) hist.set(c, (hist.get(c) || 0) + 1);
    }
    Array.from(hist.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 90)
      .forEach(([c, n]) => push('  ' + c + ' ×' + n));

    push('');
    push('=== B. 元素 id 清单（前 40） ===');
    qa('[id]')
      .slice(0, 40)
      .forEach((el) => push('  #' + el.id + ' (' + el.tagName.toLowerCase() + ')'));

    push('');
    push('=== C. 行容器上下文 ===');
    qa('.cv-body, .cv-list').slice(0, 10).forEach((body, i) => {
      const chain = [];
      for (let p = body; p && p !== document.body; p = p.parentElement) chain.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (cls(p) ? '.' + cls(p).split(/\s+/)[0] : ''));
      push('[' + i + '] ' + body.tagName.toLowerCase() + attrsOf(body) + ' 直接行数=' + qa(':scope > .cv-row', body).length);
      push('     父链 ' + chain.join(' > '));
      const head = body.parentElement && body.parentElement.querySelector('.cv-head');
      if (head) push('     表头 ' + Array.from(head.children).map((d) => short((d.textContent || '').trim(), 8) + '(' + cls(d) + ')').join(' | '));
    });

    push('');
    push('=== D. 教学班行（含 a.cv-choice）—— 只打两层 + 关键子树 ===');
    const tcRows = qa('.cv-row').filter((r) => r.querySelector('a.cv-choice'));
    push('数量 ' + tcRows.length);
    tcRows.slice(0, 2).forEach((r, i) => {
      push('--- 教学班行' + i + ' index=' + r.getAttribute('index'));
      layer(r);
      const holder = r.querySelector('a.cv-choice') && r.querySelector('a.cv-choice').parentElement;
      if (holder) {
        push('   含 a.cv-choice 的容器子树：');
        tree(holder, 2, 3);
      }
      const setting = r.querySelector('.cv-setting-col');
      if (setting) {
        push('   .cv-setting-col 子树：');
        tree(setting, 2, 3);
      }
    });

    push('');
    push('=== E. 课程行（不含 a.cv-choice）—— 只打两层 + 课程详情子树 ===');
    const courseRows = qa('.cv-row').filter((r) => !r.querySelector('a.cv-choice'));
    push('数量 ' + courseRows.length);
    if (courseRows[0]) {
      const r = courseRows[0];
      push('--- 课程行 index=' + r.getAttribute('index'));
      layer(r);
      const detail = r.querySelector('.cv-detail');
      if (detail && detail.parentElement) {
        push('   .cv-detail 所在列子树：');
        tree(detail.parentElement, 2, 3);
      }
    }

    push('');
    push('=== F. courseDataList 形状（只打印键名 + 行—数据对照） ===');
    const cdl = window.courseDataList;
    if (cdl && typeof cdl === 'object') {
      const items = Array.isArray(cdl) ? cdl : Object.values(cdl);
      push('是否数组=' + Array.isArray(cdl) + ' 项数=' + items.length);
      items.slice(0, 3).forEach((it, i) => {
        push('[' + i + '] 项键=' + JSON.stringify(Object.keys(it || {})));
        const tl = it && it.tcList;
        push('    tcList=' + (Array.isArray(tl) ? '数组，长度 ' + tl.length : typeof tl));
        if (Array.isArray(tl) && tl[0]) {
          push('    tcList[0] 键=' + JSON.stringify(Object.keys(tl[0])));
          push(
            '    tcList[0] 关键字段=' +
              JSON.stringify({
                teachingClassID: tl[0].teachingClassID,
                teachingClassType: tl[0].teachingClassType,
                classCapacity: tl[0].classCapacity,
                numberOfFirstVolunteer: tl[0].numberOfFirstVolunteer,
              }),
          );
        }
      });
      push('行 index → 数据项 对照（前 4 行）:');
      qa('.cv-row')
        .slice(0, 4)
        .forEach((r) => {
          const idx = r.getAttribute('index');
          const it = Array.isArray(cdl) ? cdl[Number(idx)] : cdl[idx];
          push(
            '   行 index=' + idx +
              ' 数据=' + (it ? '有' : '无') +
              ' courseName=' + JSON.stringify(it && it.courseName) +
              ' 行首列=' + JSON.stringify(short((r.children[0] && r.children[0].textContent || '').trim(), 14)),
          );
        });
    } else {
      push('courseDataList 不是对象：' + typeof cdl);
    }

    push('');
    push('=== G. 类别页签候选（class 含 tab/nav/menu/cate 的短文本元素） ===');
    const cand = qa('[class]').filter((el) => {
      if (!/tab|nav|menu|cate/i.test(cls(el))) return false;
      const t = (el.textContent || '').trim();
      return t.length > 0 && t.length < 12 && el.children.length === 0;
    });
    push('候选数 ' + cand.length);
    cand.slice(0, 30).forEach((el) => push('  ' + el.tagName.toLowerCase() + attrsOf(el) + ' 文本=' + JSON.stringify((el.textContent || '').trim())));

    push('');
    push('=== H. 主动作按钮（选课/退选等，看站点自己的按钮长什么样） ===');
    qa('a, button, span')
      .filter((el) => /^(选课|退选|退课|收藏|取消|查看)$/.test((el.textContent || '').trim()) && el.children.length === 0)
      .slice(0, 20)
      .forEach((el, i) => push('  [' + i + '] ' + el.tagName.toLowerCase() + attrsOf(el) + ' 文本=' + JSON.stringify((el.textContent || '').trim())));
  } catch (e) {
    push('!!! 采样抛错：' + (e && e.message ? e.message : String(e)));
  }

  if (budget <= 0) push('\n[注意：命中输出预算 1400 行，后面被截断了]');
  const text = out.join('\n');
  window.__szuSample = text;
  try {
    if (typeof copy === 'function') copy(text);
  } catch (e) {
    /* 剪贴板拿不到无所谓，用 window.__szuSample 或手动复制 */
  }
  console.log(text);
  console.log('\n[共 ' + out.length + ' 行；已尝试复制到剪贴板，失败则用 copy(__szuSample) 或在输出区全选复制]');
  return text.length + ' 字符，' + out.length + ' 行';
})();
