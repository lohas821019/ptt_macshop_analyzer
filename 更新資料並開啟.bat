@echo off
chcp 65001 > nul
title PTT MacShop iPhone / iPad mini 行情分析 - 增量更新

:: 切換至 bat 檔所在目錄
cd /d "%~dp0"

echo ============================================================
echo   PTT MacShop 二手行情分析系統 - 增量極速更新
echo   (僅檢查新貼文，遇到已快取文章自動早停，數秒內完成)
echo ============================================================
echo.

python run.py

pause
