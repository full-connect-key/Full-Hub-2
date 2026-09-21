#!/usr/bin/env bash
#
# Full Hub — instalação completa numa VPS Ubuntu limpa, em um comando.
#
# Instala Node, Nginx e PM2, clona o projeto, builda, configura o proxy reverso
# e emite o certificado SSL. Pode rodar de novo quantas vezes precisar: o script
# é idempotente e só refaz o que está faltando.
#
# Uso (como root):
#
#   bash bootstrap.sh
#
# Ou informando tudo de uma vez, sem perguntas:
#
#   DOMINIO=hub.suaagencia.com.br \
#   SUPABASE_URL=https://xxxx.supabase.co \
#   SUPABASE_KEY=sb_publishable_xxx \
#   EMAIL_SSL=voce@agencia.com.br \
#   bash bootstrap.sh
#
set -euo pipefail

REPO="${REPO:-https://github.com/full-connect-key/Full-Hub-2.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/full-hub}"
LOG_DIR="${LOG_DIR:-/var/log/full-hub}"
NODE_MAJOR=22

# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  AZUL=$'\033[1;34m'; VERDE=$'\033[1;32m'; AMARELO=$'\033[1;33m'
  VERMELHO=$'\033[1;31m'; NEUTRO=$'\033[0m'
else
  AZUL=""; VERDE=""; AMARELO=""; VERMELHO=""; NEUTRO=""
fi

passo()  { echo; echo "${AZUL}==> $*${NEUTRO}"; }
ok()     { echo "${VERDE}    ✓ $*${NEUTRO}"; }
aviso()  { echo "${AMARELO}    ! $*${NEUTRO}"; }
erro()   { echo "${VERMELHO}    ✗ $*${NEUTRO}" >&2; }
morrer() { erro "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Verificações iniciais
# ---------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || morrer "Rode como root:  sudo bash bootstrap.sh"
command -v apt-get >/dev/null || morrer "Este script é para Ubuntu/Debian."

# ---------------------------------------------------------------------------
# Coleta dos dados
# ---------------------------------------------------------------------------
perguntar() {
  # perguntar <nome-da-variavel> <texto> [validacao-regex] [mensagem-de-erro]
  local var="$1" texto="$2" regex="${3:-.+}" msg="${4:-Valor inválido.}"
  local valor="${!var:-}"

  while [ -z "$valor" ] || ! [[ "$valor" =~ $regex ]]; do
    if [ -n "$valor" ]; then erro "$msg"; fi
    if [ ! -t 0 ]; then
      morrer "Faltou $var. Informe pela linha de comando (veja o cabeçalho do script)."
    fi
    read -r -p "    $texto: " valor
  done

  printf -v "$var" '%s' "$valor"
}

echo
echo "${AZUL}┌───────────────────────────────────────────┐${NEUTRO}"
echo "${AZUL}│  Full Hub — instalação na VPS             │${NEUTRO}"
echo "${AZUL}└───────────────────────────────────────────┘${NEUTRO}"
echo
echo "    Precisarei de três informações:"

perguntar DOMINIO "Domínio do hub (ex.: hub.suaagencia.com.br)" \
  '^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$' \
  "Domínio inválido — informe só o nome, sem https:// e sem barras."

perguntar SUPABASE_URL "URL do projeto Supabase (https://xxxx.supabase.co)" \
  '^https://[a-z0-9-]+\.supabase\.(co|in)$' \
  "URL inválida — deve ser https://<projeto>.supabase.co, sem barra no final."

perguntar SUPABASE_KEY "Chave pública do Supabase (sb_publishable_... ou a anon key)" \
  '^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$' \
  "Chave inválida. Atenção: nunca use aqui a service_role / sb_secret_."

EMAIL_SSL="${EMAIL_SSL:-}"
if [ -z "$EMAIL_SSL" ] && [ -t 0 ]; then
  read -r -p "    E-mail para avisos do certificado SSL (Enter para pular): " EMAIL_SSL || true
fi

# ---------------------------------------------------------------------------
# 1. Pacotes
# ---------------------------------------------------------------------------
passo "Instalando dependências do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
ok "Node $(node -v)"

apt-get install -y -qq git nginx curl >/dev/null
ok "git, nginx"

command -v pm2 >/dev/null || npm install -g pm2 --silent >/dev/null
ok "pm2 $(pm2 -v 2>/dev/null || echo)"

# ---------------------------------------------------------------------------
# 2. Swap — o build do Next não cabe em 1 GB de RAM
# ---------------------------------------------------------------------------
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "$RAM_MB" -lt 2000 ] && [ "$SWAP_MB" -lt 1000 ]; then
  passo "RAM baixa (${RAM_MB} MB) — criando swap de 2 GB para o build"
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "swap ativo"
fi

# ---------------------------------------------------------------------------
# 3. Código
# ---------------------------------------------------------------------------
passo "Obtendo o código"
mkdir -p "$LOG_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
  ok "atualizado a partir de origin/$BRANCH"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
  ok "clonado em $APP_DIR"
fi

# ---------------------------------------------------------------------------
# 4. Variáveis de ambiente
# ---------------------------------------------------------------------------
passo "Gravando as variáveis de ambiente"
cat > "$APP_DIR/.env.local" <<ENV
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_KEY
NEXT_PUBLIC_SITE_URL=https://$DOMINIO
ENV
chmod 600 "$APP_DIR/.env.local"
ok ".env.local gravado"

# ---------------------------------------------------------------------------
# 5. Build
# ---------------------------------------------------------------------------
passo "Instalando pacotes e buildando (leva alguns minutos)"
cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run build
cp -r .next/static .next/standalone/.next/
[ -d public ] && cp -r public .next/standalone/
cp .env.local .next/standalone/
ok "build concluído"

# ---------------------------------------------------------------------------
# 6. Processo
# ---------------------------------------------------------------------------
passo "Subindo a aplicação"
if pm2 describe full-hub >/dev/null 2>&1; then
  pm2 reload full-hub --update-env >/dev/null
else
  pm2 start "$APP_DIR/deploy/ecosystem.config.js" >/dev/null
fi
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

sleep 3
if curl -sf -o /dev/null --max-time 10 http://127.0.0.1:3000/login; then
  ok "aplicação respondendo em 127.0.0.1:3000"
else
  erro "a aplicação não respondeu. Veja os logs com:  pm2 logs full-hub"
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. Nginx
# ---------------------------------------------------------------------------
passo "Configurando o Nginx para $DOMINIO"
sed "s/hub\.suaagencia\.com\.br/$DOMINIO/g" "$APP_DIR/deploy/nginx-full-hub.conf" \
  > /etc/nginx/sites-available/full-hub
ln -sf /etc/nginx/sites-available/full-hub /etc/nginx/sites-enabled/full-hub
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || morrer "configuração do Nginx inválida (rode: nginx -t)"
systemctl reload nginx
ok "proxy reverso ativo"

# ---------------------------------------------------------------------------
# 8. Firewall
# ---------------------------------------------------------------------------
if command -v ufw >/dev/null; then
  passo "Liberando as portas no firewall"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "SSH, HTTP e HTTPS liberados"
fi

# ---------------------------------------------------------------------------
# 9. SSL — só se o DNS já estiver apontando para esta máquina
# ---------------------------------------------------------------------------
passo "Verificando o DNS de $DOMINIO"
IP_SERVIDOR=$(curl -sf --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')
IP_DOMINIO=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || true)

SSL_OK=false
if [ -z "$IP_DOMINIO" ]; then
  aviso "o domínio ainda não resolve — o DNS não foi configurado ou não propagou"
elif [ "$IP_DOMINIO" != "$IP_SERVIDOR" ]; then
  aviso "o domínio aponta para $IP_DOMINIO, mas esta máquina é $IP_SERVIDOR"
else
  ok "o domínio aponta para esta máquina"
  passo "Emitindo o certificado SSL"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  CERTBOT_EMAIL_ARGS=(--register-unsafely-without-email)
  [ -n "$EMAIL_SSL" ] && CERTBOT_EMAIL_ARGS=(--email "$EMAIL_SSL")
  if certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --redirect \
       "${CERTBOT_EMAIL_ARGS[@]}"; then
    SSL_OK=true
    ok "HTTPS ativo e renovação automática configurada"
  else
    aviso "o certbot falhou — o site continua no ar por HTTP"
  fi
fi

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
echo
echo "${VERDE}┌───────────────────────────────────────────┐${NEUTRO}"
echo "${VERDE}│  Full Hub no ar                           │${NEUTRO}"
echo "${VERDE}└───────────────────────────────────────────┘${NEUTRO}"
echo
if [ "$SSL_OK" = true ]; then
  echo "    Acesse:  ${AZUL}https://$DOMINIO${NEUTRO}"
else
  echo "    Acesse:  ${AZUL}http://$DOMINIO${NEUTRO}   (sem HTTPS ainda)"
  echo
  echo "    Para ativar o HTTPS, aponte o DNS de $DOMINIO para $IP_SERVIDOR"
  echo "    (registro A) e rode este script de novo."
fi
echo
echo "    Ainda falta fazer no painel do Supabase:"
echo "      1. Authentication → URL Configuration"
echo "         Site URL:      https://$DOMINIO"
echo "         Redirect URLs: https://$DOMINIO/auth/confirm"
echo "      2. Authentication → Email Templates → Reset Password"
echo "         (o modelo está no DEPLOY.md — sem ele a recuperação de senha não funciona)"
echo "      3. Desative o cadastro público em Sign In / Providers → Email"
echo
echo "    Comandos úteis:"
echo "      pm2 status full-hub      estado da aplicação"
echo "      pm2 logs full-hub        logs ao vivo"
echo "      cd $APP_DIR && ./deploy/deploy.sh    atualizar depois de um push"
echo
