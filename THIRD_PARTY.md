# 第三方代码声明（Third-Party Notices）

本仓库在 `vendor/` 目录中包含第三方项目的原样拷贝（verbatim copy），用于学习交流与功能补充。以下为来源、作者与许可证信息。

---

## cursor-auto-gui（Cursor Pro）

- **位置**：`vendor/cursor-auto-gui/`
- **来源 URL**：<https://github.com/CavinHuang/cursor-auto-gui>
- **作者 / 开发者**：Minator 水门（GitHub: CavinHuang）
- **拷贝的上游 commit**：`a946fa72cba248548fe5dda4ff814fc98dd90b70`（详见 `vendor/cursor-auto-gui/UPSTREAM_COMMIT.txt`）
- **许可证**：[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)（署名 - 非商业性使用 - 禁止演绎）

### 许可证要点

CC BY-NC-ND 4.0 允许在任何媒介以任何形式**原样复制、分发**该作品，但要求：

- **署名（BY）**：必须给出适当的署名（本文件即为署名声明）。
- **非商业（NC）**：不得将该作品用于商业目的。
- **禁止演绎（ND）**：不得再分发经修改的衍生作品。

因此，本仓库对 `vendor/cursor-auto-gui/` 中的上游源码**未做任何修改**，保持原样拷贝。仓库仅额外添加了一个元数据文件 `vendor/cursor-auto-gui/UPSTREAM_COMMIT.txt` 用于记录拷贝时的 commit SHA，不改动任何上游逻辑。如需修改或二次开发，请前往上游仓库参与贡献，勿在本仓库内修改 vendor 源码。

### 用途说明

该项目**仅供学习交流使用，请勿用于商业用途**（与上游声明一致）。使用该工具产生的任何后果由使用者自行承担。

### 如何原样运行

cursor-auto-gui 是一个独立的 Python（PySide6）桌面应用，不参与 FlyCursor 的 Electron 构建，需单独运行：

1. 环境要求：Python 3.8+（含 pip）。
2. 安装依赖：

   ```bash
   pip3 install -r vendor/cursor-auto-gui/requirements.txt
   ```

3. 启动程序：

   ```bash
   python3 vendor/cursor-auto-gui/main.py
   ```

也可以使用本仓库提供的便捷脚本（脚本位于本仓库 `scripts/` 目录，不属于上游代码）：

```bash
./scripts/setup-cursor-auto-gui.sh   # 安装依赖（macOS / Linux）
./scripts/run-cursor-auto-gui.sh    # 启动程序（macOS / Linux）
scripts\setup-cursor-auto-gui.cmd    # 安装依赖（Windows）
scripts\run-cursor-auto-gui.cmd     # 启动程序（Windows）
```

或使用 npm scripts：

```bash
npm run auto-gui:setup   # 安装依赖
npm run auto-gui         # 启动程序
```

### 上游致谢链

上游项目自身参考 / 致谢了以下开源项目（详见 `vendor/cursor-auto-gui/README.md`）：

- [go-cursor-help](https://github.com/yuaotian/go-cursor-help) — 机器码重置实现参考
- [cursor-auto-free](https://github.com/chengazhen/cursor-auto-free) — 自动续期实现参考

---

## 2026-08-23 增补的对照拷贝

下列目录均为浅克隆后去掉嵌套 `.git` 的原样拷贝，仅额外写入 `UPSTREAM_COMMIT.txt`。完整对照见 [research/SOURCE_MATRIX.md](./research/SOURCE_MATRIX.md)。**请勿在 vendor 内改上游逻辑。**

| 目录 | 来源 | 许可证（以仓库内文件或 README 为准） |
|---|---|---|
| `vendor/zzxcursor` | https://github.com/zhangx1aoxi77/ZZXcursor | MIT（见 `LICENSE`） |
| `vendor/cursor-free-vip` | https://github.com/hovanhoa/cursor-free-vip | CC BY-NC-ND 4.0（见 `LICENSE.md`） |
| `vendor/cursor-register` | https://github.com/JiuZX/Cursor-Register | 未发现 LICENSE 文件 |
| `vendor/wf-cursor-auto-free` | https://github.com/wangffei/wf-cursor-auto-free | README 称 CC BY-NC-ND 4.0 |
| `vendor/cursor-api` | https://github.com/waterwoodwind/cursor-api | 未发现 LICENSE 文件 |
| `vendor/cursor-auto-free` | https://github.com/chengazhen/cursor-auto-free | README 称 CC BY-NC-ND 4.0 |
| `vendor/ycursor` | https://github.com/YanCchen/YCursor | 未发现；仓库主要为文档与截图 |
| `vendor/xc-cursor` | https://github.com/Aeth247/XC-Cursor | 未发现；仓库主要为文档与截图 |
| `vendor/any-auto-register` | https://github.com/lxf746/any-auto-register | AGPL-3.0（见 `LICENSE`） |
| `vendor/cursor-auto-icloud` | https://github.com/Ryan0204/cursor-auto-icloud | CC BY-NC-ND 4.0（见 `LICENSE.md`） |
| `vendor/cursor-pro-trial` | https://github.com/aigem/cursor-pro-trial | 未发现；静态说明页 |
| `vendor/lens-cursor-free` | https://github.com/lens68/lens-cursor-free | MIT（见 `LICENSE`；商业核心不在本拷贝中） |

合并成新自动 REG 项目的计划见 [docs/AUTO_REG_MERGE_PLAN.md](./docs/AUTO_REG_MERGE_PLAN.md)。AGPL 与 CC BY-NC-ND 源码**不得**未经评估地改完再并入 MIT/专有产品。
