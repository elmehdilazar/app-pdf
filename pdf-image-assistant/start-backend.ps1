Set-Location "$PSScriptRoot\backend"
$python = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Backend virtual environment not found. Create it with: python -m venv backend\.venv"
}
& $python -m uvicorn main:app --reload --port 8000
