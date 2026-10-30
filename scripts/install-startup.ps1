# Registers the String Theory server to start at logon, and adds a desktop
# shortcut that starts it if needed and then opens the browser.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1 -Remove
#
# The task runs wscript.exe against scripts\serve-hidden.vbs, so there is no
# console window, and it restarts the supervisor if node exits.

[CmdletBinding()]
param([switch]$Remove)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$taskName = 'String Theory'
$vbs = Join-Path $root 'scripts\serve-hidden.vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$userId = "$env:USERDOMAIN\$env:USERNAME"
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'String Theory.lnk'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force }
    Write-Host "Removed the startup task and the desktop shortcut."
    return
}

if (-not (Test-Path $vbs)) { throw "Missing launcher: $vbs" }
if (-not (Test-Path (Join-Path $root 'node_modules'))) { throw "Run npm install first." }

$action = New-ScheduledTaskAction -Execute $wscript -Argument "`"$vbs`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'String Theory local server, hot reload mode.' `
    -Force | Out-Null

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcutPath)
$link.TargetPath = $wscript
$link.Arguments = "`"$vbs`" open"
$link.WorkingDirectory = $root
$link.WindowStyle = 7
$link.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$link.Description = 'String Theory string rewriting studio'
$link.Save()

Write-Host "Registered '$taskName' at logon for $userId."
Write-Host "Desktop shortcut: $shortcutPath"
Write-Host "Start it now with: Start-ScheduledTask -TaskName '$taskName'"
