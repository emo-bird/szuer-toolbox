/* 深大人工具箱 · 只读探针：bkxk 课表页
 *
 * 用法：在**课表页**（.../xsxkapp/sys/xsxkapp/*default/curriculum.do）按 F12 →
 *      Console → 整段粘贴 → 回车 → 把打印出来的内容整段贴回给助手。
 *
 * 它只读，不发请求、不改 DOM、不写存储。回答三件事：
 *   1. 站点的课表容器到底叫什么（我们的选择器是按旧仓库的文档契约写的，没在真机采过样）；
 *   2. 页面 realm 里的 XMLHttpRequest / fetch 有没有被我们换掉
 *      （本项目声明了 @grant，脚本跑在沙箱里 —— 换的可能是沙箱的，不是页面的）；
 *   3. 我们的注入节点在不在。
 */
(() => {
  const q = (sel) => document.querySelectorAll(sel).length;
  const head = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const out = [];

  out.push('== 1. 页面 ==');
  out.push('href     = ' + location.href);
  out.push('pathname = ' + location.pathname);
  out.push('title    = ' + document.title);

  out.push('');
  out.push('== 2. 我们按契约找的容器 / 结构 ==');
  const sels = [
    '#myCourseTable',
    '.cv-my-course',
    '.cv-col.cv-right',
    '.cv-col.cv-left',
    '.cv-head',
    '.cv-lesson',
    '.cv-course-card-single',
  ];
  for (const s of sels) out.push(s.padEnd(24) + '命中 ' + q(s));

  const table = document.querySelector('#myCourseTable') || document.querySelector('.cv-my-course');
  if (table) {
    out.push('容器 tag/id/class = ' + table.tagName + '#' + table.id + '.' + head(table.className, 80));
    out.push('容器一层子节点 = ' + [...table.children].map((c) => c.tagName + '.' + head(c.className, 40)).join(' | '));
  } else {
    out.push('容器 tag/id/class = 没找到（下面看候选）');
  }
  out.push('列头文本 = ' + [...document.querySelectorAll('.cv-head')].map((e) => head(e.textContent, 12)).join(' | '));

  out.push('');
  out.push('== 3. 我们注入的东西在不在 ==');
  out.push('.sztb-bkxk-tt-lesson     命中 ' + q('.sztb-bkxk-tt-lesson'));
  out.push('.sztb-bkxk-tt-card       命中 ' + q('.sztb-bkxk-tt-card'));
  out.push('注入样式 #sztb-bkxk-tt-style = ' + (document.getElementById('sztb-bkxk-tt-style') ? '在' : '不在'));
  out.push('.sztb-root 悬浮窗        命中 ' + q('.sztb-root'));

  out.push('');
  out.push('== 4. 页面 realm 有没有被接管 ==');
  out.push('XMLHttpRequest = ' + head(String(window.XMLHttpRequest), 110));
  out.push('fetch          = ' + head(String(window.fetch), 110));

  out.push('');
  out.push('== 5. 容器候选（找不到时看这个）==');
  const cands = [...document.querySelectorAll('[id], table, [class*="course"], [class*="curricul"], [class*="timetable"], [class*="lesson"]')];
  const seen = new Set();
  const lines = [];
  for (const e of cands) {
    const key = e.tagName + '#' + e.id + '.' + head(e.className, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(key);
    if (lines.length >= 25) break;
  }
  out.push(lines.join('\n'));

  const text = out.join('\n');
  console.log(text);
  return text;
})();
