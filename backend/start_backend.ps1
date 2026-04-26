param(
  [int]$Port = 8010
)

$python = "C:\Users\PCHOME1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$projectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $PSScriptRoot

if (-not (Test-Path ".deps")) {
  Write-Host "Dependências do backend não encontradas em backend\.deps." -ForegroundColor Yellow
  Write-Host "Instale com:" -ForegroundColor Yellow
  Write-Host "& `"$python`" -m pip install -r backend\requirements.txt --target backend\.deps" -ForegroundColor Cyan
  exit 1
}

$env:PYTHONPATH = "$PSScriptRoot\.deps;$PSScriptRoot"
$env:REPOFISCAL_PORT = "$Port"
& $python "$PSScriptRoot\run_backend.py"
