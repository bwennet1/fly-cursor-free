#!/usr/bin/env bash
# 安装 vendor/cursor-auto-gui（Cursor Pro）的 Python 依赖。
# 用法：在仓库根目录执行 ./scripts/setup-cursor-auto-gui.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/cursor-auto-gui"
REQUIREMENTS="$VENDOR_DIR/requirements.txt"

if [ ! -d "$VENDOR_DIR" ]; then
    echo "错误：未找到目录 $VENDOR_DIR" >&2
    echo "请先在仓库根目录执行：git clone --depth 1 https://github.com/CavinHuang/cursor-auto-gui.git vendor/cursor-auto-gui" >&2
    exit 1
fi

if [ ! -f "$REQUIREMENTS" ]; then
    echo "错误：未找到依赖文件 $REQUIREMENTS" >&2
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

if ! "$PYTHON" -m pip --version >/dev/null 2>&1; then
    echo "错误：当前 Python 缺少 pip 模块，请先安装 pip（例如：$PYTHON -m ensurepip --upgrade）" >&2
    exit 1
fi

echo "正在安装 cursor-auto-gui 依赖..."
"$PYTHON" -m pip install -r "$REQUIREMENTS"

echo "依赖安装完成。启动程序：./scripts/run-cursor-auto-gui.sh"
