FROM node:22-bookworm

ARG OPENCLAW_PACKAGE=openclaw@latest

ENV OPENCLAW_STATE_DIR=/home/openclaw/.openclaw \
    OPENCLAW_CONFIG_PATH=/home/openclaw/.openclaw/openclaw.json \
    OPENCLAW_NO_RESPAWN=1 \
    NODE_COMPILE_CACHE=/tmp/openclaw-node-cache \
    NO_COLOR=1

RUN useradd --create-home --shell /bin/bash openclaw \
  && npm install -g "$OPENCLAW_PACKAGE"

WORKDIR /guard
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install --package-lock=false --omit=dev
COPY bin ./bin
COPY lib ./lib
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /guard/bin/openclaw-upgrade-guard.js \
  && mkdir -p /home/openclaw/.openclaw /reports /tmp/openclaw-node-cache \
  && chown -R openclaw:openclaw /home/openclaw /reports /tmp/openclaw-node-cache /guard

USER openclaw
ENTRYPOINT ["/entrypoint.sh"]
