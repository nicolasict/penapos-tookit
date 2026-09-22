#Requires -Version 5.1
#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
# This installer runs Windows PowerShell 5.1. Do not inherit PS7 module paths
# from GitHub Actions or another launching application. Process-local only.
if($PSVersionTable.PSEdition -eq 'Desktop'){
    $env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
}

try {
    if(Get-Service KTPStudio -ErrorAction SilentlyContinue){
        & (Join-Path $PSScriptRoot 'Remove-Service.ps1') -Confirm:$false
    }
    exit 0
} catch {Write-Error $_ -ErrorAction Continue;exit 1}
