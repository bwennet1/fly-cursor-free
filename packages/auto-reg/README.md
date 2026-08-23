# @flycursor/auto-reg

Clean-room（净室自研）的 Cursor 批量注册编排器。它把「身份生成 → 邮箱收码 → 执行引擎 → 账号落盘」串成一条可插拔的流水线，默认输出到本地 JSON 文件。

本包**只做注册与账号落盘**。它**不改机器码**、不打补丁伪装 Pro、不跑任何远程 root 脚本（详见 [不做机器码](#不做机器码)）。

> 设计与取舍见仓库根目录的 `docs/AUTO_REG_MERGE_PLAN.md` 与 `research/SOURCE_MATRIX.md`。

## 目录

- [运行环境](#运行环境)
- [快速开始（dry-run）](#快速开始dry-run)
- [配置](#配置)
  - [域名](#域名)
  - [邮箱：liao.bot（默认，@bwen.net）](#邮箱liaobot默认bwennet)
  - [邮箱：IMAP](#邮箱imap)
  - [邮箱：tempmail.plus](#邮箱tempmailplus)
  - [邮箱：manual（手动 / 测试）](#邮箱manual手动--测试)
  - [环境变量覆盖](#环境变量覆盖)
- [命令行](#命令行)
- [输出与安全](#输出与安全)
  - [账号库加密](#账号库加密)
- [编程式 API](#编程式-api)
- [Cloudflare 与浏览器稳定性（issue 4 / 5）](#cloudflare-与浏览器稳定性issue-4--5)
- [风险（务必先读）](#风险务必先读)
- [不做机器码](#不做机器码)

## 运行环境

- Node.js **>= 22**（用到内置的 TypeScript 类型擦除 `--experimental-strip-types`，直接跑 `.ts`，无需编译步骤）。
- **浏览器执行引擎基于 [Playwright](https://playwright.dev/)，已作为本包依赖声明在 `package.json`**。安装依赖并下载 Chromium（浏览器二进制不随 `npm install` 下载，需单独执行一次 `playwright install chromium`）：

```bash
# 在 packages/auto-reg 目录下
npm install && npx playwright install chromium
```

在仓库根目录可以用等价的一条命令：

```bash
npm run auto-reg:install
```

- 真实注册（非 dry-run）时才需要上面的 Playwright / Chromium 与可访问的邮箱。**dry-run 完全离线，不需要安装 Chromium 也能跑通流水线形状。**
- **turnstilePatch（默认开启）**：打包了与 [JiuZX/Cursor-Register](https://github.com/JiuZX/Cursor-Register) / [TheFalloutOf76](https://github.com/TheFalloutOf76/CDP-bug-MouseEvent-.screenX-.screenY-patcher) / [Xewdy444](https://github.com/Xewdy444/CDP-bug-MouseEvent-.screenX-.screenY-patcher) 同源思路的 MV3 扩展（`resources/turnstilePatch`）。只修补 CDP 下 `screenX/screenY` 指纹（getter：`clientX + offset`），**不是验证码求解器**。
  - **有头（真实注册的默认路径）**：用 `--load-extension` 加载扩展（并去掉 Playwright 默认的 `--disable-extensions`），等同 vendor 里 DrissionPage `add_extension`。**真实注册（非 dry-run）默认自动 headed**，无需显式传 `--headed`。
  - **无头（仅 `--headless` 强制时）**：引擎启动前会自动设置 `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0`，强制使用完整 Chromium——`chrome-headless-shell` **无法加载 MV3 扩展**，正是之前真实无头运行卡死的根因（不是「补丁没拷进来」）。即便换成完整 Chromium，无头下也不会加载扩展，只用 `addInitScript` 注入 `script.js`；且 Turnstile 在无头下没有窗口可供人工点选，会在 `challenge` 阶段以 `CHALLENGE_REQUIRED` 失败。

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

> 账号库[默认加密](#账号库加密)。**dry-run 未设置 `AUTO_REG_VAULT_PASSWORD` 时不会报错**：本次自动改明文落盘并打印警告。正式注册（非 dry-run）加密开启时仍必须设置口令。

## 配置

配置是一个 JSON 文件；加载时会**在内置默认值之上做深合并**，再套用 `AUTO_REG_*` 环境变量，最后做校验。完整示例见 [`examples/config.example.json`](examples/config.example.json)。字段结构定义见 [`src/types.ts`](src/types.ts)。

关键字段：

| 字段 | 含义 |
|---|---|
| `count` | 注册数量（整数，`>= 1`） |
| `dryRun` | `true` 走离线 dry-run 引擎；也可用 `--dry-run` 覆盖 |
| `headed` | 浏览器是否有头（可见）。**真实注册默认自动 headed**；`--headed` / `--headless` 可覆盖 |
| `turnstilePatch` | **默认 `true`**：加载 `resources/turnstilePatch`（CDP screenX/Y 补丁）。不是验证码求解器 |
| `timeoutMs` | 单步超时（毫秒，`> 0`） |
| `signupUrl` | 注册页地址 |
| `email` | 邮箱 / 收码配置，见下 |
| `identity.emailPrefix` | 邮箱本地部分前缀，例如 `dev.` |
| `identity.localPartLength` | 随机本地部分长度（`>= 4`） |
| `identity.passwordLength` | 生成密码长度（`>= 8`） |
| `output.accountsPath` | 账号落盘文件路径（相对当前工作目录解析） |
| `output.encrypt` | **默认 `true`**：账号库 AES-256-GCM 加密，口令取自 `AUTO_REG_VAULT_PASSWORD`（见[账号库加密](#账号库加密)） |
| `output.persistFailures` | **默认 `true`**：失败尝试也追加进账号库（密码 / token / 验证码已抹掉） |
| `selectors` | 注册表单的 CSS 选择器（页面变动时需自行调整） |

### 域名

`email.domain` 是生成 / 分配邮箱地址所用的域名。**默认与推荐组合是 liao.bot 邮件服务 + `bwen.net` 域名**（见 [邮箱：liao.bot](#邮箱liaobot默认bwennet)）；示例配置里 `email.domain` 即为 `bwen.net`。

如果改用自有 catch-all 域名 + IMAP，请把 `email.domain` 换成你自己的域名——**开源方案能稳定收码的现实前提，是你自己拥有一个配好 catch-all 的域名**（临时邮箱域名经常被拦截）。

支持用 `/` 分隔配置一个「域名池」，每次注册会随机挑一个，便于分散：

```json
{ "email": { "domain": "mail.example.com/mail.example.org" } }
```

也可用环境变量 `AUTO_REG_DOMAIN` 覆盖。

### 邮箱：liao.bot（默认，@bwen.net）

默认的收码通道是 [liao.bot](https://liao.bot/) 邮件 API：先按域名**分配**一个 `@bwen.net` 地址，再对该地址**轮询查信**取验证码。把 `email.provider` 设为 `"liao_bot"`，`email.domain` 设为 `bwen.net`，并填 `email.liao`：

```json
{
  "email": {
    "provider": "liao_bot",
    "domain": "bwen.net",
    "liao": {
      "baseUrl": "https://liao.bot/email-api",
      "allocatePath": "/get-email",
      "firstEmailPath": "/first-email"
    },
    "codeRegex": "\\b(\\d{6})\\b",
    "pollMs": 3000,
    "pollTimeoutMs": 120000
  }
}
```

用到的两个接口（均为 `GET`）：

| 步骤 | 请求 | 说明 |
|---|---|---|
| 分配邮箱 | `GET https://liao.bot/email-api/get-email?domain=bwen.net` | 返回一个可用的 `@bwen.net` 地址，作为本次注册用的邮箱 |
| 查信取码 | `GET https://liao.bot/email-api/first-email?femail=<allocated>` | 以上一步分配到的地址为 `femail`，轮询拿最新一封邮件，再用 `codeRegex` 抽取 6 位验证码 |

- `<allocated>` 就是「分配邮箱」返回的完整地址。
- `pollMs` 轮询间隔、`pollTimeoutMs` 总超时（毫秒），超时抛 `MAILBOX_TIMEOUT`。
- `baseUrl` / `allocatePath` / `firstEmailPath` 一般无需改动；改自建代理时才需覆盖。

### 邮箱：IMAP

如果不用默认的 liao.bot，自有域名 + IMAP 收件箱（catch-all）是最稳妥的自建组合。把 `email.provider` 设为 `"imap"`，并填 `email.imap`：

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
| `AUTO_REG_VAULT_PASSWORD` | 账号库加密口令（见 [账号库加密](#账号库加密)） |

## 命令行

```
auto-reg register [options]

选项：
  --config <path>   配置文件路径。缺省时用 examples/config.example.json（包根目录或当前目录）。
  --count <n>       本次注册数量（覆盖配置）。
  --dry-run         离线演练：不启动真实浏览器、不联网，但仍会写账号文件。
                    未设 AUTO_REG_VAULT_PASSWORD 时本次明文落盘并警告。
  --headed          浏览器有头（可见）运行。
  --headless        强制无头。真实注册默认 headed，以便加载扩展并人工过人机。
  -h, --help        显示帮助。
```

退出码：

- **全部注册失败** → `process.exitCode = 1`。
- 未知命令 / 未知选项 / 找不到配置文件 / 配置加载失败 → `1`。
- 至少一个成功、或只是查看 `--help` → `0`。

## 输出与安全

- 账号写入 `output.accountsPath` 指向的文件，采用 **append**：读出现有数组 → 追加 → 写临时文件 → `rename` 覆盖，保证是**原子写**，中途崩溃不会留下半截文件。
- 该文件是本地账号库，会包含 **密码与 session token**。文件以 `0600` 权限创建；请自行妥善保管，并加入 `.gitignore`，**切勿提交或上传**。
- **失败也留痕（`output.persistFailures`，默认 `true`）**：失败的注册尝试同样会追加进账号库，便于事后排查；写入前会抹掉 password，且不含 sessionToken / 验证码，只保留 email、stage 与错误信息。设为 `false` 则只写成功记录。
- CLI **只在控制台打印 email 与 ok/stage**；密码、验证码、token 只落盘、绝不打印。进度行打印 `· <stage>  <经脱敏的消息>`（JWT / password= / 长 token / 独立 6 位码会被替换为 `[redacted]`）。
- **绝不要把 session token 发给任何第三方服务。**

### 账号库加密

账号库**默认加密落盘**：`output.encrypt` 默认为 `true`，采用 **AES-256-GCM**，密钥由口令经 **scrypt** 派生（每次写入用随机 salt / IV，落盘为一个自描述的 envelope）。口令通过环境变量 `AUTO_REG_VAULT_PASSWORD` 注入，**绝不写进配置文件**。

因此**正式注册且加密开着（默认）时，必须先设置 `AUTO_REG_VAULT_PASSWORD`**：

```bash
export AUTO_REG_VAULT_PASSWORD='一段足够强的口令'
npm run register -- --config config.local.json
```

- 正式注册且加密开启、却没有口令，会直接报 `output.encrypt is enabled but no vault password is set`。
- **dry-run 缺口令不再硬失败**：自动关闭本次加密、明文写入 sink，并打印警告。正式跑请先 `export AUTO_REG_VAULT_PASSWORD=...`。
- 加密后的账号库无法直接用文本编辑器查看，需用同一口令解密（GCM 校验：口令错或文件被篡改都会解密失败）；**口令丢失等于账号库不可恢复，请务必备份口令**。
- 如需明文落盘，把 `output.encrypt` 显式设为 `false`（不推荐）。

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

## Cloudflare 与浏览器稳定性（issue 4 / 5）

真实注册会遇到两类与浏览器 / Cloudflare 相关的现实问题（高层说明，详见仓库根目录 `docs/问题.md` 第 4、5 节）。这里明确本包的**预期产品行为**：

- **不做任何自动绕过 Cloudflare / Turnstile**：Cloudflare 拦截页与 Turnstile 挑战一律视为硬失败 + 需人工介入。本包不做「假点击」之类的对抗，**也不实现验证码求解**——这是刻意的边界，不是 TODO。
- **快速失败，不干等**：检测到浏览器崩溃、Cloudflare「Incompatible browser extension」拦截、或持续的「Just a moment」/ 429 时，直接以清晰错误结束本次尝试并记入结果，不做长时间无输出的等待。
- **优先使用系统 Chrome（issue 4）**：有头运行时 Playwright 打包自带的 Chromium 在部分环境不稳定（窗口崩溃 / 闪退）。预期优先通过 Playwright 的 `channel: "chrome"` 使用系统已安装的 Google Chrome，系统无 Chrome 时再回退到自带 Chromium 并给出提示。
- **扩展按需开启 opt-in（issue 5）**：用 `--load-extension` 加载 turnstilePatch 本身可能触发 Cloudflare「Incompatible browser extension」拦截。目标行为是把 turnstilePatch 扩展改为**默认关闭、需显式开启**，仅在你明确了解取舍时启用（当前默认值参见[配置](#配置)表，正朝 opt-in 收敛）。
- **429 表示需要等待（issue 5）**：同一来源被高频访问后，上游可能返回 HTTP 429 并卡在「Just a moment」。429 是限流信号，应退避 / 稍后再试，而不是继续高频重试。

## 风险（务必先读）

- **违反服务条款**：批量注册、绕过试用通常违反 Cursor 的服务条款，账号可能被封。请仅用于你自己拥有的域名与账号，风险自负。
- **选择器易失效**：注册页的 DOM / WorkOS next-action / Turnstile 会频繁变化，`selectors` 与 `codeRegex` 必须可配置并随时调整。
- **人机验证是断点**：真实的 Turnstile 挑战、以及手机 / radar 验证是全自动流程的两处断点；本包把它们当作硬失败 + 需人工介入，不做「假点击」之类的对抗。
- **Cloudflare / 浏览器现实问题**：有头自带 Chromium 可能崩溃、加载扩展可能触发「Incompatible browser extension」、高频后可能 429 卡在「Just a moment」。预期行为是快速失败、优先系统 Chrome、扩展按需开启、429 退避等待，详见 [Cloudflare 与浏览器稳定性（issue 4 / 5）](#cloudflare-与浏览器稳定性issue-4--5)。
- **临时邮箱易被拦**：自有 catch-all 域名 + IMAP 是目前更现实的前提。
- **凭据即风险**：落盘文件含密码与 session token，泄露等于账号泄露；建议开启[账号库加密](#账号库加密)（`output.encrypt` + `AUTO_REG_VAULT_PASSWORD`），并妥善保管口令。

## 不做机器码

本包**明确不做**以下事情（这是刻意的边界，不是 TODO）：

- 不重置 / 伪造机器码、设备指纹或 `machineId`。
- 不修改 Cursor 的 `main.js` / workbench，不做字符串补丁，不伪装 Pro。
- 不执行 `curl | bash`、`irm | iex` 之类的远程脚本，不跑闭源二进制。

它只负责「注册账号并把结果写到本地 JSON」。机器码 / 试用重置属于另一类工具，不在本包范围内。
