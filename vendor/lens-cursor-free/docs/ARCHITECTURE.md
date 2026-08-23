# 架构说明

## 双仓库

| 仓库 | 角色 |
|------|------|
| **lens-cursor-free**（本仓库） | 公开信任层 |
| **lens-cursor-free-core**（私有） | `@relay/core` 商业实现 |

构建完整安装包时，维护者在 CI 或本机将二者通过 `core.lock.json` 钉版本后联合 `npm run build:full`。

## 源码治理 vs 客户端安全

- **源码治理**：私有代码不进入本仓库 git 历史；Fork PR 不使用访问私有仓的 Secrets。
- **客户端安全**：发布包内仍含 JavaScript，**不能**假设 asar 防逆向。商业裁决应逐步上收 Hub；客户端视为**敌对环境**。

## core-api 纪律

公开类型只描述**能力**，不镜像 Hub 内部状态机。避免让 `core-api` 膨胀为私有实现的复印件。

## IPC 边界

长期 ABI 是 `preload.cjs` 暴露的 `window.cursorFree` 与既有 `hub:*` channel。新增 channel 须经过信任层审查。

## 构建

- `npm run build` — stub 或已 link 的 `@relay/core`；`prebuild` 从 `build-config.json`（缺省则 `*.example.json`）生成 `shared/build-config.ts`
- `npm run link:core` — 链接已克隆的私有核心包（见维护者文档，路径因环境而异）
- `npm run build:full` — link + build + 发版前完整构建
- 生产发版：`BUILD_CONFIG_JSON`（Actions Secret）或 `node scripts/prepare-build-config.mjs prod`（维护者本机，保留非占位字段）
