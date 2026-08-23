#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
关于标签页 - 显示应用程序信息和版权声明
"""

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, 
    QGroupBox, QTextBrowser, QSpacerItem, QSizePolicy
)
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtGui import QFont, QPixmap, QIcon

class AboutTab(QWidget):
    """关于标签页类"""
    
    def __init__(self, parent=None):
        """初始化关于标签页"""
        super().__init__(parent)
        self.parent = parent
        self.init_ui()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)
        
        # 添加标题和Logo
        title_layout = QHBoxLayout()
        
        # Logo部分
        try:
            logo_label = QLabel()
            logo_pixmap = QPixmap("icons/cursor.png")
            if not logo_pixmap.isNull():
                logo_label.setPixmap(logo_pixmap.scaled(64, 64, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                title_layout.addWidget(logo_label, 0, Qt.AlignRight)
        except:
            pass  # 没有logo图片不报错，继续执行
        
        # 标题部分
        title_label = QLabel(self.tr("Cursor Pro"))
        title_font = QFont()
        title_font.setPointSize(24)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_layout.addWidget(title_label, 1, Qt.AlignCenter)
        
        main_layout.addLayout(title_layout)
        
        # 版本信息
        version_label = QLabel(self.tr("版本: 1.0.4"))
        version_label.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(version_label)
        
        # 应用描述
        desc_group = QGroupBox(self.tr("应用程序描述"))
        desc_layout = QVBoxLayout()
        
        description = QTextBrowser()
        description.setOpenExternalLinks(True)
        description.setHtml(self.tr("""
        <p><strong>Cursor Pro</strong> 是一款专为Cursor用户设计的工具，提供了多种实用功能：</p>
        <ul>
            <li>重置机器码 - 解决授权过期问题</li>
            <li>账号注册 - 自动注册Cursor账号</li>
            <li>账号管理 - 管理已保存的账号信息</li>
            <li>环境配置 - 管理.env环境变量文件</li>
        </ul>
        <p>本工具旨在简化Cursor用户的日常使用体验，提高工作效率。</p>
        """))
        description.setMinimumHeight(150)
        desc_layout.addWidget(description)
        
        desc_group.setLayout(desc_layout)
        main_layout.addWidget(desc_group)
        
        # 作者信息
        author_group = QGroupBox(self.tr("作者信息"))
        author_layout = QVBoxLayout()
        
        author_info = QTextBrowser()
        author_info.setOpenExternalLinks(True)
        author_info.setHtml(self.tr("""
        <p><strong>开发者:</strong> WangFFei</p>
        <p><strong>微信联系方式:</strong> wf-5569</p>
        <p><strong>QQ交流群:</strong> 996321868</p>
        <p><strong>项目GitHub地址:</strong> <a href="https://github.com/wangffei/wf-cursor-auto-free">https://github.com/wangffei/wf-cursor-auto-free</a></p>
        """))
        
        author_layout.addWidget(author_info)
        author_group.setLayout(author_layout)
        main_layout.addWidget(author_group)
        
        # 版权信息
        copyright_group = QGroupBox(self.tr("版权和许可"))
        copyright_layout = QVBoxLayout()
        
        copyright_info = QTextBrowser()
        copyright_info.setOpenExternalLinks(True)
        copyright_info.setHtml(self.tr("""
        <p>版权所有 © 2023-2024 WF Cursor Pro Team</p>
        <p>本软件按"原样"提供，不提供任何形式的明示或暗示担保。</p>
        <p>使用本软件的风险由用户自行承担。</p>
        """))
        
        copyright_layout.addWidget(copyright_info)
        copyright_group.setLayout(copyright_layout)
        main_layout.addWidget(copyright_group)
        
        # 添加弹性空间
        main_layout.addItem(QSpacerItem(20, 20, QSizePolicy.Minimum, QSizePolicy.Expanding))
        
        # 设置主布局
        self.setLayout(main_layout)
    
    def retranslate_ui(self):
        """更新UI文本翻译"""
        try:
            # 标题部分
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.layout(), QHBoxLayout):
                    for j in range(item.layout().count()):
                        widget = item.layout().itemAt(j).widget()
                        if isinstance(widget, QLabel) and widget.font().pointSize() > 20:
                            widget.setText(self.tr("Cursor Pro"))
                            break
                    break
            
            # 版本信息
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.widget(), QLabel) and "版本" in item.widget().text():
                    item.widget().setText(self.tr("版本: 1.0.4"))
                    break
            
            # 应用描述组
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.widget(), QGroupBox) and "描述" in item.widget().title():
                    item.widget().setTitle(self.tr("应用程序描述"))
                    # 更新描述文本
                    desc_layout = item.widget().layout()
                    if desc_layout and desc_layout.count() > 0:
                        browser = desc_layout.itemAt(0).widget()
                        if isinstance(browser, QTextBrowser):
                            browser.setHtml(self.tr("""
                            <p><strong>Cursor Pro</strong> 是一款专为Cursor用户设计的工具，提供了多种实用功能：</p>
                            <ul>
                                <li>重置机器码 - 解决授权过期问题</li>
                                <li>账号注册 - 自动注册Cursor账号</li>
                                <li>账号管理 - 管理已保存的账号信息</li>
                                <li>环境配置 - 管理.env环境变量文件</li>
                            </ul>
                            <p>本工具旨在简化Cursor用户的日常使用体验，提高工作效率。</p>
                            """))
                    break
            
            # 作者信息组
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.widget(), QGroupBox) and "作者" in item.widget().title():
                    item.widget().setTitle(self.tr("作者信息"))
                    # 更新作者信息文本
                    author_layout = item.widget().layout()
                    if author_layout and author_layout.count() > 0:
                        browser = author_layout.itemAt(0).widget()
                        if isinstance(browser, QTextBrowser):
                            browser.setHtml(self.tr("""
                            <p><strong>开发者:</strong> WangFFei</p>
                            <p><strong>微信联系方式:</strong> wf-5569</p>
                            <p><strong>QQ交流群:</strong> 996321868</p>
                            <p><strong>项目GitHub地址:</strong> <a href="https://github.com/wangffei/wf-cursor-auto-free">https://github.com/wangffei/wf-cursor-auto-free</a></p>
                            """))
                    break
            
            # 版权信息组
            for i in range(self.layout().count()):
                item = self.layout().itemAt(i)
                if isinstance(item.widget(), QGroupBox) and "版权" in item.widget().title():
                    item.widget().setTitle(self.tr("版权和许可"))
                    # 更新版权信息文本
                    copyright_layout = item.widget().layout()
                    if copyright_layout and copyright_layout.count() > 0:
                        browser = copyright_layout.itemAt(0).widget()
                        if isinstance(browser, QTextBrowser):
                            browser.setHtml(self.tr("""
                            <p>版权所有 © 2023-2024 WF Cursor Pro Team</p>
                            <p>本软件按"原样"提供，不提供任何形式的明示或暗示担保。</p>
                            <p>使用本软件的风险由用户自行承担。</p>
                            """))
                    break
                    
        except Exception as e:
            print(f"About标签页翻译UI时出错: {str(e)}") 