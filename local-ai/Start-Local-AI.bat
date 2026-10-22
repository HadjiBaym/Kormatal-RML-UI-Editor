@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Local-AI.ps1" -Backend cpu
pause
