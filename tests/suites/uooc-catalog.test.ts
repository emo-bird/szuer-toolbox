/**
 * UOOC 目录模型（`src/sites/uooc/catalog.ts`）的纯函数冒烟。
 *
 * 用例里的 id 全部取自 `local/capture/` 的真实取证样本（2025 实测，课程 2005836044），
 * 所以这些断言同时也是「我对站点结构的理解没跑偏」的回归检查。
 */

import {
  SOURCE_TYPE,
  catalogListUrl,
  classifySource,
  courseIdFromLocation,
  currentChainFromHash,
  examUrl,
  findLeafIndex,
  flattenLeaves,
  parseCatalogTree,
  parseUnitSources,
  sourceHash,
  unitLearnUrl,
} from '../../src/sites/uooc/catalog.ts';
import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';

describe('uooc/catalog · 资源类型', () => {
  it('数字与字符串形式的 type 都能归一化', () => {
    // 实测：同一份响应里 type 出现过数字 50 与字符串 "80"
    assertEqual(classifySource(50), 'attach');
    assertEqual(classifySource('50'), 'attach');
    assertEqual(classifySource('80'), 'quiz');
    assertEqual(classifySource(80), 'quiz');
    assertEqual(classifySource('10'), 'video');
    assertEqual(classifySource('60'), 'text');
    assertEqual(classifySource('70'), 'discussion');
  });

  it('未知类型落到 unknown，不抛', () => {
    assertEqual(classifySource('999'), 'unknown');
    assertEqual(classifySource(undefined), 'unknown');
    assertEqual(classifySource(null), 'unknown');
  });

  it('类型字典与实测一致', () => {
    assertDeepEqual(SOURCE_TYPE, { VIDEO: '10', ATTACH: '50', TEXT: '60', DISCUSSION: '70', QUIZ: '80' });
  });
});

describe('uooc/catalog · 目录树解析', () => {
  it('结构不对时返回空数组而不是抛错', () => {
    assertDeepEqual(parseCatalogTree(null), []);
    assertDeepEqual(parseCatalogTree({}), []);
    assertDeepEqual(parseCatalogTree({ data: 'nope' }), []);
  });

  it('保留 id / name，丢掉没有合法 id 的节点', () => {
    const tree = parseCatalogTree({
      code: 1,
      data: [
        { id: 766102022, name: '第1章', children: [] },
        { name: '没有 id' },
        { id: 'abc', name: 'id 不是数字' },
      ],
    });
    assertEqual(tree.length, 1);
    assertEqual(tree[0]!.id, 766102022);
    assertEqual(tree[0]!.name, '第1章');
    // children 为空数组 = 叶子，归一化成 undefined
    assertEqual(tree[0]!.children, undefined);
  });

  it('空 children 归一化成叶子', () => {
    const tree = parseCatalogTree({ data: [{ id: 1, name: 'x', children: [] }] });
    assertEqual(tree[0]!.children, undefined);
  });
});

describe('uooc/catalog · 展平叶子', () => {
  const tree = parseCatalogTree({
    data: [
      {
        id: 766102022,
        name: '第1章 劳动与劳动教育',
        children: [
          {
            id: 1408189092,
            name: '第1节 劳动',
            children: [
              { id: 394899706, name: '课程导论' },
              { id: 1953974751, name: '劳动的概念及其分类' },
            ],
          },
          { id: 1482506601, name: '第3节 章节测试' },
          {
            id: 241367479,
            name: '第4节 拓展资源',
            children: [
              { id: 860214972, name: '第1节 课程大纲' },
              { id: 1817157352, name: '第2节 本章讲义' },
            ],
          },
          { id: 733704712, name: '第5节' },
        ],
      },
      { id: 60253051, name: '第2章' },
    ],
  });

  it('深度优先、顺序即目录顺序', () => {
    const leaves = flattenLeaves(tree);
    assertDeepEqual(
      leaves.map((l) => l.nodeId),
      [394899706, 1953974751, 1482506601, 860214972, 1817157352, 733704712, 60253051],
    );
  });

  it('链长 2 vs 3 能区分（二级叶 vs 三级叶）', () => {
    const leaves = flattenLeaves(tree);
    const l2 = leaves.find((l) => l.nodeId === 1482506601)!;
    const l3 = leaves.find((l) => l.nodeId === 394899706)!;
    assertDeepEqual(l2.chain, [766102022, 1482506601]);
    assertDeepEqual(l3.chain, [766102022, 1408189092, 394899706]);
    assertDeepEqual(l3.titles, ['第1章 劳动与劳动教育', '第1节 劳动', '课程导论']);
  });

  it('空叶子照样进队列（运行时才知道它没资源）', () => {
    const leaves = flattenLeaves(tree);
    assert(leaves.some((l) => l.nodeId === 733704712), '733704712 是实测的空叶子，必须出现在队列里');
  });
});

describe('uooc/catalog · 进度字段（起点判定要用）', () => {
  // 形状照抄实测：`finished` 每个节点都有；`learning=1` 只标在章和节上，叶子自己不标
  const tree = parseCatalogTree({
    data: [
      {
        id: 100,
        name: '第1章',
        finished: 1,
        learning: 0,
        children: [
          { id: 111, name: '1.1 已学完', finished: 1, learning: 0 },
          { id: 112, name: '1.2 没学', finished: 0, learning: 0 },
        ],
      },
      {
        id: 200,
        name: '第4章',
        finished: 0,
        learning: 1,
        children: [
          {
            id: 210,
            name: '4.1 用户在的节',
            finished: 0,
            learning: 1,
            children: [
              { id: 211, name: '4.1.1 已学完', finished: 1, learning: 0 },
              { id: 212, name: '4.1.2 没学', finished: 0, learning: 0 },
            ],
          },
          { id: 220, name: '4.2 没学', finished: 0, learning: 0 },
        ],
      },
    ],
  });

  it('finished 原样带到叶子上', () => {
    const leaves = flattenLeaves(tree);
    assertEqual(leaves.find((l) => l.nodeId === 111)!.finished, 1);
    assertEqual(leaves.find((l) => l.nodeId === 112)!.finished, 0);
  });

  it('learning 沿链往下传：章/节标了，它们下面的每个叶子都算在链上', () => {
    const leaves = flattenLeaves(tree);
    const onPath = leaves.filter((l) => l.learning === 1).map((l) => l.nodeId);
    assertDeepEqual(onPath, [211, 212, 220]);
  });

  it('learning=0 的节点下面不会有叶子被误标', () => {
    const leaves = flattenLeaves(tree);
    assertEqual(leaves.find((l) => l.nodeId === 112)!.learning, undefined);
  });
});

describe('uooc/catalog · 地址拼装', () => {
  const leaves = flattenLeaves(
    parseCatalogTree({
      data: [
        {
          id: 766102022,
          name: '第1章',
          children: [
            {
              id: 1408189092,
              name: '第1节',
              children: [{ id: 1953974751, name: '点' }],
            },
            { id: 1482506601, name: '第3节' },
          ],
        },
      ],
    }),
  );
  const l3 = leaves.find((l) => l.nodeId === 1953974751)!;
  const l2 = leaves.find((l) => l.nodeId === 1482506601)!;

  it('三级叶子用 /subsection', () => {
    assertEqual(sourceHash('2005836044', l3, 1766807241), '#/2005836044/766102022/1408189092/1953974751/1766807241/subsection');
  });

  it('二级叶子用 /section', () => {
    assertEqual(sourceHash('2005836044', l2, 1289718123), '#/2005836044/766102022/1482506601/1289718123/section');
  });

  it('附件 id 恒为 0，拼出来就是 0', () => {
    assertEqual(sourceHash('2005836044', l3, 0), '#/2005836044/766102022/1408189092/1953974751/0/subsection');
  });

  it('答题页用 task_id 当 tid', () => {
    assertEqual(examUrl('2005836044', 153728628), '/exam/paper?cid=2005836044&tid=153728628');
  });

  it('两个接口地址形状与实测一致', () => {
    assertEqual(catalogListUrl('2005836044'), '/home/learn/getCatalogList?cid=2005836044&hidemsg_=true');
    assertEqual(
      unitLearnUrl('2005836044', l3),
      '/home/learn/getUnitLearn?catalog_id=1953974751&chapter_id=766102022&section_id=1408189092&cid=2005836044&hidemsg_=true',
    );
  });
});

describe('uooc/catalog · 地址反查', () => {
  it('三级叶 hash 反推出链（节点 id 就是链尾）', () => {
    assertDeepEqual(
      currentChainFromHash('#/2005836044/766102022/1408189092/1953974751/1766807241/subsection'),
      [766102022, 1408189092, 1953974751],
    );
  });

  it('二级叶 hash 反推出链', () => {
    assertDeepEqual(currentChainFromHash('#/2005836044/766102022/1482506601/124739605/section'), [
      766102022,
      1482506601,
    ]);
  });

  it('只到章一级时链长为 1（对应 ui-router 的 main.chapter）', () => {
    assertDeepEqual(currentChainFromHash('#/2005836044/766102022'), [766102022]);
  });

  it('形状不对时返回 null', () => {
    assertEqual(currentChainFromHash(''), null);
    assertEqual(currentChainFromHash('#/2005836044'), null);
    assertEqual(currentChainFromHash('#/x/y'), null);
  });

  it('findLeafIndex 按链精确匹配', () => {
    const leaves = flattenLeaves(
      parseCatalogTree({
        data: [{ id: 1, name: 'a', children: [{ id: 2, name: 'b' }, { id: 3, name: 'c' }] }],
      }),
    );
    assertEqual(findLeafIndex(leaves, [1, 3]), 1);
    assertEqual(findLeafIndex(leaves, [1, 99]), -1);
    // 长度不同不算命中
    assertEqual(findLeafIndex(leaves, [1]), -1);
  });

  it('课程 id 新旧两版都能取', () => {
    assertEqual(courseIdFromLocation('/home/learn/new/2005836044', '#/2005836044/1/2'), '2005836044');
    assertEqual(courseIdFromLocation('/home/learn/index', '#/2005836044/1/2'), '2005836044');
    assertEqual(courseIdFromLocation('/home/learn/index', ''), null);
    assertEqual(courseIdFromLocation('/home/learn/new/abc', '#/xyz'), null);
  });
});

describe('uooc/catalog · 资源解析', () => {
  it('解析实测的视频资源', () => {
    const [s] = parseUnitSources({
      code: 1,
      data: [
        {
          id: 1289718123,
          type: '10',
          title: '04- 1.mp4',
          finished: 1,
          video_pos: '750.420',
        },
      ],
    });
    assertEqual(s!.id, 1289718123);
    assertEqual(s!.type, '10');
    assertEqual(s!.finished, true);
    assertEqual(s!.taskId, null);
  });

  it('解析实测的测验资源：task_id 就是答题页 tid', () => {
    const [s] = parseUnitSources({
      code: 1,
      data: [
        {
          id: 124739605,
          type: '80',
          title: '第一章  章节测试',
          uri: null,
          finished: 1,
          is_task: '1',
          task_id: 1250916414,
        },
      ],
    });
    assertEqual(s!.taskId, 1250916414);
    assertEqual(s!.finished, true);
  });

  it('解析实测的附件资源：文件在 document[] 里，主对象 id 恒为 0', () => {
    const [s] = parseUnitSources({
      code: 1,
      data: [
        {
          id: 0,
          type: 50,
          document: [
            {
              id: '22981',
              title: '1.第一章  劳动与劳动教育.pdf',
              uri: 'https://sourcetx3.uooconline.com/course2743/document/1.第一章  劳动与劳动教育.pdf',
              online: 1,
            },
          ],
        },
      ],
    });
    assertEqual(s!.id, 0);
    assertEqual(s!.type, '50');
    assertEqual(s!.documents.length, 1);
    assertEqual(s!.documents[0]!.title, '1.第一章  劳动与劳动教育.pdf');
    assert(s!.documents[0]!.uri.startsWith('https://sourcetx3.uooconline.com/'), '附件必须有可打开的 uri');
  });

  it('空叶子返回空数组（实测 733704712）', () => {
    assertDeepEqual(parseUnitSources({ code: 1, data: [] }), []);
    assertDeepEqual(parseUnitSources({ code: 1 }), []);
    assertDeepEqual(parseUnitSources(null), []);
  });

  it('task_id 为 0 或缺省时 taskId 是 null（避免拼出 tid=0 的答题页）', () => {
    const [a] = parseUnitSources({ data: [{ id: 1, type: '80' }] });
    assertEqual(a!.taskId, null);
    const [b] = parseUnitSources({ data: [{ id: 1, type: '80', task_id: 0 }] });
    assertEqual(b!.taskId, null);
  });
});
