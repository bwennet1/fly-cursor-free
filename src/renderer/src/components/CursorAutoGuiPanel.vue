<script setup>
    import { ref } from "vue";
    import { ElMessage } from "element-plus";
    import { Link, CopyDocument } from "@element-plus/icons-vue";

    const UPSTREAM_URL = "https://github.com/CavinHuang/cursor-auto-gui";
    const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/";

    const setupCommand = "pip3 install -r vendor/cursor-auto-gui/requirements.txt";
    const runCommand = "python3 vendor/cursor-auto-gui/main.py";

    const copiedKey = ref("");

    // 功能对照：FlyCursor 内置能力 vs cursor-auto-gui（vendor 收录的旁路工具）
    const featureRows = [
        {
            feature: "重置机器码",
            flycursor: "内置（主进程实现，源码未公开）",
            flycursorType: "warning",
            autogui: "支持（Python 源码完整可读，参考 go-cursor-help）",
            autoguiType: "success",
        },
        {
            feature: "自动注册",
            flycursor: "内置（需域名 + 临时邮箱，脚本源码未公开）",
            flycursorType: "warning",
            autogui: "支持（DrissionPage 驱动浏览器，完整注册流程）",
            autoguiType: "success",
        },
        {
            feature: "续期 / 换号",
            flycursor: "内置（账号池一键换号）",
            flycursorType: "success",
            autogui: "支持（自动续期，参考 cursor-auto-free）",
            autoguiType: "success",
        },
        {
            feature: "操作日志",
            flycursor: "内置（首页日志面板）",
            flycursorType: "success",
            autogui: "支持（详细日志页面）",
            autoguiType: "success",
        },
        {
            feature: "多平台",
            flycursor: "Windows / macOS",
            flycursorType: "success",
            autogui: "Windows / macOS（Intel + ARM64）/ Linux",
            autoguiType: "success",
        },
    ];

    const openLink = (url) => {
        // 完整 Electron 包中由 preload 注入 window.api；公开仓库仅有渲染层源码，
        // 纯浏览器/开发环境下回退到 window.open
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
    <div class="body-card-item autogui-panel">
        <el-scrollbar>
            <div class="card-container">
                <el-card>
                    <div class="card-header">
                        <span>Cursor Auto GUI（旁路工具）</span>
                    </div>
                    <p class="intro-text">
                        本仓库公开源码不含 Electron 主进程与注册脚本（<code>src/main/*</code>、<code>src/preload/*</code>、<code>src/script/*</code>
                        已被 gitignore 排除）。为补充这部分能力，仓库在
                        <code>vendor/cursor-auto-gui/</code> 原样收录了开源项目
                        <b>cursor-auto-gui</b>（Cursor Pro，作者 Minator 水门）——
                        一个独立的 Python / PySide6 桌面工具，提供完整可读的自动注册、重置机器码与续期实现。
                    </p>
                    <p class="link-row">
                        <el-button text type="primary" :icon="Link" @click="openLink(UPSTREAM_URL)">
                            GitHub：CavinHuang/cursor-auto-gui
                        </el-button>
                        <el-button text type="primary" :icon="Link" @click="openLink(LICENSE_URL)">
                            许可证：CC BY-NC-ND 4.0
                        </el-button>
                    </p>
                    <p class="license-tip">
                        ⚠️ 上游项目采用 CC BY-NC-ND 4.0（署名 - 非商业 - 禁止演绎）许可证：本仓库保持原样拷贝、未做任何修改，仅供学习交流，请勿用于商业用途，勿再分发修改后的版本。详见仓库根目录
                        <code>THIRD_PARTY.md</code>。
                    </p>
                </el-card>
            </div>

            <div class="card-container">
                <el-card>
                    <div class="card-header">
                        <span>功能对照</span>
                    </div>
                    <el-table :data="featureRows" style="width: 100%; margin-top: 10px">
                        <el-table-column prop="feature" label="功能" width="120" />
                        <el-table-column label="FlyCursor 内置">
                            <template #default="{ row }">
                                <el-tag :type="row.flycursorType" effect="plain" size="small">
                                    {{ row.flycursor }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="cursor-auto-gui">
                            <template #default="{ row }">
                                <el-tag :type="row.autoguiType" effect="plain" size="small">
                                    {{ row.autogui }}
                                </el-tag>
                            </template>
                        </el-table-column>
                    </el-table>
                </el-card>
            </div>

            <div class="card-container">
                <el-card>
                    <div class="card-header">
                        <span>运行说明</span>
                    </div>
                    <p class="intro-text">
                        cursor-auto-gui 是独立的 Python 程序，不随本应用打包，需要在仓库根目录用命令行单独运行（要求
                        <b>Python 3.8+</b>）：
                    </p>

                    <div class="command-row">
                        <span class="command-step">1. 安装依赖</span>
                        <code class="command-code">{{ setupCommand }}</code>
                        <el-button
                            size="small"
                            :icon="CopyDocument"
                            :type="copiedKey === 'setup' ? 'success' : 'default'"
                            @click="copyCommand(setupCommand, 'setup')"
                        >
                            {{ copiedKey === "setup" ? "已复制" : "复制" }}
                        </el-button>
                    </div>

                    <div class="command-row">
                        <span class="command-step">2. 启动程序</span>
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

                    <p class="intro-text hint-text">
                        也可以使用仓库提供的脚本：macOS / Linux 用
                        <code>./scripts/setup-cursor-auto-gui.sh</code> 与
                        <code>./scripts/run-cursor-auto-gui.sh</code>；Windows 用
                        <code>scripts\setup-cursor-auto-gui.cmd</code> 与
                        <code>scripts\run-cursor-auto-gui.cmd</code>；或
                        <code>npm run auto-gui:setup</code> / <code>npm run auto-gui</code>。
                    </p>
                </el-card>
            </div>
        </el-scrollbar>
    </div>
</template>

<style lang="scss" scoped>
    .autogui-panel {
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

        .hint-text {
            font-size: 12px;
            color: var(--ev-c-text-2);
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

        :deep(.el-table) {
            --el-table-bg-color: transparent;
            --el-table-tr-bg-color: transparent;
            --el-table-header-bg-color: #f8f9fa0a;
            --el-table-border-color: #f8f9fa26;
            --el-table-text-color: var(--ev-c-text-1);
            --el-table-header-text-color: var(--ev-c-text-1);
            --el-table-row-hover-bg-color: #f8f9fa14;

            .el-tag {
                height: auto;
                white-space: normal;
                line-height: 1.6;
                padding: 2px 8px;
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
