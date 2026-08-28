@echo off
setlocal enabledelayedexpansion
REM Abre o Solibri com a REST API local ativa na porta 10876, em HTTP.
REM Sem --rest-api-server-http o Solibri usa HTTPS com certificado autoassinado.

set "PORTA=10876"
set "SOLIBRI="
set "DETECTOR=%~dp0scripts\detectar-solibri.ps1"

REM 1. Caminho definido pelo usuario tem prioridade.
if defined SOLIBRI_EXE (
  if exist "%SOLIBRI_EXE%" set "SOLIBRI=%SOLIBRI_EXE%"
)

REM 2. Registro do Windows: acha a instalacao em qualquer disco, a mais nova primeiro.
if not defined SOLIBRI (
  if exist "%DETECTOR%" (
    for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%DETECTOR%"`) do (
      set "SOLIBRI=%%P"
    )
  )
)

REM 3. Ultimo recurso: locais de instalacao padrao.
if not defined SOLIBRI (
  for %%R in ("%ProgramFiles%" "%ProgramFiles(x86)%") do (
    for %%B in ("Solibri" "Solibri Anywhere" "Solibri Office" "Solibri Site") do (
      if exist "%%~R\%%~B\SOLIBRI\Solibri.exe" set "SOLIBRI=%%~R\%%~B\SOLIBRI\Solibri.exe"
      if exist "%%~R\%%~B\Solibri.exe"        set "SOLIBRI=%%~R\%%~B\Solibri.exe"
    )
  )
)

if not defined SOLIBRI (
  echo Solibri nao encontrado.
  echo Defina a variavel SOLIBRI_EXE com o caminho completo do Solibri.exe e rode de novo.
  pause
  exit /b 1
)

REM Uma instancia aberta sem os parametros nao sobe a API: avisa antes de abrir outra.
tasklist /fi "imagename eq Solibri.exe" 2>nul | find /i "Solibri.exe" >nul
if not errorlevel 1 (
  echo.
  echo ATENCAO: ja existe um Solibri aberto.
  echo Feche-o antes de continuar, senao a REST API nao sera ativada.
  echo.
  pause
)

echo Iniciando: !SOLIBRI!
echo REST API: http://127.0.0.1:%PORTA%/solibri/v1
start "" "!SOLIBRI!" --rest-api-server-port=%PORTA% --rest-api-server-http
endlocal
