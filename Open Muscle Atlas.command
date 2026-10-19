#!/bin/zsh
cd -- "$(dirname "$0")"
if curl -fsS http://127.0.0.1:4173/ 2>/dev/null | grep -q 'Muscle Atlas'; then
  open http://127.0.0.1:4173/
else
  ATLAS_OPEN_BROWSER=1 python3 server.py
fi
