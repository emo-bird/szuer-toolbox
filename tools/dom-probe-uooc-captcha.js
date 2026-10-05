/**
 * UOOC 验证码 DOM 只读采样 v1 —— 专攻「阿里云智能验证（SceneId=137o3jmc）长什么样、能不能点到」。
 *
 * 存在意义：抓包已经确认了**服务端**全貌（设备指纹 Log1/Log2 → InitCaptchaV3 → VerifyCaptchaV3 → UploadLog
 * 行为轨迹），但抓包看不见**前端 DOM**。而「模拟人类点击」能不能做，取决于三件事：
 *   Q-A 验证码在不在 **shadow DOM** 里？（在的话普通 querySelector 找不到，必须递归 shadowRoot）
 *   Q-B 可点目标是什么元素、多大、坐标在哪？（点选型验证码通常要求**按顺序点若干目标**）
 *   Q-C 有没有跨域 iframe？（跨域则脚本碰不到 DOM，这条路直接判死）
 *
 * ⚠️ 本脚本**绝对不点击、不交互**，只读取结构与坐标。
 *
 * 怎么用：
 *   1. 在做题页**先把验证码弄出来**（点提交、或触发风控），让验证码停留在屏幕上；
 *   2. F12 → Console → 整段粘贴 → 回车（注意：别误点，脚本自己不会点）；
 *   3. 结果自动进剪贴板，粘进 `local/capture/dom-uooc-captcha.txt` 保存；
 *   4. 告诉助手文件名。
 *   若剪贴板没拿到：敲 `copy(__szuCaptchaSample)`。
 *
 * 建议**跑两次**：验证码刚出现时一次（初始态），鼠标悬停/移入后一次（展开态，可能多出提示文字）。
 */
(() => {
  const out = [];
  let budget = 1500;
  const push = (...a) => {
    if (budget > 0) {
      budget--;
      out.push(a.join(' '));
    }
  };
  const short = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
  const cls = (el) => (typeof el.className === 'string' ? el.className : '');
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
  };
  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return Math.round(r.left + r.width / 2) + ',' + Math.round(r.top + r.height / 2);
  };
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

  const tree = (el, depth, maxDepth) => {
    if (depth > maxDepth || budget <= 0) return;
    const t = ownText(el);
    push(
      '    '.repeat(depth) +
        el.tagName.toLowerCase() +
        attrsOf(el) +
        ' ' +
        rectOf(el) +
        (t ? ' text=' + JSON.stringify(short(t, 30)) : ''),
    );
    Array.from(el.children)
      .slice(0, 14)
      .forEach((c) => tree(c, depth + 1, maxDepth));
    if (el.children.length > 14) push('    '.repeat(depth + 1) + '…另有 ' + (el.children.length - 14) + ' 个子元素（已省略）');
  };

  /** 递归收集含 shadow root 的元素 */
  const shadowHosts = [];
  const allEls = (root, acc) => {
    const cur = acc || [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      cur.push(el);
      if (el.shadowRoot) {
        shadowHosts.push(el);
        allEls(el.shadowRoot, cur);
      }
    }
    return cur;
  };

  try {
    const CAPTCHA_RE = /captcha|aliyun|baxia|nc_|verify|slider|puzzle|人机|验证/i;
    const els = allEls(document, []);

    push('=== 0. 环境 ===');
    push('url', location.pathname + location.search);
    push('readyState', document.readyState);
    push('window 尺寸', window.innerWidth + 'x' + window.innerHeight, 'DPR', window.devicePixelRatio);

    push('');
    push('=== 1. 页面里的 captcha 相关脚本 / 样式（判断加载了哪一套） ===');
    Array.from(document.querySelectorAll('script[src], link[href]')).forEach((el) => {
      const u = el.src || el.href || '';
      if (CAPTCHA_RE.test(u)) push('  ' + (el.src ? 'script' : 'link ') + ' ' + short(u, 160));
    });

    push('');
    push('=== 2. shadow DOM 主机清单（能不能 querySelector 到，全看这个） ===');
    push('  shadow 主机总数 = ' + shadowHosts.length);
    shadowHosts.forEach((h, i) => {
      push('  #' + i + ' ' + h.tagName.toLowerCase() + attrsOf(h) + ' ' + rectOf(h) + ' 模式=' + (h.shadowRoot ? h.shadowRoot.mode : '?'));
    });
    if (!shadowHosts.length) push('  （没有 shadow DOM —— 好消息，普通选择器能用）');

    push('');
    push('=== 3. 跨域 iframe 检测（若验证码在跨域帧里，脚本碰不到 DOM） ===');
    let crossCnt = 0;
    Array.from(document.querySelectorAll('iframe')).forEach((f, i) => {
      let same = false;
      try {
        same = !!f.contentDocument;
      } catch {
        same = false;
      }
      if (!same) crossCnt++;
      push('  iframe[' + i + '] src=' + short(f.src, 120) + ' ' + rectOf(f) + ' 同源=' + same);
    });
    push('  跨域 iframe 数 = ' + crossCnt + (crossCnt ? '  ⚠ 若验证码在其中，方案受限' : ''));

    push('');
    push('=== 4. 验证码容器定位 ===');
    const CONTAINERS = [
      '#aliyunCaptcha',
      '[id*="aliyunCaptcha"]',
      '.aliyun-captcha',
      '[class*="captcha"]',
      '[id*="captcha"]',
      '[class*="baxia"]',
      '[id*="baxia"]',
      '.nc-container',
      '[class*="verify"]',
      '[class*="slider"]',
    ];
    const found = [];
    CONTAINERS.forEach((sel) => {
      let got = [];
      try {
        got = Array.from(document.querySelectorAll(sel));
      } catch {
        return;
      }
      if (got.length) {
        push('  ' + sel + ' → ' + got.length);
        got.forEach((el) => {
          if (!found.includes(el)) found.push(el);
        });
      }
    });
    // shadow 内部的也扫一遍
    shadowHosts.forEach((h) => {
      CONTAINERS.forEach((sel) => {
        let got = [];
        try {
          got = Array.from(h.shadowRoot.querySelectorAll(sel));
        } catch {
          return;
        }
        got.forEach((el) => {
          if (!found.includes(el)) {
            found.push(el);
            push('  （shadow 内）' + sel + ' → ' + rectOf(el));
          }
        });
      });
    });

    push('');
    push('=== 5. 验证码容器结构（缩进树，深度 ≤6） ===');
    if (!found.length) {
      push('  ⚠ 没有命中任何 captcha 容器选择器。回退：列出全屏浮层候选（见第 6 段）');
    }
    found.slice(0, 3).forEach((el, i) => {
      push('  --- 容器 #' + i + ' ' + el.tagName.toLowerCase() + attrsOf(el) + ' ' + rectOf(el) + ' ---');
      tree(el, 2, 6);
    });

    push('');
    push('=== 6. 全屏浮层候选（position 固定/绝对 + 高 z-index + 尺寸够大） ===');
    const overlays = els
      .map((el) => {
        let cs;
        try {
          cs = getComputedStyle(el);
        } catch {
          return null;
        }
        const r = el.getBoundingClientRect();
        const z = parseInt(cs.zIndex, 10);
        if ((cs.position === 'fixed' || cs.position === 'absolute') && !isNaN(z) && z >= 100 && r.width > 120 && r.height > 60) {
          return { el, z, r };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.z - a.z)
      .slice(0, 12);
    overlays.forEach(({ el, z, r }) => {
      push(
        '  z=' + z + ' ' + el.tagName.toLowerCase() + attrsOf(el) + ' ' +
          `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}` +
          ' text=' + JSON.stringify(short((el.textContent || '').trim(), 40)),
      );
    });

    push('');
    push('=== 7. 可点目标清单（模拟点击要按这些坐标打） ===');
    const TARGETS = [
      '[class*="btn"]',
      '[class*="click"]',
      '[class*="target"]',
      '[class*="point"]',
      '[class*="char"]',
      '[class*="icon"]',
      '[role="button"]',
      'button',
      'canvas',
      'img',
      'span',
    ];
    const scope = found.length ? found[0] : document.body;
    const seen = new Set();
    let n = 0;
    for (const sel of TARGETS) {
      let got = [];
      try {
        got = Array.from(scope.querySelectorAll(sel));
      } catch {
        continue;
      }
      for (const el of got) {
        if (seen.has(el) || n >= 40) continue;
        const r = el.getBoundingClientRect();
        // 只保留「有面积且不太大」的，才可能是点选目标
        if (r.width < 8 || r.height < 8 || r.width > 200 || r.height > 200) continue;
        seen.add(el);
        n++;
        push(
          '  [' + n + '] ' + el.tagName.toLowerCase() + attrsOf(el) +
            ' 尺寸=' + Math.round(r.width) + 'x' + Math.round(r.height) +
            ' 中心=' + centerOf(el) +
            ' text=' + JSON.stringify(short((el.textContent || '').trim(), 16)),
        );
      }
    }
    if (!n) push('  （没找到像点选目标的小元素 —— 可能是 canvas 整体绘制，需要另一套思路）');

    push('');
    push('=== 8. 全局钩子与状态 ===');
    ['AliyunCaptcha', 'aliyunCaptcha', 'AWSC', 'baxia', 'nc', 'getCaptcha', 'captchaInstance', 'CAPTCHA'].forEach((k) => {
      let t = typeof window[k];
      if (t !== 'undefined') push('  window.' + k + ' : ' + t);
    });
    push('  内联 script 中含 captcha 关键词的片段：');
    Array.from(document.querySelectorAll('script:not([src])'))
      .slice(0, 15)
      .forEach((s, i) => {
        const txt = s.textContent || '';
        if (!CAPTCHA_RE.test(txt)) return;
        const m = txt.match(/[\w$]*(?:captcha|Captcha|AliyunCaptcha)[\w$]*/g);
        push('    script[' + i + '] len=' + txt.length + (m ? ' 命中=' + JSON.stringify(Array.from(new Set(m)).slice(0, 8)) : ''));
      });

    push('');
    push('=== 9. 输出统计 ===');
    push('总行数', out.length, '预算剩余', budget, budget <= 0 ? '⚠ 已截断' : '（未截断）');

    const text = out.join('\n');
    window.__szuCaptchaSample = text;
    try {
      copy(text);
      console.log('%c已复制到剪贴板，行数 ' + out.length, 'color:#0a0;font-weight:bold');
    } catch {
      console.log('%c剪贴板不可用，请敲 copy(__szuCaptchaSample)', 'color:#c60;font-weight:bold');
    }
    console.log(text);
    return '采样完成，共 ' + out.length + ' 行（已挂到 window.__szuCaptchaSample）';
  } catch (e) {
    console.error('采样失败：', e);
    return '采样失败：' + (e && e.message);
  }
})();
