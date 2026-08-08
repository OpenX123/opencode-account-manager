FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium fonts-noto-cjk novnc openssh-client postgresql-client websockify x11vnc xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

COPY backend backend
COPY frontend frontend
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH VITE_WEB_MODE=1
RUN pnpm build

ENV NODE_ENV=production \
    WEB_MODE=1 \
    REMOTE_BROWSER=1 \
    DISPLAY=:99 \
    PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
    PORT=3001 \
    DATA_DIR=/data \
    FORCE_FRONTEND_DIST=/app/frontend/dist

EXPOSE 3001 6080
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh
CMD ["/usr/local/bin/docker-entrypoint.sh"]
