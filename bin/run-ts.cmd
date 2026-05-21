@echo off
setlocal

REM Input args
set "ROLLUP_INPUT=%~1"
set "ROLLUP_OUTPUT_FILE=%~2"

REM Validate args
if "%ROLLUP_INPUT%"=="" (
    echo Missing input file
    exit /b 1
)

if "%ROLLUP_OUTPUT_FILE%"=="" (
    echo Missing output file
    exit /b 1
)

REM Export env vars for rollup.executor.js
set "ROLLUP_INPUT=%ROLLUP_INPUT%"
set "ROLLUP_OUTPUT_FILE=%ROLLUP_OUTPUT_FILE%"

REM Run Rollup
call rollup -c rollup.executor.js

REM Stop if Rollup failed
if errorlevel 1 (
    echo Rollup build failed
    exit /b 1
)

REM Ensure output exists
if not exist "%ROLLUP_OUTPUT_FILE%" (
    echo Output file not found: %ROLLUP_OUTPUT_FILE%
    exit /b 1
)

REM Execute built file
echo Running built file: %ROLLUP_OUTPUT_FILE%
echo -------------------------------
echo.
call node "%ROLLUP_OUTPUT_FILE%"
