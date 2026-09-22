# Read only explicitly named installer logs; never collect certificates or keys.
$paths=@((Join-Path $env:RUNNER_TEMP 'penaprint-setup.log'))
foreach($base in @($env:ProgramFiles,${env:ProgramFiles(x86)})){
    foreach($name in @('setup-service.log','setup-bootstrap.log','service-rollback.log')){
        if($base){$paths+=Join-Path $base "PENAPRINT-TOOLKIT/$name"}
    }
}
$paths+=@(Get-ChildItem "$env:ProgramData/KTPStudio/logs/*.log" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$destination=Join-Path $env:RUNNER_TEMP 'penaprint-diagnostics'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$found=0
foreach($path in ($paths | Select-Object -Unique)){
    if(Test-Path -LiteralPath $path){
        $found++
        $lines=Get-Content -LiteralPath $path -ErrorAction Continue | ForEach-Object {
            $_ -replace '(#owner=|#token=)[A-Za-z0-9_-]+','$1[REDACTED]'
        }
        $lines | Set-Content -LiteralPath (Join-Path $destination "$found-$(Split-Path $path -Leaf)") -Encoding UTF8
        Write-Host "Installer diagnostic: $path"
        $lines | Select-Object -Last 200 | Write-Host
    }
}
if(-not $found){Write-Host 'Tidak ada log installer ditemukan; installer mungkin gagal sebelum menjalankan skrip service.'}
