#!/bin/sh
# Миграции накатываются перед стартом сервера. Администратора здесь не
# заводим: его создаёт deploy.sh командой admin:init и сразу печатает вход.
set -e

echo "==> prisma migrate deploy"
npx prisma migrate deploy

echo "==> запуск сервера"
exec node dist/main.js
