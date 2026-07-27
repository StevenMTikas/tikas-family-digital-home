@echo off
REM Runs the 5-minute reminder-check tick as its own Windows Scheduled Task —
REM see scheduler-hourly.bat's comment for why this is decoupled from the
REM web server process instead of running through Next.js's instrumentation.ts.
cd /d "D:\Python\Projects\TikasFamilyDigitalHome\tikas-family-digital-home"
"C:\Program Files\nodejs\npx.cmd" tsx scripts/scheduler-reminders.ts >> scheduler-reminders.log 2>&1
