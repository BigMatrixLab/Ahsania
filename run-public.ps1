# Runs the app from this PC for phones on any network: https://adynamic-trinh-thickly.ngrok-free.dev
# Forms are filled by OCR and plain rules on the CPU; no GPU or model is needed. Data lives in server\.devdata-demo.
# Logins doctor / doctor2 / admin; the password is in .public-password (kept out of git).
# Run:  powershell -ExecutionPolicy Bypass -File run-public.ps1 [-Reset] [-Demo]
#       -Reset wipes this folder's records first; -Demo adds made-up sample patients to an empty database.
# Stop: close the three windows it opens, then end any postgres.exe left running.
param([switch]$Reset, [switch]$Demo)

$root = $PSScriptRoot
$domain = "adynamic-trinh-thickly.ngrok-free.dev"
$env:CAPTURE_DEMO_PASSWORD = (Get-Content "$root\.public-password" -Raw).Trim()
$env:CAPTURE_DEV_DATA = "$root\server\.devdata-demo"
$env:CAPTURE_COOKIE_SECURE = "true"
$flags = @()
if ($Reset) { $flags += "--reset" }
if ($Demo) { $flags += "--seed-demo" }

# API on 127.0.0.1:8000; the built web app on 127.0.0.1:4173 (it forwards /api); ngrok in front.
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; uv run --extra ocr python -m capture.devserver $($flags -join ' ') --worker rules --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm run build; npx vite preview --host 127.0.0.1 --port 4173 --strictPort"
Start-Process ngrok -ArgumentList "http", "--domain=$domain", "4173"

Write-Host "Starting... open https://$domain in a minute."
