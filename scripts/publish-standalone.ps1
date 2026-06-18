# Build a standalone NDI Manager release (UI + self-contained backend)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Building Web UI ..."
Push-Location "$repoRoot\ndi-web-ui"
npm run build
Pop-Location

Write-Host "Syncing wwwroot ..."
Remove-Item "$repoRoot\wwwroot\*" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$repoRoot\wwwroot" | Out-Null
Copy-Item "$repoRoot\ndi-web-ui\dist\*" "$repoRoot\wwwroot" -Recurse -Force

Write-Host "Publishing self-contained win-x64 to publish\ ..."
dotnet publish "$repoRoot\NDIManager.csproj" -c Release -r win-x64 --self-contained true -o "$repoRoot\publish"

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Syncing wwwroot into publish ..."
Copy-Item "$repoRoot\wwwroot\*" "$repoRoot\publish\wwwroot" -Recurse -Force

$config = Get-Content "$repoRoot\publish\NDIManager.runtimeconfig.json" -Raw
if ($config -notmatch 'includedFrameworks') {
  Write-Error "Publish failed: runtimeconfig.json is not self-contained."
  exit 1
}

Write-Host "OK: $repoRoot\publish\NDIManager.exe"
