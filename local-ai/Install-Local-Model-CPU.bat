@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Local-Model.ps1" -Backend cpu
if errorlevel 1 echo Установка завершилась с ошибкой.
pause
