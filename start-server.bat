@echo off
chcp 65001 >nul
title خادم الأرشيف المحلي
cd /d "%~dp0"

echo.
echo ═══════════════════════════════════════
echo   🖥️  خادم الأرشيف المحلي
echo ═══════════════════════════════════════
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js غير مثبت على هذا الجهاز!
    echo 📥 حمّل نسخة LTS من: https://nodejs.org/
    pause
    exit /b 1
)

:: ملف الإعدادات
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo ⚠️ تم إنشاء ملف .env من النموذج. راجع قيمه ثم أعد التشغيل.
        notepad ".env"
        pause
        exit /b 0
    )
)

:: ملف المستخدمين
if not exist "users.json" (
    echo ❌ ملف users.json غير موجود بجانب الخادم.
    pause
    exit /b 1
)

:: تحويل كلمات المرور النصية القديمة إن وجدت
node tools\migrate-users.js

if not exist "node_modules" (
    echo 📦 جاري تثبيت المكتبات لأول مرة...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo ❌ فشل التثبيت!
        pause
        exit /b 1
    )
)

echo 🚀 جاري تشغيل الخادم...
node server.js

echo.
echo ⏹️ توقف الخادم.
pause
