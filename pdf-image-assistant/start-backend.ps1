Set-Location "$PSScriptRoot\backend"
uvicorn main:app --reload --port 8000
