# MixCerto - imagem de producao (API + interface no mesmo processo)
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    MIXCERTO_DB=/app/data/db.json

# Dependencias primeiro (melhor cache de camadas); devDeps sao necessarias para o build
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
