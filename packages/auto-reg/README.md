# @flycursor/auto-reg

Clean-room（净室自研）的 Cursor 批量注册编排器。它把「身份生成 → 邮箱收码 → 执行引擎 → 账号落盘」串成一条可插拔的流水线，默认输出到本地 JSON 文件。

本包**只做注册与账号落盘**。它**不改机器码**、不打补丁伪装 Pro、不跑任何远程 root 脚本（详见 [不做机器码](#不做机器码)）。

> 设计与取舍见仓库根目录的 `docs/AUTO_REG_MERGE_PLAN.md` 与 `research/SOURCE_MATRIX.md`。

## 目录

- [运行环境](#运行环境)
- [快速开始（dry-run）](#快速开始dry-run)
- [配置](#配置)
  - [域名](#域名)
  - [邮箱：IMAP](#邮箱imap)
  - [邮箱：tempmail.plus](#邮箱tempmailplus)
  - [邮箱：manual（手动 / 测试）](#邮箱manual手动--测试)
  - [环境变量覆盖](#环境变量覆盖)
- [命令行](#命令行)
- [输出与安全](#输出与安全)
- [编程式 API](#编程式-api)
- [风险（务必先读）](#风险务必先读)
- [不做机器码](#不做机器码)

## 运行环境

- Node.js **>= 22**（用到内置的 TypeScript 类型擦除 `--experimental-strip-types`，直接跑 `.ts`，无需编译步骤）。
- 真实注册（非 dry-run）时才需要浏览器执行引擎的相关依赖与可访问的邮箱。dry-run 完全离线。

## 快速开始（dry-run）

dry-run 会走完整条流水线的**形状**，但**不启动浏览器、不联网、不访问真实邮箱**：使用内置引擎产出一个合成的 session token 和一个固定验证码，方便先把编排、落盘、报表跑通。

```bash
# 在 packages/auto-reg 目录下
npm run register -- --config examples/config.example.json --dry-run --count 2
```

或直接调 CLI：

```bash
node --experimental-strip-types src/cli.ts register --config examples/config.example.json --dry-run --count 2
```

不带 `--config` 时，会依次在「包根目录」和「当前工作目录」下找 `examples/config.example.json`：

```bash
node --experimental-strip-types src/cli.ts register --dry-run
```

dry-run 成功后，账号会写入配置里的 `output.accountsPath`（示例配置为当前目录下的 `accounts.json`）。控制台只会打印每个账号的 **email 和 ok/stage**，不会打印密码或 token。

## 配置

配置是一个 JSON 文件；加载时会**在内置默认值之上做深合并**，再套用 `AUTO_REG_*` 环境变量，最后做校验。完整示例见 [`examples/config.example.json`](examples/config.example.json)。字段结构定义见 [`src/types.ts`](src/types.ts)。

关键字段：

| 字段 | 含义 |
|---|---|
| `count` | 注册数量（整数，`>= 1`） |
| `dryRun` | `true` 走离线 dry-run 引擎；也可用 `--dry-run` 覆盖 |
| `headed` | 浏览器是否有头（可见），也可用 `--headed` 覆盖 |
| `timeoutMs` | 单步超时（毫秒，`> 0`） |
| `signupUrl` | 注册页地址 |
| `email` | 邮箱 / 收码配置，见下 |
| `identity.emailPrefix` | 邮箱本地部分前缀，例如 `dev.` |
| `identity.localPartLength` | 随机本地部分长度（`>= 4`） |
| `identity.passwordLength` | 生成密码长度（`>= 8`） |
| `output.accountsPath` | 账号落盘的 JSON 文件路径（相对当前工作目录解析） |
| `selectors` | 注册表单的 CSS 选择器（页面变动时需自行调整） |

### 域名

`email.domain` 是生成邮箱地址所用的域名。**目前开源方案能稳定收码的现实前提，是你自己拥有一个配好 catch-all 的域名**（临时邮箱域名经常被拦截）。

支持用 `/` 分隔配置一个「域名池」，每次注册会随机挑一个，便于分散：

```json
{ "email": { "domain": "mail.example.com/mail.example.org" } }
```

也可用环境变量 `AUTO_REG_DOMAIN` 覆盖。

### 邮箱：IMAP

自有域名 + IMAP 收件箱（catch-all）是最推荐的组合。把 `email.provider` 设为 `"imap"`，并填 `email.imap`：

```json
{
  "email": {
    "provider": "imap",
    "domain": "mail.example.com",
    "codeRegex": "\\b(\\d{6})\\b",
    "pollMs": 3000,
    "pollTimeoutMs": 120000,
    "imap": {
      "host": "imap.example.com",
      "port": 993,
      "secure": true,
      "user": "catchall@example.com",
      "password": "",
      "mailbox": "INBOX"
    }
  }
}
```

- **不要把 IMAP 密码写进配置文件**。留空，改用环境变量 `AUTO_REG_IMAP_PASSWORD`（或 `IMAP_PASSWORD`）注入；用户名也可用 `AUTO_REG_IMAP_USER` 覆盖。
- `codeRegex` 用于从邮件里抽取验证码；默认识别 6 位数字。
- `pollMs` 轮询间隔、`pollTimeoutMs` 总超时（毫秒）。超时会抛 `MAILBOX_TIMEOUT`。

### 邮箱：tempmail.plus

把 `email.provider` 设为 `"tempmail_plus"`，需要 `email.receivingEmail` 和 `email.receivingPin`：

```json
{
  "email": {
    "provider": "tempmail_plus",
    "domain": "your-owned-domain.com",
    "receivingEmail": "yourbox@mailto.plus",
    "receivingPin": "",
    "codeRegex": "\\b(\\d{6})\\b",
    "pollMs": 3000,
    "pollTimeoutMs": 120000
  }
}
```

`receivingPin` 建议用环境变量 `AUTO_REG_TEMPMAIL_PIN` 注入，不要写进文件。

> 提示：临时邮箱域名很容易被注册端拦截，成功率通常低于自有域名 + IMAP。

### 邮箱：manual（手动 / 测试）

把 `email.provider` 设为 `"manual"`，验证码从环境变量 `AUTO_REG_MANUAL_CODE` 读取。适合调试收码后续流程，不适合批量。

### 环境变量覆盖

以下变量会在合并配置文件之后生效，用于避免把密钥写进文件：

| 变量 | 覆盖的字段 |
|---|---|
| `AUTO_REG_DOMAIN` | `email.domain` |
| `AUTO_REG_IMAP_USER` | `email.imap.user` |
| `AUTO_REG_IMAP_PASSWORD` / `IMAP_PASSWORD` | `email.imap.password` |
| `AUTO_REG_TEMPMAIL_PIN` | `email.receivingPin` |
| `AUTO_REG_MANUAL_CODE` | manual provider 的验证码 |

## 命令行

```
auto-reg register [options]

选项：
  --config <path>   配置文件路径。缺省时用 examples/config.example.json（包根目录或当前目录）。
  --count <n>       本次注册数量（覆盖配置）。
  --dry-run         离线演练：不启动真实浏览器、不改动任何状态。
  --headed          浏览器有头（可见）运行，而非无头。
  -h, --help        显示帮助。
```

退出码：

- **全部注册失败** → `process.exitCode = 1`。
- 未知命令 / 未知选项 / 找不到配置文件 / 配置加载失败 → `1`。
- 至少一个成功、或只是查看 `--help` → `0`。

## 输出与安全

- 账号写入 `output.accountsPath` 指向的 **JSON 数组**文件，采用 **append**：读出现有数组 → 追加 → 写临时文件 → `rename` 覆盖，保证是**原子写**，中途崩溃不会留下半截文件。
- 该文件是本地账号库，会包含 **密码与 session token**（明文）。文件以 `0600` 权限创建；请自行妥善保管，并加入 `.gitignore`，**切勿提交或上传**。
- CLI **只在控制台打印 email 与 ok/stage**；密码、验证码、token 只落盘、绝不打印。进度行只显示阶段名（`stage`），不回显引擎的自由文本消息，以免意外泄露。
- **绝不要把 session token 发给任何第三方服务。**

## 编程式 API

```ts
import { runRegister, createJsonSink, loadConfig } from "@flycursor/auto-reg";

const config = await loadConfig("examples/config.example.json");
const results = await runRegister(config, (e) => {
    // e.stage / e.message / e.at —— 不要把 message 直接打到日志里（可能含码/token）
    console.log(e.stage);
});

const ok = results.filter((r) => r.ok).length;
console.log(`${ok}/${results.length} succeeded`);
```

`runRegister(config, onEvent?, deps?)` 会循环 `count` 次；每次：生成身份 → 把邮箱的 `waitForCode` 注入执行引擎 → 成功后 `sink.append`。**单次失败会记为 `failed` 结果，但不阻断后续**，最终返回每次尝试对应的 `RegisterResult[]`。

第三个参数 `deps` 用于注入 `createIdentity` / `createMailbox` / `createEngine` / `createSink`，测试里据此完全离线打桩（见 `test/pipeline.test.ts`）。

## 风险（务必先读）

- **违反服务条款**：批量注册、绕过试用通常违反 Cursor 的服务条款，账号可能被封。请仅用于你自己拥有的域名与账号，风险自负。
- **选择器易失效**：注册页的 DOM / WorkOS next-action / Turnstile 会频繁变化，`selectors` 与 `codeRegex` 必须可配置并随时调整。
- **人机验证是断点**：真实的 Turnstile 挑战、以及手机 / radar 验证是全自动流程的两处断点；本包把它们当作硬失败 + 需人工介入，不做「假点击」之类的对抗。
- **临时邮箱易被拦**：自有 catch-all 域名 + IMAP 是目前更现实的前提。
- **凭据即风险**：落盘文件含明文凭据，泄露等于账号泄露。

## 不做机器码

本包**明确不做**以下事情（这是刻意的边界，不是 TODO）：

- 不重置 / 伪造机器码、设备指纹或 `machineId`。
- 不修改 Cursor 的 `main.js` / workbench，不做字符串补丁，不伪装 Pro。
- 不执行 `curl | bash`、`irm | iex` 之类的远程脚本，不跑闭源二进制。

它只负责「注册账号并把结果写到本地 JSON」。机器码 / 试用重置属于另一类工具，不在本包范围内。
