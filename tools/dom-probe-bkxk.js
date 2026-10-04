/**
 * bkxk 选课页 DOM 只读采样片段。
 *
 * 怎么用：在「本科选课」页面（`*default/grablessons.do`）按 F12 → Console → 整段粘贴 → 回车，
 * 把打印出来的整段文本贴回给助手。**公选课与专业课两个页签各跑一次**（行分两类，两边结构不同）。
 *
 * 为什么需要它：`docs/开发文档.md` §4.1 的 DOM 结论是从旧仓库文档迁移来的，本项目从未在真机复核。
 * 选择器写错不会报错，只会静默不生效 —— 那是这类活儿最难查的失败模式，所以动手前先看清结构。
 *
 * 红线（这段代码严格遵守，别改成不遵守）：
 *   - 只读：不点任何按钮、不发任何请求、不改 DOM、不写 storage、不读 token/cookie。
 *   - 不打印课程数据内容，只打印结构、类名、属性名与「有几个」。
 *   - 学号 / token 一律不碰。
 */
(() => {
  const out = [];
  const push = (...a) => out.push(a.join(' '));
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const q1 = (sel, root) => (root || document).querySelector(sel);

  /** 元素的 name=value 属性串（值过长截断） */
  const attrsOf = (el, names) => {
    const got = [];
    for (const n of names) {
      const v = el.getAttribute && el.getAttribute(n);
      if (v !== null && v !== undefined && v !== '') {
        got.push(n + '=' + JSON.stringify(v.length > 48 ? v.slice(0, 48) + '…' : v));
      }
    }
    return got.length ? ' [' + got.join(' ') + ']' : '';
  };

  /** 自己那一层的直接文本（不含子元素的） */
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();

  const ATTRS = ['id', 'class', 'style', 'tcId', 'data-tcid', 'data-index', 'index', 'value', 'href'];

  /** 打印一棵浅树（只到 maxDepth，每层最多 12 个子元素） */
  const tree = (el, depth, maxDepth) => {
    if (depth > maxDepth) return;
    const t = ownText(el);
    push(
      '  '.repeat(depth) +
        el.tagName.toLowerCase() +
        attrsOf(el, ATTRS) +
        (t ? ' text=' + JSON.stringify(t.slice(0, 36)) : ''),
    );
    Array.from(el.children)
      .slice(0, 12)
      .forEach((c) => tree(c, depth + 1, maxDepth));
    if (el.children.length > 12) push('  '.repeat(depth + 1) + '…还有 ' + (el.children.length - 12) + ' 个子元素');
  };

  try {
    push('=== 环境 ===');
    push('url', location.pathname + location.search.slice(0, 60));
    push('title', JSON.stringify(String(document.title).slice(0, 40)));
    push('readyState', document.readyState);
    push('jQuery', typeof window.jQuery, 'BH_UTILS', typeof window.BH_UTILS);

    push('');
    push('=== 1. 模板 ===');
    const tpls = qa('script[type="text/template"]');
    push('模板数量', tpls.length);
    push('模板 id', tpls.map((s) => s.id || '(无id)').join(', ') || '(无)');

    push('');
    push('=== 2. 列表容器 ===');
    const listIds = ['publicBody', 'moocBody', 'courseBody', 'recommendBody', 'myBody'];
    for (const id of listIds) {
      const el = document.getElementById(id);
      push(
        '#' + id,
        el
          ? el.tagName.toLowerCase() + ' class=' + JSON.stringify(el.className) + ' 直接行数=' + qa(':scope > .cv-row', el).length
          : '不存在',
      );
    }
    push('全部 .cv-list 数量', qa('.cv-list').length);
    qa('.cv-list').slice(0, 3).forEach((l, i) => {
      push('  .cv-list[' + i + ']', attrsOf(l, ['id', 'class']), '行数=' + qa(':scope > .cv-row', l).length);
    });

    push('');
    push('=== 3. 表头列（看 float/width/flex） ===');
    qa('.cv-list > .cv-head').slice(0, 3).forEach((head, hi) => {
      push('.cv-head[' + hi + '] 列数=' + head.children.length, attrsOf(head, ['id', 'class']));
      Array.from(head.children).forEach((col, i) => {
        const cs = getComputedStyle(col);
        push(
          '  列' + i,
          attrsOf(col, ['class', 'style']),
          '文本=' + JSON.stringify((col.textContent || '').trim().slice(0, 10)),
          'computed{w:' + cs.width + ',float:' + cs.float + ',flex:' + cs.flex + '}',
        );
      });
    });

    push('');
    push('=== 4. 行样本（前 2 行，深度 4） ===');
    const rows = qa('.cv-list .cv-row');
    push('行总数', rows.length);
    rows.slice(0, 2).forEach((r, i) => {
      push('--- 行' + i + ' ---', '有tcId=' + (r.hasAttribute('tcId') || r.hasAttribute('data-tcid')), '子元素数=' + r.children.length);
      tree(r, 0, 4);
    });

    push('');
    push('=== 5. 两种行的占比 ===');
    const withAttr = rows.filter((r) => r.hasAttribute('tcId') || r.hasAttribute('data-tcid'));
    const withImg = rows.filter((r) => q1('img.collection-img', r));
    const withChoice = rows.filter((r) => q1('a.cv-choice', r));
    push('行上有 tcId 属性的', withAttr.length);
    push('含 img.collection-img 的', withImg.length);
    push('含 a.cv-choice 的', withChoice.length);

    push('');
    push('=== 6. tcId 落点 ===');
    const tcEls = qa('[tcId], [data-tcid]');
    push('[tcId] 元素总数', tcEls.length);
    tcEls.slice(0, 8).forEach((el, i) => {
      push(
        '  [' + i + ']',
        el.tagName.toLowerCase() + attrsOf(el, ['class', 'id']),
        'tcId=' + JSON.stringify(el.getAttribute('tcId') || el.getAttribute('data-tcid')),
      );
    });
    const imgs = qa('img.collection-img');
    push('img.collection-img', imgs.length, '前3个 tcId=' + JSON.stringify(imgs.slice(0, 3).map((im) => im.getAttribute('tcId'))));
    const choices = qa('a.cv-choice');
    push('a.cv-choice', choices.length, '前3个 tcId=' + JSON.stringify(choices.slice(0, 3).map((a) => a.getAttribute('tcId'))));

    push('');
    push('=== 7. 旧脚本用到的关键选择器存在性 ===');
    for (const sel of [
      '.cv-row',
      '.cv-info',
      '.cv-caption-red',
      '.cv-caption-text',
      '.cv-setting-col',
      '.cv-course-card',
      '.cv-course-card-single',
      '.cv-choice',
      '#myCourseTable',
      '.cv-my-course',
    ]) {
      push(sel, qa(sel).length);
    }

    push('');
    push('=== 8. 类别页签（启发式：class 含 tab 且文本短） ===');
    const tabish = qa('[class*="tab" i], [class*="category" i]').filter((el) => {
      const t = (el.textContent || '').trim();
      return t.length > 0 && t.length < 14 && el.children.length === 0;
    });
    push('候选数', tabish.length);
    tabish.slice(0, 24).forEach((el, i) => {
      push('  [' + i + ']', el.tagName.toLowerCase() + attrsOf(el, ['class', 'id', 'href']), '文本=' + JSON.stringify((el.textContent || '').trim()));
    });

    push('');
    push('=== 9. 全局数据对象（只看键名，不看值） ===');
    for (const name of ['courseDataList', 'courseList', 'publicCourseList']) {
      const v = window[name];
      push(
        name,
        typeof v,
        Array.isArray(v) ? '长度=' + v.length + ' 首项键=' + JSON.stringify(Object.keys(v[0] || {}).slice(0, 24)) : '',
      );
    }
  } catch (e) {
    push('!!! 采样抛错：' + (e && e.message ? e.message : String(e)));
  }

  const text = out.join('\n');
  console.log(text);
  console.log('\n[以上请整段复制贴回给助手；共 ' + out.length + ' 行]');
  return text;
})();
