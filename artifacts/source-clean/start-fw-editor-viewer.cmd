@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-fw-editor-viewer.ps1" %*
exit /b %ERRORLEVEL%
