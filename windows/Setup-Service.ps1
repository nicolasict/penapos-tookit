#Requires -Version 5.1
#Requires -RunAsAdministrator
param([string]$IpAddress='')
$ErrorActionPreference='Stop'
$transcriptStarted=$false
try {
    Start-Transcript -Path (Join-Path $PSScriptRoot 'setup-service.log') -Force | Out-Null
    $transcriptStarted=$true
    if(-not $IpAddress){
        $network=Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up'} | Select-Object -First 1
        $IpAddress=($network.IPv4Address | Select-Object -First 1).IPAddress
        if(-not $IpAddress){throw 'Tidak ditemukan jaringan LAN/Wi-Fi. Hubungkan jaringan lalu jalankan installer kembali dengan alamat IPv4 komputer.'}
    }
    & (Join-Path $PSScriptRoot 'Install-Service.ps1') -IpAddress $IpAddress
    $service=Get-Service -Name KTPStudio -ErrorAction Stop
    $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running,[TimeSpan]::FromSeconds(30))
    $deadline=(Get-Date).AddSeconds(60)
    $log="$env:ProgramData\KTPStudio\logs\KTPStudio.out.log"
    do {
        if((Test-Path $log) -and (Select-String -Path $log -Pattern '#owner=' -Quiet)){exit 0}
        Start-Sleep -Milliseconds 500
    } while((Get-Date) -lt $deadline)
    throw 'Service belum siap setelah 60 detik. Periksa folder logs di ProgramData\KTPStudio.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {if($transcriptStarted){Stop-Transcript | Out-Null}}
