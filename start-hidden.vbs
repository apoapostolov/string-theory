' Start String Theory with no console window, then open it in the default browser.
' Output goes to data\server.log so a crash is still diagnosable.
Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
If Not fso.FolderExists(root & "\dist") Then
    MsgBox "The client is not built yet. Run: npm install; npm run build", 48, "String Theory"
    WScript.Quit 1
End If

shell.Run "cmd /c node server\index.mjs >> data\server.log 2>&1", 0, False
WScript.Sleep 1200
shell.Run "http://127.0.0.1:4317", 1, False
