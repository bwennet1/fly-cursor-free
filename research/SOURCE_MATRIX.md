# 自动 REG 源项目对照表

调研日期：2026-08-23。源码原样放在 `vendor/<name>/`（另见各目录 `UPSTREAM_COMMIT.txt`）。  
分析由多个 Task 子代理完成（指定模型 `claude-fable-5-thinking-xhigh`）。

| 目录 | 上游 | 形态 | 自动 REG | 技术栈 | 许可证 | 合并价值 |
|---|---|---|---|---|---|---|
| `cursor-auto-gui` | [CavinHuang/cursor-auto-gui](https://github.com/CavinHuang/cursor-auto-gui) | Python GUI，源码完整 | 有（注册 / 重置机器码 / 续期） | PySide6 | README 称 CC BY-NC-ND 4.0 | 旁路工具；**禁止演绎** |
| `cursor-auto-free` | [chengazhen/cursor-auto-free](https://github.com/chengazhen/cursor-auto-free) | Python CLI，**祖师爷**，作者已弃坑 | 端到端（邮箱 + Turnstile + 写库 + 机器码） | DrissionPage | README 称 CC BY-NC-ND 4.0 | **流程蓝本**；勿直接拷代码 |
| `wf-cursor-auto-free` | [wangffei/wf-cursor-auto-free](https://github.com/wangffei/wf-cursor-auto-free) | 上者二次开发 + PyQt5 | 更完整（深链 poll token、仅注册存 JSON） | DrissionPage + PyQt5 | README 称 CC BY-NC-ND 4.0 | token 深链可参考；含 `curl\|bash` 风险 |
| `cursor-auto-icloud` | [Ryan0204/cursor-auto-icloud](https://github.com/Ryan0204/cursor-auto-icloud) | 上者变体 | 有，但作者声明 **已失效** | DrissionPage + iCloud HME | **CC BY-NC-ND 4.0** | Hide My Email 思路；token 写入有错位 bug |
| `cursor-free-vip` | [hovanhoa/cursor-free-vip](https://github.com/hovanhoa/cursor-free-vip) | 跨平台 CLI 菜单 | 邮箱路径标过期；OAuth 为主 | DrissionPage + Selenium | **CC BY-NC-ND 4.0** | 路径解析 / 认证写库成熟；补丁易碎 |
| `cursor-register` | [JiuZX/Cursor-Register](https://github.com/JiuZX/Cursor-Register) | Python CLI + Actions | 声称批量注册 + CSV / OneAPI | Hydra + DrissionPage + temp_mails | **未发现 LICENSE** | **配置 / 邮箱 provider / sink** 分层可学 |
| `zzxcursor` | [zhangx1aoxi77/ZZXcursor](https://github.com/zhangx1aoxi77/ZZXcursor) | 完整 PyQt6 桌面端 | 端到端 + 绑卡；手机验证弱 | DrissionPage + PyQt6 | **MIT** | **最可合法吸收的完整 GUI 实现** |
| `any-auto-register` | [lxf746/any-auto-register](https://github.com/lxf746/any-auto-register) | 多平台注册框架 + 桌面 | Cursor 协议五步 + 浏览器 + 换号 | FastAPI + Playwright + Camoufox | **AGPL-3.0** | **最佳自动 REG 架构**；拷代码会传染 AGPL |
| `cursor-api` | [waterwoodwind/cursor-api](https://github.com/waterwoodwind/cursor-api) | Rust OpenAI 兼容代理 | **无注册**，只消费 token | Rust / axum / protobuf | 未发现 LICENSE 文件 | 下游消费层，不是 REG |
| `ycursor` | [YanCchen/YCursor](https://github.com/YanCchen/YCursor) | README + 截图 | UI 声称完整 | 闭源安装包 | 未发现 | **无源码**，只作产品对标 |
| `xc-cursor` | [Aeth247/XC-Cursor](https://github.com/Aeth247/XC-Cursor) | README + 截图 + Release 二进制 | UI 声称完整（邮箱 / 绑卡 / 接码） | 闭源 Electron 嫌疑 | 未发现 | **无源码**；tag 混乱，勿跑二进制 |
| `cursor-pro-trial` | [aigem/cursor-pro-trial](https://github.com/aigem/cursor-pro-trial) | 静态教程页 | **0** | HTML | 未发现 | 不合并 |
| `lens-cursor-free` | [lens68/lens-cursor-free](https://github.com/lens68/lens-cursor-free) | Electron 公开壳 | **0**（领号 / 账号池，非注册） | Electron + TS | **MIT**（核心私有） | 换号安全约束 / IPC 契约可参考 |

## topic:cursor-pro 补看清单（未克隆）

话题页里多数清单项目**没有**打 `cursor-pro` 标签。值得另开调研、尚未收入 `vendor/` 的：

1. [kingparks/cursor-vip](https://github.com/kingparks/cursor-vip)（约 4768★）
2. [liqiang-xxfy/fly-cursor-free](https://github.com/liqiang-xxfy/fly-cursor-free)（本仓库上游）
3. [whispin/Cursor_Windsurf_Reset](https://github.com/whispin/Cursor_Windsurf_Reset)
4. [risunCode/SurfManager](https://github.com/risunCode/SurfManager)
5. [arindban55/Cursor-FREE-Trial-Reset-Windows-Latest-](https://github.com/arindban55/Cursor-FREE-Trial-Reset-Windows-Latest-)

## 共同能力谱系（自动 REG 视角）

几乎所有「能跑」的开源实现都收敛到同一条流水线：

1. 生成身份（随机姓名 + 自有域名 / 临时邮箱 / iCloud 隐藏邮箱）
2. 浏览器或协议提交 `authenticator.cursor.sh` 注册
3. 过人机（扩展点击 / 打码平台 / 人工兜底）
4. 收 6 位邮箱验证码（tempmail / IMAP / POP3）
5. 取会话（Cookie 或 PKCE 深链 + `auth/poll`）
6. 写入本机 `state.vscdb` / `storage.json` 并可选重置机器码
7. 账号落盘（JSON / CSV / SQLite）或推到 OneAPI / 自建网关

**手机 / radar 验证**和 **Turnstile 真挑战**是全自动的两处断点。闭源产品（YCursor / XC-Cursor）在 UI 上声称接了接码平台，公开仓里看不到实现。

## turnstilePatch 对照（已移植进 `packages/auto-reg`）

同源技术来自 [TheFalloutOf76 CDP MouseEvent.screenX/Y patcher](https://github.com/TheFalloutOf76/CDP-bug-MouseEvent-.screenX-.screenY-patcher)，经 [JiuZX/Cursor-Register](https://github.com/JiuZX/Cursor-Register) 引入（`vendor/cursor-register` 已浅克隆，与上游一致）。**只修 CDP 指纹，不是打码。**

| 路径 | 与 Cursor-Register 关系 |
|---|---|
| `vendor/cursor-register/turnstilePatch/` | **权威对照**（JiuZX） |
| `vendor/cursor-auto-free/turnstilePatch/` 等（auto-gui / icloud / free-vip / wf） | 同 script.js 哈希；祖师爷系副本 |
| `vendor/zzxcursor/core/turnstilePatch/` | MIT；额外带自动点 checkbox 逻辑，**未**并入 auto-reg |
| `vendor/any-auto-register/services/turnstile_solver/` | AGPL 打码服务，**不可**拷进 MIT 包 |
| `packages/auto-reg/resources/turnstilePatch/` | **已落地**：与 JiuZX 同源 manifest + script；浏览器引擎默认 `--load-extension` + `addInitScript` |

配置项：`turnstilePatch`（默认 `true`）。
