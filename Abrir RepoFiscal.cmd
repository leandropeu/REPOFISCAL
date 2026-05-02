@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "POWERSHELL_EXE=C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe"
set "LAUNCHER=%PROJECT_DIR%Abrir-RepoFiscal.ps1"

if not exist "%LAUNCHER%" (
  echo Nao encontrei o arquivo "%LAUNCHER%".
  echo Verifique se este lancador esta na pasta REPOFISCAL.
  pause
  exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%"

if errorlevel 1 (
  echo.
  echo Nao foi possivel abrir o RepoFiscal. Verifique as mensagens acima.
  pause
)
