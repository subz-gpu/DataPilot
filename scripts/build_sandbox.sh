#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -t datapilot-sandbox agents/sandbox
echo "Built image: datapilot-sandbox"
