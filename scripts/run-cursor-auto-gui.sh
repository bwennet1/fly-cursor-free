#!/usr/bin/env bash
# 启动 vendor/cursor-auto-gui（Cursor Pro）的 Python GUI 程序。
# 用法：在仓库根目录执行 ./scripts/run-cursor-auto-gui.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/cursor-auto-gui"
MAIN_PY="$VENDOR_DIR/main.py"

if [ ! -d "$VENDOR_DIR" ]; then
    echo "错误：未找到目录 $VENDOR_DIR" >&2
    echo "请先在仓库根目录执行：git clone --depth 1 https://github.com/CavinHuang/cursor-auto-gui.git vendor/cursor-auto-gui" >&2
    exit 1
fi

if [ ! -f "$MAIN_PY" ]; then
    echo "错误：未找到入口文件 $MAIN_PY" >&2
    exit 1
fi

if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1; then
    PYTHON=python
else
    echo "错误：未找到 python3 或 python，请先安装 Python 3.8+（https://www.python.org/downloads/）" >&2
    exit 1
fi

echo "使用 Python：$($PYTHON --version 2>&1)（$(command -v $PYTHON)）"

if ! "$PYTHON" -c "import PySide6" >/dev/null 2>&1; then
    echo "提示：未检测到 PySide6 依赖，请先执行 ./scripts/setup-cursor-auto-gui.sh 安装依赖" >&2
fi

cd "$VENDOR_DIR"
exec "$PYTHON" main.py "$@"
