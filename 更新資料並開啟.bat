@echo off
chcp 65001 > nul
title PTT MacShop 行情分析 - 日常快速更新 (近3天狀態)

:: 切換至 bat 檔所在目錄
cd /d "%~dp0"

echo ============================================================
echo   PTT MacShop 二手行情分析系統 - 日常快速更新
echo   (抓取今日最新售盤 + 回查近 3 天售出狀態，約 10~15 秒完成)
echo ============================================================
echo.

python run.py --refresh-days 3

pause
