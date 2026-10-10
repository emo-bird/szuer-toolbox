# szuer-toolbox

深大人工具箱 —— 面向深圳大学校园站点的一体化油猴脚本（框架 + 站点适配层 + 统一悬浮窗）。

## 构建与自检

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | `tsc --noEmit`（覆盖 `src/` 与 `tests/`） |
| `npm test` | 纯函数冒烟（档 1），秒级 |
| `npm run build` | 生成 `dist/szuer-toolbox.user.js` |
| `npm run verify` | 产物自检（头部字段 / 无 ESM 残留 / 适配器已注册 …） |
| `npm run check` | 上面四步串起来 |

## 文档

先看 **[`docs/README.md`](docs/README.md)** —— 它标明了哪些文档描述**当前代码**、哪些只是**历史快照**。
