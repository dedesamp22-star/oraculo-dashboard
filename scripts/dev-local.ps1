$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root "artifacts/api-server"
$webDir = Join-Path $root "artifacts/oraculo"

Write-Host "Building local API..."
Push-Location $apiDir
try {
  & pnpm.cmd --config.confirmModulesPurge=false run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}

$apiEnv = @{
  NODE_ENV = "development"
  PORT = "3000"
  ORACULO_API_HOST = "127.0.0.1"
  ORACULO_REQUIRE_HTTPS = "false"
}

$webEnv = @{
  PORT = "5173"
  BASE_PATH = "/"
}

$apiCommand = @"
cd /d "$apiDir"
set NODE_ENV=$($apiEnv.NODE_ENV)
set PORT=$($apiEnv.PORT)
set ORACULO_API_HOST=$($apiEnv.ORACULO_API_HOST)
set ORACULO_REQUIRE_HTTPS=$($apiEnv.ORACULO_REQUIRE_HTTPS)
node --enable-source-maps ./dist/index.mjs
"@

$webCommand = @"
cd /d "$webDir"
set PORT=$($webEnv.PORT)
set BASE_PATH=$($webEnv.BASE_PATH)
node_modules\.bin\vite.CMD --config vite.config.ts --host 0.0.0.0
"@

Write-Host "Starting API at http://127.0.0.1:3000"
Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $apiCommand) -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "Starting frontend at http://localhost:5173"
Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $webCommand) -WindowStyle Normal

Write-Host ""
Write-Host "Local dev URLs:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  API:      http://127.0.0.1:3000"
