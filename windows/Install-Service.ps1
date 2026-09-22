#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$IpAddress,
    [Parameter(Mandatory=$true)][string]$PythonPath,
    [Parameter(Mandatory=$true)][string]$OpenSSLPath,
    [Parameter(Mandatory=$true)][string]$WinSWPath,
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
foreach($file in @($PythonPath,$OpenSSLPath,$WinSWPath)){
    if(-not (Test-Path -LiteralPath $file -PathType Leaf)){throw "File tidak ditemukan: $file"}
}
$PythonPath=(Resolve-Path -LiteralPath $PythonPath).Path
$OpenSSLPath=(Resolve-Path -LiteralPath $OpenSSLPath).Path
$WinSWPath=(Resolve-Path -LiteralPath $WinSWPath).Path
if($PythonPath -like '*\WindowsApps\*' -or $PythonPath -like '*\AppData\*'){
    throw 'Gunakan Python yang dipasang untuk semua pengguna, bukan alias WindowsApps atau instalasi dalam AppData.'
}
& $PythonPath -c 'import sys; assert sys.version_info >= (3,9), "Python minimal 3.9"'
if($LASTEXITCODE -ne 0){throw 'Python gagal dijalankan atau versinya terlalu lama.'}
& $OpenSSLPath version
if($LASTEXITCODE -ne 0){throw 'OpenSSL gagal dijalankan.'}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw "Port $Port sedang dipakai. Hentikan server manual atau pilih port lain."}
$sourceRoot=Split-Path -Parent $PSScriptRoot
# Hanya salin file aplikasi yang diperlukan; jangan menyalin kunci/API atau seluruh workspace.
$appFiles=@('server.py','index.html','app.js','style.css','pairing.js','phone.html','phone.js','phone.css','perspective.js','camera-help.html','template-data.js','README.md','vendor\qrcode.min.js','vendor\qrcode.LICENSE')
foreach($name in $appFiles){if(-not(Test-Path -LiteralPath (Join-Path $sourceRoot $name))){throw "File aplikasi kurang: $name"}}

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
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'vendor') | Out-Null
foreach($name in $appFiles){Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $InstallDir $name)}
Copy-Item -LiteralPath $WinSWPath -Destination (Join-Path $InstallDir 'KTPStudio.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Open-Portal.ps1') -Destination $InstallDir
$template=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'KTPStudio.xml.template') -Raw
$template=$template.Replace('@@PYTHON@@',[Security.SecurityElement]::Escape($PythonPath)).Replace('@@OPENSSL_DIR@@',[Security.SecurityElement]::Escape((Split-Path -Parent $OpenSSLPath))).Replace('@@IP@@',$IpAddress).Replace('@@PORT@@',[string]$Port)
[xml]$config=$template
$config.Save((Join-Path $InstallDir 'KTPStudio.xml'))
$wrapper=Join-Path $InstallDir 'KTPStudio.exe'
& $wrapper install
if($LASTEXITCODE -ne 0){throw 'WinSW gagal memasang service. Periksa file logs.'}
# Buka hanya port aplikasi untuk perangkat subnet lokal pada jaringan Private.
New-NetFirewallRule -Name 'KTPStudio-LAN' -DisplayName 'PENAPRINT - TOOLKIT HTTPS (LAN)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Private -Program $PythonPath | Out-Null
& $wrapper start
if($LASTEXITCODE -ne 0){throw 'Service gagal dimulai. Periksa folder logs.'}
Write-Host "Service dipasang: KTPStudio. Folder: $InstallDir"
Write-Host 'Buka portal menggunakan Open-Portal.ps1 di folder tersebut.'
Write-Host 'Percayai sertifikat lokal di Windows dan HP sebelum menggunakan kamera browser.'
