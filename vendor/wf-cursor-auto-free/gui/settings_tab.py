#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
设置标签页 - 提供应用程序设置功能
"""

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, 
    QGroupBox, QComboBox, QCheckBox, QMessageBox, QFormLayout
)
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QFont, QIcon

import os
import json

class SettingsTab(QWidget):
    """设置标签页类"""
    
    # 语言变更信号
    language_changed = pyqtSignal(str)
    
    def __init__(self, parent=None):
        """初始化设置标签页"""
        super().__init__(parent)
        self.parent = parent
        self.settings_file = "settings.json"
        self.settings = {
            "language": "zh_CN",
            "theme": "default",
            "auto_check_update": True,
            "log_level": "info"
        }
        self.init_ui()
        self.load_settings()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)
        
        # 添加标题
        title_label = QLabel(self.tr("应用设置"))
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title_label.setFont(title_font)
        main_layout.addWidget(title_label, 0, Qt.AlignCenter)
        
        # 添加说明文本
        info_label = QLabel(self.tr("配置应用程序的外观和行为。设置将在应用重启后完全生效。"))
        info_label.setWordWrap(True)
        main_layout.addWidget(info_label)
        
        # 语言设置组
        lang_group = QGroupBox(self.tr("语言设置"))
        lang_layout = QFormLayout()
        
        self.lang_combo = QComboBox()
        self.lang_combo.addItem("简体中文", "zh_CN")
        self.lang_combo.addItem("English", "en_US")
        self.lang_combo.currentIndexChanged.connect(self.language_selection_changed)
        
        lang_layout.addRow(self.tr("界面语言:"), self.lang_combo)
        
        lang_group.setLayout(lang_layout)
        main_layout.addWidget(lang_group)
        
        # 外观设置组
        appearance_group = QGroupBox(self.tr("外观设置"))
        appearance_layout = QFormLayout()
        
        self.theme_combo = QComboBox()
        self.theme_combo.addItem(self.tr("默认"), "default")
        self.theme_combo.addItem(self.tr("深色"), "dark")
        self.theme_combo.addItem(self.tr("浅色"), "light")
        
        appearance_layout.addRow(self.tr("主题:"), self.theme_combo)
        
        appearance_group.setLayout(appearance_layout)
        main_layout.addWidget(appearance_group)
        
        # 行为设置组
        behavior_group = QGroupBox(self.tr("行为设置"))
        behavior_layout = QVBoxLayout()
        
        self.auto_update_check = QCheckBox(self.tr("自动检查更新"))
        behavior_layout.addWidget(self.auto_update_check)
        
        log_layout = QHBoxLayout()
        log_label = QLabel(self.tr("日志级别:"))
        self.log_level_combo = QComboBox()
        self.log_level_combo.addItem("DEBUG", "debug")
        self.log_level_combo.addItem("INFO", "info")
        self.log_level_combo.addItem("WARNING", "warning")
        self.log_level_combo.addItem("ERROR", "error")
        
        log_layout.addWidget(log_label)
        log_layout.addWidget(self.log_level_combo)
        log_layout.addStretch()
        
        behavior_layout.addLayout(log_layout)
        
        behavior_group.setLayout(behavior_layout)
        main_layout.addWidget(behavior_group)
        
        # 操作按钮
        buttons_layout = QHBoxLayout()
        
        self.save_button = QPushButton(QIcon("icons/save.png"), self.tr("保存设置"))
        self.save_button.clicked.connect(self.save_settings)
        
        self.reset_button = QPushButton(QIcon("icons/reset.png"), self.tr("恢复默认"))
        self.reset_button.clicked.connect(self.reset_settings)
        
        buttons_layout.addStretch()
        buttons_layout.addWidget(self.save_button)
        buttons_layout.addWidget(self.reset_button)
        
        main_layout.addLayout(buttons_layout)
        
        # 添加弹性空间
        main_layout.addStretch(1)
        
        # 设置主布局
        self.setLayout(main_layout)
    
    def load_settings(self):
        """加载设置"""
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    loaded_settings = json.load(f)
                    self.settings.update(loaded_settings)
            
            # 应用加载的设置到UI
            self.apply_settings_to_ui()
            
        except Exception as e:
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("加载设置失败: ") + str(e)
            )
    
    def apply_settings_to_ui(self):
        """将设置应用到UI控件"""
        # 设置语言
        index = self.lang_combo.findData(self.settings["language"])
        if index >= 0:
            self.lang_combo.setCurrentIndex(index)
        
        # 设置主题
        theme_index = self.theme_combo.findData(self.settings["theme"])
        if theme_index >= 0:
            self.theme_combo.setCurrentIndex(theme_index)
        
        # 设置自动更新
        self.auto_update_check.setChecked(self.settings["auto_check_update"])
        
        # 设置日志级别
        log_index = self.log_level_combo.findData(self.settings["log_level"])
        if log_index >= 0:
            self.log_level_combo.setCurrentIndex(log_index)
    
    def save_settings(self):
        """保存设置"""
        try:
            # 从UI获取设置
            self.settings["language"] = self.lang_combo.currentData()
            self.settings["theme"] = self.theme_combo.currentData()
            self.settings["auto_check_update"] = self.auto_update_check.isChecked()
            self.settings["log_level"] = self.log_level_combo.currentData()
            
            # 保存到文件
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, indent=4)
            
            QMessageBox.information(
                self,
                self.tr("成功"),
                self.tr("设置已保存。部分设置将在重启程序后生效。")
            )
            
        except Exception as e:
            QMessageBox.warning(
                self,
                self.tr("警告"),
                self.tr("保存设置失败: ") + str(e)
            )
    
    def reset_settings(self):
        """重置设置为默认值"""
        reply = QMessageBox.question(
            self,
            self.tr("确认操作"),
            self.tr("确定要将所有设置恢复为默认值吗？"),
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            self.settings = {
                "language": "zh_CN",
                "theme": "default",
                "auto_check_update": True,
                "log_level": "info"
            }
            
            # 更新UI
            self.apply_settings_to_ui()
            
            # 保存到文件
            self.save_settings()
    
    def language_selection_changed(self, index):
        """处理语言选择变更"""
        language = self.lang_combo.itemData(index)
        if language != self.settings["language"]:
            reply = QMessageBox.question(
                self,
                self.tr("语言更改"),
                self.tr("语言设置将在保存后立即应用，是否继续？"),
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.Yes
            )
            
            if reply == QMessageBox.Yes:
                # 立即更新设置
                self.settings["language"] = language
                
                # 尝试应用语言更改
                self.language_changed.emit(language)
            else:
                # 恢复之前的选择
                prev_index = self.lang_combo.findData(self.settings["language"])
                if prev_index >= 0:
                    self.lang_combo.setCurrentIndex(prev_index)
    
    def retranslate_ui(self):
        """更新UI文本翻译"""
        # 更新所有可翻译文本
        self.layout().itemAt(0).widget().setText(self.tr("应用设置"))
        self.layout().itemAt(1).widget().setText(self.tr("配置应用程序的外观和行为。设置将在应用重启后完全生效。"))
        
        # 语言设置组
        self.layout().itemAt(2).widget().setTitle(self.tr("语言设置"))
        
        # 外观设置组
        self.layout().itemAt(3).widget().setTitle(self.tr("外观设置"))
        self.theme_combo.setItemText(0, self.tr("默认"))
        self.theme_combo.setItemText(1, self.tr("深色"))
        self.theme_combo.setItemText(2, self.tr("浅色"))
        
        # 行为设置组
        self.layout().itemAt(4).widget().setTitle(self.tr("行为设置"))
        self.auto_update_check.setText(self.tr("自动检查更新"))
        
        # 按钮
        self.save_button.setText(self.tr("保存设置"))
        self.reset_button.setText(self.tr("恢复默认")) 