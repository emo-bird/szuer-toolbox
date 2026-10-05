/**
 * UOOC 测验页（`/exam/*`）DOM 采样（只读，不改任何东西、不发请求）
 *
 * 用法：**跑两次**，把两次输出都贴回来。
 *   第一次：打开测验、还没交卷时；
 *   第二次：**交卷成功之后**（页面应该变样了）。
 *
 * 想弄清的问题：怎么**可靠地**认出「交卷成功」。
 * 当前实现依赖一条实测判据 —— `button.btn.btn-danger`「提交试卷」带
 * `ng-if="vm.paper.can_do"`，交卷成功后按钮**从 DOM 消失**。
 * 这份采样就是来验证它、并在它不成立时给出替代判据的。
 */
(() => {
  const out = [];
  const say = (s) => out.push(s);
  const trunc = (s, n) => {
    const t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  const desc = (el) => {
    const r = el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    return (
      '<' + el.tagName.toLowerCase() + '>' +
      ' class=' + JSON.stringify(el.className) +
      ' text=' + JSON.stringify(trunc(el.textContent, 24)) +
      ' ng-click=' + JSON.stringify(el.getAttribute('ng-click')) +
      ' ng-if=' + JSON.stringify(trunc(el.getAttribute('ng-if'), 50)) +
      ' 可见=' + (visible ? Math.round(r.width) + 'x' + Math.round(r.height) : '否')
    );
  };

  say('=== A. 环境 ===');
  say('url      : ' + location.href);
  say('pathname : ' + location.pathname);
  say('search   : ' + location.search);
  say('有 angular: ' + Boolean(window.angular));
  say('采样时刻 : ' + new Date().toLocaleTimeString());

  // ------------------------------------------- B. 关键按钮是否存在
  say('');
  say('=== B. 关键按钮（判据验证） ===');
  const CANDIDATES = [
    'button.btn.btn-danger[ng-click="vm.commitTask()"]',
    'button.btn.btn-danger',
    'button.btn.btn-success[ng-click="vm.saveTask()"]',
    'button.btn.btn-success',
    '[ng-click="vm.commitTask()"]',
    '[ng-click="vm.saveTask()"]',
    '.btn-danger',
    '.btn-success',
  ];
  CANDIDATES.forEach((s) => {
    let n = -1;
    try {
      n = document.querySelectorAll(s).length;
    } catch (e) {
      n = -2;
    }
    say('  ' + s + ' → ' + n);
  });

  say('');
  say('  命中详情：');
  const seen = new Set();
  ['button', 'a', 'div', 'span'].forEach((tag) => {
    Array.from(document.querySelectorAll(tag)).forEach((el) => {
      const cls = String(el.className || '');
      const click = String(el.getAttribute('ng-click') || '');
      if (!/btn/.test(cls) && !/commitTask|saveTask/.test(click)) return;
      if (seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0 && !/commitTask|saveTask/.test(click)) return;
      say('    ' + desc(el));
    });
  });

  // ------------------------------------------------- C. 试卷状态
  say('');
  say('=== C. 试卷 scope 状态 ===');
  const main = document.querySelector('[ng-controller], .queItems-type, .queContainer, #paperMain, body');
  const scope = (() => {
    try {
      return window.angular && main ? window.angular.element(main).scope() : null;
    } catch (e) {
      return null;
    }
  })();
  if (scope) {
    const keys = Object.keys(scope).filter((k) => k.charAt(0) !== '$');
    say('  最近的 scope 键(' + keys.length + '): ' + keys.slice(0, 40).join(', '));
    const vm = scope.vm;
    if (vm && typeof vm === 'object') {
      say('  scope.vm 键: ' + Object.keys(vm).join(', '));
      const paper = vm.paper;
      if (paper && typeof paper === 'object') {
        say('  vm.paper 键: ' + Object.keys(paper).join(', '));
        say('  **vm.paper.can_do = ' + JSON.stringify(paper.can_do) + '**');
        say('  vm.paper.status = ' + JSON.stringify(paper.status) +
            '  vm.paper.score = ' + JSON.stringify(paper.score));
      }
      if (vm.task && typeof vm.task === 'object') {
        say('  vm.task 键: ' + Object.keys(vm.task).join(', '));
        say('  vm.task.type=' + JSON.stringify(vm.task.type) +
            ' id=' + JSON.stringify(vm.task.id) + ' cid=' + JSON.stringify(vm.task.cid));
      }
    }
  } else {
    say('  !! 拿不到 scope（页面结构可能变了）');
  }

  // ---------------------------------------------- D. 页面上的题与提示
  say('');
  say('=== D. 题目 / 提示 ===');
  say('  .queContainer 数: ' + document.querySelectorAll('.queContainer').length);
  say('  input 数        : ' + document.querySelectorAll('input').length);
  say('  富文本编辑器数  : ' + document.querySelectorAll('[contenteditable="true"], iframe.w-e-text-container').length);
  const body = document.body ? trunc(document.body.textContent, 100000) : '';
  ['已交卷', '已完成', '提交成功', '成绩', '分数', '得分', '返回课程', '重新考试', '暂不开始考试', '开始考试']
    .forEach((kw) => {
      if (body.indexOf(kw) >= 0) say('  页面包含关键字: ' + kw);
    });

  say('');
  say('  body 纯文本前 300 字: ' + trunc(body, 300));

  const text = out.join('\n');
  console.log(text);
  console.log('\n（以上共 ' + out.length + ' 行，请整段复制回来）');
  return text;
})();
