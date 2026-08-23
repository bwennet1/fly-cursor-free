# 新项目计划：统一自动 REG（Auto Register）

目标：在学习 `vendor/` 内各项目之后，**不要把十几份仓库糊成一个巨石**，而是做一个新的自动注册编排器：可插拔邮箱 / 执行器 / 结果出口，默认走 Cursor 自动 REG。

本文件是计划，不是把上游代码合并进 FlyCursor 主进程。FlyCursor 公开仓仍缺 `src/main` / `src/preload` / `src/script`。

## 1. 为什么不能「直接 merge 成一个 repo」

| 障碍 | 说明 |
|---|---|
| 许可证互相打架 | 多份 **CC BY-NC-ND 4.0**（禁止演绎、禁止商用）；`any-auto-register` 是 **AGPL-3.0**（网络 copyleft）；`cursor-register` **无 LICENSE**；`ycursor` / `xc-cursor` **无源码** |
| 语言分裂 | Python（主流）、Rust（API 代理）、Electron/TS（壳）、闭源二进制 |
| 同一套祖传流程 | `cursor-auto-free` → wf / iCloud / 多个 GUI 套壳，重复度极高 |
| 供应链雷 | 多处 `curl \| sudo bash` / `irm \| iex` 拉远程脚本改机器码 |
| 产品模型不同 | 本地屯号 vs 卖激活码 vs 云端领号（Relay）vs 只做 API 消费 |

**结论：新项目必须 clean-room 自研编排层；vendor 只作对照，不把 ND / 无许可源码改完再分发。**

## 2. 推荐产品形态

名称暂定 **`auto-reg`**（可独立仓库，或本仓库 `packages/auto-reg`）。

- **第一优先：自动 REG**（批量注册 Cursor 账号，产出 email / password / session token）
- **第二优先：账号 sink**（SQLite / JSON / 可选推到已有 FlyCursor 账号库）
- **明确不做（v1）**：改 Cursor `main.js` / workbench 伪装 Pro、远程 root 脚本、闭源二进制、卖激活码

技术选型建议：

- **编排与 CLI：TypeScript**（和 FlyCursor 渲染层同语言，后续好接 Electron IPC）
- **浏览器执行器：Playwright**（比散落的 DrissionPage 选择器更好维护）
- **协议执行器：可选**（对照 any-auto-register 的 WorkOS 步骤，**自行重写**，不拷 AGPL 源码）
- **若需要最快落地 GUI**：以 **MIT 的 ZZXcursor** 为参考重写界面，而不是复制 ND 项目

许可证建议：新项目用 **MIT 或 Apache-2.0**。因此：

- 可以吸收 **MIT**：`zzxcursor`（须修硬编码密钥 / `exec`）、`lens-cursor-free` 的公开壳思路
- **不能**把 AGPL 源码拷进 MIT 产品；只能读协议行为后重写
- **不能**改完再分发 ND 源码

## 3. 目标架构（六层，来自 Cursor-Register / any-auto-register 的边界）

```
┌─────────────┐
│  配置中心    │  yaml / env：数量、并发、邮箱、代理、超时
└──────┬──────┘
       ▼
┌─────────────┐
│  编排 / 队列 │  串行默认；并发按独立 browser profile
└──────┬──────┘
       ▼
┌─────────────┐     ┌──────────────┐
│ 身份 Provider│────│ 邮箱 Provider │  IMAP / tempmail / 自有域名
└─────────────┘     └──────────────┘
       ▼
┌─────────────┐
│ 执行引擎     │  protocol 适配器  或  browser 适配器
└──────┬──────┘
       ▼
┌─────────────┐
│ Token 获取   │  深链 PKCE + poll  或  会话 Cookie（事实接口，自研）
└──────┬──────┘
       ▼
┌─────────────┐
│ Sink        │  sqlite / json / csv /（可选）FlyCursor accounts API
└─────────────┘
```

人机验证做成**可插拔、可失败降级**（人工 / 超时），不要把「假点击扩展」写成唯一路径。

手机 / radar 验证：v1 标记为 **硬失败 + 人工**；接码平台放到 v2，且必须是正式 SDK，禁止 `exec(用户代码)`。

## 4. 建议从各项目「学什么、不搬什么」

**学（写成自己的模块）：**

- 流水线阶段划分：`cursor-auto-free` / `wf-cursor-auto-free`
- 邮箱多通道：tempmail + IMAP + POP3（思路，自研）
- 配置 + hydra 式 profile：`cursor-register`
- 插件平台 / 三条 Flow：`any-auto-register`（重写）
- 深链取 token：多项目重复出现的公开行为，自研实现
- 本机认证键名与三平台路径：公开事实，做成常量层
- 换号前先关 Cursor、避免 SQLITE_BUSY：`lens-cursor-free` 文档与公开测试
- MIT GUI 完成度：`zzxcursor` 的分步注册与账号库（先换掉硬编码 Fernet 密钥）

**不搬：**

- 任何 `curl|bash` / `irm|iex` 机器码脚本
- workbench.js 字符串补丁、伪造 Pro
- YCursor / XC-Cursor 闭源包
- cursor-pro-trial 推广页
- cursor-api 除非明确要做「token 消费代理」（那是另一个产品）
- ND 许可源码的修改再分发

## 5. 里程碑

**M0 — 对照仓（本分支已做）**  
vendor 浅克隆 + 本计划 + `research/SOURCE_MATRIX.md`。

**M1 — 新仓库脚手架（已落地 `packages/auto-reg`）**  
CLI、配置校验、身份生成、IMAP / tempmail.plus / manual 收码、dry-run 引擎、Playwright 浏览器引擎骨架（人机验证仅人工/超时）。

**M2 — 闭环自动 REG（加密已落地）**  
dry-run 可闭环写入账号库 sink（原子写、0600）。真实浏览器路径：收码 → 填 OTP → 解析会话 cookie。**默认收码通道为 liao.bot 邮件 API + `bwen.net` 域名**（`get-email` 分配地址、`first-email` 轮询查信）。**账号库加密已落地且默认开启**（`output.encrypt` 默认 `true`）：账号库以 AES-256-GCM 落盘，密钥由环境变量 `AUTO_REG_VAULT_PASSWORD` 口令经 scrypt 派生（文件权限仍为 0600）。正式注册缺口令仍报错；**dry-run 缺口令改为本次明文落盘 + 警告**。失败尝试默认也落盘（`persistFailures`，不含密码 / token）。真实注册默认 headed。OS keychain 尚未做。

**M3 — 接 FlyCursor**  
只通过稳定 IPC / 导入 JSON，不把 Python 塞进被 gitignore 的 `src/main`。渲染层已有 Auto GUI 页签，可再加「导入 auto-reg 结果」。

**M4 — 可选**  
协议模式、接码、代理池。仅在 M2 稳定后做。

## 6. 风险（必须写进新项目 README）

- 批量注册与试用绕过通常违反 Cursor 服务条款，账号会被封。
- DOM / WorkOS next-action / Turnstile 会频繁失效，选择器必须可配置。
- 临时邮箱域名容易被拦；自有 catch-all 域名是目前开源方案的真实前提。
- 把 session token 发到第三方（历史项目里出现过）视为不可接受。

## 7. 立刻不要做的事

- 不要把 13 个 vendor 编译进同一个 Electron 安装包。
- 不要在本仓库「改一改 cursor-auto-free 再发布」。
- 不要下载运行 XC-Cursor / YCursor 外链二进制来「补齐源码」。

## 8. Runtime notes（运行时要点）

- **Node >= 22**：`packages/auto-reg` 直接跑 TS（strip-types），无构建步骤。
- **dry-run 时 vault 口令可选**：未设 `AUTO_REG_VAULT_PASSWORD` 则降级明文并告警；真实跑仍强制。
- **真实注册默认 headed**：未显式指定 `--headed/--headless` 时自动提升为 headed。
- **`output.persistFailures` 默认开启**：失败记录同样写入账号库，便于复盘。
- **`turnstilePatch` 不是求解器**：只修 CDP screenX/screenY 指纹，默认 `addInitScript`，**不要** `--load-extension`（Cloudflare 会报 Incompatible browser extension）；人机验证仍走人工 / 超时降级。
