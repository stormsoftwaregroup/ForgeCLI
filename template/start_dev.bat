@echo off
echo ========================================
echo  Unicorn Forge Express - Dev Startup
echo ========================================
echo.

echo Installing dependencies...
cd /d "%~dp0"
call npm install
if %errorlevel% neq 0 (
    echo npm install failed!
    pause
    exit /b 1
)
echo.

echo Starting server...
start "Server - localhost:3001" cmd /k "cd /d "%~dp0server" && npm run dev"

echo Starting client...
start "Client - localhost:5173" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo Both services starting in separate windows.
echo   Client: http://localhost:5173
echo   Server: http://localhost:3001
echo.
