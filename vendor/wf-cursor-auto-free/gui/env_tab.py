#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
环境配置标签页 - 提供.env文件操作和环境变量管理功能
"""

import os
import re
from datetime import datetime
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QHeaderView, QFileDialog,
    QMessageBox, QLineEdit, QGroupBox, QSplitter, QTextEdit,
    QDialog, QFormLayout, QDialogButtonBox
)
from PyQt5.QtCore import Qt, pyqtSignal, QSize
from PyQt5.QtGui import QIcon, QColor

class EnvVariableDialog(QDialog):
    """环境变量编辑对话框"""
    
    def __init__(self, parent=None, key="", value=""):
        """初始化对话框"""
        super().__init__(parent)
        self.setWindowTitle(self.tr("编辑环境变量"))
        self.resize(400, 150)
        
        # 创建表单布局
        form_layout = QFormLayout(self)
        
        # 创建控件
        self.key_edit = QLineEdit(key)
        self.value_edit = QLineEdit(value)
        
        # 添加表单项
        form_layout.addRow(self.tr("变量名:"), self.key_edit)
        form_layout.addRow(self.tr("变量值:"), self.value_edit)
        
        # 创建按钮
        self.button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)
        
        # 添加按钮到布局
        form_layout.addRow(self.button_box)
    
    def get_data(self):
        """返回用户输入的数据"""
        return self.key_edit.text(), self.value_edit.text()

class EnvTab(QWidget):
    """环境配置标签页"""
    
    # 定义信号
    log_message = pyqtSignal(str)
    env_changed = pyqtSignal()
    
    def __init__(self, parent=None):
        """初始化标签页"""
        super().__init__(parent)
        self.current_file = None
        self.env_data = {}
        self.modified = False
        
        # 初始化UI
        self.init_ui()
        
        # 尝试自动加载.env文件
        self.try_load_default_env()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建主布局
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # 创建分割器
        splitter = QSplitter(Qt.Vertical)
        
        # === 上部分: 文件操作区和表格区 ===
        top_widget = QWidget()
        top_layout = QVBoxLayout(top_widget)
        top_layout.setContentsMargins(0, 0, 0, 0)
        
        # 文件操作区
        file_group = QGroupBox(self.tr("文件操作"))
        file_layout = QHBoxLayout(file_group)
        
        # 文件路径显示
        self.file_path_label = QLabel(self.tr("当前文件: 未选择"))
        file_layout.addWidget(self.file_path_label, 1)
        
        # 文件操作按钮
        self.open_button = QPushButton(self.tr("打开"))
        self.open_button.clicked.connect(self.open_env_file)
        file_layout.addWidget(self.open_button)
        
        self.save_button = QPushButton(self.tr("保存"))
        self.save_button.clicked.connect(self.save_env_file)
        file_layout.addWidget(self.save_button)
        
        self.save_as_button = QPushButton(self.tr("另存为"))
        self.save_as_button.clicked.connect(self.save_env_as)
        file_layout.addWidget(self.save_as_button)
        
        self.new_button = QPushButton(self.tr("新建"))
        self.new_button.clicked.connect(self.new_env_file)
        file_layout.addWidget(self.new_button)
        
        # 将文件组添加到顶部布局
        top_layout.addWidget(file_group)
        
        # 表格操作区
        env_group = QGroupBox(self.tr("环境变量"))
        env_layout = QVBoxLayout(env_group)
        
        # 创建表格
        self.env_table = QTableWidget(0, 2)
        self.env_table.setHorizontalHeaderLabels([self.tr("变量名"), self.tr("变量值")])
        self.env_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.env_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.env_table.verticalHeader().setVisible(False)
        self.env_table.setAlternatingRowColors(True)
        self.env_table.itemChanged.connect(self.on_table_item_changed)
        
        # 添加表格到布局
        env_layout.addWidget(self.env_table)
        
        # 表格操作按钮
        buttons_layout = QHBoxLayout()
        
        self.add_button = QPushButton(self.tr("添加"))
        self.add_button.clicked.connect(self.add_env_variable)
        buttons_layout.addWidget(self.add_button)
        
        self.edit_button = QPushButton(self.tr("编辑"))
        self.edit_button.clicked.connect(self.edit_env_variable)
        buttons_layout.addWidget(self.edit_button)
        
        self.delete_button = QPushButton(self.tr("删除"))
        self.delete_button.clicked.connect(self.delete_env_variable)
        buttons_layout.addWidget(self.delete_button)
        
        self.reload_button = QPushButton(self.tr("重新加载"))
        self.reload_button.clicked.connect(self.reload_env_file)
        buttons_layout.addWidget(self.reload_button)
        
        # 添加按钮布局到环境变量组
        env_layout.addLayout(buttons_layout)
        
        # 添加环境变量组到顶部布局
        top_layout.addWidget(env_group)
        
        # === 下部分: 日志区 ===
        bottom_widget = QWidget()
        bottom_layout = QVBoxLayout(bottom_widget)
        bottom_layout.setContentsMargins(0, 0, 0, 0)
        
        # 日志组
        log_group = QGroupBox(self.tr("操作日志"))
        log_layout = QVBoxLayout(log_group)
        
        # 日志文本区域
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        log_layout.addWidget(self.log_text)
        
        # 清除日志按钮
        self.clear_log_button = QPushButton(self.tr("清除日志"))
        self.clear_log_button.clicked.connect(self.clear_log)
        log_layout.addWidget(self.clear_log_button)
        
        # 添加日志组到底部布局
        bottom_layout.addWidget(log_group)
        
        # 添加部件到分割器
        splitter.addWidget(top_widget)
        splitter.addWidget(bottom_widget)
        splitter.setSizes([600, 200])  # 设置初始大小比例
        
        # 添加分割器到主布局
        main_layout.addWidget(splitter)
        
        # 连接自身信号
        self.log_message.connect(self.add_log)
    
    def retranslate_ui(self):
        """更新UI文本翻译"""
        # 文件操作组
        self.file_path_label.setText(self.tr("当前文件: ") + (self.current_file if self.current_file else self.tr("未选择")))
        self.open_button.setText(self.tr("打开"))
        self.save_button.setText(self.tr("保存"))
        self.save_as_button.setText(self.tr("另存为"))
        self.new_button.setText(self.tr("新建"))
        
        # 环境变量操作
        self.env_table.setHorizontalHeaderLabels([self.tr("变量名"), self.tr("变量值")])
        self.add_button.setText(self.tr("添加"))
        self.edit_button.setText(self.tr("编辑"))
        self.delete_button.setText(self.tr("删除"))
        self.reload_button.setText(self.tr("重新加载"))
        
        # 日志操作
        self.clear_log_button.setText(self.tr("清除日志"))
    
    def try_load_default_env(self):
        """尝试加载默认的.env文件，如果不存在则创建"""
        default_env = ".env"
        if os.path.exists(default_env):
            self.load_env_file(default_env)
            self.log_message.emit(self.tr(f"自动加载默认配置文件: {default_env}"))
        else:
            # 创建默认的.env文件
            self.log_message.emit(self.tr(f"默认配置文件不存在，正在创建: {default_env}"))
            self.current_file = default_env
            self.env_data = {
                "CURSOR_PRO_VERSION": "1.0.4",
                "DEBUG_MODE": "false",
                "LOG_LEVEL": "info"
            }
            self.save_env_data_to_file(default_env)
            self.update_env_table()
            self.file_path_label.setText(self.tr("当前文件: ") + default_env)
            self.modified = False
    
    def load_env_file(self, file_path):
        """加载环境变量文件"""
        if not os.path.exists(file_path):
            QMessageBox.warning(self, self.tr("错误"), self.tr(f"文件不存在: {file_path}"))
            return False
        
        try:
            self.env_data = {}
            
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
                for line in lines:
                    line = line.strip()
                    # 跳过空行和注释行
                    if not line or line.startswith('#'):
                        continue
                    
                    # 解析环境变量
                    match = re.match(r'^([^=]+)=(.*)$', line)
                    if match:
                        key = match.group(1).strip()
                        value = match.group(2).strip()
                        
                        # 去除值周围的引号
                        if (value.startswith('"') and value.endswith('"')) or \
                           (value.startswith("'") and value.endswith("'")):
                            value = value[1:-1]
                        
                        self.env_data[key] = value
            
            # 更新UI
            self.current_file = file_path
            self.file_path_label.setText(self.tr("当前文件: ") + file_path)
            self.update_env_table()
            self.modified = False
            
            self.log_message.emit(self.tr(f"已加载文件: {file_path}"))
            return True
            
        except Exception as e:
            QMessageBox.critical(self, self.tr("错误"), self.tr(f"加载文件失败: {str(e)}"))
            self.log_message.emit(self.tr(f"加载文件失败: {str(e)}"))
            return False
    
    def update_env_table(self):
        """更新环境变量表格"""
        # 断开信号连接，避免在填充表格时触发修改信号
        self.env_table.blockSignals(True)
        
        # 清空表格
        self.env_table.setRowCount(0)
        
        # 填充表格
        for i, (key, value) in enumerate(self.env_data.items()):
            self.env_table.insertRow(i)
            
            key_item = QTableWidgetItem(key)
            value_item = QTableWidgetItem(value)
            
            self.env_table.setItem(i, 0, key_item)
            self.env_table.setItem(i, 1, value_item)
        
        # 恢复信号连接
        self.env_table.blockSignals(False)
    
    def save_env_file(self):
        """保存环境变量文件"""
        if not self.current_file:
            return self.save_env_as()
        
        # 强制重新保存文件
        success = self.save_env_data_to_file(self.current_file)
        
        # 验证保存结果
        if success:
            self.log_message.emit(self.tr(f"成功保存到文件: {self.current_file}"))
            # 显示保存成功的对话框
            QMessageBox.information(self, self.tr("保存成功"), 
                self.tr(f"环境变量已成功保存到 {self.current_file}"))
        else:
            self.log_message.emit(self.tr(f"保存失败，请检查文件权限: {self.current_file}"))
        
        return success
    
    def save_env_data_to_file(self, file_path):
        """保存环境变量数据到文件"""
        try:
            # 确保目标文件所在目录存在
            directory = os.path.dirname(file_path)
            if directory and not os.path.exists(directory):
                os.makedirs(directory)
                self.log_message.emit(self.tr(f"创建目录: {directory}"))
            
            # 使用绝对路径处理文件
            abs_file_path = os.path.abspath(file_path)
            self.log_message.emit(self.tr(f"正在保存到文件: {abs_file_path}"))
            
            # 备份原文件（如果存在）
            if os.path.exists(abs_file_path):
                backup_file = f"{abs_file_path}.bak"
                try:
                    import shutil
                    shutil.copy2(abs_file_path, backup_file)
                    self.log_message.emit(self.tr(f"创建备份文件: {backup_file}"))
                except Exception as e:
                    self.log_message.emit(self.tr(f"创建备份文件失败: {str(e)}"))
            
            # 直接写入目标文件
            with open(abs_file_path, 'w', encoding='utf-8') as f:
                f.write("# 环境变量配置文件\n")
                f.write(f"# 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                
                for key, value in self.env_data.items():
                    # 如果值包含空格等特殊字符，则用引号包围
                    if ' ' in value or '\t' in value or '\n' in value or '"' in value or "'" in value:
                        # 优先使用双引号
                        if '"' not in value:
                            value = f'"{value}"'
                        else:
                            value = f"'{value}'"
                    
                    f.write(f"{key}={value}\n")
            
            # 验证文件是否确实被保存
            if not os.path.exists(abs_file_path):
                raise FileNotFoundError(f"无法创建文件: {abs_file_path}")
            
            # 尝试读取文件内容以验证写入是否成功
            with open(abs_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content:
                    raise IOError(f"文件内容为空，可能写入失败: {abs_file_path}")
            
            # 设置当前文件
            self.current_file = file_path
            self.file_path_label.setText(self.tr("当前文件: ") + file_path)
            self.modified = False
            
            self.log_message.emit(self.tr(f"成功保存文件: {abs_file_path}"))
            self.env_changed.emit()  # 发送环境变量已改变信号
            return True
            
        except Exception as e:
            error_msg = str(e)
            self.log_message.emit(self.tr(f"保存文件失败: {error_msg}"))
            QMessageBox.critical(self, self.tr("错误"), self.tr(f"保存文件失败: {error_msg}"))
            import traceback
            traceback_info = traceback.format_exc()
            self.log_message.emit(f"异常详情: {traceback_info}")
            return False
    
    def check_save_changes(self):
        """检查是否需要保存更改"""
        if not self.modified:
            return True
        
        reply = QMessageBox.question(
            self, 
            self.tr("保存更改"),
            self.tr("当前文件已修改，是否保存更改?"),
            QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel
        )
        
        if reply == QMessageBox.Save:
            return self.save_env_file()
        elif reply == QMessageBox.Cancel:
            return False
        
        return True  # 选择不保存
    
    # === 槽函数 ===
    
    def open_env_file(self):
        """打开环境变量文件"""
        if not self.check_save_changes():
            return
        
        options = QFileDialog.Options()
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            self.tr("打开环境变量文件"),
            "",
            self.tr("环境变量文件 (*.env);;所有文件 (*)"),
            options=options
        )
        
        if file_path:
            self.load_env_file(file_path)
    
    def save_env_as(self):
        """另存为环境变量文件"""
        options = QFileDialog.Options()
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            self.tr("保存环境变量文件"),
            "",
            self.tr("环境变量文件 (*.env);;所有文件 (*)"),
            options=options
        )
        
        if file_path:
            # 确保文件有.env扩展名
            if not file_path.lower().endswith('.env'):
                file_path += '.env'
            
            return self.save_env_data_to_file(file_path)
        
        return False
    
    def new_env_file(self):
        """新建环境变量文件"""
        if not self.check_save_changes():
            return
        
        self.current_file = None
        self.env_data = {}
        self.update_env_table()
        self.file_path_label.setText(self.tr("当前文件: 未选择"))
        self.modified = False
        
        self.log_message.emit(self.tr("新建环境变量文件"))
    
    def reload_env_file(self):
        """重新加载当前环境变量文件"""
        if not self.current_file:
            QMessageBox.warning(self, self.tr("错误"), self.tr("当前没有打开的文件"))
            return
        
        if not self.check_save_changes():
            return
        
        self.load_env_file(self.current_file)
    
    def add_env_variable(self):
        """添加环境变量"""
        dialog = EnvVariableDialog(self)
        
        if dialog.exec_() == QDialog.Accepted:
            key, value = dialog.get_data()
            
            # 检查键是否为空
            if not key:
                QMessageBox.warning(self, self.tr("错误"), self.tr("变量名不能为空"))
                return
            
            # 检查键是否已存在
            if key in self.env_data:
                reply = QMessageBox.question(
                    self, 
                    self.tr("覆盖确认"),
                    self.tr(f"变量 '{key}' 已存在，是否覆盖?"),
                    QMessageBox.Yes | QMessageBox.No
                )
                
                if reply != QMessageBox.Yes:
                    return
            
            # 更新数据
            self.env_data[key] = value
            self.update_env_table()
            self.modified = True
            
            self.log_message.emit(self.tr(f"添加环境变量: {key}={value}"))
    
    def edit_env_variable(self):
        """编辑环境变量"""
        # 获取当前选中的行
        selected_rows = self.env_table.selectedItems()
        
        if not selected_rows:
            QMessageBox.warning(self, self.tr("错误"), self.tr("请先选择一个变量"))
            return
        
        # 获取当前行的键和值
        row = selected_rows[0].row()
        key = self.env_table.item(row, 0).text()
        value = self.env_table.item(row, 1).text()
        
        # 打开编辑对话框
        dialog = EnvVariableDialog(self, key, value)
        
        if dialog.exec_() == QDialog.Accepted:
            new_key, new_value = dialog.get_data()
            
            # 检查键是否为空
            if not new_key:
                QMessageBox.warning(self, self.tr("错误"), self.tr("变量名不能为空"))
                return
            
            # 检查新键是否与其他键冲突
            if new_key != key and new_key in self.env_data:
                reply = QMessageBox.question(
                    self, 
                    self.tr("覆盖确认"),
                    self.tr(f"变量 '{new_key}' 已存在，是否覆盖?"),
                    QMessageBox.Yes | QMessageBox.No
                )
                
                if reply != QMessageBox.Yes:
                    return
            
            # 更新数据
            if new_key != key:
                del self.env_data[key]
            
            self.env_data[new_key] = new_value
            self.update_env_table()
            self.modified = True
            
            self.log_message.emit(self.tr(f"编辑环境变量: {key} -> {new_key}={new_value}"))
    
    def delete_env_variable(self):
        """删除环境变量"""
        # 获取当前选中的行
        selected_rows = self.env_table.selectedItems()
        
        if not selected_rows:
            QMessageBox.warning(self, self.tr("错误"), self.tr("请先选择一个变量"))
            return
        
        # 获取当前行的键
        row = selected_rows[0].row()
        key = self.env_table.item(row, 0).text()
        
        # 确认删除
        reply = QMessageBox.question(
            self, 
            self.tr("删除确认"),
            self.tr(f"确定要删除变量 '{key}' 吗?"),
            QMessageBox.Yes | QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            # 更新数据
            del self.env_data[key]
            self.update_env_table()
            self.modified = True
            
            self.log_message.emit(self.tr(f"删除环境变量: {key}"))
    
    def on_table_item_changed(self, item):
        """表格项目变更处理"""
        # 如果在更新表格时触发了此事件则忽略
        if self.env_table.signalsBlocked():
            return
        
        row = item.row()
        col = item.column()
        
        # 获取当前行的键和值
        key_item = self.env_table.item(row, 0)
        value_item = self.env_table.item(row, 1)
        
        if not key_item or not value_item:
            return
        
        key = key_item.text()
        value = value_item.text()
        
        # 检查键是否为空
        if col == 0 and not key:
            QMessageBox.warning(self, self.tr("错误"), self.tr("变量名不能为空"))
            
            # 恢复原键
            old_key = list(self.env_data.keys())[row]
            key_item.setText(old_key)
            return
        
        # 如果是键变更
        if col == 0:
            old_key = list(self.env_data.keys())[row]
            
            # 检查新键是否与其他键冲突
            if key != old_key and key in self.env_data:
                reply = QMessageBox.question(
                    self, 
                    self.tr("覆盖确认"),
                    self.tr(f"变量 '{key}' 已存在，是否覆盖?"),
                    QMessageBox.Yes | QMessageBox.No
                )
                
                if reply != QMessageBox.Yes:
                    # 恢复原键
                    key_item.setText(old_key)
                    return
                
                # 删除冲突的键
                del self.env_data[key]
            
            # 更新数据
            self.env_data[key] = self.env_data.pop(old_key)
            self.log_message.emit(self.tr(f"重命名环境变量: {old_key} -> {key}"))
        
        # 如果是值变更
        elif col == 1:
            old_value = self.env_data[key]
            self.env_data[key] = value
            self.log_message.emit(self.tr(f"修改环境变量值: {key}={value}"))
        
        self.modified = True
    
    def add_log(self, message):
        """添加日志消息"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.log_text.append(f"[{timestamp}] {message}")
    
    def clear_log(self):
        """清除日志"""
        self.log_text.clear()
        self.log_message.emit(self.tr("日志已清除")) 