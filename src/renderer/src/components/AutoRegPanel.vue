<script setup>
    import { ref } from "vue";
    import { ElMessage } from "element-plus";
    import { Link, CopyDocument } from "@element-plus/icons-vue";

    const PACKAGE_DOC_URL = "https://github.com/bwennet1/fly-cursor-free/tree/main/packages/auto-reg";
    const MERGE_PLAN_URL = "https://github.com/bwennet1/fly-cursor-free/blob/main/docs/AUTO_REG_MERGE_PLAN.md";

    const installCommand =
        "npm --prefix packages/auto-reg install && npx --prefix packages/auto-reg playwright install chromium";
    const testCommand = "cd packages/auto-reg && npm test";
    const dryRunCommand =
        "cd packages/auto-reg && node --experimental-strip-types src/cli.ts register --dry-run --config examples/config.example.json";
    const runCommand =
        "cd packages/auto-reg && AUTO_REG_VAULT_PASSWORD='一段强口令' node --experimental-strip-types src/cli.ts register --config config.local.json";

    const allocateEmailApi = "GET https://liao.bot/email-api/get-email?domain=bwen.net";
    const firstEmailApi = "GET https://liao.bot/email-api/first-email?femail=<allocated>";

    const copiedKey = ref("");

    const openLink = (url) => {
        // 完整 Electron 包中由 preload 注入 window.api；公开仓库仅有渲染层源码，
        // 纯浏览器/开发环境下回退到 window.open，不调用不存在的 API
        if (window.api?.openExternalLink) {
            window.api.openExternalLink(url);
        } else {
            window.open(url, "_blank");
        }
    };

    const copyCommand = async (command, key) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(command);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = command;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            copiedKey.value = key;
            ElMessage.success("命令已复制到剪贴板");
            setTimeout(() => {
                if (copiedKey.value === key) copiedKey.value = "";
            }, 2000);
        } catch (error) {
            console.error("复制失败", error);
            ElMessage.error("复制失败，请手动复制");
        }
    };
</script>

<template>
    <div class="body-card-item autoreg-panel">
        <el-scrollbar>
            <div class="card-container">
                <el-card>
                    <div class="card-header">
                        <span>本地自动 REG（clean-room）</span>
                    </div>
                    <p class="intro-text">
                        <code>packages/auto-reg</code> 是<b>本仓库自研的 clean-room 实现</b>（MIT
                        许可，TypeScript，Node 22+ 直接以
                        <code>--experimental-strip-types</code> 运行）：注册编排器 + 邮箱取码 +
                        <b>Playwright</b> 浏览器驱动（已声明为本包依赖）+ 账号落盘（默认 AES-256-GCM 加密）。它<b>不是</b>
                        <code>vendor/</code> 目录里收录的闭源或 CC BY-NC-ND（禁止演绎）项目，未复制其任何代码，仅参考公开流程做了独立实现。
                    </p>
                    <p class="link-row">
                        <el-button text type="primary" :icon="Link" @click="openLink(PACKAGE_DOC_URL)">
                            源码与文档：packages/auto-reg
                        </el-button>
                        <el-button text type="primary" :icon="Link" @click="openLink(MERGE_PLAN_URL)">
                            设计说明：docs/AUTO_REG_MERGE_PLAN.md
                        </el-button>
                    </p>
                    <p class="license-tip">
                        ⚠️ 本应用公开仓库不含 Electron 主进程（<code>src/main/*</code> 已被 gitignore
                        排除），渲染层无法一键 spawn 该
                        CLI，因此本页签只提供命令，请在仓库根目录用终端手动运行。
                    </p>
                </el-card>
            </div>

            <div class="card-container">
                <el-card>
                    <div class="card-header">
                        <span>快速验证（无副作用）</span>
                    </div>
                    <p class="intro-text">
                        以下两条命令均不会真正注册账号：单元测试离线运行；<code>--dry-run</code>
                        只校验配置、生成身份并走通流水线形状，不打开浏览器、不联网。账号库<b>默认加密</b>，但对
                        dry-run 来说 <code>AUTO_REG_VAULT_PASSWORD</code> 是<b>可选</b>的：缺口令时该次演练会自动改为明文落盘并给出警告，
                        不会报错（下面命令带上示例口令可保持加密；正式注册前必须设置口令）。
                    </p>

                    <div class="command-row">
                        <span class="command-step">1. 运行单元测试</span>
                        <code class="command-code">{{ testCommand }}</code>
                        <el-button
                            size="small"
                            :icon="CopyDocument"
                            :type="copiedKey === 'test' ? 'success' : 'default'"
                            @click="copyCommand(testCommand, 'test')"
                        >
                            {{ copiedKey === "test" ? "已复制" : "复制" }}
                        </el-button>
                    </div>

                    <div class="command-row">
                        <span class="command-step">2. 演练（dry-run）</span>
                        <code class="command-code">{{ dryRunCommand }}</code>
                        <el-button
                            size="small"
                            :icon="CopyDocument"
                            :type="copiedKey === 'dryrun' ? 'success' : 'default'"
                            @click="copyCommand(dryRunCommand, 'dryrun')"
                        >
                            {{ copiedKey === "dryrun" ? "已复制" : "复制" }}
                        </el-button>
                    </div>
                </el-card>
            </div>

            <div class="card-container">
                <el-card>
                    <div class="card-header">
                        <span>正式使用步骤</span>
                    </div>
                    <p class="intro-text">
                        1️⃣ <b>安装依赖并下载 Chromium</b>（浏览器引擎基于 Playwright，仅正式注册需要，dry-run
                        无需）：
                    </p>

                    <div class="command-row">
                        <span class="command-step">1. 安装依赖</span>
                        <code class="command-code">{{ installCommand }}</code>
                        <el-button
                            size="small"
                            :icon="CopyDocument"
                            :type="copiedKey === 'install' ? 'success' : 'default'"
                            @click="copyCommand(installCommand, 'install')"
                        >
                            {{ copiedKey === "install" ? "已复制" : "复制" }}
                        </el-button>
                    </div>

                    <p class="intro-text">
                        2️⃣ 复制示例配置：把
                        <code>packages/auto-reg/examples/config.example.json</code> 复制一份（如
                        <code>config.local.json</code>）；<br />
                        3️⃣ 确认收码配置：<b>默认走 liao.bot 邮件 API + <code>bwen.net</code> 域名</b>（也可换成自有域名 +
                        IMAP）。liao.bot 用到两个 <code>GET</code> 接口——先分配一个
                        <code>@bwen.net</code> 地址，再对该地址轮询查信取验证码：
                    </p>

                    <div class="command-row">
                        <span class="command-step">分配邮箱</span>
                        <code class="command-code">{{ allocateEmailApi }}</code>
                    </div>
                    <div class="command-row">
                        <span class="command-step">查信取码</span>
                        <code class="command-code">{{ firstEmailApi }}</code>
                    </div>

                    <p class="intro-text">
                        4️⃣ <b>设置账号库加密口令</b>：账号库<b>默认加密</b>（<code>output.encrypt</code> 默认
                        <code>true</code>，AES-256-GCM，口令经 scrypt 派生），口令通过环境变量
                        <code>AUTO_REG_VAULT_PASSWORD</code> 注入、<b>切勿写进配置文件</b>，正式 register 前必须设置；<br />
                        5️⃣ 去掉 <code>--dry-run</code>，设置口令后指向本地配置运行（<b>真实注册默认 headed</b>，无需再加
                        <code>--headed</code>；仅调试无头时才加 <code>--headless</code>）：
                    </p>

                    <div class="command-row">
                        <span class="command-step">5. 正式运行</span>
                        <code class="command-code">{{ runCommand }}</code>
                        <el-button
                            size="small"
                            :icon="CopyDocument"
                            :type="copiedKey === 'run' ? 'success' : 'default'"
                            @click="copyCommand(runCommand, 'run')"
                        >
                            {{ copiedKey === "run" ? "已复制" : "复制" }}
                        </el-button>
                    </div>

                    <p class="license-tip">
                        ⚠️ 边界说明：遇到人机验证（Turnstile
                        等）时<b>需要人工在弹出的浏览器窗口中手动完成</b>（真实注册默认 headed，不做自动过验证；<b>不要</b>
                        用 <code>--load-extension</code> 挂 turnstilePatch，Cloudflare 会报 Incompatible browser
                        extension）；该 CLI
                        <b>不做机器码重置</b>，只负责注册与账号落盘；账号库含密码与 session token，默认加密后需用同一
                        <code>AUTO_REG_VAULT_PASSWORD</code> 口令解密，口令丢失不可恢复，请妥善备份。
                    </p>
                </el-card>
            </div>
        </el-scrollbar>
    </div>
</template>

<style lang="scss" scoped>
    .autoreg-panel {
        .card-container {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 10px;

            .el-card {
                flex: 1;
                position: relative;
                --el-card-bg-color: #f8f9fa0a;
                --el-card-border-color: #f8f9fa00;
                --el-card-border-radius: 10px;
                color: var(--ev-c-text-1);
                min-width: 300px;

                :deep(.el-card__body) {
                    padding-top: 10px;
                }

                .card-header {
                    font-size: 16px;
                    font-weight: 800;
                    color: var(--el-color-primary);
                    user-select: none;
                }
            }
        }

        .intro-text {
            font-size: 14px;
            margin-top: 10px;
            line-height: 1.7;
            color: var(--ev-c-text-1);
            word-break: break-all;

            code {
                background-color: #0000002e;
                padding: 1px 6px;
                border-radius: 4px;
                font-size: 12px;
            }
        }

        .link-row {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 5px;

            .el-button {
                padding-left: 0;
            }
        }

        .license-tip {
            font-size: 12px;
            margin-top: 10px;
            padding: 8px 12px;
            border-radius: 6px;
            line-height: 1.7;
            background-color: rgba(230, 162, 60, 0.1);
            color: #e6a23c;
            word-break: break-all;

            code {
                background-color: #0000002e;
                padding: 1px 6px;
                border-radius: 4px;
            }
        }

        .command-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 12px;
            flex-wrap: wrap;

            .command-step {
                font-size: 13px;
                flex-shrink: 0;
                color: var(--ev-c-text-2);
                user-select: none;
            }

            .command-code {
                flex: 1;
                min-width: 200px;
                background-color: #0000002e;
                padding: 6px 12px;
                border-radius: 5px;
                font-size: 12px;
                word-break: break-all;
                user-select: all;
            }
        }
    }
</style>
