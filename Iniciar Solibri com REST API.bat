@echo off
setlocal enabledelayedexpansion
REM Abre o Solibri com a REST API local ativa na porta 10876, em HTTP.
REM Sem --rest-api-server-http o Solibri usa HTTPS com certificado autoassinado.

set "PORTA=10876"
set "SOLIBRI="

REM Permite sobrescrever a deteccao definindo SOLIBRI_EXE no ambiente.
if defined SOLIBRI_EXE (
  if exist "%SOLIBRI_EXE%" set "SOLIBRI=%SOLIBRI_EXE%"
)

REM Procura Solibri.exe nos locais de instalacao usuais.
if not defined SOLIBRI (
  for %%R in ("%ProgramFiles%" "%ProgramFiles(x86)%") do (
    for %%B in ("Solibri" "Solibri Anywhere" "Solibri Office" "Solibri Site") do (
      if exist "%%~R\%%~B\SOLIBRI\Solibri.exe" set "SOLIBRI=%%~R\%%~B\SOLIBRI\Solibri.exe"
      if exist "%%~R\%%~B\Solibri.exe"        set "SOLIBRI=%%~R\%%~B\Solibri.exe"
    )
  )
)

if not defined SOLIBRI (
  echo Solibri nao encontrado nos locais padrao.
  echo Defina a variavel SOLIBRI_EXE com o caminho completo do Solibri.exe e rode de novo.
  pause
  exit /b 1
)

echo Iniciando: !SOLIBRI!
echo REST API: http://127.0.0.1:%PORTA%/solibri/v1
start "" "!SOLIBRI!" --rest-api-server-port=%PORTA% --rest-api-server-http
endlocal
