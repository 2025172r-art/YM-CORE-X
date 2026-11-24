#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
if [ ! -f .env ]; then
  .venv/bin/python setup.py
fi
exec .venv/bin/python app.py
