


# FlyCursor · 轻松一键续杯 Cursor Pro，保持14天试用不掉。

# 【支持Claude 4、GPT 5】 【免费使用】

> 🚀 **FlyCursor** 让你 Cursor Pro 试用永不断，批量注册本地账号+共享账号池，一秒换号，无限次数高级模型。
>
> - `Claude 4` 、`Gemini 2.5pro`、`gpt 5` 等模型需要梯子才能使用。
> - Cursor 要求新账户绑定虚拟支付卡才能激活试用，建议激活后马上取消订阅，否则试用到期产生扣费
> - 支持 windows、macOS ，不限制 Cursor 版本 ，可升级。（目前最新版 Cursor v1.3.9）
> - qq交流群： [1002388537](https://qun.qq.com/universal-share/share?ac=1&authKey=ZpKpMm4QdN1I2eWzqZYinybEpN1PfyrUlmgA01ZG0mAVSUVg0fWQWngzBnl7jG79&busi_data=eyJncm91cENvZGUiOiIxMDAyMzg4NTM3IiwidG9rZW4iOiJNR0hENmlHS0xHSzdmMm0xRmZSNjJpczdJMWl5WkhrNWI0SHVQOUZhemNuSTcvN0VQNUNSZVZ4Ty9kbU1KSFBWIiwidWluIjoiMzY2Mzg1NjQyOSJ9&data=ghmRHANkTOdaEFfbxNKWtfgZ5emKN2-RQ-FKgFvWnukdfbup51jtrgQKlbPS_2O-0QHYmuRUd7her7DzYjH43A&svctype=4&tempid=h5_group_info)
> - 使用文档： [详细文档、常见问题](https://docs.qq.com/aio/DUGd6V2t5WUVoQUdG)
> - 下载地址：&nbsp;[GitHub](https://github.com/liqiang-xxfy/fly-cursor-free/releases/latest) &nbsp; [123云盘](https://www.123865.com/s/uY80Td-AtUh) &nbsp;&nbsp; [百度网盘](https://pan.baidu.com/s/1UPg4D4VO_F_47Fl1A7oc8g?pwd=9gmc)
> - 如果启动失败，尝试禁用GPU加速，启动参数添加 " --disable-gpu --no-sandbox"


#### ⚠️ Cursor取消了支付宝激活试用，无限续杯现在需要虚拟卡
#### ⚠️ Cursor 虚拟信用卡一张卡支持激活 5个试用账号


## 核心功能
- **一键换号**：免费账号池 ，秒级换号，稳定维持 Cursor Pro 14天试用
- **本地自动注册**：自动注册Cursor新账号，自动通过人机验证，需要手动绑定支付卡（绑定后请**马上取消订阅**，否则试用到期自动扣费）

---

## 截图

<img src="img/截图1.png" width="680" />
<img src="img/截图2.png" width="680" />

> - 解决：“Please upgrade to Pro to continue.”
> - 解决：“Free users can only use GPT 4.1 or Auto as premium models”
> - 解决：“Model not available. This model provider doesn’t serve your region.”

---

## 前期准备

#### 1.接收 Cursor 验证码的邮箱

- [tempmail临时邮箱](https://tempmail.plus) 或 [qq邮箱](https://wx.mail.qq.com/) 任选一个

#### 2.虚拟支付卡

#### 3.个人域名

- 需要一个域名，用于生成注册用的无限邮箱地址。
  建议自己购买域名，[阿里云低价域名3元左右/年](https://wanwang.aliyun.com/domain?spm=5176.30275541.J_ZGek9Blx07Hclc3Ddt9dg.2.6d242f3dOjUe0y&scm=20140722.S_card@@%E4%BA%A7%E5%93%81@@3417315._.ID_card@@%E4%BA%A7%E5%93%81@@3417315-RL_%E5%9F%9F%E5%90%8D-LOC_2024SPSearchCard-OR_ser-PAR1_213e367317506646568403729e0b4e-V_4-RE_new5-P0_0-P1_0)

---

## 配置教程：[自动注册续杯教程](https://docs.qq.com/aio/DUGd6V2t5WUVoQUdG?p=Zbo4uw0V0wGxKiybuT7EEX)

---

## Cursor Auto GUI 补充

本仓库的公开源码并不完整：`.gitignore` 排除了 `src/main/*`、`src/preload/*`、`src/script/*`，即 **Electron 主进程、preload 桥接层和自动注册脚本均不可见**。这意味着仅凭本仓库源码，无法看到（也无法本地运行）「一键注册登录 / 批量注册 / 重置机器码 / 换号续期」等核心功能的实现——它们只存在于官方发布的完整安装包里。

为补充这部分缺失的能力，本仓库在 `vendor/cursor-auto-gui/` 原样收录了开源项目 [cursor-auto-gui](https://github.com/CavinHuang/cursor-auto-gui)（Cursor Pro，作者 Minator 水门）。它是一个**独立的 Python（PySide6）桌面工具**，提供了完整、可阅读、可直接运行的实现，可作为 FlyCursor 的旁路工具使用：

- **重置机器码**：生成新的随机机器 ID，重置使用限制（参考 go-cursor-help 实现）
- **自动注册**：完整注册流程，自动创建新账号，自动通过人机验证（DrissionPage 驱动浏览器）
- **自动续期**：实现 Cursor 的续期操作（参考 cursor-auto-free 实现）
- **图形界面**：亮/暗主题、详细操作日志、Windows / macOS / Linux 多平台支持

### 快速运行（独立于 Electron 应用）

```bash
# 需要 Python 3.8+
pip3 install -r vendor/cursor-auto-gui/requirements.txt
python3 vendor/cursor-auto-gui/main.py
```

或使用便捷脚本 / npm scripts：

```bash
# macOS / Linux
./scripts/setup-cursor-auto-gui.sh && ./scripts/run-cursor-auto-gui.sh
# Windows
scripts\setup-cursor-auto-gui.cmd && scripts\run-cursor-auto-gui.cmd
# 等价于
npm run auto-gui:setup && npm run auto-gui
```

应用内也新增了「Auto GUI」页签（`src/renderer/src/components/CursorAutoGuiPanel.vue`），提供功能对照表与运行说明。

> ⚠️ cursor-auto-gui 采用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) 许可证（署名-非商业-禁止演绎），本仓库保持**原样拷贝、未做修改**，仅供学习交流。署名与详细说明见 [THIRD_PARTY.md](./THIRD_PARTY.md)。

---

## 自动 REG 调研（多源对照）

已在 `vendor/` 浅克隆多份相关开源/文档仓，用于学习「自动注册」而不是把它们编译进同一个安装包：

- 对照表：[research/SOURCE_MATRIX.md](./research/SOURCE_MATRIX.md)
- 新项目合并计划（推荐独立 `auto-reg`，六层编排）：[docs/AUTO_REG_MERGE_PLAN.md](./docs/AUTO_REG_MERGE_PLAN.md)
- 第三方许可总表：[THIRD_PARTY.md](./THIRD_PARTY.md)

其中 YCursor / XC-Cursor 几乎无源码；`cursor-pro-trial` 只是静态页；`lens-cursor-free` 是领号壳而不是注册器。真正可对照的自动 REG 实现主要在 `cursor-auto-free` 谱系、`zzxcursor`（MIT）和 `any-auto-register`（AGPL）。

---

## 本地自动 REG

`packages/auto-reg` 是本仓库**自研的 clean-room 实现**（MIT，TypeScript，Node 22+ 以 `--experimental-strip-types` 直接运行），不是 `vendor/` 里收录的闭源 / CC BY-NC-ND（禁止演绎）项目，未复制其任何代码。浏览器执行引擎基于 **Playwright**（已声明为本包依赖），先安装依赖并下载 Chromium：

```bash
npm --prefix packages/auto-reg install
npx --prefix packages/auto-reg playwright install chromium
```

快速验证（均不会真正注册；账号库默认加密，dry-run 也会写库，故需先设口令）：

```bash
cd packages/auto-reg && npm test
export AUTO_REG_VAULT_PASSWORD='一段强口令'
cd packages/auto-reg && node --experimental-strip-types src/cli.ts register --dry-run --config examples/config.example.json
```

收码默认走 **liao.bot 邮件 API + `bwen.net` 域名**：先 `GET https://liao.bot/email-api/get-email?domain=bwen.net` 分配一个 `@bwen.net` 地址，再 `GET https://liao.bot/email-api/first-email?femail=<allocated>` 轮询查信取验证码（也可改用自有域名 + IMAP）。

账号库**默认加密**（`output.encrypt` 默认 `true`，AES-256-GCM，口令经 scrypt 派生），口令用环境变量 `AUTO_REG_VAULT_PASSWORD` 注入、**绝不写进配置**。**register 前先 `export AUTO_REG_VAULT_PASSWORD=...`；dry-run 同样需要**（它也写账号库，缺口令会在校验阶段报错）。

正式使用：复制 `examples/config.example.json` 为本地配置 → 确认域名 / liao.bot 配置（或换成你自己的域名与收件邮箱）→ 设置 `AUTO_REG_VAULT_PASSWORD` → 去掉 `--dry-run` 并指向本地配置运行。

注意边界：遇到人机验证需人工在浏览器窗口（headed）手动完成；该 CLI 不做机器码重置；因公开仓不含 Electron 主进程，应用内「注册」页签（`src/renderer/src/components/AutoRegPanel.vue`）只提供命令说明，不能一键运行。

---

## 💰 赞赏

如果觉得这个项目对你有帮助，鼓励作者持续更新。

<div align="center">
  <table>
    <tr>
      <td>
        <img src="./img/pay2.png" alt="wechat_pay" width="200"/><br>
      </td>
      <td>
        <img src="./img/pay1.png" alt="alipay" width="200"/><br>
      </td>
      <td>
        <img src="./img/chat.jpg" alt="alipay" width="200"/><br>
      </td>
    </tr>
  </table>
</div>

---

## 授权协议

为防止滥用，代码并未完全开源

---

## 📩 免责声明

本工具仅供学习和研究使用，使用本工具所产生的任何后果由使用者自行承担。 <br>

---
