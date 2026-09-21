#!/usr/bin/env bash
#
# Atualiza o Full Hub no VPS: puxa o código, instala, builda e reinicia.
#
#   cd /var/www/full-hub && ./deploy/deploy.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/full-hub}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "==> Atualizando o código (branch $BRANCH)"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Instalando dependências"
npm ci

echo "==> Build de produção"
npm run build

# O build standalone não copia estes diretórios sozinho.
echo "==> Copiando assets estáticos para o standalone"
cp -r .next/static .next/standalone/.next/
if [ -d public ]; then
  cp -r public .next/standalone/
fi

# O server.js roda com cwd em .next/standalone, então leva o .env junto.
# (As NEXT_PUBLIC_* já foram embutidas no build acima — isto é só garantia.)
if [ -f .env.local ]; then
  cp .env.local .next/standalone/
fi

echo "==> Reiniciando o processo"
if pm2 describe full-hub > /dev/null 2>&1; then
  pm2 reload full-hub --update-env
else
  pm2 start deploy/ecosystem.config.js
  pm2 save
fi

echo "==> Pronto. Status:"
pm2 status full-hub
