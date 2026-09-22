#Requires -Version 5.1
[CmdletBinding()]
param([string]$InstallDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
$service=Get-Service -Name KTPStudio -ErrorAction Stop
if($service.Status -ne 'Running'){throw 'Service KTPStudio belum berjalan. Jalankan Start-Service KTPStudio sebagai Administrator.'}
$log=Join-Path $InstallDir 'logs\KTPStudio.out.log'
$deadline=(Get-Date).AddSeconds(20)
do {
    if(Test-Path -LiteralPath $log){
        $text=Get-Content -LiteralPath $log -Raw -Encoding UTF8
        $links=[regex]::Matches([string]$text,'https://[0-9.]+:[0-9]+/#owner=[A-Za-z0-9_-]+')
        if($links.Count -gt 0){
            Start-Process $links[$links.Count-1].Value
            return
        }
    }
    Start-Sleep -Milliseconds 500
} while((Get-Date) -lt $deadline)
throw "Server belum siap. Periksa $InstallDir\logs\KTPStudio.err.log dan KTPStudio.wrapper.log."
