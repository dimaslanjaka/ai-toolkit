@echo off
setlocal EnableDelayedExpansion

echo Stopping any running 9router processes...

:: Kill by exact image name (if 9router.exe exists)
taskkill /F /IM "9router.exe" /T 2>nul

:: Also kill any Node process running 9router (in case it's a CLI script)
for /f "tokens=2 delims=," %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH') do (
    wmic process where "ProcessId=%%~a" get CommandLine 2>nul | find /i "9router" >nul && (
        taskkill /F /PID %%~a /T 2>nul
    )
)

:: Wait a moment to ensure file handles are released
timeout /t 1 /nobreak >nul

echo Installing 9router...
npm install -g 9router --prefer-online --allow-scripts=9router

if %errorlevel% neq 0 (
    echo.
    echo Installation failed with error %errorlevel%.
    pause
    exit /b %errorlevel%
)

echo.
echo 9router installed successfully.
pause