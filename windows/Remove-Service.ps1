#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param([string]$InstallDir="$env:ProgramData\KTPStudio")
$ErrorActionPreference='Stop'
if($PSCmdlet.ShouldProcess('KTPStudio','Hentikan dan hapus service beserta aturan firewall')){
    $wrapper=Join-Path $InstallDir 'KTPStudio.exe'
    if(-not(Test-Path -LiteralPath $wrapper)){throw "Wrapper tidak ditemukan: $wrapper"}
    if(Get-Service KTPStudio -ErrorAction SilentlyContinue){
        Stop-Service KTPStudio
        & $wrapper uninstall
        if($LASTEXITCODE -ne 0){throw 'Gagal menghapus service.'}
    }
    Get-NetFirewallRule -Name 'KTPStudio-LAN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host 'Service dan aturan firewall dihapus. File aplikasi, log, dan sertifikat tetap disimpan.'
}
