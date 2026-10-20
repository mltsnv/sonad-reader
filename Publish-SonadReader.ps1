# Checks, commits, pushes to GitHub (origin/main) and deploys to Cloudflare.
# Full output goes to publish.log (UTF-8, ignored by git).
param([string]$Message = 'Update Sonad Reader')
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$log = Join-Path $PSScriptRoot 'publish.log'
Set-Content -LiteralPath $log -Value "Sonad Reader publish $(Get-Date -Format s)" -Encoding UTF8

function Log([string]$text) {
  Write-Host $text
  Add-Content -LiteralPath $log -Value $text -Encoding UTF8
}

function Step([string]$name, [string]$exe, [string[]]$arguments) {
  Log "=== $name ==="
  & $exe @arguments 2>&1 | ForEach-Object { Log ("$_") }
  if ($LASTEXITCODE -ne 0) {
    Log "FAILED: $name (exit $LASTEXITCODE)"
    Log 'PUBLISH FAILED'
    Write-Host ''
    Write-Host "Publish stopped at: $name. Nothing was deployed after that step." -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
  }
}

if (-not (Test-Path 'node_modules\vite\bin\vite.js')) { Step 'npm ci' 'npm.cmd' @('ci') }
Step 'typecheck' 'npm.cmd' @('run', 'typecheck')
Step 'unit tests' 'npm.cmd' @('test')
Step 'build' 'npm.cmd' @('run', 'build')

Step 'git add' 'git' @('add', '-A')
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  Step 'git commit' 'git' @('commit', '-m', $Message)
} else {
  Log 'No new changes to commit.'
}
Step 'git push' 'git' @('push', 'origin', 'main')
Step 'cloudflare deploy' 'npx.cmd' @('--prefix', 'c:\Users\mrmol\Desktop\Sonad', 'wrangler', 'deploy')

Log 'PUBLISH OK'
Write-Host ''
Write-Host 'Done: GitHub and Cloudflare are updated.' -ForegroundColor Green
Read-Host 'Press Enter to close'
