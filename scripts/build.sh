#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist/assets/brand dist/assets/batches
cp index.html admin.html privacy.html _redirects _headers dist/
cp assets/public.css assets/archive-theme.css assets/archive-icons.js assets/archive-icons.LICENSE.txt assets/public.js assets/qr.js assets/qr.LICENSE.txt dist/assets/
cp assets/brand/memory-icon.svg dist/assets/brand/
for year in 2022 2023 2024 2026; do cp "assets/batches/$year.jpg" dist/assets/batches/; done
