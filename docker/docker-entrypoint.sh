#!/bin/sh
set -eu

mkdir -p /run/app /run/nginx

if [ ! -d /data ]; then
  echo "No /data folder mounted; the app will start with no datasets." >&2
  mkdir -p /data
fi

node /opt/runtime-config/scripts/writeRuntimeConfig.ts \
  --data /data \
  --data-url data \
  --out /run/app \
  --offline "${APP_OFFLINE:-true}" \
  --default-basemap "${DEFAULT_BASEMAP:-}" \
  --nominatim-upstream "${NOMINATIM_URL:-}" \
  --live-traffic "$( [ -n "${LTA_ACCOUNT_KEY:-}" ] && echo true || echo false )"

case "${APP_OFFLINE:-true}" in
  true|1|yes|on|TRUE|True) ;;
  *)
    if [ -n "${LTA_ACCOUNT_KEY:-}" ]; then
      node /opt/runtime-config/scripts/fetchLiveTraffic.ts --out /run/app/live &
    fi
    ;;
esac

exec nginx -g 'daemon off;'
