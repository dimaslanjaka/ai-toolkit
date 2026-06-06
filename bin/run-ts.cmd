@echo off
setlocal
set SCRIPT_DIR=%~dp0

@REM echo Running script: %~f0

node "%SCRIPT_DIR%run-ts.cjs" %*
