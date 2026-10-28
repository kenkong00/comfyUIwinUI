@echo off
chcp 65001 >nul
echo ========================================
echo    角色生成器 - 启动中...
echo ========================================
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [1/5] 正在安装依赖...
    call npm install
    echo.
) else (
    echo [1/5] 依赖已安装，跳过安装步骤
    echo.
)

:: 清理可能残留的端口占用（3007/3006/5177）
echo [2/5] 清理残留端口占用...
for %%P in (3007 3006 5177) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul

echo [3/5] 启动后端服务...
start /b node server/api-server.js
timeout /t 2 /nobreak >nul

echo [4/5] 启动下载服务...
start /b node server/download-server.js
timeout /t 2 /nobreak >nul

echo [5/5] 启动前端服务...
echo.
echo ========================================
echo    所有服务已启动！
echo ========================================
echo.
echo 前端地址: http://localhost:5177
echo 后端地址: http://localhost:3007
echo 下载服务: http://localhost:3006
echo.
echo 关闭此窗口将停止所有服务。
echo.

node node_modules/vite/bin/vite.js --port 5177 --host
