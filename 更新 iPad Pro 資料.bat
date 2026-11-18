@echo off
chcp 65001 > nul
title PTT MacShop iPad Pro 行情分析 - 增量更新

:: 切換至 bat 檔所在目錄
cd /d "%~dp0"

echo ============================================================
echo   PTT MacShop 二手行情分析系統 - iPad Pro 專用增量更新
echo   (抓取 iPad Pro 新貼文 + 回查近 3 天售出狀態)
echo ============================================================
echo.

python run.py --ipad-pro-only --refresh-days 3

pause
