#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist/assets/brand
cp index.html admin.html privacy.html _redirects _headers dist/
cp assets/public.css assets/public.js assets/qr.js assets/qr.LICENSE.txt dist/assets/
cp assets/brand/memory-icon.svg dist/assets/brand/
