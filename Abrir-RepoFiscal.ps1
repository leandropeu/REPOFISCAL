param(
  [switch]$InstallDesktopShortcut,
  [int]$BackendPort = 8010,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$backendScript = Join-Path $backendDir "start_backend.ps1"
$frontendUrl = "http://localhost:$FrontendPort"
$iconPath = Join-Path $projectRoot "REPOFISCAL.ico"

function Get-DesktopPath {
  $desktopRegistry = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" -ErrorAction SilentlyContinue
  if ($desktopRegistry -and $desktopRegistry.Desktop) {
    return [Environment]::ExpandEnvironmentVariables($desktopRegistry.Desktop)
  }

  return Join-Path $env:USERPROFILE "Desktop"
}

function Install-DesktopShortcut {
  $desktopPath = Get-DesktopPath
  $shortcutPath = Join-Path $desktopPath "RepoFiscal.lnk"
  $powershellPath = "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)

  $shortcut.TargetPath = $powershellPath
  $shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
  $shortcut.WorkingDirectory = $projectRoot
  if (Test-Path $iconPath) {
    $shortcut.IconLocation = $iconPath
  } else {
    $shortcut.IconLocation = "$powershellPath,0"
  }
  $shortcut.Save()

  Write-Host "Atalho salvo em $shortcutPath" -ForegroundColor Green
}

function Test-PortListening {
  param([int]$Port)

  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    return $null -ne $connection
  } catch {
    return $false
  }
}

function Start-BackendWindow {
  param([int]$Port)

  if (-not (Test-Path $backendScript)) {
    throw "Script do backend nao encontrado em $backendScript"
  }

  Start-Process `
    -FilePath "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -WorkingDirectory $projectRoot `
    -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $backendScript, "-Port", $Port
}

function Start-FrontendWindow {
  Start-Process `
    -FilePath "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -WorkingDirectory $frontendDir `
    -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm.cmd run dev"
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

if ($InstallDesktopShortcut) {
  Install-DesktopShortcut
  exit 0
}

if (-not (Test-PortListening -Port $BackendPort)) {
  Write-Host "Subindo backend na porta $BackendPort..." -ForegroundColor Cyan
  Start-BackendWindow -Port $BackendPort
  Start-Sleep -Seconds 2
} else {
  Write-Host "Backend ja esta ativo na porta $BackendPort." -ForegroundColor DarkCyan
}

if (-not (Test-PortListening -Port $FrontendPort)) {
  Write-Host "Subindo frontend na porta $FrontendPort..." -ForegroundColor Cyan
  Start-FrontendWindow
} else {
  Write-Host "Frontend ja esta ativo na porta $FrontendPort." -ForegroundColor DarkCyan
}

if (Wait-ForPort -Port $FrontendPort -TimeoutSeconds 45) {
  Write-Host "Abrindo aplicacao em $frontendUrl" -ForegroundColor Green
  Start-Process $frontendUrl
} else {
  Write-Host "O frontend nao respondeu na porta $FrontendPort dentro do tempo esperado." -ForegroundColor Yellow
  Write-Host "Verifique a janela do frontend para confirmar se o npm subiu corretamente." -ForegroundColor Yellow
}
