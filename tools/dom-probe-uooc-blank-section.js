/**
 * UOOC「空白节」DOM 采样（只读，不改任何东西、不发请求）
 *
 * 用法：
 *   1. 在 UOOC 学习页**停在那个空白节上**（`__sztbUooc()` 显示 resourceItem 为 0 的那个状态）；
 *   2. F12 → Console → 整段粘贴 → 回车；
 *   3. 把输出**整段复制**回来（它会自己截断长度，直接全选复制即可）。
 *
 * 想弄清的问题只有一个：**这一节到底是真的没有资源，还是资源没渲染出来？**
 * 所以要同时看三样东西：
 *   - 目录里这一节的 DOM 长什么样（`li` 里有没有资源列表容器、有没有别的子元素）；
 *   - 这一节的 Angular scope 里 `sectionItem.unitSource` 是数组还是 undefined、长度多少；
 *   - 页面上这一节「右边」显示的是什么（播放器？空白正文？还是提示文字）。
 */
(() => {
  const out = [];
  const say = (s) => out.push(s);
  const trunc = (s, n) => {
    const t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  const SEL = {
    resource: '[ng-click="goSource(source, \'section\')"]',
    chapterItem: 'li[ng-repeat="chapterItem in chapterList"]',
    chapterTitle: '[ng-click="toggleChapter(chapterItem)"]',
    sectionItem: 'li[ng-repeat="sectionItem in chapterItem.children"]',
    sectionTitle: '[ng-click="toggleChapter(sectionItem)"]',
  };

  const q = (s, root) => Array.from((root || document).querySelectorAll(s));
  const ng = window.angular;
  const scopeOf = (el) => {
    try {
      return ng && ng.element(el).scope();
    } catch (e) {
      return null;
    }
  };
  const idOf = (li, key) => {
    const attr = li.getAttribute && li.getAttribute('id');
    if (attr) return attr;
    const item = scopeOf(li) && scopeOf(li)[key];
    return item && item.id !== undefined ? String(item.id) : '';
  };

  // ---------------------------------------------------------- A. 环境
  say('=== A. 环境 ===');
  say('url      : ' + location.href);
  say('pathname : ' + location.pathname);
  say('hash 段  : ' + JSON.stringify(location.hash.replace(/^#\/?/, '').split('/')));
  say('有 angular: ' + Boolean(ng));

  // ------------------------------------------ B. 我们的五个选择器命中数
  say('');
  say('=== B. 选择器命中数 ===');
  Object.keys(SEL).forEach((k) => say('  ' + k + ' : ' + q(SEL[k]).length));

  // ------------------------------------------------ C. 当前章 / 节节点
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter((p) => /^\d+$/.test(p));
  const chapterId = parts[1] || '';
  const sectionId = parts[2] || '';
  const resourceId = parts[3] || '';
  say('');
  say('=== C. 当前章 / 节 ===');
  say('  解析出的 chapterId/sectionId/resourceId = ' + [chapterId, sectionId, resourceId].join(' / '));

  const chapters = q(SEL.chapterItem);
  const chapterLi =
    chapters.filter((li) => idOf(li, 'chapterItem') === chapterId)[0] || null;
  say('  章节点找到: ' + Boolean(chapterLi));
  if (chapterLi) {
    say('    章 li: <' + chapterLi.tagName.toLowerCase() + '> id=' + JSON.stringify(chapterLi.getAttribute('id')) +
        ' class=' + JSON.stringify(chapterLi.className) +
        ' scope.chapterItem.id=' + JSON.stringify((scopeOf(chapterLi) || {}).chapterItem && scopeOf(chapterLi).chapterItem.id));
  }

  const sections = chapterLi ? q(SEL.sectionItem, chapterLi) : [];
  say('  当前章下的节节点数: ' + sections.length);
  sections.forEach((li, i) => {
    const sid = idOf(li, 'sectionItem');
    const res = q(SEL.resource, li).length;
    const mark = sid === sectionId ? '  <== 当前节' : '';
    say('     [' + i + '] sectionId=' + (sid || '(空)') + ' 资源项=' + res + mark);
  });

  const secLi = sections.filter((li) => idOf(li, 'sectionItem') === sectionId)[0] || null;
  say('');
  say('=== D. 当前节的直接子元素（这一层最关键） ===');
  if (!secLi) {
    say('  !! 当前节节点没找到（这本身就是个线索）');
  } else {
    say('  节 li: class=' + JSON.stringify(secLi.className) + ' id=' + JSON.stringify(secLi.getAttribute('id')));
    say('  子元素数: ' + secLi.children.length);
    for (let i = 0; i < secLi.children.length && i < 12; i++) {
      const c = secLi.children[i];
      say('    [' + i + '] <' + c.tagName.toLowerCase() + '> class=' + JSON.stringify(c.className) +
          ' ng-if=' + trunc(c.getAttribute('ng-if'), 60) +
          ' ng-repeat=' + trunc(c.getAttribute('ng-repeat'), 60) +
          ' 子元素=' + c.children.length +
          ' 文本=' + trunc(c.textContent, 50));
    }
    const deep = q('*', secLi).length;
    say('  节内所有后代元素数: ' + deep);
  }

  // ------------------------------------------------- E. scope 里的数据形态
  say('');
  say('=== E. 当前节的 scope（数据层到底有没有资源） ===');
  if (secLi) {
    const sc = scopeOf(secLi);
    const keys = sc ? Object.keys(sc).filter((k) => k.charAt(0) !== '$') : [];
    say('  scope 键(' + keys.length + '): ' + keys.join(', '));
    const item = sc && sc.sectionItem;
    if (item && typeof item === 'object') {
      const ik = Object.keys(item);
      say('  sectionItem 键(' + ik.length + '): ' + ik.join(', '));
      const us = item.unitSource;
      say('  typeof sectionItem.unitSource = ' + typeof us +
          (Array.isArray(us) ? ' / 长度 ' + us.length : ''));
      if (Array.isArray(us)) {
        us.slice(0, 8).forEach((s, i) => {
          say('     unitSource[' + i + '] id=' + (s && s.id) + ' type=' + (s && s.type) +
              ' is_task=' + (s && s.is_task) + ' task_id=' + (s && s.task_id) +
              ' finished=' + (s && s.finished) + ' title=' + trunc(s && s.title, 30));
        });
      }
      say('  sectionItem.hide = ' + JSON.stringify(item.hide) + '  errorMsg=' + trunc(item.errorMsg, 60));
    } else {
      say('  !! scope 上没有 sectionItem');
    }
  }

  // ------------------------------------- F. 这一页所有 ng-repeat 表达式
  say('');
  say('=== F. 页面上的 ng-repeat 表达式（去重） ===');
  const reps = {};
  q('[ng-repeat]').forEach((el) => {
    const v = el.getAttribute('ng-repeat');
    reps[v] = (reps[v] || 0) + 1;
  });
  Object.keys(reps).forEach((k) => say('  ×' + reps[k] + '  ' + trunc(k, 90)));

  // --------------------------------------------- G. 右边一块显示了什么
  say('');
  say('=== G. 内容区（这一节右边是什么） ===');
  say('  #player_html5_api : ' + document.querySelectorAll('#player_html5_api').length);
  say('  video 标签        : ' + document.querySelectorAll('video').length);
  const mains = ['.panel-main', '.panel-right', '#panelContent', '.panel-content', '.showViewer', '.sourceMain', '.content'];
  mains.forEach((s) => {
    const n = document.querySelectorAll(s).length;
    if (n > 0) say('  ' + s + ' : ' + n);
  });
  // 找「主内容区」：屏幕右侧面积最大且文本不为空的那块
  let best = null;
  let bestArea = 0;
  q('div').forEach((d) => {
    const r = d.getBoundingClientRect();
    if (r.width < 300 || r.height < 200) return;
    if (r.left < window.innerWidth * 0.3) return;
    const area = r.width * r.height;
    if (area > bestArea && d.children.length <= 6) {
      best = d;
      bestArea = area;
    }
  });
  if (best) {
    say('  右侧最大内容块: class=' + JSON.stringify(best.className) +
        ' 尺寸=' + Math.round(best.getBoundingClientRect().width) + 'x' + Math.round(best.getBoundingClientRect().height) +
        ' 子元素=' + best.children.length);
    say('    文本前 120 字: ' + trunc(best.textContent, 120));
    for (let i = 0; i < best.children.length && i < 6; i++) {
      const c = best.children[i];
      say('      [' + i + '] <' + c.tagName.toLowerCase() + '> class=' + JSON.stringify(c.className) +
          ' 文本=' + trunc(c.textContent, 60));
    }
  }

  // ---------------------- I. 节内所有 ng-repeat 容器（含深层，找闯关模式那层）
  // 有些新课（闯关模式）内容挂在 2.3.1 / 2.3.2 这种**更深一层**里，
  // 那一层的资源不属于 sectionItem.unitSource，得先弄清它的 ng-repeat 是什么。
  say('');
  say('=== I. 节内所有 ng-repeat 容器（含深层） ===');
  if (secLi) {
    const repsDeep = q('[ng-repeat]', secLi);
    say('  节内带 ng-repeat 的元素数: ' + repsDeep.length + '（不含节标题那一层）');
    repsDeep.slice(0, 20).forEach((el, i) => {
      const first = el.children[0];
      say('   [' + i + '] <' + el.tagName.toLowerCase() + '> class=' + JSON.stringify(el.className) +
          ' ng-repeat=' + JSON.stringify(trunc(el.getAttribute('ng-repeat'), 70)) +
          ' 子元素=' + el.children.length);
      if (first) {
        say('        首个子元素: <' + first.tagName.toLowerCase() + '> class=' + JSON.stringify(first.className) +
            ' ng-click=' + JSON.stringify(trunc(first.getAttribute('ng-click'), 50)) +
            ' ui-sref=' + JSON.stringify(trunc(first.getAttribute('ui-sref'), 50)) +
            ' 文本=' + trunc(first.textContent, 50) +
            ' 内部资源项=' + q(SEL.resource, first).length);
      }
    });
  }

  // ------------------------------------ J. 节内所有可点节点（找「要展开谁」）
  say('');
  say('=== J. 节内可点节点（ng-click / ui-sref） ===');
  if (secLi) {
    const clickable = q('[ng-click], [ui-sref]', secLi).filter(
      (el) => el.closest(SEL.resource) === null,
    );
    say('  可点节点数: ' + clickable.length);
    clickable.slice(0, 20).forEach((el, i) => {
      say('   [' + i + '] <' + el.tagName.toLowerCase() + '> class=' + JSON.stringify(el.className) +
          ' ng-click=' + JSON.stringify(trunc(el.getAttribute('ng-click'), 50)) +
          ' ui-sref=' + JSON.stringify(trunc(el.getAttribute('ui-sref'), 50)) +
          ' 文本=' + trunc(el.textContent, 40));
    });
  }

  // --------------------------------------------------------- H. 统计
  say('');
  say('=== H. 统计 ===');
  say('  body 纯文本前 200 字: ' + trunc(document.body ? document.body.textContent : '', 200));

  const text = out.join('\n');
  console.log(text);
  console.log('\n（以上共 ' + out.length + ' 行，请整段复制回来）');
  return text;
})();
