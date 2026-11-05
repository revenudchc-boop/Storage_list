@echo off
chcp 65001 >nul
rem ============================================================
rem  نسخة احتياطية كاملة من مستودع الأرشيف (كل الملفات والتاريخ) - تحتاج Git
rem  شغّلها أسبوعياً. إن كان المستودع خاصاً سيطلب Git بيانات الدخول.
rem ============================================================
set REPO=https://github.com/markingdchc/marking.dchc.git
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set D=%%i
set DEST=%~dp0backups\marking.dchc-%D%.git
where git >nul 2>nul || (echo ❌ Git غير مثبّت. حمّله من https://git-scm.com ثم أعد التشغيل & pause & exit /b 1)
if not exist "%~dp0backups" mkdir "%~dp0backups"
echo ⏳ جارٍ النسخ إلى: %DEST%
git clone --mirror "%REPO%" "%DEST%" || (echo ❌ فشل النسخ & pause & exit /b 1)
powershell -NoProfile -Command "Compress-Archive -Path '%DEST%' -DestinationPath '%DEST%.zip' -Force" && rmdir /s /q "%DEST%"
echo ✅ تمت النسخة الاحتياطية: %DEST%.zip
echo للاستعادة: فك الضغط ثم  git clone marking.dchc-%D%.git  أو ادفعها لمستودع جديد بـ git push --mirror
pause
