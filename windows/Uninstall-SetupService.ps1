#Requires -Version 5.1
#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
try {
    if(Get-Service KTPStudio -ErrorAction SilentlyContinue){
        & (Join-Path $PSScriptRoot 'Remove-Service.ps1') -Confirm:$false
    }
    exit 0
} catch {Write-Error $_ -ErrorAction Continue;exit 1}
