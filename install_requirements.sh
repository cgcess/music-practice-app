#!/usr/bin/env bash
# Idempotent project setup: node >= 20 check, then install npm deps.
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "node not found (need >= 20)" >&2; exit 1; fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then echo "node >= 20 required, found $(node -v)" >&2; exit 1; fi
if [ -f package-lock.json ]; then npm ci; else npm install; fi
