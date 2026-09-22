#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $Installer).Path,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Installer syntax error'}
$function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Set-AppFolderAcl'},$true)
if(-not $function){throw 'ACL function not found'}
# Load only the real ACL function, without installing a service.
. ([scriptblock]::Create($function.Extent.Text))
$root=Join-Path ([IO.Path]::GetTempPath()) ('penaprint-acl-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
try {
    $PSModuleAutoLoadingPreference='None'
    foreach($writable in @($false,$true)){
        Set-AppFolderAcl $root $writable
        $acl=[IO.DirectoryInfo]::new($root).GetAccessControl()
        if(-not $acl.AreAccessRulesProtected){throw 'ACL inheritance was not disabled'}
        $rules=$acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])
        $serviceRule=$rules | Where-Object {$_.IdentityReference.Value -eq 'S-1-5-19'}
        $expected=if($writable){[Security.AccessControl.FileSystemRights]::Modify}else{[Security.AccessControl.FileSystemRights]::ReadAndExecute}
        if(-not $serviceRule -or ($serviceRule.FileSystemRights -band $expected) -ne $expected){throw 'LocalService permissions incorrect'}
        if(-not $writable -and ($serviceRule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)){throw 'Application directory unexpectedly writable'}
    }
    Write-Host 'ACL checks passed without module autoload: protected inheritance, read-only application, writable service data.'
} finally {
    [IO.Directory]::Delete($root,$true)
}
