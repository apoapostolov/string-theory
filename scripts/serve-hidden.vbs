' Launches the String Theory supervisor with no console window.
' argument "open" also opens the browser once the server answers.
Option Explicit

Dim shell, fso, root, args, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root

args = ""
Dim i
For i = 0 To WScript.Arguments.Count - 1
  args = args & " " & WScript.Arguments(i)
Next

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder root & "\data"

cmd = "cmd /c node """ & root & "\scripts\serve.mjs""" & args
shell.Run cmd, 0, False
