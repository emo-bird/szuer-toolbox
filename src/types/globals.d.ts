/**
 * 全局类型补充。
 *
 * 这里只声明 `@types/tampermonkey` **没有**覆盖到的部分。
 * GM_* 的正式类型来自 devDependency `@types/tampermonkey`（见 tsconfig.json 的 types）。
 */

/** 构建期由 esbuild --define 注入 */
declare const __SZB_VERSION__: string;
/** 构建期由 esbuild --define 注入，ISO 字符串 */
declare const __SZB_BUILD_TIME__: string;
/** 构建期由 esbuild --define 注入；单调递增的构建号，用于区分同版本号的多次构建 */
declare const __SZB_BUILD_NO__: number;
/**
 * 构建期由 esbuild --define 注入：**已压缩的** `src/common/ui/style.css` 全文。
 *
 * 不用 `import css from './x.css'`（`--loader:.css=text`）是因为那样 CSS 只是个
 * 字符串字面量，`--minify` 压不到它 —— 压缩版产物里会躺着一整份带注释的 CSS。
 * 见 build.mjs 的 `minifyCss()`。
 */
declare const __SZB_CSS__: string;
