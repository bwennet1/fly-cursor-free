@echo off
setlocal
cd /d "%~dp0.."
if not exist "vendor\cursor-auto-gui\requirements.txt" (
    echo Error: vendor\cursor-auto-gui\requirements.txt not found.
    exit /b 1
)
where python >nul 2>&1
if %ERRORLEVEL%==0 (
    python -m pip install -r vendor\cursor-auto-gui\requirements.txt
    exit /b %ERRORLEVEL%
)
where python3 >nul 2>&1
if %ERRORLEVEL%==0 (
    python3 -m pip install -r vendor\cursor-auto-gui\requirements.txt
    exit /b %ERRORLEVEL%
)
echo Error: python or python3 not found. Install Python 3.8+ first.
exit /b 1
