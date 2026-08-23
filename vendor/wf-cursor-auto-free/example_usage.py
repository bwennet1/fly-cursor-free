#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
示例程序：演示如何使用重构后的cursor_pro_keep_alive.py API接口
"""

import sys
import time
from cursor_pro_keep_alive import (
    api_reset_machine_id,
    api_complete_registration,
    api_sign_up_only,
    api_disable_auto_update,
    api_apply_saved_account,
    api_get_account_info,
    api_save_account_info,
    api_update_cursor_auth,
    api_start_cursor
)

def show_menu():
    """显示操作菜单"""
    print("\n===== Cursor Pro API 使用示例 =====")
    print("1. 仅重置机器码")
    print("2. 完整注册流程")
    print("3. 仅注册账号")
    print("4. 禁用自动更新")
    print("5. 选择并应用已保存的账号")
    print("6. 指定账号文件应用")
    print("7. 获取随机账号信息")
    print("8. 手动保存账号信息")
    print("9. 手动更新认证信息")
    print("0. 退出程序")
    print("==================================")

def main():
    """主函数"""
    while True:
        show_menu()
        try:
            choice = int(input("\n请输入选项: ").strip())
            
            if choice == 0:
                print("程序退出")
                break
                
            elif choice == 1:
                print("执行: 仅重置机器码")
                result = api_reset_machine_id()
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 2:
                print("执行: 完整注册流程")
                result = api_complete_registration()
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 3:
                print("执行: 仅注册账号")
                result = api_sign_up_only()
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 4:
                print("执行: 禁用自动更新")
                result = api_disable_auto_update()
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 5:
                print("执行: 选择并应用已保存的账号")
                result = api_apply_saved_account()
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 6:
                filepath = input("请输入账号文件路径: ").strip()
                print(f"执行: 应用指定账号文件 '{filepath}'")
                result = api_apply_saved_account(filepath)
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 7:
                print("执行: 获取随机账号信息")
                account_info = api_get_account_info()
                print("\n随机账号信息:")
                for key, value in account_info.items():
                    print(f"  {key}: {value}")
                    
            elif choice == 8:
                email = input("请输入邮箱: ").strip()
                password = input("请输入密码: ").strip()
                access_token = input("请输入访问令牌(可选): ").strip() or ""
                refresh_token = input("请输入刷新令牌(可选): ").strip() or ""
                
                print(f"执行: 手动保存账号信息 '{email}'")
                result = api_save_account_info(email, password, access_token, refresh_token)
                print(f"操作结果: {'成功' if result else '失败'}")
                
            elif choice == 9:
                email = input("请输入邮箱: ").strip()
                access_token = input("请输入访问令牌: ").strip()
                refresh_token = input("请输入刷新令牌: ").strip()
                
                print(f"执行: 手动更新认证信息 '{email}'")
                result = api_update_cursor_auth(email, access_token, refresh_token)
                print(f"操作结果: {'成功' if result else '失败'}")
                
            else:
                print("无效选项，请重新输入")
                
            # 操作后的间隔
            time.sleep(1)
                
        except ValueError:
            print("请输入有效的数字选项")
        except KeyboardInterrupt:
            print("\n程序被用户中断")
            break
        except Exception as e:
            print(f"操作出错: {str(e)}")

if __name__ == "__main__":
    main() 