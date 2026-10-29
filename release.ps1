# Standard Morelord Foundry module release workflow.
# This file is intentionally shared across Morelord module repositories.
# Project-specific values live in release.config.json.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$CommitMessage,

    [Parameter(Mandatory = $false)]
    [switch]$Prerelease,

    [Parameter(Mandatory = $false)]
    [switch]$Draft,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [switch]$ValidateOnly,

    [Parameter(Mandatory = $false)]
    [switch]$SkipWebsitePublish,

    [Parameter(Mandatory = $false)]
    [switch]$SkipFoundryPublish,

    [Parameter(Mandatory = $false)]
    [switch]$WebsiteOnly,

    [Parameter(Mandatory = $false)]
    [switch]$FoundryOnly,

    [Parameter(Mandatory = $false)]
    [string]$WebsiteUrl,

    [Parameter(Mandatory = $false)]
    [string]$WebsiteToken,

    [Parameter(Mandatory = $false)]
    [string]$FoundryToken,

    [Parameter(Mandatory = $false)]
    [string]$ReleaseNotesPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ProjectRoot 'release.config.json'
$ManifestPath = Join-Path $ProjectRoot 'module.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$OriginalManifestText = $null
$ManifestWasModified = $false
$CommitWasCreated = $false
$TagWasCreated = $false
$PushCompleted = $false
$GitHubReleaseCreated = $false
$FoundryReleasePublished = $false


function Import-ProjectEnv {
    param(
        [string]$Path = (Join-Path $PSScriptRoot ".env")
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Write-Host "Loading project environment from .env..." -ForegroundColor DarkGray

    foreach ($RawLine in Get-Content -LiteralPath $Path) {
        $Line = $RawLine.Trim()

        if ([string]::IsNullOrWhiteSpace($Line) -or $Line.StartsWith("#")) {
            continue
        }

        $Parts = $Line -split "=", 2
        if ($Parts.Count -ne 2) {
            continue
        }

        $Name = $Parts[0].Trim()
        $Value = $Parts[1].Trim()

        if ([string]::IsNullOrWhiteSpace($Name)) {
            continue
        }

        if (
            ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
            ($Value.StartsWith("'") -and $Value.EndsWith("'"))
        ) {
            $Value = $Value.Substring(1, $Value.Length - 2)
        }

        # Project .env is authoritative for local release configuration.
        # An explicit -WebsiteToken parameter is handled separately and still
        # takes precedence over RELEASE_PUBLISH_TOKEN.
        [Environment]::SetEnvironmentVariable(
            $Name,
            $Value,
            "Process"
        )
    }
}

Import-ProjectEnv

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ''
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Assert-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Command)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Required command '$Command' was not found."
    }
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    & $Command
    if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

function Get-GitOutput {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    $Output = & $Command
    if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
    return ($Output | Out-String).Trim()
}

function Get-RequiredConfigValue {
    param(
        [Parameter(Mandatory = $true)][psobject]$Config,
        [Parameter(Mandatory = $true)][string]$Name
    )
    $Property = $Config.PSObject.Properties[$Name]
    if ($null -eq $Property -or [string]::IsNullOrWhiteSpace([string]$Property.Value)) {
        throw "release.config.json is missing required property '$Name'."
    }
    return [string]$Property.Value
}

function Set-JsonProperty {
    param(
        [Parameter(Mandatory = $true)][psobject]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $false)]$Value
    )
    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.$Name = $Value
    }
    else {
        $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    }
}

function Assert-Utf8JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    $Bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($Bytes.Length -eq 0) { throw "JSON file '$Path' is empty." }
    $HasBom = $Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF
    if ($HasBom) { throw "JSON file '$Path' contains a UTF-8 BOM." }
    $Text = [System.IO.File]::ReadAllText($Path)
    try { $null = $Text | ConvertFrom-Json } catch { throw "JSON file '$Path' is invalid: $($_.Exception.Message)" }
}

function Assert-Manifest {
    param(
        [Parameter(Mandatory = $true)][psobject]$Manifest,
        [Parameter(Mandatory = $true)][string]$ExpectedModuleId
    )
    foreach ($Property in @('id', 'title', 'version', 'compatibility')) {
        if ($Manifest.PSObject.Properties.Name -notcontains $Property) {
            throw "module.json is missing required property '$Property'."
        }
    }
    if ($Manifest.id -ne $ExpectedModuleId) {
        throw "module.json id '$($Manifest.id)' does not match '$ExpectedModuleId'."
    }
    if ($Manifest.version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Current module.json version '$($Manifest.version)' is not supported by this release script."
    }
    if (-not $Manifest.compatibility.minimum) {
        throw 'module.json compatibility.minimum is missing.'
    }
    $Minimum = 0
    if (-not [int]::TryParse([string]$Manifest.compatibility.minimum, [ref]$Minimum)) {
        throw "module.json compatibility.minimum '$($Manifest.compatibility.minimum)' is not numeric."
    }
    if ($Minimum -lt 13) { throw 'Morelord modules must require Foundry VTT v13 or later.' }
}

function Test-RemoteTagExists {
    param([Parameter(Mandatory = $true)][string]$Tag)
    $PreviousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        git ls-remote --exit-code --tags origin "refs/tags/$Tag" *> $null
        return $LASTEXITCODE -eq 0
    }
    finally { $ErrorActionPreference = $PreviousPreference }
}

function Test-GitHubReleaseExists {
    param(
        [Parameter(Mandatory = $true)][string]$Tag,
        [Parameter(Mandatory = $true)][string]$Repository
    )
    $PreviousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        gh release view $Tag --repo $Repository *> $null
        return $LASTEXITCODE -eq 0
    }
    finally { $ErrorActionPreference = $PreviousPreference }
}

function Update-ManifestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)][string]$DownloadUrl,
        [Parameter(Mandatory = $true)][string]$RepositoryUrl,
        [Parameter(Mandatory = $true)][string]$ManifestUrl,
        [Parameter(Mandatory = $true)][string]$ExpectedModuleId
    )
    $Manifest = Get-Content -Path $Path -Raw | ConvertFrom-Json
    Assert-Manifest -Manifest $Manifest -ExpectedModuleId $ExpectedModuleId
    Set-JsonProperty -Object $Manifest -Name 'version' -Value $ReleaseVersion
    Set-JsonProperty -Object $Manifest -Name 'download' -Value $DownloadUrl
    Set-JsonProperty -Object $Manifest -Name 'url' -Value $RepositoryUrl
    Set-JsonProperty -Object $Manifest -Name 'manifest' -Value $ManifestUrl
    Set-JsonProperty -Object $Manifest -Name 'changelog' -Value "$RepositoryUrl/releases"
    Write-Utf8NoBom -Path $Path -Text ($Manifest | ConvertTo-Json -Depth 100)
    Assert-Utf8JsonFile -Path $Path
}

function Copy-ReleaseContent {
    param(
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string[]]$RequiredPaths,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$OptionalPaths
    )
    foreach ($RelativePath in $RequiredPaths) {
        if (-not (Test-Path (Join-Path $ProjectRoot $RelativePath))) {
            throw "Required release path '$RelativePath' was not found."
        }
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($RelativePath in $RequiredPaths) {
        Copy-Item -Path (Join-Path $ProjectRoot $RelativePath) -Destination $Destination -Recurse -Force
    }
    foreach ($RelativePath in $OptionalPaths) {
        $Source = Join-Path $ProjectRoot $RelativePath
        if (Test-Path $Source) {
            Copy-Item -Path $Source -Destination $Destination -Recurse -Force
        }
    }
}

function Build-Archive {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDirectory,
        [Parameter(Mandatory = $true)][string]$DestinationArchive
    )
    if (Test-Path $DestinationArchive) { Remove-Item $DestinationArchive -Force }
    Compress-Archive -Path (Join-Path $SourceDirectory '*') -DestinationPath $DestinationArchive -CompressionLevel Optimal -Force
}

function Assert-Archive {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedDownloadUrl,
        [Parameter(Mandatory = $true)][string]$ExpectedModuleId,
        [Parameter(Mandatory = $true)][string[]]$RequiredPaths
    )
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $EntryNames = @($Zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        foreach ($RelativePath in $RequiredPaths) {
            if (Test-Path -LiteralPath (Join-Path $ProjectRoot $RelativePath) -PathType Leaf) {
                if ($EntryNames -notcontains $RelativePath) { throw "Required archive entry '$RelativePath' is missing from the ZIP root." }
            }
            else {
                $Prefix = $RelativePath.TrimEnd('/') + '/'
                if (-not ($EntryNames | Where-Object { $_.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase) })) {
                    throw "Required archive folder '$Prefix' was not found."
                }
            }
        }
        $ForbiddenPatterns = @(
            '^\.git/', '^\.github/', '^\.vscode/', '^node_modules/', '^\.release-', '^tmp/', '^release-notes/',
            '(^|/)release\.ps1$', '(^|/)release\.config\.json$', '\.zip$', '\.log$',
            '(^|/)\.DS_Store$', '(^|/)Thumbs\.db$', '^RELEASE-NOTES-'
        )
        foreach ($EntryName in $EntryNames) {
            # LevelDB numbered logs contain live records and must ship with packs.
            if ($EntryName -match '^packs/[^/]+/[0-9]+\.log$') { continue }
            foreach ($Pattern in $ForbiddenPatterns) {
                if ($EntryName -match $Pattern) { throw "Forbidden archive entry '$EntryName' matched '$Pattern'." }
            }
        }
        $ManifestEntry = $Zip.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq 'module.json' } | Select-Object -First 1
        if (-not $ManifestEntry) { throw 'module.json is not at the ZIP root.' }
        $Reader = New-Object System.IO.StreamReader($ManifestEntry.Open())
        try { $ZippedManifest = $Reader.ReadToEnd() | ConvertFrom-Json } finally { $Reader.Dispose() }
        Assert-Manifest -Manifest $ZippedManifest -ExpectedModuleId $ExpectedModuleId
        if ($ZippedManifest.version -ne $ExpectedVersion) { throw "ZIP version '$($ZippedManifest.version)' does not match '$ExpectedVersion'." }
        if ($ZippedManifest.download -ne $ExpectedDownloadUrl) { throw 'ZIP download URL does not match the expected release URL.' }
    }
    finally { $Zip.Dispose() }
}

function Get-ReleaseMetadataFromMarkdown {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$DefaultTitle
    )
    $Lines = @(Get-Content -Path $Path -Encoding UTF8)
    $Title = $DefaultTitle
    $SummaryLines = New-Object System.Collections.Generic.List[string]
    $Changes = New-Object System.Collections.Generic.List[object]
    $CurrentCategory = $null
    $SeenH2 = $false

    $CategoryMap = @{
        'added' = 'feature'; 'new' = 'feature'; 'features' = 'feature'; 'feature' = 'feature'
        'improvements' = 'improvement'; 'improvement' = 'improvement'; 'changed' = 'improvement'; 'changes' = 'improvement'
        'fixed' = 'fix'; 'fixes' = 'fix'; 'bug fixes' = 'fix'; 'bugfixes' = 'fix'
        'breaking' = 'breaking'; 'breaking changes' = 'breaking'
        'security' = 'security'
    }

    foreach ($Line in $Lines) {
        $Trimmed = $Line.Trim()
        if ($Trimmed -match '^#\s+(.+)$' -and $Trimmed -notmatch '^##') {
            $Title = $Matches[1].Trim()
            continue
        }
        if ($Trimmed -match '^##\s+(.+)$') {
            $SeenH2 = $true
            $Heading = $Matches[1].Trim().ToLowerInvariant()
            if ($CategoryMap.ContainsKey($Heading)) { $CurrentCategory = $CategoryMap[$Heading] } else { $CurrentCategory = $null }
            continue
        }
        if ($Trimmed -match '^###\s+(.+)$') {
            $Heading = $Matches[1].Trim().ToLowerInvariant()
            if ($CategoryMap.ContainsKey($Heading)) { $CurrentCategory = $CategoryMap[$Heading] } else { $CurrentCategory = $null }
            continue
        }
        if (-not $SeenH2 -and -not [string]::IsNullOrWhiteSpace($Trimmed)) {
            $SummaryLines.Add($Trimmed)
            continue
        }
        if ($null -ne $CurrentCategory -and $Trimmed -match '^[-*]\s+(.+)$') {
            $Description = $Matches[1].Trim()
            $Tier = 'standard'
            if ($Description -match '^\[(Premium|Champion|Standard)\]\s*(.+)$') {
                $Tier = $Matches[1].ToLowerInvariant(); $Description = $Matches[2].Trim()
            }
            elseif ($Description -match '^\*\*(Premium|Champion|Standard):\*\*\s*(.+)$') {
                $Tier = $Matches[1].ToLowerInvariant(); $Description = $Matches[2].Trim()
            }
            $Changes.Add([pscustomobject]@{ category = $CurrentCategory; tier = $Tier; description = $Description })
        }
    }

    $Summary = ($SummaryLines -join ' ').Trim()
    if ([string]::IsNullOrWhiteSpace($Summary) -and $Changes.Count -gt 0) {
        $Summary = [string]$Changes[0].description
    }
    return [pscustomobject]@{ title = $Title; summary = $Summary; changes = @($Changes | ForEach-Object { $_ }) }
}

function Assert-ReleaseMetadataHasChanges {
    param(
        [Parameter(Mandatory = $true)][psobject]$Metadata,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $Content = Get-Content -Path $Path -Raw -Encoding UTF8
    if ($Content -notmatch '(?m)^##\s+What Changed\s*$') {
        throw "Release notes '$Path' must include the standard '## What Changed' heading."
    }
    if (@($Metadata.changes).Count -gt 0) { return }
    throw "Release notes '$Path' do not contain any publishable What Changed entries. Use bullet lists under subsections such as ### Added, ### Improvements, or ### Fixed."
}

function Assert-ProductDocumentation {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedProductSlug,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Product documentation was not found: $Path"
    }
    $Content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $EscapedProduct = [regex]::Escape($ExpectedProductSlug)
    $EscapedVersion = [regex]::Escape($ExpectedVersion)
    $ProductPattern = '(?m)^product:\s*[''"]?{0}[''"]?\s*$' -f $EscapedProduct
    $VersionPattern = '(?m)^version:\s*[''"]?{0}[''"]?\s*$' -f $EscapedVersion
    if ($Content -notmatch $ProductPattern) {
        throw "Product documentation '$Path' must declare product: $ExpectedProductSlug in its frontmatter."
    }
    if ($Content -notmatch $VersionPattern) {
        throw "Product documentation '$Path' must be updated to version $ExpectedVersion before release."
    }
}

function New-WebsiteReleasePayload {
    param([Parameter(Mandatory = $true)][psobject]$Metadata)
    return [pscustomobject]@{
        productSlug = $ProductSlug
        version = $Version
        title = [string]$Metadata.title
        summary = [string]$Metadata.summary
        publishedAt = [DateTimeOffset]::Now.ToString('o')
        githubReleaseUrl = $GitHubReleaseUrl
        downloadUrl = $DownloadUrl
        manifestUrl = $ManifestUrl
        changes = @($Metadata.changes)
    }
}

function Publish-WebsiteRelease {
    param(
        [Parameter(Mandatory = $true)][string]$EndpointBase,
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)][psobject]$Payload
    )
    $Endpoint = "$($EndpointBase.TrimEnd('/'))/api/releases"
    $Json = $Payload | ConvertTo-Json -Depth 20
    $Headers = @{ Authorization = "Bearer $Token"; Accept = 'application/json' }
    try {
        $Response = Invoke-RestMethod -Method Post -Uri $Endpoint -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body $Json
    }
    catch {
        $Details = if ($null -ne $_.ErrorDetails) { $_.ErrorDetails.Message } else { $null }
        if ([string]::IsNullOrWhiteSpace($Details)) { $Details = $_.Exception.Message }
        throw "Website release publication failed: $Details"
    }
    if (-not $Response.ok) { throw "Website release publication failed: $($Response.error)" }
    return $Response
}

function Publish-FoundryRelease {
    param(
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)][psobject]$Payload
    )
    $Endpoint = 'https://foundryvtt.com/_api/packages/release_version/'
    $Headers = @{ Authorization = $Token; Accept = 'application/json' }
    try {
        return Invoke-RestMethod -Method Post -Uri $Endpoint -Headers $Headers -SkipHeaderValidation -ContentType 'application/json; charset=utf-8' -Body ($Payload | ConvertTo-Json -Depth 20)
    }
    catch {
        $Details = if ($null -ne $_.ErrorDetails) { $_.ErrorDetails.Message } else { $null }
        if ([string]::IsNullOrWhiteSpace($Details)) { $Details = $_.Exception.Message }
        throw "Foundry VTT release publication failed: $Details"
    }
}

function Request-DocumentationDeployment {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string]$ProductSlug,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion
    )
    $Dispatch = [pscustomobject]@{
        event_type = 'product-docs-updated'
        client_payload = [pscustomobject]@{
            product = $ProductSlug
            version = $ReleaseVersion
        }
    } | ConvertTo-Json -Depth 5 -Compress
    $Dispatch | & gh api --method POST "repos/$Repository/dispatches" --input -
    if ($LASTEXITCODE -ne 0) { throw "Unable to request documentation deployment from $Repository." }
}

function Test-ChangelogHorizontalRule {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line)
    return $Line.Trim() -match '^([-*_])\1{2,}$'
}

function Format-ChangelogLine {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line)
    $Trimmed = $Line.Trim()
    if ([string]::IsNullOrWhiteSpace($Trimmed)) { return '' }
    if ($Trimmed -match '^(#{1,6})\s+(\S.*?)\s*$') {
        return "$($Matches[1]) $($Matches[2].Trim())"
    }
    if ($Trimmed -match '^(#{1,6})(\S.*?)\s*$') {
        return "$($Matches[1]) $($Matches[2].Trim())"
    }
    if ($Trimmed -match '^[-*+]\s+(.*\S)\s*$') {
        $BulletText = $Matches[1].Trim()
        $Indent = ''
        if ($Line -match '^([ \t]+)') { $Indent = $Matches[1] }
        return "$Indent- $BulletText"
    }
    return $Line.TrimEnd()
}

function Get-ChangelogBodyLines {
    param([Parameter(Mandatory = $true)][string]$Path)
    $RawLines = @([System.IO.File]::ReadAllLines($Path, $Utf8NoBom))
    $Body = New-Object System.Collections.Generic.List[string]
    $ChangeHeadings = @{
        'added' = $true; 'new' = $true; 'feature' = $true; 'features' = $true
        'improvement' = $true; 'improvements' = $true; 'changed' = $true; 'changes' = $true
        'fixed' = $true; 'fix' = $true; 'fixes' = $true; 'bug fixes' = $true; 'bugfixes' = $true
        'breaking' = $true; 'breaking changes' = $true; 'security' = $true
    }

    $WhatChangedIndex = -1
    for ($Index = 0; $Index -lt $RawLines.Count; $Index++) {
        if ($RawLines[$Index].Trim() -match '^##\s+What Changed\s*$') {
            $WhatChangedIndex = $Index
            break
        }
    }

    if ($WhatChangedIndex -ge 0) {
        for ($Index = $WhatChangedIndex + 1; $Index -lt $RawLines.Count; $Index++) {
            $Trimmed = $RawLines[$Index].Trim()
            if ($Trimmed -match '^##\s+') { break }
            if (Test-ChangelogHorizontalRule -Line $RawLines[$Index]) { continue }
            $Body.Add((Format-ChangelogLine -Line $RawLines[$Index]))
        }
    }
    else {
        $Including = $false
        foreach ($RawLine in $RawLines) {
            $Trimmed = $RawLine.Trim()
            if ($Trimmed -match '^#\s+' -and $Trimmed -notmatch '^##') { continue }
            if ($Trimmed -match '^##\s+(.+)$') {
                $Heading = $Matches[1].Trim()
                if ($ChangeHeadings.ContainsKey($Heading.ToLowerInvariant())) {
                    $Including = $true
                    $Body.Add("### $Heading")
                }
                else { $Including = $false }
                continue
            }
            if (-not $Including) { continue }
            if (Test-ChangelogHorizontalRule -Line $RawLine) { continue }
            $Body.Add((Format-ChangelogLine -Line $RawLine))
        }
    }

    $Compact = New-Object System.Collections.Generic.List[string]
    $PreviousBlank = $false
    foreach ($BodyLine in $Body) {
        $Blank = [string]::IsNullOrWhiteSpace($BodyLine)
        if ($Blank -and $PreviousBlank) { continue }
        $Compact.Add($BodyLine)
        $PreviousBlank = $Blank
    }
    $Body = $Compact

    while ($Body.Count -gt 0 -and [string]::IsNullOrWhiteSpace($Body[0])) { $Body.RemoveAt(0) }
    while ($Body.Count -gt 0 -and [string]::IsNullOrWhiteSpace($Body[$Body.Count - 1])) { $Body.RemoveAt($Body.Count - 1) }
    return @($Body.ToArray())
}

function New-ChangelogMarkdown {
    param(
        [Parameter(Mandatory = $true)][string]$ModuleTitle,
        [Parameter(Mandatory = $true)][string]$ReleaseNotesDirectory
    )
    if (-not (Test-Path -LiteralPath $ReleaseNotesDirectory -PathType Container)) {
        throw "Release notes directory was not found: $ReleaseNotesDirectory"
    }

    $Entries = New-Object System.Collections.Generic.List[object]
    foreach ($File in @(Get-ChildItem -LiteralPath $ReleaseNotesDirectory -Filter 'RELEASE-NOTES-*.md' -File)) {
        if ($File.Name -notmatch '^RELEASE-NOTES-(\d+\.\d+\.\d+)\.md$') {
            throw "Release notes file '$($File.Name)' does not use RELEASE-NOTES-<x.y.z>.md."
        }
        $Entries.Add([pscustomobject]@{
            Version = $Matches[1]
            SortKey = [version]$Matches[1]
            Path = $File.FullName
        })
    }
    if ($Entries.Count -eq 0) {
        throw "No RELEASE-NOTES-<x.y.z>.md files were found in $ReleaseNotesDirectory."
    }

    $Sorted = @($Entries | Sort-Object -Property SortKey -Descending)
    $Seen = @{}
    $Lines = New-Object System.Collections.Generic.List[string]
    $Lines.Add("# $ModuleTitle Changelog")
    $Lines.Add('')
    foreach ($Entry in $Sorted) {
        if ($Seen.ContainsKey($Entry.Version)) { throw "Duplicate release notes for version $($Entry.Version)." }
        $Seen[$Entry.Version] = $true
        $Lines.Add("## $($Entry.Version)")
        $Body = @(Get-ChangelogBodyLines -Path $Entry.Path)
        if ($Body.Count -gt 0) {
            $Lines.Add('')
            foreach ($BodyLine in $Body) { $Lines.Add([string]$BodyLine) }
        }
        $Lines.Add('')
    }
    return (($Lines -join "`n").TrimEnd("`n") + "`n")
}

function Update-ChangelogFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $Existing = [System.IO.File]::ReadAllText($Path)
        if ($Existing -eq $Text) { return $false }
    }
    Write-Utf8NoBom -Path $Path -Text $Text
    return $true
}

function Update-Changelog {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ModuleTitle,
        [Parameter(Mandatory = $true)][string]$ReleaseNotesDirectory
    )
    $Text = New-ChangelogMarkdown -ModuleTitle $ModuleTitle -ReleaseNotesDirectory $ReleaseNotesDirectory
    $Changed = Update-ChangelogFile -Path $Path -Text $Text
    return [pscustomobject]@{ Changed = [bool]$Changed; Text = $Text }
}

function Show-Usage {
    param([string]$Title)
    Write-Host ''
    Write-Host "$Title - Standard Morelord Release Workflow" -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  .\release.ps1 -Version <x.y.z> [-DryRun] [-Prerelease] [-Draft]' -ForegroundColor Yellow
    Write-Host '  .\release.ps1 -Version <x.y.z> -ValidateOnly' -ForegroundColor Yellow
    Write-Host '  .\release.ps1 -Version <x.y.z> -WebsiteOnly' -ForegroundColor Yellow
    Write-Host '  .\release.ps1 -Version <x.y.z> -FoundryOnly' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Normal releases publish GitHub + Foundry + morelordgaming.com/releases.'
    Write-Host 'Set RELEASE_PUBLISH_TOKEN in the project .env file or pass -WebsiteToken.'
    Write-Host 'Set FOUNDRY_RELEASE_TOKEN in the project .env file or pass -FoundryToken.'
    Write-Host 'Use -SkipWebsitePublish only for exceptional cases.'
    Write-Host 'Draft and prerelease builds are not published to the public website release feed.'
    Write-Host '-WebsiteOnly and -FoundryOnly publish an existing version. They do not commit, tag, or create a GitHub Release.'
    Write-Host '-ValidateOnly rebuilds CHANGELOG.md when it differs, checks the archive, and does not commit, tag, or publish.'
    Write-Host 'When CHANGELOG.md is already current, -ValidateOnly leaves the Git worktree unchanged.'
    Write-Host ''
}

if (-not (Test-Path $ConfigPath)) { throw "release.config.json was not found at '$ConfigPath'." }
Assert-Utf8JsonFile -Path $ConfigPath
$Config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
$ModuleId = Get-RequiredConfigValue -Config $Config -Name 'moduleId'
$ModuleTitle = Get-RequiredConfigValue -Config $Config -Name 'moduleTitle'
$ProductSlug = Get-RequiredConfigValue -Config $Config -Name 'productSlug'
$GitHubOwner = Get-RequiredConfigValue -Config $Config -Name 'githubOwner'
$GitHubRepo = Get-RequiredConfigValue -Config $Config -Name 'githubRepo'
$ReleaseBranch = Get-RequiredConfigValue -Config $Config -Name 'releaseBranch'
$ArchiveName = Get-RequiredConfigValue -Config $Config -Name 'archiveName'
$ProductDocumentationRelativePath = if ($Config.PSObject.Properties.Name -contains 'productDocumentationPath') { [string]$Config.productDocumentationPath } else { '' }
$DocumentationWebsiteRepository = if ($Config.PSObject.Properties.Name -contains 'documentationWebsiteRepository') { [string]$Config.documentationWebsiteRepository } else { '' }
$RequiredPaths = @($Config.requiredPaths | ForEach-Object { [string]$_ })
$OptionalPaths = @($Config.optionalPaths | ForEach-Object { [string]$_ })
if ($RequiredPaths.Count -eq 0) { throw 'release.config.json requiredPaths must contain at least one path.' }

if ([string]::IsNullOrWhiteSpace($Version) -and $ValidateOnly) {
    if (-not (Test-Path -LiteralPath $ManifestPath)) { throw 'module.json was not found.' }
    $Version = [string]((Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json).version)
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "module.json version '$Version' is not x.y.z." }
}
if ([string]::IsNullOrWhiteSpace($Version)) { Show-Usage -Title $ModuleTitle; exit 0 }

$Tag = "v$Version"
if ([string]::IsNullOrWhiteSpace($CommitMessage)) { $CommitMessage = "Release $Tag" }
if ([string]::IsNullOrWhiteSpace($WebsiteUrl)) {
    $WebsiteUrl = if ($Config.websiteUrl) { [string]$Config.websiteUrl } else { 'https://morelordgaming.com' }
}
if ([string]::IsNullOrWhiteSpace($WebsiteToken)) {
    $WebsiteToken = $env:RELEASE_PUBLISH_TOKEN
}
if ([string]::IsNullOrWhiteSpace($FoundryToken)) {
    $FoundryToken = $env:FOUNDRY_RELEASE_TOKEN
}
if ([string]::IsNullOrWhiteSpace($ReleaseNotesPath)) { $ReleaseNotesPath = Join-Path $ProjectRoot "release-notes/RELEASE-NOTES-$Version.md" }
elseif (-not [System.IO.Path]::IsPathRooted($ReleaseNotesPath)) { $ReleaseNotesPath = Join-Path $ProjectRoot $ReleaseNotesPath }
$ProductDocumentationPath = if ([string]::IsNullOrWhiteSpace($ProductDocumentationRelativePath)) { '' } else { Join-Path $ProjectRoot $ProductDocumentationRelativePath }

$Repository = "$GitHubOwner/$GitHubRepo"
$RepositoryUrl = "https://github.com/$Repository"
$ManifestUrl = "https://raw.githubusercontent.com/$Repository/$ReleaseBranch/module.json"
$VersionManifestUrl = "https://raw.githubusercontent.com/$Repository/$Tag/module.json"
$DownloadUrl = "https://github.com/$Repository/releases/download/$Tag/$ArchiveName"
$GitHubReleaseUrl = "https://github.com/$Repository/releases/tag/$Tag"
$ArchivePath = Join-Path (Join-Path $ProjectRoot 'tmp') $ArchiveName
$WorkingPath = Join-Path $ProjectRoot 'tmp'
New-Item -ItemType Directory -Path $WorkingPath -Force | Out-Null
$StagingPath = Join-Path $WorkingPath ("$ModuleId-release-" + [guid]::NewGuid().ToString('N'))
$DryRunArchivePath = Join-Path $WorkingPath ("$ModuleId-dry-run-" + [guid]::NewGuid().ToString('N') + '.zip')
$ShouldPublishWebsite = -not $SkipWebsitePublish -and -not $Draft -and -not $Prerelease -and -not $ValidateOnly
$ShouldPublishFoundry = -not $SkipFoundryPublish -and -not $Draft -and -not $Prerelease -and -not $ValidateOnly
if ($WebsiteOnly) { $ShouldPublishWebsite = $true }
if ($WebsiteOnly -and $FoundryOnly) { throw 'Pass -WebsiteOnly or -FoundryOnly, not both. Run the script once for each destination.' }

Set-Location $ProjectRoot

if ($FoundryOnly) {
    if (-not (Test-Path $ManifestPath)) { throw 'module.json was not found.' }
    if ([string]::IsNullOrWhiteSpace($FoundryToken)) { throw 'Foundry-only publishing requires FOUNDRY_RELEASE_TOKEN in the environment or -FoundryToken.' }
    Assert-CommandExists 'git'
    Assert-Utf8JsonFile -Path $ManifestPath
    $Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    Assert-Manifest -Manifest $Manifest -ExpectedModuleId $ModuleId
    if ([string]$Manifest.version -ne $Version) {
        throw "Foundry-only publishing requires module.json version $([string]$Manifest.version) to equal $Version. This path does not change the manifest, tag, or GitHub Release."
    }
    if (-not (Test-RemoteTagExists -Tag $Tag)) { throw "Git tag '$Tag' was not found on origin. Foundry-only publishing uses the existing tag and does not create one." }
    $FoundryCompatibility = [ordered]@{
        minimum = [string]$Manifest.compatibility.minimum
        verified = [string]$Manifest.compatibility.verified
    }
    if ($Manifest.compatibility.PSObject.Properties.Name -contains 'maximum' -and -not [string]::IsNullOrWhiteSpace([string]$Manifest.compatibility.maximum)) {
        $FoundryCompatibility.maximum = [string]$Manifest.compatibility.maximum
    }
    $FoundryPayload = [pscustomobject]@{
        id = $ModuleId
        release = [pscustomobject]@{
            version = $Version
            manifest = $VersionManifestUrl
            notes = $GitHubReleaseUrl
            compatibility = $FoundryCompatibility
        }
    }
    Write-Host ''
    Write-Host "Publishing existing $ModuleTitle $Tag to Foundry VTT..." -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host ($FoundryPayload | ConvertTo-Json -Depth 20)
        Write-Host 'Foundry-only dry run completed; nothing was published.' -ForegroundColor Green
        exit 0
    }
    $FoundryResponse = Publish-FoundryRelease -Token $FoundryToken -Payload $FoundryPayload
    if ($FoundryResponse.status -ne 'success') {
        $FoundryError = if ($FoundryResponse.errors) { $FoundryResponse.errors | ConvertTo-Json -Compress } else { 'Foundry did not return status success.' }
        throw "Foundry release publication failed: $FoundryError"
    }
    Write-Host 'Published to Foundry VTT.' -ForegroundColor Green
    if ($FoundryResponse.PSObject.Properties.Name -contains 'page' -and -not [string]::IsNullOrWhiteSpace([string]$FoundryResponse.page)) {
        Write-Host "Package page: $($FoundryResponse.page)"
    }
    exit 0
}

if ($WebsiteOnly) {
    if (-not (Test-Path $ReleaseNotesPath -PathType Leaf)) { throw "Release notes were not found: $ReleaseNotesPath" }
    if ([string]::IsNullOrWhiteSpace($WebsiteToken)) { throw 'Website-only publishing requires RELEASE_PUBLISH_TOKEN in the project .env file or -WebsiteToken.' }
    $ReleaseMetadata = Get-ReleaseMetadataFromMarkdown -Path $ReleaseNotesPath -DefaultTitle "$ModuleTitle $Version"
    Assert-ReleaseMetadataHasChanges -Metadata $ReleaseMetadata -Path $ReleaseNotesPath
    if (-not [string]::IsNullOrWhiteSpace($ProductDocumentationPath)) {
        Assert-ProductDocumentation -Path $ProductDocumentationPath -ExpectedProductSlug $ProductSlug -ExpectedVersion $Version
    }
    $Payload = New-WebsiteReleasePayload -Metadata $ReleaseMetadata
    Write-Host ''
    Write-Host "Publishing existing $ModuleTitle $Tag to $WebsiteUrl/releases..." -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host ($Payload | ConvertTo-Json -Depth 20)
        Write-Host 'Website-only dry run completed; nothing was published.' -ForegroundColor Green
        exit 0
    }
    $WebsiteResponse = Publish-WebsiteRelease -EndpointBase $WebsiteUrl -Token $WebsiteToken -Payload $Payload
    Write-Host "Published: $($WebsiteResponse.action) $($WebsiteResponse.releaseId)" -ForegroundColor Green
    Write-Host "$WebsiteUrl$($WebsiteResponse.publicUrl)"
    if (-not [string]::IsNullOrWhiteSpace($DocumentationWebsiteRepository)) {
        Request-DocumentationDeployment -Repository $DocumentationWebsiteRepository -ProductSlug $ProductSlug -ReleaseVersion $Version
        Write-Host "Documentation deployment requested from $DocumentationWebsiteRepository." -ForegroundColor Green
    }
    exit 0
}

Write-Host ''
Write-Host "Preparing $ModuleTitle $Tag..." -ForegroundColor Cyan
if ($DryRun) { Write-Host 'DRY RUN: no project files, Git history, GitHub releases, or website records will be changed.' -ForegroundColor Yellow }
if ($ValidateOnly) { Write-Host 'VALIDATE ONLY: no commit, tag, push, or publication. CHANGELOG.md is rewritten only when its text changes.' -ForegroundColor Yellow }
if (($Draft -or $Prerelease) -and -not $SkipWebsitePublish) { Write-Host 'Website publication will be skipped for draft/prerelease builds.' -ForegroundColor Yellow }

try {
    Write-Step 'Checking prerequisites and release metadata...'
    Assert-CommandExists 'git'
    if (-not $DryRun -and -not $ValidateOnly) { Assert-CommandExists 'gh' }
    if (-not (Test-Path $ManifestPath)) { throw 'module.json was not found.' }
    if (-not (Test-Path $ReleaseNotesPath -PathType Leaf)) { throw "Release notes were not found: $ReleaseNotesPath" }
    if (-not [string]::IsNullOrWhiteSpace($ProductDocumentationPath)) {
        Assert-ProductDocumentation -Path $ProductDocumentationPath -ExpectedProductSlug $ProductSlug -ExpectedVersion $Version
    }
    if ($ShouldPublishWebsite -and [string]::IsNullOrWhiteSpace($WebsiteToken)) {
        throw 'Website publishing is enabled but no token is configured. Set RELEASE_PUBLISH_TOKEN in the project .env file or pass -WebsiteToken. Use -SkipWebsitePublish only when intentionally bypassing the website feed.'
    }
    if ($ShouldPublishFoundry -and [string]::IsNullOrWhiteSpace($FoundryToken)) {
        throw 'Foundry publishing is enabled but FOUNDRY_RELEASE_TOKEN is not configured. Use -SkipFoundryPublish only when intentionally bypassing Foundry.'
    }
    $ReleaseMetadata = Get-ReleaseMetadataFromMarkdown -Path $ReleaseNotesPath -DefaultTitle "$ModuleTitle $Version"
    Assert-ReleaseMetadataHasChanges -Metadata $ReleaseMetadata -Path $ReleaseNotesPath
    Write-Host "  Notes           : $ReleaseNotesPath"
    if (-not [string]::IsNullOrWhiteSpace($ProductDocumentationPath)) { Write-Host "  Documentation   : $ProductDocumentationPath" }
    Write-Host "  Website changes : $($ReleaseMetadata.changes.Count)"

    if (-not $ValidateOnly) {
        Write-Step 'Checking repository identity and state...'
        git rev-parse --is-inside-work-tree *> $null
        if ($LASTEXITCODE -ne 0) { throw 'This directory is not a Git repository.' }
        $CurrentBranch = Get-GitOutput -Command { git branch --show-current } -FailureMessage 'Unable to determine the current Git branch.'
        if ($CurrentBranch -ne $ReleaseBranch) { throw "Releases must run from '$ReleaseBranch'. Current branch: '$CurrentBranch'." }
        $OriginUrl = Get-GitOutput -Command { git remote get-url origin } -FailureMessage "Git remote 'origin' was not found."
        if ($OriginUrl -notmatch [regex]::Escape($Repository)) { throw "Git remote 'origin' does not point to $Repository. Current: $OriginUrl" }
        $InitialStatus = Get-GitOutput -Command { git status --porcelain } -FailureMessage 'Unable to inspect the Git working tree.'
        if (-not [string]::IsNullOrWhiteSpace($InitialStatus)) { throw "The working tree is not clean:`n$InitialStatus" }
        Invoke-NativeCommand -Command { git fetch origin --tags --prune } -FailureMessage 'Unable to fetch origin.'
        $Behind = [int](Get-GitOutput -Command { git rev-list --count "HEAD..origin/$ReleaseBranch" } -FailureMessage 'Unable to compare local and remote branches.')
        if ($Behind -gt 0) { throw "Local '$ReleaseBranch' is $Behind commit(s) behind origin. Pull before releasing." }
        if (-not $DryRun) { Invoke-NativeCommand -Command { gh auth status } -FailureMessage "GitHub CLI is not authenticated. Run 'gh auth login'." }
        if (git tag --list $Tag) { throw "Git tag '$Tag' already exists locally." }
        if (Test-RemoteTagExists -Tag $Tag) { throw "Git tag '$Tag' already exists on origin." }
        if (-not $DryRun -and (Test-GitHubReleaseExists -Tag $Tag -Repository $Repository)) { throw "GitHub Release '$Tag' already exists." }
    }

    Write-Step 'Validating and preparing module manifest...'
    Assert-Utf8JsonFile -Path $ManifestPath
    $Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    Assert-Manifest -Manifest $Manifest -ExpectedModuleId $ModuleId
    $FoundryCompatibility = [ordered]@{
        minimum = [string]$Manifest.compatibility.minimum
        verified = [string]$Manifest.compatibility.verified
    }
    if ($Manifest.compatibility.PSObject.Properties.Name -contains 'maximum' -and -not [string]::IsNullOrWhiteSpace([string]$Manifest.compatibility.maximum)) {
        $FoundryCompatibility.maximum = [string]$Manifest.compatibility.maximum
    }
    $FoundryPayload = [pscustomobject]@{
        id = $ModuleId
        release = [pscustomobject]@{
            version = $Version
            manifest = $VersionManifestUrl
            notes = $GitHubReleaseUrl
            compatibility = $FoundryCompatibility
        }
    }
    $CurrentVersion = [version]$Manifest.version
    $RequestedVersion = [version]$Version
    if ($RequestedVersion -lt $CurrentVersion) { throw "Release version $Version cannot be lower than current version $($Manifest.version)." }
    Write-Host "  Module          : $ModuleId"
    Write-Host "  Current version : $($Manifest.version)"
    Write-Host "  Release version : $Version"
    Write-Host "  Repository      : $Repository"
    Write-Host "  Archive         : $ArchiveName"

    Write-Step 'Updating cumulative changelog...'
    $ChangelogModuleTitle = [string]$Manifest.title
    if ([string]::IsNullOrWhiteSpace($ChangelogModuleTitle)) { throw 'module.json title is required to build CHANGELOG.md.' }
    $ReleaseNotesDirectory = Join-Path $ProjectRoot 'release-notes'
    $ChangelogPath = Join-Path $ProjectRoot 'CHANGELOG.md'
    if ($DryRun) {
        $ChangelogText = New-ChangelogMarkdown -ModuleTitle $ChangelogModuleTitle.Trim() -ReleaseNotesDirectory $ReleaseNotesDirectory
        Write-Host '  Changelog       : dry run leaves CHANGELOG.md unchanged'
    }
    else {
        $ChangelogResult = Update-Changelog -Path $ChangelogPath -ModuleTitle $ChangelogModuleTitle.Trim() -ReleaseNotesDirectory $ReleaseNotesDirectory
        $ChangelogText = [string]$ChangelogResult.Text
        if ($ChangelogResult.Changed) { Write-Host '  Changelog       : updated CHANGELOG.md' }
        else { Write-Host '  Changelog       : CHANGELOG.md already current' }
    }

    Write-Step 'Building and validating release archive...'
    Copy-ReleaseContent -Destination $StagingPath -RequiredPaths $RequiredPaths -OptionalPaths $OptionalPaths
    Write-Utf8NoBom -Path (Join-Path $StagingPath 'CHANGELOG.md') -Text $ChangelogText
    $StagedManifest = Join-Path $StagingPath 'module.json'
    Update-ManifestFile -Path $StagedManifest -ReleaseVersion $Version -DownloadUrl $DownloadUrl -RepositoryUrl $RepositoryUrl -ManifestUrl $ManifestUrl -ExpectedModuleId $ModuleId
    if (-not $DryRun -and -not $ValidateOnly) {
        $OriginalManifestText = Get-Content $ManifestPath -Raw
        Update-ManifestFile -Path $ManifestPath -ReleaseVersion $Version -DownloadUrl $DownloadUrl -RepositoryUrl $RepositoryUrl -ManifestUrl $ManifestUrl -ExpectedModuleId $ModuleId
        $ManifestWasModified = $true
        Copy-Item $ManifestPath $StagedManifest -Force
    }
    $OutputArchive = if ($DryRun -or $ValidateOnly) { $DryRunArchivePath } else { $ArchivePath }
    Build-Archive -SourceDirectory $StagingPath -DestinationArchive $OutputArchive
    Assert-Archive -Path $OutputArchive -ExpectedVersion $Version -ExpectedDownloadUrl $DownloadUrl -ExpectedModuleId $ModuleId -RequiredPaths $RequiredPaths
    Write-Host "  Archive verified: $OutputArchive" -ForegroundColor Green

    $Payload = New-WebsiteReleasePayload -Metadata $ReleaseMetadata
    Write-Step 'Validating website release payload...'
    $PayloadJson = $Payload | ConvertTo-Json -Depth 20
    $null = $PayloadJson | ConvertFrom-Json
    Write-Host "  Product slug    : $ProductSlug"
    Write-Host "  Release title   : $($Payload.title)"
    Write-Host "  Changes         : $($Payload.changes.Count)"
    if ($ShouldPublishWebsite) { Write-Host "  Website         : $WebsiteUrl/releases" } else { Write-Host '  Website         : skipped' -ForegroundColor Yellow }
    if ($ShouldPublishFoundry) { Write-Host '  Foundry VTT     : publish after GitHub Release' } else { Write-Host '  Foundry VTT     : skipped' -ForegroundColor Yellow }

    if ($DryRun -or $ValidateOnly) {
        Write-Host ''
        if ($ValidateOnly) {
            Write-Host "Validation for $Tag completed successfully." -ForegroundColor Green
            Write-Host 'No commit, tag, or publication was created.' -ForegroundColor Green
        }
        else {
            Write-Host "Dry run for $Tag completed successfully." -ForegroundColor Green
            Write-Host 'Git, GitHub, and the website were not modified.' -ForegroundColor Green
        }
        exit 0
    }

    Write-Step 'Creating release commit and tag...'
    git add -- module.json CHANGELOG.md
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { throw 'No staged manifest or changelog change was detected. The requested version may already be committed.' }
    Invoke-NativeCommand -Command { git diff --cached --check } -FailureMessage 'Staged changes contain whitespace errors.'
    Invoke-NativeCommand -Command { git commit -m $CommitMessage } -FailureMessage 'git commit failed.'
    $CommitWasCreated = $true
    Invoke-NativeCommand -Command { git tag -a $Tag -m "$ModuleTitle $Tag" } -FailureMessage "Failed to create tag '$Tag'."
    $TagWasCreated = $true

    Write-Step 'Pushing release commit and tag...'
    Invoke-NativeCommand -Command { git push origin $ReleaseBranch $Tag } -FailureMessage 'Failed to push the release commit and tag.'
    $PushCompleted = $true

    Write-Step 'Creating GitHub Release from the same release notes...'
    $ReleaseArguments = @('release','create',$Tag,$ArchivePath,'--repo',$Repository,'--title',"$Tag - $ModuleTitle",'--notes-file',$ReleaseNotesPath,'--verify-tag')
    if ($Prerelease) { $ReleaseArguments += '--prerelease' }
    if ($Draft) { $ReleaseArguments += '--draft' }
    & gh @ReleaseArguments
    if ($LASTEXITCODE -ne 0) { throw "Failed to create GitHub Release '$Tag'." }
    $GitHubReleaseCreated = $true
    Invoke-NativeCommand -Command { gh release view $Tag --repo $Repository } -FailureMessage 'GitHub Release verification failed.'

    if ($ShouldPublishFoundry) {
        Write-Step 'Publishing release to Foundry VTT...'
        $FoundryResponse = Publish-FoundryRelease -Token $FoundryToken -Payload $FoundryPayload
        if ($FoundryResponse.status -ne 'success') { throw "Foundry VTT release publication failed: $($FoundryResponse | ConvertTo-Json -Depth 20 -Compress)" }
        $FoundryReleasePublished = $true
        Write-Host "  Package page    : $($FoundryResponse.page)" -ForegroundColor Green
    }

    if ($ShouldPublishWebsite) {
        Write-Step 'Publishing release to morelordgaming.com...'
        $WebsiteResponse = Publish-WebsiteRelease -EndpointBase $WebsiteUrl -Token $WebsiteToken -Payload $Payload
        Write-Host "  Website record  : $($WebsiteResponse.action) $($WebsiteResponse.releaseId)" -ForegroundColor Green
        Write-Host "  Public URL      : $WebsiteUrl$($WebsiteResponse.publicUrl)"
        if (-not [string]::IsNullOrWhiteSpace($DocumentationWebsiteRepository)) {
            Request-DocumentationDeployment -Repository $DocumentationWebsiteRepository -ProductSlug $ProductSlug -ReleaseVersion $Version
            Write-Host "  Documentation   : deployment requested" -ForegroundColor Green
        }
    }

    Write-Host ''
    Write-Host '========================================' -ForegroundColor Green
    Write-Host "Release $Tag completed successfully." -ForegroundColor Green
    Write-Host '========================================' -ForegroundColor Green
    Write-Host "Manifest: $ManifestUrl"
    Write-Host "Download: $DownloadUrl"
    Write-Host "GitHub:   $GitHubReleaseUrl"
    if ($ShouldPublishFoundry) { Write-Host "Foundry:  https://foundryvtt.com/packages/$ModuleId" }
    if ($ShouldPublishWebsite) { Write-Host "Website:  $WebsiteUrl/releases" }
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host 'RELEASE FAILED' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    if ($ManifestWasModified -and -not $CommitWasCreated -and $null -ne $OriginalManifestText) {
        Write-Host 'Restoring the original module.json...' -ForegroundColor Yellow
        Write-Utf8NoBom -Path $ManifestPath -Text $OriginalManifestText
    }
    if ($CommitWasCreated) {
        Write-Host 'A release commit was created before the failure. Git history was not rewritten automatically.' -ForegroundColor Yellow
    }
    if ($TagWasCreated) { Write-Host "Local tag '$Tag' may exist and should be inspected before retrying." -ForegroundColor Yellow }
    if ($PushCompleted) { Write-Host 'The commit/tag were already pushed to GitHub. Inspect the remote before retrying.' -ForegroundColor Yellow }
    if ($GitHubReleaseCreated) { Write-Host 'The GitHub Release was already created. The website publication can be retried separately if needed.' -ForegroundColor Yellow }
    if ($FoundryReleasePublished) { Write-Host 'The Foundry VTT release was already published.' -ForegroundColor Yellow }
    exit 1
}
finally {
    if (Test-Path $StagingPath) { Remove-Item $StagingPath -Recurse -Force -ErrorAction SilentlyContinue }
    if (($DryRun -or $ValidateOnly) -and (Test-Path $DryRunArchivePath)) { Remove-Item $DryRunArchivePath -Force -ErrorAction SilentlyContinue }
}
