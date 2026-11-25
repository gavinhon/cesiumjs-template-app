# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache nginx

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

COPY scripts/writeRuntimeConfig.ts scripts/fetchLiveTraffic.ts /opt/runtime-config/scripts/
COPY vite-plugins/publicDatasetCatalog.ts vite-plugins/liveTrafficFeed.ts vite-plugins/mrtStations.ts \
  /opt/runtime-config/vite-plugins/
RUN echo '{ "type": "module" }' > /opt/runtime-config/package.json

COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

ENV APP_OFFLINE=true \
    DEFAULT_BASEMAP= \
    NOMINATIM_URL= \
    LTA_ACCOUNT_KEY= \
    NODE_NO_WARNINGS=1

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/app-config.json || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
