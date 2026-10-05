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
 * esbuild 的 `--loader:.css=text` 让 CSS 直接以字符串形式 import。
 *
 * 样式**不是**在这里压的：`--minify` 只压 JS 侧，字符串内容是原样照搬的。
 * 压缩发生在打包之前 —— `build.mjs` 的 `prepareCssOverlay()` 会把 `src/` 复制一份，
 * 在副本里把每个 `.css` 文件和每段 `*_CSS` 模板串用 esbuild 的 CSS 解析器压掉，
 * 再从副本打包。所以运行时拿到的 `baseCss` 已经是压过的。
 */
declare module '*.css' {
  const content: string;
  export default content;
}
