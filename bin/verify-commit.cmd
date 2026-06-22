@echo off
REM verify-commit.cmd
REM Validate a commit message file against commitlint rules.
REM Usage: verify-commit.cmd "path\to\commit.txt"

setlocal enabledelayedexpansion

set "COMMIT_FILE=%~1"

if "%~1"=="" (
    echo Usage: %~nx0 "path\to\commit.txt"
    exit /b 1
)

echo Validating: %COMMIT_FILE%
@REM npx commitlint --edit "%COMMIT_FILE%" --verbose
call yarn exec commitlint --edit "%COMMIT_FILE%" --verbose
set "RESULT=!errorlevel!"

if !RESULT! equ 0 (
    echo.
    echo Validation passed. Run the following command to commit:
    echo git commit -F "!COMMIT_FILE!"
)

exit /b !RESULT!
