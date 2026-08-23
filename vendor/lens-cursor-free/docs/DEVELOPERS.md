# 开发者说明

面向维护者与贡献者。普通用户请使用 [Releases](https://github.com/lens68/lens-cursor-free/releases) 安装包，阅读 [README](../README.md)。

## 本仓库包含什么

- `ui/` — 用户界面与样式
- `electron/preload.cjs` — 渲染进程可调用的 IPC 面（`window.cursorFree`）
- `electron/main.ts` — 窗口、托盘与生命周期（薄壳）
- `core-api/` — 与核心模块的**类型契约**（无商业逻辑实现）
- `shared/` — 产品文案、构建标志、Hub URL 解析等开放配置

## 本仓库不包含什么

以下能力在私有仓库 **`lens-cursor-free-core`** 中维护，不在此公开：

- 许可证校验与租约策略
- 换号 / 占号流水线
- Cursor 注入与设备指纹
- Hub 协议客户端实现

## 为何公开本仓库

公开 UI 与 IPC 边界，便于审查「客户端对用户展示了什么、调用了哪些通道」。商业核心保持私有，由维护者在 CI 中联合构建后发布二进制。

## 构建能力说明

| 目标 | 是否可在本公开仓完成 | 配置如何注入 |
|------|----------------------|--------------|
| 信任层编译（`npm run build`） | **可以**（默认 `@relay/core` stub） | 无 `build-config.json` 时自动从 `build-config.local.example.json` 生成；`prebuild` 写入 `shared/build-config.ts` |
| 完整安装包 / 换号能力 | **不可以单独完成** | 需私有仓 + `npm run link:core`；本机维护 **`build-config.json`**（真实 Hub/购买链接，已 gitignore），再 `npm run dist:prod` |
| GitHub Release（打 `v*` tag） | 维护者 CI | `RELAY_CORE_DEPLOY_KEY` + `BUILD_CONFIG_JSON`（真实 JSON，非 example）；并行构建 **Windows + macOS（arm64 / x64）** |

仓库内**只提交模板**：`build-config.*.example.json` 与占位符版 `shared/build-config.ts`；真实 Hub / 购买链接等写在 **gitignore 的** `build-config.json` 或 CI Secret 中，构建时自动生成，勿手改 `shared/build-config.ts`。

## 本地开发（仅信任层 + stub）

```bash
npm ci
npm run build    # 自动 ensure 本地 example → build-config.json → gen-build-config
npm test
```

## 完整产品构建（仅维护者）

需已授权访问私有核心仓库；发版与 Secrets 见私有仓 `docs/RELEASE-SETUP.md`。

```bash
git clone git@github.com:lens68/lens-cursor-free-core.git   # 与本作库同级目录
# 在本仓库根目录创建 build-config.json（勿提交），填入真实 defaultHubUrl / purchaseUrl 等
npm run link:core
npm run icon          # 生成 icon.ico + icon.png（Win / Mac）
npm run dist:prod     # 当前系统：Windows → NSIS；macOS → DMG
# 或显式：npm run dist:win / npm run dist:mac
npm start             # 开发运行（需 link:core + build）
```

`npm run dist:prod` 会拒绝仍含 `hub.your-domain.com`、`shop.example.com` 等**模板占位**的配置；CI 通过 Secret `BUILD_CONFIG_JSON` 写入同等结构的 JSON。

## macOS 功能说明

| 能力 | macOS 支持情况 |
|------|----------------|
| Hub / 许可证 / 占号 UI | 支持（与 Windows 相同） |
| Cursor 路径 / `state.vscdb` / `machineId` | 支持（`~/Library/Application Support/Cursor/...`） |
| 关窗口保留占号 | 支持（关窗口不退出，需 **Dock 再点图标** 或 **Cmd+Q** 退出） |
| 换号 / 注入 | 支持，但依赖本机 **Node.js 22+**（`PATH` 或 `CURSOR_FREE_NODE`） |
| Cursor 安装位置 | 默认 `/Applications/Cursor.app` |
| 首次打开未签名包 | 可能需右键「打开」或 `xattr -cr`（CI 未做 Apple 签名） |

macOS 版与 Windows 共用私有核心；发版前请在实机 Mac 上验证一次完整换号流程。

## 安全反馈

请通过 GitHub Security Advisories 或仓库 Issue 联系维护者（勿在公开 Issue 中粘贴许可证密钥或 Hub 管理凭据）。
