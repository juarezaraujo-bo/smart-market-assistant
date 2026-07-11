@echo off
cd /d C:\Users\User\.gemini\antigravity\scratch\smart-market-assistant
echo Starting SmartMarket dev server at %DATE% %TIME% > dev-server.out.log
"C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev >> dev-server.out.log 2>> dev-server.err.log
