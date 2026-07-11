$ErrorActionPreference = "Continue"
$workspace = "C:\Users\User\.gemini\antigravity\scratch\smart-market-assistant"
$log = Join-Path $workspace "dev-server.out.log"
$err = Join-Path $workspace "dev-server.err.log"
Set-Location $workspace
"Starting SmartMarket dev server at $(Get-Date -Format o)" | Out-File -FilePath $log -Encoding utf8
try {
  & "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev *>> $log
} catch {
  $_ | Out-File -FilePath $err -Encoding utf8
  throw
}
