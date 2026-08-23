#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
重置机器码标签页 - 提供重置机器码功能
"""

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, 
    QGroupBox, QTextEdit, QProgressBar, QMessageBox, QSizePolicy
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont, QIcon
from PyQt5.QtWidgets import QApplication

import threading
import time
import traceback
import logging

# 导入日志查看器组件
from gui.log_viewer import LogViewer

# 导入Cursor Pro API
from cursor_pro_keep_alive import api_reset_machine_id

class WorkerThread(QThread):
    """工作线程类，用于执行耗时操作"""
    
    # 信号定义
    progress_signal = pyqtSignal(int)  # 进度更新信号
    finished_signal = pyqtSignal(bool, str)  # 完成信号，带结果和消息
    
    def __init__(self, task, parent=None):
        """
        初始化工作线程
        
        Args:
            task: 要执行的任务函数
            parent: 父对象
        """
        super().__init__(parent)
        self.task = task
        self.running = True
    
    def run(self):
        """线程运行方法"""
        try:
            # 更新进度条
            self.progress_signal.emit(10)
            time.sleep(0.5)
            
            # 执行任务
            logging.info(self.tr("正在执行重置机器码任务..."))
            self.progress_signal.emit(30)
            
            # 调用API
            result = self.task()
            
            self.progress_signal.emit(80)
            time.sleep(0.5)
            
            # 发送结果
            if result:
                logging.info(self.tr("机器码重置成功！"))
                self.finished_signal.emit(True, self.tr("机器码重置成功！"))
            else:
                logging.error(self.tr("机器码重置失败！"))
                self.finished_signal.emit(False, self.tr("机器码重置失败！"))
                
            self.progress_signal.emit(100)
            
        except Exception as e:
            # 处理异常
            error_msg = str(e)
            trace = traceback.format_exc()
            logging.error(f"{self.tr('发生错误')}: {error_msg}\n{trace}")
            self.finished_signal.emit(False, f"{self.tr('发生错误')}: {error_msg}")
            self.progress_signal.emit(100)

class ResetTab(QWidget):
    """重置机器码标签页类"""
    
    def __init__(self, parent=None):
        """初始化重置机器码标签页"""
        super().__init__(parent)
        self.parent = parent
        self.worker_thread = None
        self.init_ui()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(12)  # 合理的间距
        
        # 添加说明文本
        info_label = QLabel(self.tr("此功能将重置Cursor的机器码，解决授权过期问题。"))
        info_label.setWordWrap(True)
        info_label.setMinimumHeight(40)
        info_label.setStyleSheet("QLabel { line-height: 150%; font-size: 10pt; }")
        main_layout.addWidget(info_label)
        
        # 创建上半部分布局（固定高度部分）
        top_container = QWidget()
        top_layout = QVBoxLayout(top_container)
        top_layout.setContentsMargins(0, 5, 0, 0)
        top_layout.setSpacing(15)
        
        # 操作按钮
        button_layout = QHBoxLayout()
        button_layout.setContentsMargins(5, 0, 5, 0)
        
        # 重置按钮
        self.reset_button = QPushButton(QIcon("icons/reset.png"), self.tr("重置机器码"))
        self.reset_button.setFixedHeight(38)
        self.reset_button.setMinimumWidth(150)
        self.reset_button.clicked.connect(self.reset_machine_id)
        # 设置按钮样式
        self.reset_button.setStyleSheet("""
            QPushButton {
                background-color: #1976D2;
                color: white;
                font-weight: bold;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 10pt;
            }
            QPushButton:hover {
                background-color: #1565C0;
            }
            QPushButton:pressed {
                background-color: #0D47A1;
            }
        """)
        
        # 添加帮助按钮
        self.help_button = QPushButton(self.tr("操作指南"))
        self.help_button.setFixedHeight(38)
        self.help_button.clicked.connect(self.show_help)
        self.help_button.setStyleSheet("""
            QPushButton {
                background-color: #F5F5F5;
                border: 1px solid #E0E0E0;
                color: #424242;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 10pt;
            }
            QPushButton:hover {
                background-color: #EEEEEE;
                border-color: #BDBDBD;
            }
            QPushButton:pressed {
                background-color: #E0E0E0;
            }
        """)
        
        button_layout.addWidget(self.help_button)
        button_layout.addStretch()
        button_layout.addWidget(self.reset_button)
        top_layout.addLayout(button_layout)
        
        # 提示信息框
        notice_group = QGroupBox(self.tr("注意事项"))
        notice_layout = QVBoxLayout()
        notice_layout.setContentsMargins(15, 15, 15, 15)
        
        notice_text = QLabel(self.tr(
            "1. 确保Cursor已关闭\n"
            "2. 点击\"重置机器码\"按钮\n"
            "3. 等待操作完成\n"
            "4. 重新启动Cursor"
        ))
        notice_text.setWordWrap(True)
        notice_font = QFont()
        notice_font.setPointSize(10)
        notice_text.setFont(notice_font)
        notice_text.setStyleSheet("QLabel { line-height: 150%; }")
        notice_text.setMinimumHeight(90)
        
        notice_layout.addWidget(notice_text)
        notice_group.setLayout(notice_layout)
        top_layout.addWidget(notice_group)
        
        # 进度条
        progress_group = QGroupBox(self.tr("操作进度"))
        progress_layout = QVBoxLayout()
        progress_layout.setContentsMargins(15, 15, 15, 15)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setMinimumHeight(25)
        # 设置进度条样式
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #E0E0E0;
                border-radius: 4px;
                text-align: center;
                background-color: #F5F5F5;
                font-size: 10pt;
            }
            QProgressBar::chunk {
                background-color: #4CAF50;
                border-radius: 3px;
            }
        """)
        
        progress_layout.addWidget(self.progress_bar)
        
        progress_group.setLayout(progress_layout)
        top_layout.addWidget(progress_group)
        
        # 限制上半部分的大小策略
        top_container.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        top_container.setMinimumHeight(250)
        main_layout.addWidget(top_container)
        
        # 日志查看器
        log_group = QGroupBox(self.tr("操作日志"))
        log_layout = QVBoxLayout()
        log_layout.setContentsMargins(15, 15, 15, 15)
        
        # 使用LogViewer组件
        self.log_viewer = LogViewer(min_height=220)
        log_layout.addWidget(self.log_viewer)
        
        log_group.setLayout(log_layout)
        log_group.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        main_layout.addWidget(log_group, 1)  # 设置stretch因子为1
        
        # 设置整体最小尺寸
        self.setMinimumSize(750, 600)
        
        # 设置主布局
        self.setLayout(main_layout)
        
        # 记录页面加载完成
        logging.info(self.tr("重置机器码页面已加载"))
    
    def reset_machine_id(self):
        """重置机器码"""
        # 已经有线程在运行
        if self.worker_thread and self.worker_thread.isRunning():
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("操作正在进行中，请等待完成")
            )
            return
        
        # 使用日志模块记录
        logging.info("开始重置机器码...")
        
        # 禁用按钮
        self.reset_button.setEnabled(False)
        
        # 创建并启动工作线程
        self.worker_thread = WorkerThread(api_reset_machine_id)
        self.worker_thread.progress_signal.connect(self.update_progress)
        self.worker_thread.finished_signal.connect(self.on_task_finished)
        self.worker_thread.start()
    
    def log(self, message):
        """兼容旧的日志接口，现在使用logging模块记录日志"""
        logging.info(message)
    
    def update_progress(self, value):
        """更新进度条"""
        self.progress_bar.setValue(value)
    
    def on_task_finished(self, success, message):
        """任务完成处理"""
        # 启用按钮
        self.reset_button.setEnabled(True)
        
        # 显示结果消息
        if success:
            QMessageBox.information(
                self,
                self.tr("操作成功"),
                message
            )
        else:
            QMessageBox.critical(
                self,
                self.tr("操作失败"),
                message
            )
    
    def retranslate_ui(self):
        """更新界面翻译"""
        try:
            # 更新描述
            main_layout = self.layout()
            if main_layout and main_layout.count() > 0:
                info_label = main_layout.itemAt(0).widget()
                if info_label:
                    info_label.setText(self.tr("此功能将重置Cursor的机器码，解决授权过期问题。"))
            
                # 获取顶部容器和布局
                if main_layout.count() > 1:
                    top_container = main_layout.itemAt(1).widget()
                    if top_container:
                        top_layout = top_container.layout()
                        if top_layout and top_layout.count() > 0:
                            # 更新按钮文本
                            button_layout = top_layout.itemAt(0).layout()
                            if button_layout and button_layout.count() > 1:
                                help_button = button_layout.itemAt(0).widget()
                                reset_button = button_layout.itemAt(2).widget()
                                
                                if help_button:
                                    help_button.setText(self.tr("操作指南"))
                                    self.help_button = help_button
                                    
                                if reset_button:
                                    reset_button.setText(self.tr("重置机器码"))
                                    self.reset_button = reset_button
                            
                            # 更新注意事项组标题
                            if top_layout.count() > 1:
                                notice_group = top_layout.itemAt(1).widget()
                                if notice_group:
                                    notice_group.setTitle(self.tr("注意事项"))
                                    notice_layout = notice_group.layout()
                                    if notice_layout and notice_layout.count() > 0:
                                        notice_text = notice_layout.itemAt(0).widget()
                                        if notice_text:
                                            notice_text.setText(self.tr(
                                                "1. 确保Cursor已关闭\n"
                                                "2. 点击\"重置机器码\"按钮\n"
                                                "3. 等待操作完成\n"
                                                "4. 重新启动Cursor"
                                            ))
                            
                            # 更新进度组标题
                            if top_layout.count() > 2:
                                progress_group = top_layout.itemAt(2).widget()
                                if progress_group:
                                    progress_group.setTitle(self.tr("操作进度"))
                
                # 更新日志组标题
                if main_layout.count() > 2:
                    log_group = main_layout.itemAt(2).widget()
                    if log_group:
                        log_group.setTitle(self.tr("操作日志"))
                        
                        # 更新日志查看器的翻译
                        log_layout = log_group.layout()
                        if log_layout and log_layout.count() > 0:
                            log_viewer = log_layout.itemAt(0).widget()
                            if log_viewer:
                                self.log_viewer = log_viewer
                                self.log_viewer.retranslate_ui()
                
        except Exception as e:
            # 使用日志记录错误，而不是打印
            logging.error(f"重新翻译UI时出错: {str(e)}")
            # 追加异常堆栈信息以便调试
            logging.debug(f"异常详情: {traceback.format_exc()}")
    
    def show_help(self):
        """显示帮助信息"""
        help_text = self.tr(
            '<h3>重置机器码操作指南</h3>'
            '<p><b>操作步骤:</b></p>'
            '<ol>'
            '<li>确保Cursor已关闭</li>'
            '<li>点击"重置机器码"按钮</li>'
            '<li>等待操作完成</li>'
            '<li>重新启动Cursor</li>'
            '</ol>'
            '<p><b>注意事项:</b></p>'
            '<ul>'
            '<li>此操作可以解决Cursor授权过期问题</li>'
            '<li>重置前请确保已关闭所有Cursor进程</li>'
            '<li>重置后需要重启Cursor才能生效</li>'
            '</ul>'
        )
        
        QMessageBox.information(
            self,
            self.tr("操作指南"),
            help_text
        ) 