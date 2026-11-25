# syntax=docker/dockerfile:1
#
# The app as a self-contained image for air-gapped networks: the built
# site, served by nginx, with its datasets read from a host folder mounted
# at /data — never baked in. See docs/deployment-docker.md.
#
#   docker compose build          # on a machine with internet access
#   docker compose up -d          # with DATA_DIR set in .env

# --- Build: the same `npm ci && npm run build` as GitHub Pages ------------
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, in their own layer, so editing source doesn't
# re-download node_modules on every build.
COPY package.json package-lock.json ./
RUN npm ci

# .dockerignore keeps public/'s dataset folders out of the build context.
# That matters twice over: Vite copies public/ into dist/ (the data would
# be baked into the image), and the build-time scan would bake a catalogue
# of it into the bundle. Here the scan finds nothing, and the container
# writes the real catalogue at start instead.
COPY . .
RUN npm run build

# --- Serve: nginx plus Node, for the startup scan --------------------------
#
# Node is here to run scripts/writeRuntimeConfig.ts when the container
# starts — the same dataset scan the Vite plugin does, over the mounted
# folder — and, with an LTA key, scripts/fetchLiveTraffic.ts beside nginx.
# Starting from the Node image and adding nginx (rather than the reverse)
# pins Node 24, whose built-in TypeScript type stripping is what lets those
# scripts run as-is, without a compiler or node_modules.
FROM node:24-alpine
RUN apk add --no-cache nginx

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The startup scan and the live traffic reader: the scripts, the plugins
# whose logic they reuse, and a package.json saying these .ts files are ES
# modules. (The plugins' `import type`s of src/lib are stripped, so src/
# isn't needed.)
COPY scripts/writeRuntimeConfig.ts scripts/fetchLiveTraffic.ts /opt/runtime-config/scripts/
COPY vite-plugins/publicDatasetCatalog.ts vite-plugins/liveTrafficFeed.ts /opt/runtime-config/vite-plugins/
RUN echo '{ "type": "module" }' > /opt/runtime-config/package.json

COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Belt and braces with .gitattributes: strip CRLFs a Windows checkout may
# have added, which would stop the script from running at all.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

# Defaults for running the image with plain `docker run`; docker-compose.yml
# sets these from .env. Offline is the default because air-gapped networks
# are what this image is for.
ENV APP_OFFLINE=true \
    DEFAULT_BASEMAP= \
    NOMINATIM_URL= \
    LTA_ACCOUNT_KEY= \
    NODE_NO_WARNINGS=1

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/app-config.json || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
