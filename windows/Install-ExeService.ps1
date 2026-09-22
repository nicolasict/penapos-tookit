#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$IpAddress,
    [ValidateRange(1024,65535)][int]$Port=8443,
    [string]$InstallDir="$env:ProgramData\KTPStudio"
)
$ErrorActionPreference='Stop'
$parsedIp=$null
if(-not [Net.IPAddress]::TryParse($IpAddress,[ref]$parsedIp) -or $parsedIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){
    throw 'IpAddress harus berupa IPv4 komputer Windows, misalnya 192.168.0.52.'
}
if(-not (Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -eq $IpAddress)){
    throw 'IP tidak ditemukan pada komputer ini. Gunakan alamat Wi-Fi/LAN komputer Windows.'
}
if(Get-Service -Name KTPStudio -ErrorAction SilentlyContinue){throw 'Service KTPStudio sudah terpasang. Gunakan Restart-Service atau baca panduan pembaruan.'}
if(Test-Path -LiteralPath $InstallDir){throw "Folder tujuan sudah ada: $InstallDir. Gunakan folder kosong baru; file lama tidak ditimpa."}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw "Port $Port sedang dipakai. Hentikan server manual atau pilih port lain."}
$sourceRoot=$PSScriptRoot
$appFiles=@('KTPStudioServer.exe','KTPStudio.exe','Open-Portal.ps1','Remove-Service.ps1','README.md','WinSW-LICENSE.txt','QRCode-LICENSE.txt','SHA256SUMS.txt')
foreach($name in $appFiles){if(-not(Test-Path -LiteralPath (Join-Path $sourceRoot $name))){throw "File paket kurang: $name"}}

function Set-AppFolderAcl([string]$Path,[bool]$ServiceWrite){
    $acl=New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    $rights=@{
        'S-1-5-18'=[System.Security.AccessControl.FileSystemRights]::FullControl
        'S-1-5-32-544'=[System.Security.AccessControl.FileSystemRights]::FullControl
        'S-1-5-19'=[System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    }
    $operatorSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $rights[$operatorSid]=[System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    if($ServiceWrite){$rights['S-1-5-19']=[System.Security.AccessControl.FileSystemRights]::Modify}
    foreach($sid in $rights.Keys){
        $identity=[System.Security.Principal.SecurityIdentifier]::new($sid)
        $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($identity,$rights[$sid],[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

New-Item -ItemType Directory -Path $InstallDir | Out-Null
$InstallDir=(Resolve-Path -LiteralPath $InstallDir).Path
Set-AppFolderAcl $InstallDir $false
foreach($name in @('logs','.local-certs')){
    $folder=Join-Path $InstallDir $name
    New-Item -ItemType Directory -Path $folder | Out-Null
    Set-AppFolderAcl $folder $true
}
foreach($name in $appFiles){Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $InstallDir $name)}
$template=@"
<service>
  <id>KTPStudio</id>
  <name>PENAPRINT - TOOLKIT</name>
  <description>Portal cetak KTP dan kamera HP melalui HTTPS lokal.</description>
  <executable>%BASE%\KTPStudioServer.exe</executable>
  <arguments>--ip $IpAddress --port $Port</arguments>
  <workingdirectory>%BASE%</workingdirectory>
  <env name="PYTHONIOENCODING" value="utf-8" />
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <depend>Tcpip</depend>
  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
  <onfailure action="restart" delay="15 sec" />
  <stoptimeout>15 sec</stoptimeout>
  <logpath>%BASE%\logs</logpath>
  <log mode="reset" />
</service>
"@
[xml]$config=$template
$config.Save((Join-Path $InstallDir 'KTPStudio.xml'))
$wrapper=Join-Path $InstallDir 'KTPStudio.exe'
& $wrapper install
if($LASTEXITCODE -ne 0){throw 'WinSW gagal memasang service. Periksa file logs.'}
# Buka hanya port aplikasi untuk perangkat subnet lokal pada jaringan Private.
New-NetFirewallRule -Name 'KTPStudio-LAN' -DisplayName 'PENAPRINT - TOOLKIT HTTPS (LAN)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Private -Program (Join-Path $InstallDir 'KTPStudioServer.exe') | Out-Null
& $wrapper start
if($LASTEXITCODE -ne 0){throw 'Service gagal dimulai. Periksa folder logs.'}
Write-Host "Service dipasang: KTPStudio. Folder: $InstallDir"
Write-Host 'Buka portal menggunakan Open-Portal.ps1 di folder tersebut.'
Write-Host 'Percayai sertifikat lokal di Windows dan HP sebelum menggunakan kamera browser.'
