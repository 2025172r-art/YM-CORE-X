@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3 -m venv .venv || (echo Python 3.11+ is required.& pause & exit /b 1)
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (pause & exit /b 1)
if not exist .env .venv\Scripts\python.exe setup.py
if errorlevel 1 (pause & exit /b 1)
.venv\Scripts\python.exe app.py
pause
