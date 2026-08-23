# 贡献指南

完整构建、发版与 macOS 说明见 [docs/DEVELOPERS.md](docs/DEVELOPERS.md)。

## 范围

本仓库仅接受**信任层**相关改动：

- `ui/` 界面与文案
- `core-api/` 对外类型（须保持克制，见 ARCHITECTURE）
- `electron/preload.cjs` 的 IPC 名称与参数形状（**不**新增暴露内部 Hub 状态的 channel）
- 文档与开源 CI 修复

请勿在此提交 `hub-client`、inject、完整换号状态机等实现。

## 开发环境

- Node.js 22+
- Windows（主要目标平台）

```bash
npm ci
npm run build
npm test
```

Fork 的 PR 仅跑 stub 构建，不会访问私有核心仓库。

维护者发版、私有仓推送与 SSH 配置见**私有仓库**文档，请勿在公开 Issue/PR 中粘贴密钥路径或本机目录。

## Pull Request

1. 说明改动属于 UI / 文档 / 类型契约中的哪一类
2. 确保 `npm test` 通过
3. 不要提交 `build-config.json`（含生产 URL）
