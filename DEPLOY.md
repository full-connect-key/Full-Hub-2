# Deploy do Full Hub na VPS da Hostinger

O Full Hub é uma aplicação Next.js: precisa de um processo Node rodando
continuamente. É esse processo que bloqueia rotas como `/dashboard/financeiro`
**antes** da página renderizar. Por isso o destino é a VPS, e não a hospedagem
compartilhada.

Arquitetura no servidor:

```
Internet → Nginx (80/443, SSL)  →  Node/Next.js (127.0.0.1:3000, sob PM2)  →  Supabase
```

O Nginx é quem fala com a internet; o Next escuta apenas em localhost.

---

## Instalação em um comando

Numa VPS Ubuntu limpa, isto faz tudo: instala Node, Nginx e PM2, clona o
projeto, builda, configura o proxy reverso e emite o certificado SSL.

```bash
ssh root@SEU_IP_AQUI

curl -fsSL https://raw.githubusercontent.com/full-connect-key/Full-Hub-2/main/deploy/bootstrap.sh -o bootstrap.sh
bash bootstrap.sh
```

O script pergunta três coisas — domínio, URL do Supabase e chave pública — e
valida cada uma antes de seguir (ele recusa, por exemplo, a `service_role`, que
nunca deve ir para o servidor web). Ao terminar, imprime o endereço do site e o
que ainda falta configurar no painel do Supabase.

Leva de 5 a 10 minutos, quase tudo no build. Pode rodar de novo quantas vezes
precisar: ele só refaz o que está faltando.

**Se o domínio ainda não estiver apontando para a VPS**, o script avisa, deixa o
site no ar por HTTP e diz qual IP configurar. Aponte o DNS e rode de novo para
ganhar o HTTPS.

Para rodar sem perguntas:

```bash
DOMINIO=hub.suaagencia.com.br \
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_KEY=sb_publishable_xxx \
EMAIL_SSL=voce@agencia.com.br \
bash bootstrap.sh
```

O passo a passo manual abaixo continua valendo — use se quiser entender cada
etapa, ou se algo falhar no meio do caminho.

---

## Antes de começar

Tenha em mãos:

- **IP da VPS** e acesso SSH root (hPanel → VPS → *Visão geral*)
- **Domínio ou subdomínio** para o hub (ex.: `hub.suaagencia.com.br`)
- **Chaves do Supabase** (Settings → API): a URL do projeto e a `anon key`

---

## 1. Preparar o servidor (manual)

Conecte via SSH e instale o que falta:

```bash
ssh root@SEU_IP_AQUI

apt update && apt upgrade -y

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git nginx

# PM2, que mantém o app vivo e o reinicia junto com o servidor
npm install -g pm2

node -v   # confirme: v22.x
```

Libere só o necessário no firewall:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

## 2. Clonar o projeto

```bash
mkdir -p /var/www /var/log/full-hub
git clone https://github.com/full-connect-key/Full-Hub-2.git /var/www/full-hub
cd /var/www/full-hub
```

> **Atenção:** o repositório ainda não tem branch `main` — o código está em
> `claude/serene-pascal-j905m0`. Enquanto for assim, clone com
> `-b claude/serene-pascal-j905m0` e rode as atualizações com
> `BRANCH=claude/serene-pascal-j905m0 ./deploy/deploy.sh`. O ideal é promover
> esse código para `main` antes do deploy e deixar o padrão do script valendo.

## 3. Configurar as variáveis de ambiente

```bash
nano /var/www/full-hub/.env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
NEXT_PUBLIC_SITE_URL=https://hub.suaagencia.com.br
```

> **Importante:** variáveis `NEXT_PUBLIC_*` são embutidas no código durante o
> build. Mudou o valor, tem que rodar o build de novo — não basta reiniciar o
> processo.

## 4. Primeiro build e start

```bash
cd /var/www/full-hub
npm ci
npm run build

# O build standalone não copia estes diretórios sozinho:
cp -r .next/static .next/standalone/.next/
cp .env.local .next/standalone/

pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup        # execute o comando que ele imprimir, para subir no boot
```

Teste localmente antes de expor:

```bash
curl -I http://127.0.0.1:3000/login     # deve responder 200
```

## 5. Apontar o domínio

No painel de DNS do domínio, crie um registro **A** apontando para o IP da VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `hub` (ou `@` para o domínio raiz) | IP da VPS |

A propagação costuma levar de minutos a algumas horas.

## 6. Nginx

```bash
cd /var/www/full-hub
# Troque o server_name pelo seu domínio antes de copiar:
nano deploy/nginx-full-hub.conf

cp deploy/nginx-full-hub.conf /etc/nginx/sites-available/full-hub
ln -s /etc/nginx/sites-available/full-hub /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
```

## 7. SSL (HTTPS)

Só depois que o DNS já estiver apontando:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d hub.suaagencia.com.br
```

O certbot edita o arquivo do Nginx sozinho, adiciona o bloco 443 e configura a
renovação automática. Escolha a opção de redirecionar HTTP para HTTPS.

## 8. Configurar o Supabase para o domínio real

Em *Authentication → URL Configuration*:

- **Site URL**: `https://hub.suaagencia.com.br`
- **Redirect URLs**: adicione `https://hub.suaagencia.com.br/auth/confirm`

Em *Authentication → Email Templates → Reset Password*, o corpo do e-mail
precisa apontar para a rota de confirmação:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha">Criar nova senha</a>
```

Sem esse ajuste o link de recuperação de senha não abre a sessão.

---

## Atualizações depois do primeiro deploy

```bash
cd /var/www/full-hub && ./deploy/deploy.sh
```

O script puxa o código, instala, builda, copia os assets e recarrega o PM2. Para
usar outra branch: `BRANCH=minha-branch ./deploy/deploy.sh`.

---

## Comandos do dia a dia

| O quê | Comando |
|---|---|
| Ver se está no ar | `pm2 status full-hub` |
| Logs ao vivo | `pm2 logs full-hub` |
| Reiniciar | `pm2 restart full-hub` |
| Erros do Nginx | `tail -f /var/log/nginx/error.log` |

---

## Se algo der errado

**502 Bad Gateway** — o Nginx está de pé, mas o Node caiu. Veja `pm2 logs full-hub`.
Quase sempre é variável de ambiente faltando ou erro de build.

**Login não redireciona / sessão não persiste** — confira se a `Site URL` no
Supabase bate exatamente com o domínio em uso (com `https://`, sem barra no
final) e se o Nginx está repassando os cabeçalhos `Host` e `X-Forwarded-Proto`.

**Link de recuperação de senha não funciona** — o template de e-mail do Supabase
ainda está no padrão. Veja o passo 8.

**Build falha por falta de memória** — VPS de 1 GB às vezes não dá conta do build
do Next. Crie swap:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Alternativa: deploy automático a cada push

O passo a passo acima é o caminho direto: Node + PM2 + Nginx, poucas peças, tudo
sob seu controle. Se vocês quiserem a experiência de "dar push e o deploy
acontecer sozinho", dá para instalar na mesma VPS um painel como **Coolify** ou
**Dokploy** — eles conectam no repositório do GitHub, buildam a cada push e
cuidam do SSL automaticamente.

O custo é consumir mais recursos da VPS (reserve de 2 GB de RAM para cima) e ter
mais uma camada para manter. Para uma equipe pequena, o `deploy.sh` resolve com
menos peças girando.
