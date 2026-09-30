@echo off
chcp 65001 > nul
title PTT MacShop 行情分析儀表板 - 啟動中...

:: 切換至 bat 檔所在目錄
cd /d "%~dp0"

echo ============================================================
echo   正在啟動 PTT MacShop 行情分析本地儀表板...
echo   網址: http://localhost:8000/web/
echo ============================================================
echo.

python run.py --serve-only

pause
