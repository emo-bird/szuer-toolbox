/**
 * 纯函数冒烟（档1）：UOOC 目录树 → 任务点。
 *
 * 锁住的是新「API 驱动接管」方案的**取数侧不变量**（口径见
 * `docs/UOOC-API驱动连播-需求.md` §A / §B）：
 *   1. 任务点 = `icon_list` 非空的节点，**按先序**展平（`data` 顺序 → 递归 `children`）；
 *   2. 祖先链**自己递归带下去**，不读 `parent` / `pid`；
 *   3. hash 尾部由**祖先链长度**决定：1 ⇒ `/section`、2 ⇒ `/subsection`；
 *   4. `finished` 数字与字符串两种形态都认；
 *   5. 起点 = 第一个未完成任务点。
 *
 * ⚠️ 第 3 条的 `/subsection` 拼法是**按同族 ui-router 状态类推**出来的，
 * 站点上没有任何真实页面实证（2026-10-08 全量扫过 `local/`）。用户已知悉并拍板照跳，
 * 所以这里锁的是「**我们的拼法**」，不是「站点的行为」—— 真跑到四级点时若对不上，
 * 要改的是这个文件和需求文档，**不是**把测试改成迁就现状。
 *
 * 另有一条**实测实例**做锚（§A.2 的 `#/2005836044/766102022/1482506601/124739605/section`
 * 曾在真实页面上出现过），它保证三级形态的字段顺序没有写反。
 *
 * 全部用**合成树**，不读 `local/`（那里不随 git，测试不能依赖它）。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  SOURCE_TYPE,
  buildCourseRows,
  classifySource,
  flattenTaskPoints,
  firstUnfinished,
  isCurrentRow,
  isFinished,
  sourceHash,
  summarizeTaskPoints,
  type CourseRow,
} from '../../src/sites/uooc/catalog.ts';

// ------------------------------------------------------------------ 合成目录树

/** 章 → 节（节自己带资源，三级）→ 点（点自己带资源，四级）各一条，外加各种边角 */
function sampleTree(): unknown {
  return [
    {
      id: 101,
      name: '第1章 甲',
      _level: 1,
      finished: 1,
      icon_list: [],
      children: [
        {
          id: 1011,
          name: '第1节 乙',
          _level: 2,
          finished: '1', // ⚠️ 字符串形态
          // 节自己就是任务点，**同时**还有子节点
          icon_list: [{ id: 9001, type: 10, type_name: '视频', catalog_id: 1011 }],
          children: [
            {
              id: 10111,
              name: '点 丙',
              _level: 3,
              finished: 0,
              icon_list: [{ id: 9002, type: '80', type_name: '测验', catalog_id: 10111 }],
            },
          ],
        },
        {
          id: 1012,
          name: '第2节 丁',
          _level: 2,
          finished: 1,
          icon_list: [{ id: 9003, type: 50, type_name: '附件', catalog_id: 1012 }],
        },
        {
          id: 1013,
          name: '第3节 空壳',
          _level: 2,
          finished: 0,
          icon_list: [], // 没有 icon_list ⇒ **不是**任务点，不参与进度
          children: [],
        },
      ],
    },
    {
      id: 102,
      name: '第2章 戊',
      _level: 1,
      finished: 0,
      icon_list: [],
      children: [
        {
          id: 1021,
          name: '第1节 己',
          _level: 2,
          finished: '0',
          icon_list: [{ id: 9004, type: 10, type_name: '视频', catalog_id: 1021 }],
        },
      ],
    },
  ];
}

const CID = '2005836044';

// ------------------------------------------------------------------ 先序与筛选

describe('uooc/catalog › 展平', () => {
  it('只收 icon_list 非空的节点，顺序是先序（章 → 节 → 该节的点 → 下一个节）', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    assertDeepEqual(
      points.map((p) => p.nodeId),
      ['1011', '10111', '1012', '1021'],
      '先序或「谁是任务点」判错了（1013 没有 icon_list，不该在列表里）',
    );
  });

  it('一个节点可以自己既是任务点、又有子任务点（不是 else 分支）', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    const ids = points.map((p) => p.nodeId);
    assert(ids.includes('1011'), '「节」自己带 icon_list 时被漏掉了');
    assert(ids.includes('10111'), '「节」的子「点」被漏掉了');
  });

  it('入参不是数组 / 是 null 时返回空列表，不抛错', () => {
    assertDeepEqual(flattenTaskPoints(null, CID), []);
    assertDeepEqual(flattenTaskPoints(undefined, CID), []);
    assertDeepEqual(flattenTaskPoints({ code: 1 }, CID), []);
    assertDeepEqual(flattenTaskPoints('nope', CID), []);
  });

  it('节点里混进 null / 非对象时不炸', () => {
    const points = flattenTaskPoints([null, 7, { id: 5, icon_list: [{ id: 6, type: 10 }] }], CID);
    assertDeepEqual(points.map((p) => p.nodeId), ['5']);
  });

  it('祖先链是自己递归带的，不读 parent / pid（故意塞一对错的也不受影响）', () => {
    const tree = [
      {
        id: 101,
        parent: '错',
        pid: 999,
        children: [
          {
            id: 1011,
            parent: '错',
            pid: 999,
            icon_list: [{ id: 9001, type: 10 }],
          },
        ],
      },
    ];
    const [point] = flattenTaskPoints(tree, CID);
    assert(point !== undefined, '没展平出任务点');
    assertDeepEqual(point.ancestors, ['101'], '祖先链被 parent / pid 带歪了');
    assertEqual(point.chapterId, '101');
    assertEqual(point.sectionId, '1011', 'section 形态下 sectionId 应该是节点自己');
    assertEqual(point.pointId, '', 'section 形态不该有 pointId');
  });
});

// ------------------------------------------------------------------ hash 拼接

describe('uooc/catalog › 拼 hash', () => {
  it('实测锚点：三级形态与 §A.2 的真实实例逐字一致', () => {
    // 需求文档 §A.2 的原话：节点 1482506601（icon 124739605）当时页面 hash 正是
    // #/2005836044/766102022/1482506601/124739605/section
    const { form, hash } = sourceHash(CID, ['766102022'], '1482506601', '124739605');
    assertEqual(form, 'section');
    assertEqual(hash, '#/2005836044/766102022/1482506601/124739605/section');
  });

  it('四级形态：章 → 节 → 点，尾关键字是 /subsection', () => {
    const { form, hash } = sourceHash(CID, ['766102022', '1408189092'], '394899706', '190951828');
    assertEqual(form, 'subsection');
    assertEqual(hash, '#/2005836044/766102022/1408189092/394899706/190951828/subsection');
  });

  it('展平出来的 hash 与 sourceHash 单独算的一致（两条路不会分叉）', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    for (const point of points) {
      const again = sourceHash(CID, point.ancestors, point.nodeId, point.sourceId);
      assertEqual(point.hash, again.hash, `${point.nodeId} 的 hash 两次算得不一样`);
      assertEqual(point.form, again.form, `${point.nodeId} 的 form 两次算得不一样`);
    }
  });

  it('祖先链长度 0 或 ≥3 ⇒ unsupported 且 hash 为空串（站点没有对应 ui-router 状态）', () => {
    for (const ancestors of [[], ['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      const r = sourceHash(CID, ancestors, 'n', 's');
      if (ancestors.length === 1 || ancestors.length === 2) {
        assert(r.form !== 'unsupported', `${ancestors.length} 段祖先链不该是 unsupported`);
      } else {
        assertEqual(r.form, 'unsupported', `${ancestors.length} 段祖先链应归 unsupported`);
        assertEqual(r.hash, '', 'unsupported 时 hash 必须是空串，不能拼出半截 URL');
      }
    }
  });

  it('缺 cid / nodeId / sourceId 任一项 ⇒ unsupported（宁可不跳，也不拼半截 URL）', () => {
    assertEqual(sourceHash('', ['1'], '2', '3').form, 'unsupported');
    assertEqual(sourceHash(CID, ['1'], '', '3').form, 'unsupported');
    assertEqual(sourceHash(CID, ['1'], '2', '').form, 'unsupported');
  });

  it('三级 / 四级的 form 判据就是祖先链长度，不是节点自己的 _level', () => {
    // 合成树里 1011（_level 2）与 10111（_level 3）刚好各一条
    const points = flattenTaskPoints(sampleTree(), CID);
    const byId = new Map(points.map((p) => [p.nodeId, p]));
    assertEqual(byId.get('1011')?.form, 'section');
    assertEqual(byId.get('10111')?.form, 'subsection');
  });
});

// ------------------------------------------------------------------ finished 判定

describe('uooc/catalog › finished 与起点', () => {
  it('finished 数字 1 与字符串 "1" 都算完成；0 / "0" / 缺失都算未完成', () => {
    assertEqual(isFinished(1), true);
    assertEqual(isFinished('1'), true);
    assertEqual(isFinished(0), false);
    assertEqual(isFinished('0'), false);
    assertEqual(isFinished(undefined), false);
    assertEqual(isFinished(null), false);
    assertEqual(isFinished(''), false);
  });

  it('起点 = 先序里第一个未完成任务点', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    const first = firstUnfinished(points);
    assert(first !== null, '应该找得到未完成的任务点');
    assertEqual(first.nodeId, '10111', '起点取错了（1011 已完成，1013 不是任务点）');
    assertEqual(first.form, 'subsection');
  });

  it('全部完成 ⇒ 返回 null（主循环据此判「全部完成」）', () => {
    const allDone = [
      {
        id: 1,
        finished: 1,
        icon_list: [{ id: 2, type: 10 }],
      },
    ];
    assertEqual(firstUnfinished(flattenTaskPoints(allDone, CID)), null);
  });

  it('空列表 ⇒ null，不抛错', () => {
    assertEqual(firstUnfinished([]), null);
  });
});

// ------------------------------------------------------------------ 进度汇总

describe('uooc/catalog › 进度汇总', () => {
  it('total / done 的分母只算任务点（没有 icon_list 的节点不算）', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    assertDeepEqual(
      summarizeTaskPoints(points),
      { total: 4, done: 2 },
      '分母应只数 icon_list 非空的节点（合成树里 1013 不算）',
    );
  });

  it('空列表 ⇒ 0 / 0', () => {
    assertDeepEqual(summarizeTaskPoints([]), { total: 0, done: 0 });
  });
});

// ------------------------------------------------------------------ 类型字典

describe('uooc/catalog › 类型分派', () => {
  it('数字与字符串两种 type 形态都归一化到同一个 kind', () => {
    assertEqual(classifySource(SOURCE_TYPE.VIDEO), 'video');
    assertEqual(classifySource(Number(SOURCE_TYPE.VIDEO)), 'video');
    assertEqual(classifySource(SOURCE_TYPE.ATTACH), 'attach');
    assertEqual(classifySource(SOURCE_TYPE.TEXT), 'text');
    assertEqual(classifySource(SOURCE_TYPE.DISCUSSION), 'discussion');
    assertEqual(classifySource(SOURCE_TYPE.QUIZ), 'quiz');
  });

  it('60 = 文本（2026-10-08 双实证：模板 icon-wendang1 + 响应 type_name）', () => {
    assertEqual(SOURCE_TYPE.TEXT, '60');
    assertEqual(classifySource('60'), 'text');
    // 不认识的号一律 unknown，由主循环 warn 一次后跳过（§C.4），不是在这里猜
    assertEqual(classifySource(0), 'unknown');
    assertEqual(classifySource('999'), 'unknown');
    assertEqual(classifySource(undefined), 'unknown');
  });

  it('展平出的 kind 与 type 对得上', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    const byId = new Map(points.map((p) => [p.nodeId, p]));
    assertEqual(byId.get('1011')?.kind, 'video');
    assertEqual(byId.get('10111')?.kind, 'quiz');
    assertEqual(byId.get('1012')?.kind, 'attach');
  });

  it('typeName 原样带出，空值时是空串而不是 "undefined"', () => {
    const points = flattenTaskPoints(
      [{ id: 1, name: 'x', icon_list: [{ id: 2, type: 10 }] }],
      CID,
    );
    assertEqual(points[0]?.typeName, '');
  });
});

// ------------------------------------------------------------------ §E.2 分层列表

describe('uooc/catalog › 监视页分层列表', () => {
  /** 把行压成 `缩进|勾|名字` 便于肉眼比对 */
  function shape(rows: readonly CourseRow[]): string[] {
    return rows.map((r) => {
      const mark = r.done === null ? '-' : r.done ? 'Y' : 'N';
      return `${r.depth}${mark} ${r.typeName}${r.typeName === '' ? '' : ' '}${r.label}`;
    });
  }

  it('section 形态只出「节」一行、勾打在这一行；subsection 形态出「节 + 点」两行', () => {
    const points = flattenTaskPoints(sampleTree(), CID);
    assertDeepEqual(shape(buildCourseRows(points)), [
      // 章行：不是任务点，done === null
      '0- 第1章 甲',
      // 1011 自己带 icon ⇒ 它就是那一节的「节行」，勾打在这里
      '1Y 视频 第1节 乙',
      // 10111 是 1011 的子任务点 ⇒ 缩进一层单独成行
      '2N 测验 点 丙',
      '1Y 附件 第2节 丁',
      '0- 第2章 戊',
      '1N 视频 第1节 己',
    ]);
  });

  it('没有 icon_list 的「空壳节」既不出现在任务点里、也不该凭空出现在列表里', () => {
    const rows = buildCourseRows(flattenTaskPoints(sampleTree(), CID));
    assertEqual(rows.some((r) => r.label.includes('空壳')), false);
  });

  it('行 id 给全：任务点行同时带 nodeId 与 sourceId，节行带 sectionId', () => {
    const rows = buildCourseRows(flattenTaskPoints(sampleTree(), CID));
    const sub = rows.find((r) => r.label === '点 丙');
    assertDeepEqual(sub?.ids, ['10111', '9002']);
    const sec = rows.find((r) => r.label === '第1节 乙');
    assertDeepEqual(sec?.ids, ['1011']);
  });

  it('isCurrentRow 认 nodeId 也认 sourceId；currentId 为空时谁都不亮', () => {
    const rows = buildCourseRows(flattenTaskPoints(sampleTree(), CID));
    const sub = rows.find((r) => r.label === '点 丙')!;
    assertEqual(isCurrentRow(sub, '10111'), true);
    assertEqual(isCurrentRow(sub, '9002'), true);
    assertEqual(isCurrentRow(sub, '99999'), false);
    assertEqual(isCurrentRow(sub, null), false);
  });

  it('空任务点列表 ⇒ 空列表（不抛错）', () => {
    assertDeepEqual(buildCourseRows([]), []);
  });

  it('同一个节下先落地「节行」再加子点行：先序保证节自己那一个勾不会被子节点吃掉', () => {
    // 实测 836508569 就是「节自己带 icon、同时还有子任务点」的形态
    const points = flattenTaskPoints(
      [
        {
          id: 1,
          name: '章',
          children: [
            {
              id: 11,
              name: '节',
              finished: 1,
              icon_list: [{ id: 91, type: 10, type_name: '视频' }],
              children: [{ id: 111, name: '子点', finished: 0, icon_list: [{ id: 92, type: 80, type_name: '测验' }] }],
            },
          ],
        },
      ],
      CID,
    );
    assertDeepEqual(shape(buildCourseRows(points)), [
      '0- 章',
      '1Y 视频 节',
      '2N 测验 子点',
    ]);
  });
});
