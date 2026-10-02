#!/usr/bin/env bash
set -euo pipefail

# Compatibility shortcut; the Node script also works on Windows.
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
exec npm run package
