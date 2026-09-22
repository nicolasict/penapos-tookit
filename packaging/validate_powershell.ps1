#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference='Stop'
$failed=$false
Get-ChildItem -LiteralPath $Package -Filter '*.ps1' | ForEach-Object {
    $tokens=$null;$parseErrors=$null
    [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$parseErrors) | Out-Null
    if($parseErrors.Count){$parseErrors | Write-Host;$failed=$true}
}
if($failed){exit 1}
Write-Host "PowerShell $($PSVersionTable.PSVersion) validation passed."
