#!/bin/sh
# Container start: describe the mounted datasets and this deployment's
# settings to the app, then hand over to nginx.
#
# Everything the app learns about where it's running comes from here, via
# environment variables (set in .env / docker-compose.yml):
#
#   APP_OFFLINE      true: hide everything that needs the internet
#   DEFAULT_BASEMAP  id of the basemap to start on (optional)
#   NOMINATIM_URL    a Nominatim server as the container reaches it, to
#                    proxy for place search (optional)
#   LTA_ACCOUNT_KEY  an LTA DataMall key: live congestion and incidents
#                    (optional; ignored when APP_OFFLINE is true)
#
# The scan runs on every start, so adding a dataset to the host folder is
# picked up by `docker compose restart` — no rebuild.
set -eu

# /run is a tmpfs when the container runs read-only (docker-compose.yml),
# so these start empty every time.
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

# Live traffic: a background reader of LTA DataMall, writing the snapshots
# nginx serves at /live/. Only with a key, and never offline: LTA is on
# the internet. It reads the key from the environment it inherits, so the
# key never appears in the process list. It runs beside nginx for the
# container's life; if it ever stops, the map shows the snapshot's age
# climbing, and `docker compose restart app` starts it again.
case "${APP_OFFLINE:-true}" in
  true|1|yes|on|TRUE|True) ;;
  *)
    if [ -n "${LTA_ACCOUNT_KEY:-}" ]; then
      node /opt/runtime-config/scripts/fetchLiveTraffic.ts --out /run/app/live &
    fi
    ;;
esac

exec nginx -g 'daemon off;'
