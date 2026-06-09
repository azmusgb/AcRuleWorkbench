@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-fw-editor-viewer.ps1" %*
exit /b %ERRORLEVEL%
