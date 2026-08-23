#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
账号管理标签页 - 提供账号管理功能
"""

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, 
    QGroupBox, QTextEdit, QProgressBar, QMessageBox, QListWidget,
    QFormLayout, QLineEdit, QFileDialog, QSplitter, QListWidgetItem,
    QApplication, QSizePolicy
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont, QIcon

import threading
import time
import traceback
import os
import json
import logging

# 导入日志查看器组件
from gui.log_viewer import LogViewer

# 导入Cursor Pro API
from cursor_pro_keep_alive import (
    api_apply_saved_account, 
    api_update_cursor_auth, 
    api_save_account_info, 
    api_get_account_info
)

class WorkerThread(QThread):
    """工作线程类，用于执行耗时操作"""
    
    # 信号定义
    progress_signal = pyqtSignal(int)  # 进度更新信号
    finished_signal = pyqtSignal(bool, str)  # 完成信号，带结果和消息
    
    def __init__(self, task, args=None, kwargs=None, parent=None):
        """
        初始化工作线程
        
        Args:
            task: 要执行的任务函数
            args: 位置参数
            kwargs: 关键字参数
            parent: 父对象
        """
        super().__init__(parent)
        self.task = task
        self.args = args or []
        self.kwargs = kwargs or {}
        self.running = True
    
    def run(self):
        """线程运行方法"""
        try:
            # 更新进度条
            self.progress_signal.emit(10)
            time.sleep(0.5)
            
            # 执行任务
            logging.info(self.tr("正在执行任务..."))
            self.progress_signal.emit(30)
            
            # 调用API
            result = self.task(*self.args, **self.kwargs)
            
            self.progress_signal.emit(80)
            time.sleep(0.5)
            
            # 发送结果
            if result:
                logging.info(self.tr("操作成功！"))
                self.finished_signal.emit(True, self.tr("操作成功！"))
            else:
                logging.error(self.tr("操作失败！"))
                self.finished_signal.emit(False, self.tr("操作失败！"))
                
            self.progress_signal.emit(100)
            
        except Exception as e:
            # 处理异常
            error_msg = str(e)
            trace = traceback.format_exc()
            logging.error(f"{self.tr('发生错误')}: {error_msg}\n{trace}")
            self.finished_signal.emit(False, f"{self.tr('发生错误')}: {error_msg}")
            self.progress_signal.emit(100)

class AccountTab(QWidget):
    """账号管理标签页类"""
    
    def __init__(self, parent=None):
        """初始化账号管理标签页"""
        super().__init__(parent)
        self.parent = parent
        self.worker_thread = None
        self.init_ui()
        
        # 初始加载账号列表
        self.load_account_list()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(12)  # 合理的间距
        
        # 添加说明文本
        info_label = QLabel(self.tr("管理已保存的Cursor账号，查看账号信息并应用到Cursor。"))
        info_label.setWordWrap(True)
        info_label.setMinimumHeight(40)
        info_label.setStyleSheet("QLabel { line-height: 150%; font-size: 10pt; }")
        main_layout.addWidget(info_label)
        
        # 创建内容区域
        content_container = QWidget()
        content_layout = QVBoxLayout(content_container)
        content_layout.setContentsMargins(0, 5, 0, 0)
        content_layout.setSpacing(15)
        
        # 创建水平分割器
        splitter = QSplitter(Qt.Horizontal)
        splitter.setHandleWidth(6)  # 分割器手柄宽度
        splitter.setStyleSheet("""
            QSplitter::handle {
                background-color: #E0E0E0;
                border-radius: 2px;
                margin: 1px 1px;
            }
            QSplitter::handle:hover {
                background-color: #BDBDBD;
            }
            QSplitter::handle:pressed {
                background-color: #9E9E9E;
            }
        """)
        
        # 左侧：账号列表
        account_group = QGroupBox(self.tr("已保存账号"))
        account_layout = QVBoxLayout()
        account_layout.setContentsMargins(12, 15, 12, 12)
        account_layout.setSpacing(10)
        
        self.account_list = QListWidget()
        self.account_list.setMinimumWidth(280)
        self.account_list.setAlternatingRowColors(True)
        self.account_list.currentItemChanged.connect(self.on_account_selected)
        # 设置列表样式
        self.account_list.setStyleSheet("""
            QListWidget {
                border: 1px solid #E0E0E0;
                border-radius: 4px;
                background-color: #FFFFFF;
                font-size: 10pt;
                padding: 5px;
            }
            QListWidget::item {
                border-bottom: 1px solid #F0F0F0;
                padding: 5px;
                margin: 2px 0;
                min-height: 20px;
            }
            QListWidget::item:selected {
                background-color: #E3F2FD;
                color: #000000;
                border-left: 3px solid #2196F3;
            }
            QListWidget::item:hover {
                background-color: #F5F5F5;
            }
        """)
        self.account_list.setMinimumHeight(200)
        account_layout.addWidget(self.account_list)
        
        # 账号列表下方的按钮
        list_buttons_layout = QHBoxLayout()
        list_buttons_layout.setSpacing(8)
        
        # 帮助按钮
        self.help_button = QPushButton(self.tr("操作指南"))
        self.help_button.setFixedHeight(32)
        self.help_button.clicked.connect(self.show_help)
        
        self.refresh_button = QPushButton(QIcon("icons/refresh.png"), self.tr("刷新"))
        self.refresh_button.setProperty("secondary", True)
        self.refresh_button.clicked.connect(self.load_account_list)
        self.refresh_button.setFixedHeight(32)
        
        self.apply_button = QPushButton(QIcon("icons/apply.png"), self.tr("应用账号"))
        self.apply_button.clicked.connect(self.apply_account)
        self.apply_button.setFixedHeight(32)
        # 设置主按钮样式
        self.apply_button.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                font-weight: bold;
                border-radius: 4px;
                padding: 5px 10px;
                font-size: 10pt;
            }
            QPushButton:hover {
                background-color: #43A047;
            }
            QPushButton:pressed {
                background-color: #388E3C;
            }
        """)
        
        self.delete_button = QPushButton(QIcon("icons/delete.png"), self.tr("删除"))
        self.delete_button.setProperty("secondary", True)
        self.delete_button.clicked.connect(self.delete_account)
        self.delete_button.setFixedHeight(32)
        # 设置次要按钮样式
        button_style = """
            QPushButton {
                background-color: #F5F5F5;
                border: 1px solid #E0E0E0;
                color: #424242;
                border-radius: 4px;
                padding: 5px 10px;
                font-size: 10pt;
            }
            QPushButton:hover {
                background-color: #EEEEEE;
                border-color: #BDBDBD;
            }
            QPushButton:pressed {
                background-color: #E0E0E0;
            }
        """
        self.help_button.setStyleSheet(button_style)
        self.refresh_button.setStyleSheet(button_style)
        self.delete_button.setStyleSheet(button_style)
        
        list_buttons_layout.addWidget(self.help_button)
        list_buttons_layout.addWidget(self.refresh_button)
        list_buttons_layout.addStretch()
        list_buttons_layout.addWidget(self.delete_button)
        list_buttons_layout.addWidget(self.apply_button)
        
        account_layout.addLayout(list_buttons_layout)
        account_group.setLayout(account_layout)
        
        # 右侧：账号详情
        details_group = QGroupBox(self.tr("账号详情"))
        details_layout = QVBoxLayout()
        details_layout.setContentsMargins(12, 15, 12, 12)
        
        # 使用只读的文本编辑区域显示账号详情
        self.details_text = QTextEdit()
        self.details_text.setReadOnly(True)
        self.details_text.setMinimumHeight(200)
        details_layout.addWidget(self.details_text)
        
        details_group.setLayout(details_layout)
        
        # 添加部件到分割器
        splitter.addWidget(account_group)
        splitter.addWidget(details_group)
        
        # 设置分割比例 (40% - 60%)
        splitter.setSizes([380, 420])
        
        content_layout.addWidget(splitter, 2)
        
        # 底部工具区域
        bottom_container = QWidget()
        bottom_layout = QVBoxLayout(bottom_container)
        bottom_layout.setContentsMargins(0, 0, 0, 0)
        bottom_layout.setSpacing(10)
        
        # 日志查看器
        log_group = QGroupBox(self.tr("操作日志"))
        log_layout = QVBoxLayout()
        log_layout.setContentsMargins(12, 15, 12, 12)
        
        # 使用LogViewer组件
        self.log_viewer = LogViewer(min_height=220)
        log_layout.addWidget(self.log_viewer)
        
        log_group.setLayout(log_layout)
        log_group.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        
        # 进度条
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setFixedHeight(20)
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
        
        bottom_layout.addWidget(log_group, 1)
        bottom_layout.addWidget(self.progress_bar)
        
        # 将区域添加到主布局
        content_layout.addWidget(bottom_container, 1)
        
        # 设置内容区域的大小策略
        content_container.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        main_layout.addWidget(content_container, 1)
        
        # 设置整体最小尺寸
        self.setMinimumSize(800, 600)
        
        # 设置主布局
        self.setLayout(main_layout)
        
        # 记录页面加载完成
        logging.info(self.tr("账号管理页面已加载"))
    
    def load_account_list(self):
        """加载账号列表"""
        self.account_list.clear()
        
        # 检查accounts目录
        accounts_dir = "accounts"
        if not os.path.exists(accounts_dir):
            os.makedirs(accounts_dir)
            logging.info(self.tr("创建账号目录"))
        
        # 获取所有JSON文件
        account_files = [f for f in os.listdir(accounts_dir) if f.endswith('.json')]
        if not account_files:
            logging.warning(self.tr("未找到保存的账号文件"))
            return
        
        # 排序按创建时间（文件名中包含的时间戳）
        account_files.sort(reverse=True)
        
        # 添加到列表
        for filename in account_files:
            try:
                filepath = os.path.join(accounts_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    account_data = json.load(f)
                    email = account_data.get('email', '未知')
                    created_time = account_data.get('created_time', self.tr("未知时间"))
                    
                    # 将文件路径存储在用户数据中
                    display_text = f"{email} ({created_time})"
                    item = QListWidgetItem(display_text)
                    
                    # 设置图标并调整项目外观
                    item.setIcon(QIcon("icons/account.png"))
                    # 可选：设置提示文本
                    item.setToolTip(f"{self.tr('文件')}: {filename}\n{self.tr('邮箱')}: {email}\n{self.tr('时间')}: {created_time}")
                    
                    item.setData(Qt.UserRole, filepath)
                    self.account_list.addItem(item)
            except Exception as e:
                logging.error(f"{self.tr('读取账号文件失败')}: {filename} - {str(e)}")
        
        logging.info(self.tr("账号列表已刷新"))
    
    def on_account_selected(self, current, previous):
        """账号选择改变事件"""
        if not current:
            return
        
        # 获取文件路径
        filepath = current.data(Qt.UserRole)
        if not filepath or not os.path.exists(filepath):
            return
        
        try:
            # 读取账号数据
            with open(filepath, 'r', encoding='utf-8') as f:
                account_data = json.load(f)
            
            # 更新详情显示
            self.display_account_details(account_data)
            
            logging.info(self.tr("已加载账号详情"))
        except Exception as e:
            logging.error(f"{self.tr('读取账号详情失败')}: {str(e)}")
    
    def display_account_details(self, account_data):
        """显示账号详细信息"""
        email = account_data.get('email', self.tr('未知'))
        password = account_data.get('password', self.tr('未设置'))
        created_time = account_data.get('created_time', self.tr('未知'))
        access_token = account_data.get('access_token', '')
        refresh_token = account_data.get('refresh_token', '')
        
        # 构建格式化的HTML显示，使用更现代的卡片样式和垂直布局
        html = f"""
        <style>
            body {{
                font-family: 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif;
                background-color: white;
                margin: 0;
                padding: 0;
            }}
            .card {{
                border-radius: 8px;
                background-color: #f8f9fa;
                padding: 15px;
                margin-bottom: 15px;
                border-left: 4px solid #1a73e8;
                box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            }}
            .card-title {{
                color: #1a73e8;
                font-size: 16px;
                font-weight: bold;
                margin-top: 0;
                margin-bottom: 12px;
                border-bottom: 1px solid #e0e0e0;
                padding-bottom: 8px;
            }}
            .field {{
                margin-bottom: 12px;
            }}
            .field-name {{
                font-weight: bold;
                color: #555;
                margin-bottom: 4px;
            }}
            .field-value {{
                background-color: #ffffff;
                padding: 6px 10px;
                border-radius: 4px;
                border: 1px solid #e0e0e0;
            }}
            .token {{
                color: #707070;
                font-family: monospace;
                font-size: 12px;
                background-color: #f1f3f4;
                padding: 8px;
                border-radius: 4px;
                word-break: break-all;
                border: 1px solid #e0e0e0;
                max-height: 100px;
                overflow-y: auto;
            }}
            .timestamp {{
                color: #0d47a1;
                font-weight: bold;
            }}
        </style>
        
        <div class="card">
            <h3 class="card-title">{self.tr('基本信息')}</h3>
            
            <div class="field">
                <div class="field-name">{self.tr('电子邮箱')}</div>
                <div class="field-value">{email}</div>
            </div>
            
            <div class="field">
                <div class="field-name">{self.tr('密码')}</div>
                <div class="field-value">{password}</div>
            </div>
            
            <div class="field">
                <div class="field-name">{self.tr('创建时间')}</div>
                <div class="field-value timestamp">{created_time}</div>
            </div>
        </div>
        
        <div class="card">
            <h3 class="card-title">{self.tr('授权令牌')}</h3>
            
            <div class="field">
                <div class="field-name">{self.tr('访问令牌')}</div>
                <div class="token">{access_token if access_token else self.tr('未设置')}</div>
            </div>
            
            <div class="field">
                <div class="field-name">{self.tr('刷新令牌')}</div>
                <div class="token">{refresh_token if refresh_token else self.tr('未设置')}</div>
            </div>
        </div>
        """
        
        self.details_text.setHtml(html)
    
    def apply_account(self):
        """应用选中的账号"""
        # 获取当前选中的账号
        current_item = self.account_list.currentItem()
        if not current_item:
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("请先选择一个账号")
            )
            return
        
        # 获取文件路径
        filepath = current_item.data(Qt.UserRole)
        if not filepath or not os.path.exists(filepath):
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("账号文件路径无效")
            )
            return
        
        # 执行应用操作
        self.run_task(
            api_apply_saved_account,
            [filepath],
            {},
            self.tr("正在应用账号...")
        )
    
    def delete_account(self):
        """删除选中的账号"""
        # 获取当前选中的账号
        current_item = self.account_list.currentItem()
        if not current_item:
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("请先选择一个账号")
            )
            return
        
        # 获取文件路径
        filepath = current_item.data(Qt.UserRole)
        if not filepath or not os.path.exists(filepath):
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("账号文件路径无效")
            )
            return
        
        # 执行删除操作
        try:
            os.remove(filepath)
            logging.info(self.tr("已删除账号文件"))
            
            # 刷新列表
            self.load_account_list()
        except Exception as e:
            logging.error(f"{self.tr('删除账号文件失败')}: {str(e)}")
            QMessageBox.critical(
                self,
                self.tr("错误"),
                self.tr("删除账号文件失败") + f": {str(e)}"
            )
    
    def run_task(self, task_func, args, kwargs, start_message):
        """运行任务"""
        # 已经有线程在运行
        if self.worker_thread and self.worker_thread.isRunning():
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("操作正在进行中，请等待完成")
            )
            return
        
        # 记录开始消息
        logging.info(start_message)
        
        # 创建并启动工作线程
        self.worker_thread = WorkerThread(task_func, args, kwargs)
        self.worker_thread.progress_signal.connect(self.update_progress)
        self.worker_thread.finished_signal.connect(self.on_task_finished)
        self.worker_thread.start()
    
    def log(self, message, level="info"):
        """
        兼容旧的日志接口，现在使用logging模块记录日志
        
        Args:
            message: 日志消息
            level: 日志级别，可选值：info, success, warning, error
        """
        # 日志级别映射
        level_map = {
            "info": logging.INFO,
            "success": logging.INFO,
            "warning": logging.WARNING,
            "error": logging.ERROR
        }
        
        # 获取对应的日志级别
        log_level = level_map.get(level, logging.INFO)
        
        # 记录日志
        logging.log(log_level, message)
    
    def update_progress(self, value):
        """更新进度条"""
        self.progress_bar.setValue(value)
    
    def on_task_finished(self, success, message):
        """任务完成处理"""
        # 显示结果消息
        if success:
            # 记录成功日志
            logging.info(message)
            
            QMessageBox.information(
                self,
                self.tr("操作成功"),
                message
            )
            # 刷新账号列表
            self.load_account_list()
        else:
            # 记录错误日志
            logging.error(message)
            
            QMessageBox.critical(
                self,
                self.tr("操作失败"),
                message
            )
    
    def retranslate_ui(self):
        """更新界面翻译"""
        try:
            # 获取主布局
            main_layout = self.layout()
            if not main_layout or main_layout.count() == 0:
                logging.warning("主布局为空或没有控件")
                return
            
            # 更新描述文本
            info_label = main_layout.itemAt(0).widget()
            if info_label:
                info_label.setText(self.tr("管理已保存的Cursor账号，查看账号信息并应用到Cursor。"))
            
            # 获取内容容器
            if main_layout.count() > 1:
                content_container = main_layout.itemAt(1).widget()
                if not content_container:
                    logging.warning("内容容器不存在")
                    return
                
                content_layout = content_container.layout()
                if not content_layout or content_layout.count() == 0:
                    logging.warning("内容布局为空或没有控件")
                    return
                
                # 获取分割器
                splitter = content_layout.itemAt(0).widget()
                if splitter and splitter.count() >= 2:
                    # 更新左侧和右侧组件标题
                    account_group = splitter.widget(0)
                    details_group = splitter.widget(1)
                    
                    if account_group:
                        account_group.setTitle(self.tr("已保存账号"))
                        
                        # 更新账号列表下方的按钮
                        account_layout = account_group.layout()
                        if account_layout and account_layout.count() > 1:
                            buttons_layout = account_layout.itemAt(1).layout()
                            if buttons_layout and buttons_layout.count() >= 5:
                                help_button = buttons_layout.itemAt(0).widget()
                                refresh_button = buttons_layout.itemAt(1).widget()
                                delete_button = buttons_layout.itemAt(3).widget()
                                apply_button = buttons_layout.itemAt(4).widget()
                                
                                if help_button:
                                    help_button.setText(self.tr("操作指南"))
                                    self.help_button = help_button
                                    
                                if refresh_button:
                                    refresh_button.setText(self.tr("刷新"))
                                    self.refresh_button = refresh_button
                                    
                                if delete_button:
                                    delete_button.setText(self.tr("删除"))
                                    self.delete_button = delete_button
                                    
                                if apply_button:
                                    apply_button.setText(self.tr("应用账号"))
                                    self.apply_button = apply_button
                    
                    if details_group:
                        details_group.setTitle(self.tr("账号详情"))
                
                # 获取底部容器
                if content_layout.count() > 1:
                    bottom_container = content_layout.itemAt(1).widget()
                    if bottom_container:
                        bottom_layout = bottom_container.layout()
                        if bottom_layout and bottom_layout.count() > 0:
                            # 更新日志组标题
                            log_group = bottom_layout.itemAt(0).widget()
                            if log_group:
                                log_group.setTitle(self.tr("操作日志"))
                                
                                # 更新日志查看器
                                log_layout = log_group.layout()
                                if log_layout and log_layout.count() > 0:
                                    log_viewer = log_layout.itemAt(0).widget()
                                    if log_viewer:
                                        self.log_viewer = log_viewer
                                        self.log_viewer.retranslate_ui()
            
            # 如果当前选中了账号，刷新详情视图
            if self.account_list and self.account_list.currentItem():
                self.on_account_selected(self.account_list.currentItem(), None)
                
        except Exception as e:
            # 使用日志记录错误，而不是打印
            logging.error(f"重新翻译UI时出错: {str(e)}")
            # 追加异常堆栈信息以便调试
            logging.debug(f"异常详情: {traceback.format_exc()}")
    
    def show_help(self):
        """显示帮助信息"""
        help_text = self.tr(
            '<h3>账号管理操作指南</h3>'
            '<p><b>查看账号:</b></p>'
            '<ol>'
            '<li>在左侧列表中选择要查看的账号</li>'
            '<li>账号详情会显示在右侧面板中</li>'
            '</ol>'
            '<p><b>应用账号:</b></p>'
            '<ol>'
            '<li>在左侧列表中选择要应用的账号</li>'
            '<li>点击"应用账号"按钮</li>'
            '<li>确认操作后等待完成</li>'
            '</ol>'
            '<p><b>删除账号:</b></p>'
            '<ol>'
            '<li>在左侧列表中选择要删除的账号</li>'
            '<li>点击"删除账号"按钮</li>'
            '<li>确认删除操作</li>'
            '</ol>'
            '<p><b>刷新账号列表:</b></p>'
            '<ul>'
            '<li>点击"刷新"按钮更新账号列表</li>'
            '</ul>'
        )
        
        QMessageBox.information(
            self,
            self.tr("操作指南"),
            help_text
        ) 