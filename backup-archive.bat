@echo off
chcp 65001 >nul
:: نسخ احتياطي للأرشيف (يضيف الملفات الجديدة ولا يحذف شيئاً من النسخة). جدولته عبر Task Scheduler يومياً.
:: عدّل المسارين التاليين:
set SRC=\\10.0.182.128\database\archive
set DST=D:\archive-backup

robocopy "%SRC%" "%DST%" /E /XO /R:2 /W:5 /NP /LOG+:"%DST%\backup.log"
echo تم النسخ الاحتياطي.
