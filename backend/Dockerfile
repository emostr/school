FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# tesseract распознаёт клетки бланков, tini обрабатывает сигналы остановки.
# Языковые данные ставятся отдельными пакетами: русский нужен для букв,
# английский — для цифр и кода бланка (в базовом пакете их нет).
RUN apk add --no-cache tini tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-rus
COPY package.json package-lock.json ./
# prisma остаётся в prod-зависимостях: entrypoint накатывает миграции.
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/dist ./dist
# Служебные команды (создание и восстановление администратора, демо-данные)
# должны быть под рукой там же, где база: внутри контейнера.
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data/uploads
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
