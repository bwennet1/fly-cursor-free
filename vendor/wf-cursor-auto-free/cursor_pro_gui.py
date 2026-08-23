#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# pyinstaller: --noconsole, --onefile, --name=CursorProGUI, --uac-admin, --add-data=turnstilePatch:turnstilePatch

"""
Cursor Pro GUI - 基于PyQt5的图形界面程序
用于调用cursor_pro_keep_alive.py提供的API功能
"""

import sys
import os
import logging
import platform

# 设置日志配置 - 打包后使用文件日志而非控制台
is_packaged = getattr(sys, 'frozen', False)
if is_packaged:
    # 运行在打包后的环境中，重定向日志到文件
    log_dir = os.path.join(os.path.expanduser('~'), 'CursorProGUI_logs')
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    log_file = os.path.join(log_dir, 'cursorpro_gui.log')
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
else:
    # 开发环境，使用控制台日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

# 提前导入管理员权限检查函数，这样如果有错误我们可以尽早捕获
try:
    from utils import is_admin
    # 记录权限状态
    if is_admin():
        logging.info("以管理员权限运行")
    else:
        logging.warning("未以管理员权限运行，某些功能可能受限")
except Exception as e:
    logging.error(f"导入权限检查模块时出错: {str(e)}")
    
# 导入PyQt5相关库
from PyQt5.QtWidgets import QApplication, QMainWindow, QTabWidget, QWidget, QVBoxLayout, QStatusBar, QLabel, QMessageBox
from PyQt5.QtCore import QTranslator, QLocale, QSettings, Qt
from PyQt5.QtGui import QIcon, QPalette, QColor

# 导入各个标签页
from gui.home_tab import HomeTab
from gui.reset_tab import ResetTab
from gui.register_tab import RegisterTab
from gui.account_tab import AccountTab
from gui.env_tab import EnvTab
from gui.about_tab import AboutTab

# 定义应用程序样式表
STYLE_SHEET = """
/* 全局样式 */
QWidget {
    font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
    font-size: 10pt;
}

/* 主窗口样式 */
QMainWindow {
    background-color: #f5f5f5;
}

/* 状态栏样式 */
QStatusBar {
    background-color: #1a73e8;
    color: white;
    font-weight: bold;
    padding: 3px 10px;
    border-top: 1px solid #0d47a1;
}

QStatusBar QLabel {
    color: white;
}

/* 标签页样式 */
QTabWidget::pane {
    border: 1px solid #cccccc;
    background-color: white;
    border-radius: 3px;
}

QTabBar::tab {
    background-color: #e0e0e0;
    color: #505050;
    min-width: 80px;
    padding: 8px 10px;
    margin-right: 2px;
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
}

QTabBar::tab:selected {
    background-color: white;
    color: #1a73e8;
    border: 1px solid #cccccc;
    border-bottom: 2px solid #1a73e8;
}

QTabBar::tab:hover:!selected {
    background-color: #d0d0d0;
}

/* 按钮样式 */
QPushButton {
    background-color: #1a73e8;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    min-height: 30px;
}

QPushButton:hover {
    background-color: #4285f4;
}

QPushButton:pressed {
    background-color: #0d47a1;
}

QPushButton:disabled {
    background-color: #cccccc;
    color: #888888;
}

/* 次要按钮样式 */
QPushButton[secondary="true"] {
    background-color: #e0e0e0;
    color: #505050;
    border: 1px solid #bbbbbb;
}

QPushButton[secondary="true"]:hover {
    background-color: #d0d0d0;
}

/* 分组框样式 */
QGroupBox {
    border: 1px solid #cccccc;
    border-radius: 4px;
    margin-top: 1.5ex;
    font-weight: bold;
    color: #404040;
}

QGroupBox::title {
    subcontrol-origin: margin;
    subcontrol-position: top left;
    padding: 0 5px;
    color: #1a73e8;
}

/* 文本编辑区域样式 */
QTextEdit {
    background-color: white;
    border: 1px solid #cccccc;
    border-radius: 3px;
    padding: 2px;
}

QTextEdit:focus {
    border: 1px solid #4285f4;
}

/* 行编辑样式 */
QLineEdit {
    background-color: white;
    border: 1px solid #cccccc;
    border-radius: 3px;
    padding: 5px;
    selection-background-color: #4285f4;
}

QLineEdit:focus {
    border: 1px solid #4285f4;
}

/* 列表部件样式 */
QListWidget {
    background-color: white;
    border: 1px solid #cccccc;
    border-radius: 3px;
    alternate-background-color: #f9f9f9;
}

QListWidget::item {
    padding: 5px;
    border-bottom: 1px solid #f0f0f0;
}

QListWidget::item:selected {
    background-color: #e7f0fd;
    color: #1a73e8;
    border-left: 3px solid #1a73e8;
}

QListWidget::item:hover:!selected {
    background-color: #f5f5f5;
}

/* 进度条样式 */
QProgressBar {
    border: 1px solid #cccccc;
    border-radius: 3px;
    background-color: #f0f0f0;
    color: #404040;
    text-align: center;
}

QProgressBar::chunk {
    background-color: #1a73e8;
    border-radius: 2px;
}

/* 标签样式 */
QLabel {
    color: #404040;
}

QLabel[heading="true"] {
    font-size: 14pt;
    font-weight: bold;
    color: #1a73e8;
}

/* 单选按钮样式 */
QRadioButton {
    spacing: 8px;
}

QRadioButton::indicator {
    width: 16px;
    height: 16px;
}

/* 滚动条样式 */
QScrollBar:vertical {
    border: none;
    background-color: #f0f0f0;
    width: 10px;
    margin: 0px;
}

QScrollBar::handle:vertical {
    background-color: #c0c0c0;
    min-height: 20px;
    border-radius: 5px;
}

QScrollBar::handle:vertical:hover {
    background-color: #a0a0a0;
}

QScrollBar:horizontal {
    border: none;
    background-color: #f0f0f0;
    height: 10px;
    margin: 0px;
}

QScrollBar::handle:horizontal {
    background-color: #c0c0c0;
    min-width: 20px;
    border-radius: 5px;
}

QScrollBar::handle:horizontal:hover {
    background-color: #a0a0a0;
}
"""

class CursorProGUI(QMainWindow):
    """Cursor Pro GUI主窗口类"""
    
    def __init__(self):
        """初始化主窗口"""
        super().__init__()
        self.setWindowTitle("Cursor Pro")
        self.setWindowIcon(QIcon(os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons", "logo.png")))
        
        # 设置翻译器
        self.translator = QTranslator()
        
        # 设置窗口基本属性
        self.settings = QSettings("CursorPro", "CursorProGUI")
        
        # 初始化UI
        self.init_ui()
        
        # 初始化语言设置
        self.init_language()
        
        # 恢复窗口大小和位置
        if self.settings.contains("window/geometry"):
            self.restoreGeometry(self.settings.value("window/geometry"))
        else:
            # 如果没有存储的大小/位置，则居中显示窗口
            self.center_window()
    
    def init_ui(self):
        """初始化用户界面"""
        # 创建标签页控件
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)  # 更现代的标签页外观
        self.tabs.setTabPosition(QTabWidget.North)
        
        # 添加各功能标签页
        self.home_tab = HomeTab(self)
        self.reset_tab = ResetTab(self)
        self.register_tab = RegisterTab(self)
        self.account_tab = AccountTab(self)
        self.env_tab = EnvTab(self)
        self.about_tab = AboutTab(self)
        
        # 将标签页添加到标签页控件
        self.tabs.addTab(self.home_tab, self.tr("首页"))
        self.tabs.addTab(self.reset_tab, self.tr("重置机器码"))
        self.tabs.addTab(self.register_tab, self.tr("注册账号"))
        self.tabs.addTab(self.account_tab, self.tr("账号管理"))
        self.tabs.addTab(self.env_tab, self.tr("环境配置"))
        self.tabs.addTab(self.about_tab, self.tr("关于"))
        
        # 设置中心部件
        self.setCentralWidget(self.tabs)
        
        # 创建状态栏
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        
        # 设置默认状态消息
        self.statusBar.showMessage(self.tr("就绪 - 访问「关于」标签页获取更多信息"))
    
    def center_window(self):
        """将窗口置于屏幕中央"""
        frame_geometry = self.frameGeometry()
        screen_center = QApplication.desktop().availableGeometry().center()
        frame_geometry.moveCenter(screen_center)
        self.move(frame_geometry.topLeft())
    
    def init_language(self):
        """初始化语言设置"""
        # 获取当前语言设置
        current_locale = self.settings.value("language", QLocale.system().name())
        self.change_language(current_locale)
    
    def change_language(self, locale):
        """
        切换应用程序语言
        
        Args:
            locale: 语言/地区代码(如 'zh_CN', 'en_US')
        """
        # 加载翻译文件
        if locale in ['zh_CN', 'zh-CN', 'zh']:
            translation_loaded = self.translator.load("translations/cursor_pro_zh_CN.qm")
        else:
            translation_loaded = self.translator.load("translations/cursor_pro_en_US.qm")
        
        # 应用翻译
        if translation_loaded:
            QApplication.installTranslator(self.translator)
        else:
            QApplication.removeTranslator(self.translator)
        
        # 保存语言设置
        self.settings.setValue("language", locale)
        
        # 刷新UI文本
        self.retranslate_ui()
    
    def retranslate_ui(self):
        """更新UI文本翻译"""
        # 更新标签页标题
        self.tabs.setTabText(0, self.tr("首页"))
        self.tabs.setTabText(1, self.tr("重置机器码"))
        self.tabs.setTabText(2, self.tr("注册账号"))
        self.tabs.setTabText(3, self.tr("账号管理"))
        self.tabs.setTabText(4, self.tr("环境配置"))
        self.tabs.setTabText(5, self.tr("关于"))
        
        # 更新窗口标题
        self.setWindowTitle(self.tr("Cursor Pro GUI"))
        
        # 更新状态栏消息
        self.statusBar.showMessage(self.tr("就绪 - 访问「关于」标签页获取更多信息"))
        
        # 更新各标签页翻译
        self.home_tab.retranslate_ui()
        self.reset_tab.retranslate_ui()
        self.register_tab.retranslate_ui()
        self.account_tab.retranslate_ui()
        self.env_tab.retranslate_ui()
        self.about_tab.retranslate_ui()
    
    def update_status(self, message):
        """更新状态栏消息"""
        self.statusBar.showMessage(message)
    
    def closeEvent(self, event):
        """窗口关闭事件处理"""
        # 保存窗口大小和位置
        self.settings.setValue("window/geometry", self.saveGeometry())
        # 接受关闭事件
        event.accept()

def main():
    """主函数入口"""
    try:
        # 记录应用启动信息
        is_frozen = getattr(sys, 'frozen', False)
        current_platform = platform.system()
        logging.info(f"应用启动 - 打包状态: {'已打包' if is_frozen else '开发环境'}, 平台: {current_platform}")
        
        # 处理管理员权限
        from utils import is_admin
        admin_status = is_admin()
        
        # 创建应用程序实例
        app = QApplication(sys.argv)
        
        # 如果未以管理员权限运行且不是打包状态，显示警告
        # 注意：如果是打包状态，打包器设置应该已经请求了管理员权限
        if not admin_status and not is_frozen:
            msg_box = QMessageBox()
            msg_box.setIcon(QMessageBox.Warning)
            msg_box.setWindowTitle("权限警告")
            msg_box.setText("应用程序未以管理员权限运行，部分功能可能不可用。")
            msg_box.setInformativeText("要获得完整功能，请以管理员身份运行此应用程序。")
            msg_box.setStandardButtons(QMessageBox.Ok | QMessageBox.Cancel)
            
            # 用户选择取消，则退出
            if msg_box.exec_() == QMessageBox.Cancel:
                return 1
        
        # 平台特定设置
        if current_platform == 'Darwin':  # macOS
            app.setAttribute(Qt.AA_UseHighDpiPixmaps)
            app.setAttribute(Qt.AA_DontUseNativeMenuBar, True)
            
            # 如果是打包后的应用，设置应用名称
            if is_frozen:
                app.setApplicationName("CursorProGUI")
                
        # 应用样式表
        app.setStyleSheet(STYLE_SHEET)
        
        # 创建主窗口
        window = CursorProGUI()
        
        # 根据管理员状态更新状态栏
        if admin_status:
            window.update_status("以管理员权限运行")
        else:
            window.update_status("警告：未以管理员权限运行，部分功能可能受限")
        
        # 显示主窗口
        window.show()
        logging.info("应用主窗口已显示")
        
        # 运行应用程序事件循环
        return app.exec_()
    except Exception as e:
        logging.error(f"应用启动失败: {str(e)}")
        logging.exception("发生异常:")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 