# Resolve the version a release workflow should pass to release.ps1.
# Prints one x.y.z version on the success stream.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ModuleManifest,

    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump = 'patch',

    [string]$Version = '',

    [switch]$PublishOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ModuleManifest -PathType Leaf)) {
    throw "module.json was not found at '$ModuleManifest'."
}

$Manifest = Get-Content -LiteralPath $ModuleManifest -Raw | ConvertFrom-Json
$CurrentText = [string]$Manifest.version
if ($CurrentText -notmatch '^\d+\.\d+\.\d+$') {
    throw "module.json version '$CurrentText' is not x.y.z."
}

$Explicit = if ($null -eq $Version) { '' } else { $Version.Trim() }
if (-not [string]::IsNullOrWhiteSpace($Explicit) -and $Explicit -notmatch '^\d+\.\d+\.\d+$') {
    throw "version must be x.y.z. Received '$Explicit'."
}

if ($PublishOnly) {
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
        Write-Output $Explicit
        return
    }
    Write-Output $CurrentText
    return
}

if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
    Write-Output $Explicit
    return
}

$Current = [version]$CurrentText
$Resolved = switch ($Bump) {
    'patch' { '{0}.{1}.{2}' -f $Current.Major, $Current.Minor, ($Current.Build + 1) }
    'minor' { '{0}.{1}.0' -f $Current.Major, ($Current.Minor + 1) }
    'major' { '{0}.0.0' -f ($Current.Major + 1) }
    default { throw "Unknown bump '$Bump'. Use patch, minor, or major." }
}
Write-Output $Resolved
