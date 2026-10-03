/**
 * UOOC 优课联盟适配器。
 *
 * ⚠️ 当前是**空壳**（阶段 2 提前建立，见 docs/开发文档.md §7）：
 *   - 只声明站点域与页面变体，**还没有任何功能标签页**；
 *   - 悬浮窗里此时只显示 4 个公共标签页（设置 / 日志 / 登录态 / 状态）。
 *
 * 为什么先建空壳而不是把它塞进 `SUPPORTED_ROOT_DOMAINS`：
 *   UOOC 是**明确已知的单一站点**（域固定、功能明确、有规划），
 *   用适配器表达才语义正确；根域白名单是给「深大域下站点多到列不全」用的兜底。
 *   走适配器还让日志与状态页显示「站点=uooc」而不是「站点=无」。
 *
 * 阶段 3 要在此目录下补：
 *   - `legacy/` —— 旧版学习页（`/home/learn/index`，有参考脚本，先做）
 *   - `modern/` —— 新版学习页（`/home/learn/new/{数字}`，零参考，需逆向）
 *   - 标签页：倍速 / 禁音 / 连播 / 失焦续播、测验答案导出与加载、LLM 答题……
 *   详见 docs/需求文档.md §11 与 docs/开发文档.md 的 UOOC 待验证清单 V1–V12。
 */

import { scoped } from '../../common/core/log.ts';
import type { SiteAdapter } from '../types.ts';

const log = scoped('site/uooc');

/**
 * 站点域。
 *
 * `uooc.net.cn` 与 `*.uooc.net.cn` 都要写：前者覆盖裸域，后者覆盖 `www.` 等子域
 * （`matchAnyHost` 的通配语义与 `@match` 一致，`*.uooc.net.cn` **不含**裸域本身）。
 */
const HOSTS: readonly string[] = ['uooc.net.cn', '*.uooc.net.cn'];

/**
 * 功能页。
 *
 * 留空 `[]` 表示「该站点任意页面都算功能页」——这**正好符合用户 Q-AB 的定稿**：
 *   「uooc 网站及其子域名也算在悬浮球显示范围内，然后能够触发实际功能的页面再自动展开」。
 *
 * ⚠️ 阶段 3 接入具体功能后，这里要改成精确的路径通配（旧版 `/home/learn/index*`、
 * 新版 `/home/learn/new/*`、测验页等），否则任意页面都会 `autoExpand=true`。
 */
const PAGES: readonly string[] = [];

export const uoocAdapter: SiteAdapter = {
  id: 'uooc',
  name: 'UOOC 优课联盟',
  hosts: HOSTS,
  pages: PAGES,
  tabs: [],
  init(ctx) {
    log.info(`UOOC 适配器已启用：isFeaturePage=${String(ctx.isFeaturePage)}（功能待阶段 3 接入）`);
  },
};
