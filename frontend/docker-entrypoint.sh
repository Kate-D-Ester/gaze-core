#!/bin/sh
set -eu

BACKEND_URL="${VITE_GAZECORE_BACKEND_URL:-}"
ESCAPED_BACKEND_URL=$(printf '%s' "$BACKEND_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat >/tmp/runtime-config.js <<EOF
window.__GAZECORE_CONFIG__ = {
  backendBaseUrl: "$ESCAPED_BACKEND_URL",
};
EOF

exec nginx -g 'daemon off;'
