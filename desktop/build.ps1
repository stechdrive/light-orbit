param([string]$OutputDirectory = 'publish')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
$version = '1.0.4314.35'
$cacheRoot = Join-Path $projectRoot '.local\packages'
$sdk = Join-Path $cacheRoot 'webview2'
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'))) {
    $archive = Join-Path $cacheRoot 'webview2.nupkg'
    if (!(Test-Path -LiteralPath $archive)) {
        Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $sdk -Force
}
$payload = Join-Path $projectRoot '.local\payload'
$expectedPayload = [IO.Path]::GetFullPath((Join-Path $projectRoot '.local\payload'))
if ([IO.Path]::GetFullPath($payload) -ne $expectedPayload -or -not $expectedPayload.StartsWith([IO.Path]::GetFullPath($projectRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid payload directory.' }
if (Test-Path -LiteralPath $payload) {
    $payloadItem = Get-Item -LiteralPath $payload
    if (($payloadItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Payload directory must not be linked.' }
    Remove-Item -LiteralPath $payloadItem.FullName -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $payload 'web') -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'dist\*') -Destination (Join-Path $payload 'web') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $payload -Force
$payloadZip = Join-Path $projectRoot '.local\payload.zip'
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $payloadZip -Force
$publish = Join-Path $projectRoot $OutputDirectory
New-Item -ItemType Directory -Path $publish -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:' + (Join-Path $publish 'LightOrbit.exe')),('/win32icon:' + (Join-Path $PSScriptRoot 'app.ico')),('/win32manifest:' + (Join-Path $PSScriptRoot 'app.manifest')),('/resource:' + $payloadZip + ',LightOrbit.payload.zip'),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',('/reference:' + (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll')),('/reference:' + (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll')),(Join-Path $PSScriptRoot 'App.cs'))
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $publish 'README.md') -Force
Copy-Item -LiteralPath (Join-Path $sdk 'LICENSE.txt') -Destination (Join-Path $publish 'WEBVIEW2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $sdk 'NOTICE.txt') -Destination (Join-Path $publish 'WEBVIEW2-NOTICE.txt') -Force
Get-Item -LiteralPath (Join-Path $publish 'LightOrbit.exe') | Select-Object FullName,Length
