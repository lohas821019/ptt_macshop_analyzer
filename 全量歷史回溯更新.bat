@echo off
chcp 65001 > nul
title PTT MacShop iPhone / iPad mini 行情分析 - 全量歷史回溯

:: 切換至 bat 檔所在目錄
cd /d "%~dp0"

echo ============================================================
echo   PTT MacShop 二手行情分析系統 - 2 年全量歷史回溯更新
echo   (會逐頁掃描過去 2 年所有文章，耗時約 1~2 分鐘)
echo ============================================================
echo.

python run.py --full

pause
