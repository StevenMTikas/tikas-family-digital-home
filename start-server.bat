@echo off
REM Starts the Tikas Family Digital Home production server.
REM Run by a Windows Task Scheduler task (see Future_Ideas.md for the
REM planned upgrade to a true Windows Service via NSSM) so the app comes up
REM automatically whenever this Windows account logs in, without needing a
REM terminal window left open.
cd /d "D:\Python\Projects\TikasFamilyDigitalHome\tikas-family-digital-home"
"C:\Program Files\nodejs\npm.cmd" start >> server.log 2>&1
