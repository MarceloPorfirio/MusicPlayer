<#
  Faz o worker de downloads iniciar sozinho, escondido, quando você entra no Windows.

    powershell -ExecutionPolicy Bypass -File scripts\worker-autostart.ps1           # instala e já inicia
    powershell -ExecutionPolicy Bypass -File scripts\worker-autostart.ps1 -Remove   # para e remove

  Cria um atalho na pasta Inicializar do seu usuário (não precisa de administrador).
  O log fica em worker.log, na raiz do projeto.
#>
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $PSScriptRoot 'worker-hidden.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$shortcut = Join-Path $startup 'Pulse Worker.lnk'
# Nome do atalho antes do app se chamar Pulse: removido ao instalar/remover.
$legacyShortcut = Join-Path $startup 'MusicPlayer Worker.lnk'
if (Test-Path $legacyShortcut) { Remove-Item $legacyShortcut }

function Stop-Worker {
  # O .vbs abre "cmd /c npm run worker": encerrando esse cmd com a árvore, vão junto o npm e o node.
  Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
    Where-Object { $_.CommandLine -match 'npm run worker' } |
    ForEach-Object {
      taskkill /PID $_.ProcessId /T /F | Out-Null
      Write-Host "Worker em execução encerrado (PID $($_.ProcessId))."
    }
}

if ($Remove) {
  Stop-Worker
  if (Test-Path $shortcut) {
    Remove-Item $shortcut
    Write-Host 'Atalho removido: o worker não inicia mais com o Windows.'
  } else {
    Write-Host 'O atalho não existia.'
  }
  return
}

if (-not (Test-Path (Join-Path $root 'worker.env'))) {
  throw "Crie o worker.env na raiz do projeto antes (copie de worker.env.example)."
}

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($shortcut)
$lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
$lnk.Arguments = "`"$vbs`""
$lnk.WorkingDirectory = $root
$lnk.Description = 'Worker de downloads do Pulse'
$lnk.Save()
Write-Host "Atalho criado em: $shortcut"

Stop-Worker
Start-Process "$env:WINDIR\System32\wscript.exe" -ArgumentList "`"$vbs`""
Write-Host "Worker iniciado em segundo plano. Log: $(Join-Path $root 'worker.log')"
