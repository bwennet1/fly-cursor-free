@echo off
setlocal
cd /d "%~dp0.."
if not exist "vendor\cursor-auto-gui\main.py" (
    echo Error: vendor\cursor-auto-gui\main.py not found.
    exit /b 1
)
cd vendor\cursor-auto-gui
where python >nul 2>&1
if %ERRORLEVEL%==0 (
    python main.py %*
    exit /b %ERRORLEVEL%
)
where python3 >nul 2>&1
if %ERRORLEVEL%==0 (
    python3 main.py %*
    exit /b %ERRORLEVEL%
)
echo Error: python or python3 not found. Install Python 3.8+ first.
exit /b 1
