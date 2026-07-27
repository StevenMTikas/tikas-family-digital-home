@echo off
REM Runs the hourly scheduler tick (Guardian/Advisor/backup/purge) as its own
REM Windows Scheduled Task, decoupled from the web server process. See
REM scripts/scheduler-hourly.ts's header comment for why this replaced
REM Next.js's instrumentation.ts (a genuine, unresolved Next.js production
REM bug — see docs/07_Development/Future_Ideas.md).
cd /d "D:\Python\Projects\TikasFamilyDigitalHome\tikas-family-digital-home"
"C:\Program Files\nodejs\npx.cmd" tsx scripts/scheduler-hourly.ts >> scheduler-hourly.log 2>&1
