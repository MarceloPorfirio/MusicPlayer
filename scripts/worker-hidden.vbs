' Inicia o worker de downloads sem janela, gravando a saída em worker.log na raiz do projeto.
' É o que o atalho da Inicialização do Windows chama (ver scripts/worker-autostart.ps1).
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = root
shell.Run "cmd /c npm run worker >> worker.log 2>&1", 0, False
