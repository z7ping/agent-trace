' AI Tool Tracker - 后台启动器 (Windows)
' 用法: wscript start-server.vbs [port]
' 通过 cmd.exe 创建隐藏的后台进程，无黑窗口

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' 获取脚本所在目录
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' 获取端口参数
port = 37215
If WScript.Arguments.Count > 0 Then
    port = WScript.Arguments(0)
End If

' 设置工作目录到脚本所在目录
objShell.CurrentDirectory = strDir

' 通过 cmd.exe /c start /b 启动，避免直接 Run 的引号问题
' cmd.exe 本身隐藏（WindowStyle 0），start /b 创建无窗口子进程
objShell.Run "cmd.exe /c start /b node server.js " & port & " --daemon", 0, False
