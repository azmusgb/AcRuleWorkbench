@echo off
echo [DEPRECATED] Use scripts\start-fw-editor-viewer.ps1 or ..\start-fw-editor-viewer.cmd instead.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-workbench.ps1" %*
exit /b %ERRORLEVEL%
