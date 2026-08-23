#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
首页标签 - 显示主要功能和欢迎信息
"""

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, 
    QGroupBox, QGridLayout, QSpacerItem, QSizePolicy
)
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QFont, QPixmap, QIcon

class HomeTab(QWidget):
    """首页标签类"""
    
    # 信号定义
    switch_tab_signal = pyqtSignal(int)
    
    def __init__(self, parent=None):
        """初始化首页标签"""
        super().__init__(parent)
        self.parent = parent
        self.init_ui()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)
        
        # 添加标题
        title_layout = QHBoxLayout()
        title_label = QLabel(self.tr("Cursor Pro 工具箱"))
        title_font = QFont()
        title_font.setPointSize(24)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignCenter)
        
        # 添加Logo (如果存在)
        try:
            logo_label = QLabel()
            logo_pixmap = QPixmap("icons/cursor.png")
            if not logo_pixmap.isNull():
                logo_label.setPixmap(logo_pixmap.scaled(64, 64, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                title_layout.addWidget(logo_label, 0, Qt.AlignRight)
        except:
            pass  # 没有logo图片也没关系
            
        title_layout.addWidget(title_label, 1)
        main_layout.addLayout(title_layout)
        
        # 添加欢迎信息
        welcome_label = QLabel(self.tr("欢迎使用Cursor Pro图形界面工具。请选择下方功能开始使用。"))
        welcome_label.setWordWrap(True)
        welcome_label.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(welcome_label)
        
        # 创建功能区
        features_group = QGroupBox(self.tr("可用功能"))
        features_layout = QGridLayout()
        features_layout.setSpacing(10)
        
        # 功能按钮样式
        button_style = """
        QPushButton {
            min-height: 100px;
            font-size: 16px;
            font-weight: bold;
            text-align: center;
        }
        """
        
        # 添加功能按钮
        reset_btn = QPushButton(QIcon("icons/reset.png"), self.tr("重置机器码"))
        reset_btn.setStyleSheet(button_style)
        reset_btn.clicked.connect(lambda: self.switch_tab_signal.emit(1))
        
        register_btn = QPushButton(QIcon("icons/register.png"), self.tr("注册账号"))
        register_btn.setStyleSheet(button_style)
        register_btn.clicked.connect(lambda: self.switch_tab_signal.emit(2))
        
        account_btn = QPushButton(QIcon("icons/account.png"), self.tr("账号管理"))
        account_btn.setStyleSheet(button_style)
        account_btn.clicked.connect(lambda: self.switch_tab_signal.emit(3))
        
        env_btn = QPushButton(QIcon("icons/env.png"), self.tr("环境配置"))
        env_btn.setStyleSheet(button_style)
        env_btn.clicked.connect(lambda: self.switch_tab_signal.emit(4))
        
        about_btn = QPushButton(QIcon("icons/about.png"), self.tr("关于"))
        about_btn.setStyleSheet(button_style)
        about_btn.clicked.connect(lambda: self.switch_tab_signal.emit(5))
        
        # 添加按钮到网格布局
        features_layout.addWidget(reset_btn, 0, 0)
        features_layout.addWidget(register_btn, 0, 1)
        features_layout.addWidget(account_btn, 1, 0)
        features_layout.addWidget(env_btn, 1, 1)
        features_layout.addWidget(about_btn, 2, 0, 1, 2)  # 修改为跨两列
        
        features_group.setLayout(features_layout)
        main_layout.addWidget(features_group)
        
        # 添加弹性空间
        main_layout.addItem(QSpacerItem(20, 40, QSizePolicy.Minimum, QSizePolicy.Expanding))
        
        # 设置主布局
        self.setLayout(main_layout)
        
        # 连接信号
        self.switch_tab_signal.connect(self.parent.tabs.setCurrentIndex)
    
    def retranslate_ui(self):
        """更新UI文本翻译"""
        # 此处更新所有可翻译文本
        # 更安全的方式更新文本，避免索引错误
        try:
            # 标题标签
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.layout(), QHBoxLayout) and item.layout().count() > 0:
                    for j in range(item.layout().count()):
                        widget = item.layout().itemAt(j).widget()
                        if isinstance(widget, QLabel) and widget.font().pointSize() > 20:
                            widget.setText(self.tr("Cursor Pro 工具箱"))
                            break
            
            # 欢迎信息
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.widget(), QLabel) and not item.widget().font().bold():
                    item.widget().setText(self.tr("欢迎使用Cursor Pro图形界面工具。请选择下方功能开始使用。"))
                    break
            
            # 功能组标题
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.widget(), QGroupBox):
                    item.widget().setTitle(self.tr("可用功能"))
                    
                    # 更新按钮文本
                    grid_layout = item.widget().layout()
                    if isinstance(grid_layout, QGridLayout):
                        # 重置机器码按钮
                        button = grid_layout.itemAtPosition(0, 0).widget()
                        if button: button.setText(self.tr("重置机器码"))
                        
                        # 注册账号按钮
                        button = grid_layout.itemAtPosition(0, 1).widget()
                        if button: button.setText(self.tr("注册账号"))
                        
                        # 账号管理按钮
                        button = grid_layout.itemAtPosition(1, 0).widget()
                        if button: button.setText(self.tr("账号管理"))
                        
                        # 环境配置按钮
                        button = grid_layout.itemAtPosition(1, 1).widget()
                        if button: button.setText(self.tr("环境配置"))
                        
                        # 关于按钮
                        button = grid_layout.itemAtPosition(2, 0).widget()
                        if button: button.setText(self.tr("关于"))
                    break
            
        except Exception as e:
            print(f"翻译UI时出错: {str(e)}") 