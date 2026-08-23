#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
日志查看器组件 - 捕获logger模块的日志并在GUI中显示
"""

import logging
import time
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QTextEdit, QApplication, 
    QHBoxLayout, QPushButton, QComboBox, QLabel,
    QSizePolicy, QScrollArea
)
from PyQt5.QtCore import Qt, QObject, pyqtSignal, pyqtSlot, QTimer, QSize
from PyQt5.QtGui import QFont, QTextCursor, QIcon, QColor

class LogSignalHandler(QObject, logging.Handler):
    """将日志记录发送到Qt信号的自定义日志处理器"""
    
    # 定义Qt信号，用于向UI组件发送日志消息
    log_signal = pyqtSignal(str, int, str)  # 参数：消息文本、日志级别、记录时间
    
    def __init__(self):
        super().__init__()
        # 初始化基类
        QObject.__init__(self)
        logging.Handler.__init__(self)
        
        # 设置格式化器 - 使用较简单的格式，由显示组件来负责布局美化
        self.setFormatter(logging.Formatter('%(message)s'))
        
        # 日志级别映射
        self.level_map = {
            logging.DEBUG: 0,
            logging.INFO: 1,
            logging.WARNING: 2,
            logging.ERROR: 3,
            logging.CRITICAL: 4
        }
    
    def emit(self, record):
        """发出日志记录时的处理"""
        try:
            # 格式化日志记录 - 保留原始消息格式
            log_message = self.format(record)
            
            # 获取日志级别索引（默认为INFO级别）
            level_idx = self.level_map.get(record.levelno, 1)
            
            # 获取时间戳
            time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(record.created))
            
            # 发送信号
            self.log_signal.emit(log_message, level_idx, time_str)
        except Exception:
            self.handleError(record)

class LogViewer(QWidget):
    """日志查看器组件，用于在GUI中显示日志"""
    
    def __init__(self, parent=None, min_height=250):
        """初始化日志查看器"""
        super().__init__(parent)
        self.parent = parent
        self.min_height = min_height
        self.log_handler = None
        self.log_buffer = []  # 用于存储最近的日志记录
        self.max_buffer_size = 1000  # 最大缓冲区大小
        self.auto_scroll = True  # 是否自动滚动
        self.init_ui()
        self.setup_logger()
        
        # 定时刷新UI，避免频繁的UI更新操作
        self.refresh_timer = QTimer(self)
        self.refresh_timer.timeout.connect(self.update_display)
        self.refresh_timer.start(100)  # 每100毫秒更新一次UI
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(5)
        
        # 工具栏
        toolbar = QHBoxLayout()
        toolbar.setContentsMargins(0, 0, 0, 0)
        toolbar.setSpacing(10)
        
        # 日志级别选择
        level_label = QLabel(self.tr("日志级别:"))
        level_label.setFixedWidth(60)
        self.level_combo = QComboBox()
        self.level_combo.addItems([
            self.tr("调试 (DEBUG)"),
            self.tr("信息 (INFO)"),
            self.tr("警告 (WARNING)"),
            self.tr("错误 (ERROR)"),
            self.tr("严重 (CRITICAL)")
        ])
        self.level_combo.setCurrentIndex(1)  # 默认INFO级别
        self.level_combo.currentIndexChanged.connect(self.change_log_level)
        
        # 自动滚动选项
        self.auto_scroll_button = QPushButton(self.tr("自动滚动"))
        self.auto_scroll_button.setCheckable(True)
        self.auto_scroll_button.setChecked(True)
        self.auto_scroll_button.clicked.connect(self.toggle_auto_scroll)
        
        # 清除按钮
        self.clear_button = QPushButton(self.tr("清除日志"))
        self.clear_button.clicked.connect(self.clear_logs)
        
        # 设置按钮和组件大小
        self.level_combo.setFixedWidth(150)
        self.auto_scroll_button.setFixedWidth(80)
        self.clear_button.setFixedWidth(80)
        
        toolbar.addWidget(level_label)
        toolbar.addWidget(self.level_combo)
        toolbar.addStretch(1)
        toolbar.addWidget(self.auto_scroll_button)
        toolbar.addWidget(self.clear_button)
        
        layout.addLayout(toolbar)
        
        # 日志文本框
        self.log_display = QTextEdit()
        self.log_display.setReadOnly(True)
        self.log_display.setMinimumHeight(self.min_height)
        
        # 设置大小策略，允许垂直方向尽可能扩展
        self.log_display.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        
        # 设置日志文本框样式
        font = QFont("Monospace")
        font.setPointSize(9)
        self.log_display.setFont(font)
        
        # 自定义样式表，增强可读性
        self.log_display.setStyleSheet("""
            QTextEdit {
                background-color: #FCFCFC;
                border: 1px solid #DDDDDD;
                border-radius: 4px;
                padding: 8px;
                line-height: 140%;
            }
        """)
        
        # 预先设置日志显示的HTML样式
        self.log_display.setHtml("""
        <style>
            body {
                font-family: Monospace, Consolas, 'Courier New', monospace;
                font-size: 9pt;
                line-height: 140%;
                padding: 5px;
            }
            .log-entry {
                margin: 4px 0;
                padding: 4px 0;
                border-bottom: 1px solid #f0f0f0;
            }
            .log-timestamp {
                color: #777777;
                font-weight: bold;
                padding-right: 8px;
            }
            .log-message {
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            .log-debug { color: #1565C0; }
            .log-info { color: #212121; }
            .log-warning { color: #F57C00; }
            .log-error { color: #D32F2F; }
            .log-critical { color: #7B1FA2; }
        </style>
        <body></body>
        """)
        
        # 优化滚动条设置
        self.log_display.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
        
        # 日志显示区域设置最小大小
        self.log_display.setMinimumSize(QSize(300, self.min_height))
        
        # 添加日志显示区域到主布局
        layout.addWidget(self.log_display, 1)  # 使用伸缩因子1，使其尽量扩展
        
        # 设置日志文本颜色
        self.log_colors = [
            "#1565C0",  # DEBUG - 深蓝色
            "#212121",  # INFO - 黑色
            "#F57C00",  # WARNING - 橙色
            "#D32F2F",  # ERROR - 红色
            "#7B1FA2"   # CRITICAL - 紫色
        ]
        
        # 设置日志CSS类名
        self.log_classes = [
            "log-debug",
            "log-info",
            "log-warning",
            "log-error",
            "log-critical"
        ]
        
        # 设置组件大小策略
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        
        # 设置最小整体尺寸
        self.setMinimumHeight(self.min_height + 40)  # 考虑工具栏高度
    
    def toggle_auto_scroll(self, checked):
        """切换自动滚动选项"""
        self.auto_scroll = checked
        if checked:
            # 立即滚动到底部
            scrollbar = self.log_display.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
            
    def setup_logger(self):
        """设置日志处理器"""
        # 创建信号处理器
        self.log_handler = LogSignalHandler()
        self.log_handler.setLevel(logging.INFO)  # 默认只捕获INFO及以上级别
        
        # 连接信号到槽函数
        self.log_handler.log_signal.connect(self.on_log_message)
        
        # 添加到根日志记录器
        root_logger = logging.getLogger()
        root_logger.addHandler(self.log_handler)
        
        # 记录初始日志
        logging.info(self.tr("日志显示组件已初始化"))
    
    @pyqtSlot(str, int, str)
    def on_log_message(self, message, level, time_str):
        """
        接收日志消息并添加到缓冲区
        
        Args:
            message: 日志消息文本
            level: 日志级别索引
            time_str: 日志时间戳
        """
        # 添加到缓冲区
        self.log_buffer.append((message, level, time_str))
        
        # 限制缓冲区大小
        if len(self.log_buffer) > self.max_buffer_size:
            self.log_buffer = self.log_buffer[-self.max_buffer_size:]
    
    def update_display(self):
        """更新显示区域，显示缓冲区中的日志"""
        if not self.log_buffer:
            return
        
        # 获取当前滚动条位置
        scrollbar = self.log_display.verticalScrollBar()
        at_bottom = scrollbar.value() >= scrollbar.maximum() - 20 or self.auto_scroll
        
        # 当前级别设置
        current_level = self.level_combo.currentIndex()
        
        # 批量处理缓冲区内容
        cursor = self.log_display.textCursor()
        cursor.movePosition(QTextCursor.End)
        
        # 预处理HTML文本
        html = ""
        for message, level, time_str in self.log_buffer:
            # 如果消息级别低于当前显示级别，跳过
            if level < current_level:
                continue
                
            # 获取对应的CSS类名
            css_class = self.log_classes[level]
            
            # 处理消息中的换行符，将其转换为HTML的<br>标签
            # 首先转义HTML特殊字符，防止注入
            escaped_message = message.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            # 将换行符保留为换行符，因为我们使用white-space: pre-wrap
            
            # 添加到HTML，使用更清晰的样式
            html += f"""
            <div class="log-entry">
                <span class="log-timestamp">[{time_str}]</span>
                <span class="log-message {css_class}">{escaped_message}</span>
            </div>
            """
        
        # 插入HTML
        if html:
            cursor.insertHtml(html)
        
        # 清空缓冲区
        self.log_buffer.clear()
        
        # 如果之前在底部或启用了自动滚动，则滚动到底部
        if at_bottom:
            scrollbar.setValue(scrollbar.maximum())
    
    def change_log_level(self, index):
        """更改日志显示级别"""
        level_map = {
            0: logging.DEBUG,
            1: logging.INFO,
            2: logging.WARNING,
            3: logging.ERROR,
            4: logging.CRITICAL
        }
        
        # 更新处理器级别
        self.log_handler.setLevel(level_map.get(index, logging.INFO))
        
        # 记录级别变化
        level_names = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        logging.info(self.tr(f"日志显示级别已更改为: {level_names[index]}"))
        
        # 重新显示所有日志
        self.refresh_logs()
    
    def refresh_logs(self):
        """刷新日志显示，应用当前过滤设置"""
        # 清除当前显示
        self.log_display.clear()
        
        # 强制UI更新
        QApplication.processEvents()
    
    def clear_logs(self):
        """清除日志显示"""
        self.log_display.clear()
        logging.info(self.tr("日志已清除"))
    
    def sizeHint(self):
        """提供组件的建议大小"""
        return QSize(500, self.min_height + 50)
    
    def minimumSizeHint(self):
        """提供组件的最小建议大小"""
        return QSize(300, self.min_height)
    
    def retranslate_ui(self):
        """更新UI文本翻译"""
        # 更新可翻译的文本元素
        self.level_combo.setItemText(0, self.tr("调试 (DEBUG)"))
        self.level_combo.setItemText(1, self.tr("信息 (INFO)"))
        self.level_combo.setItemText(2, self.tr("警告 (WARNING)"))
        self.level_combo.setItemText(3, self.tr("错误 (ERROR)"))
        self.level_combo.setItemText(4, self.tr("严重 (CRITICAL)"))
        
        self.auto_scroll_button.setText(self.tr("自动滚动"))
        self.clear_button.setText(self.tr("清除日志"))
    
    def resizeEvent(self, event):
        """窗口大小改变时的处理"""
        super().resizeEvent(event)
        
        # 确保滚动条在合适的位置
        if self.auto_scroll:
            scrollbar = self.log_display.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum()) 