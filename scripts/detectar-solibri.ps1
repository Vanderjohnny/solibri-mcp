<#
  Descobre o Solibri instalado e imprime o caminho do executavel.
  Consulta o registro do Windows primeiro, o que encontra a instalacao em
  qualquer disco, e devolve a versao mais nova. Sem resultado, cai para os
  locais de instalacao padrao.

  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File detectar-solibri.ps1
        powershell ... -File detectar-solibri.ps1 -Todos    (lista todas)
#>
param([switch]$Todos)

$ErrorActionPreference = 'SilentlyContinue'

$chaves = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

$encontrados = @()

foreach ($item in Get-ItemProperty $chaves) {
  if ($item.DisplayName -notlike '*Solibri*') { continue }
  if (-not $item.InstallLocation) { continue }

  $exe = Join-Path $item.InstallLocation 'Solibri.exe'
  if (-not (Test-Path $exe)) { continue }

  $versao = [version]'0.0'
  try { $versao = [version]$item.DisplayVersion } catch { }

  $encontrados += [pscustomobject]@{ Exe = $exe; Versao = $versao }
}

# Fallback: locais padrao, para instalacoes sem registro.
if ($encontrados.Count -eq 0) {
  $raizes = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)
  $marcas = @('Solibri', 'Solibri Anywhere', 'Solibri Office', 'Solibri Site')

  foreach ($raiz in $raizes) {
    if (-not $raiz) { continue }
    foreach ($marca in $marcas) {
      foreach ($sufixo in @('SOLIBRI\Solibri.exe', 'Solibri.exe')) {
        $exe = Join-Path (Join-Path $raiz $marca) $sufixo
        if (Test-Path $exe) {
          $encontrados += [pscustomobject]@{ Exe = $exe; Versao = [version]'0.0' }
        }
      }
    }
  }
}

$ordenados = $encontrados | Sort-Object Versao -Descending | Select-Object -Unique Exe, Versao

if ($ordenados.Count -eq 0) { exit 1 }

if ($Todos) {
  foreach ($i in $ordenados) { Write-Output "$($i.Exe)|$($i.Versao)" }
} else {
  Write-Output $ordenados[0].Exe
}
