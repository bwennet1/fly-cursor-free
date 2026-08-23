# Relay desktop resources

- `icon-source.svg` — 256×256 主图源（圆角渐变底 + 字形 R），编辑后执行 `npm run icon`。
- `icon.ico` / `icon.png` — 已纳入仓库供 CI 发版；源图变更后执行 `npm run icon` 重新生成并提交。
- `icon-source.svg` — 编辑后：`npm run icon`（需 devDependencies：`sharp`、`to-ico`）。
- 品牌色：`#0969da` / `#0550ae`（与 [`ui/styles/tokens.css`](../ui/styles/tokens.css) 一致）。
