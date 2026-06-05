@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-workbench.ps1" %*
exit /b %ERRORLEVEL%
