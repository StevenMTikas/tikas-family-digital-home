' Launches a batch file with a fully hidden window, for use by Windows Task
' Scheduler actions. Task Scheduler's own "Hidden" setting is unreliable for
' console-app actions on some systems; WScript.Shell.Run's windowStyle 0 is
' the standard, reliable workaround. Usage: wscript.exe run-hidden.vbs "<path-to-bat>"
Set objShell = CreateObject("WScript.Shell")
objShell.Run """" & WScript.Arguments(0) & """", 0, False
