# Full Hub

Plataforma da agência com duas áreas sobre o mesmo backend:

- **Painel Interno** (`/painel`) — equipe da agência
- **Portal do Cliente** (`/portal`) — clientes da agência

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres).

> Estado atual: **fundação**. Autenticação, perfis, controle de acesso, modelagem de dados e
> o shell das duas áreas estão prontos. As telas de cada módulo chegam nos próximos sprints.

---

## Perfis de acesso

| Perfil | Área | Acesso |
|---|---|---|
| `cliente` | Portal do Cliente | Apenas dados da(s) empresa(s) à(s) qual(is) está vinculado |
| `colaborador` | Painel Interno | Tarefas, Diário, Mês a Mês, Skills, Recomendações |
| `desenvolvedor` | Painel Interno | Tudo, **exceto** Financeiro |
| `socio` | Painel Interno | Tudo, incluindo Financeiro e Aprovações de RH |

Após o login o usuário é redirecionado automaticamente: `cliente` → `/portal`, os demais → `/painel`.

Podem existir vários usuários por empresa cliente, todos com o mesmo nível de acesso
(sem hierarquia entre eles) — o vínculo fica em `client_users`.

### Onde as permissões são definidas

Tudo em **`lib/auth/roles.ts`** — menus, rotas e a função `canAccessPath()`. Para mudar quem vê
o quê, altere apenas esse arquivo.

O bloqueio é aplicado em três camadas:

1. **`middleware.ts`** — barra a requisição antes de renderizar (bloqueio real)
2. **Layouts e páginas restritas** — revalidam no servidor via `requireUser()`
3. **RLS no Postgres** — isola os dados por `client_id`, mesmo que a camada web falhe

A sidebar apenas *esconde* o que essas camadas já proíbem.

---

## Configuração

### 1. Instalar

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local` com as chaves do seu projeto Supabase (*Settings → API*):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Criar o banco

Rode `supabase/migrations/20260921000001_init.sql` no **SQL Editor** do Supabase
(ou `supabase db push` com a CLI). A migration cria:

- `users` — espelho de `auth.users` com o `role` de cada pessoa
- `clients` — empresas atendidas (inclui `drive_folder_id`)
- `client_users` — vínculo N:N entre usuários e empresas
- `team_members` — dados de RH da equipe interna
- Trigger que cria a linha em `users` a cada conta nova no Auth
- Policies de RLS em todas as tabelas

### 3. Configurar o Auth no Supabase

Em *Authentication → URL Configuration*:

- **Site URL**: a URL da aplicação (ex.: `http://localhost:3000`)
- **Redirect URLs**: inclua `http://localhost:3000/auth/confirm` e a URL de produção

Em *Authentication → Email Templates → Reset Password*, o link precisa apontar para a rota
de confirmação com `token_hash` — substitua o corpo padrão por:

```
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha">Criar nova senha</a>
```

### 4. Criar o primeiro usuário

Crie a conta em *Authentication → Users → Add user* e depois defina o perfil:

```sql
update public.users set role = 'socio', nome = 'Seu Nome'
where email = 'voce@agencia.com.br';
```

Para um usuário cliente, além de definir `role = 'cliente'`, vincule-o a uma empresa:

```sql
insert into public.clients (nome_empresa, nome_contato, email_contato)
values ('Empresa Exemplo', 'Contato', 'contato@exemplo.com.br');

insert into public.client_users (client_id, user_id)
select c.id, u.id from public.clients c, public.users u
where c.nome_empresa = 'Empresa Exemplo' and u.email = 'cliente@exemplo.com.br';
```

### 5. Rodar

```bash
npm run dev       # desenvolvimento
npm run build     # build de produção
npm run typecheck # checagem de tipos
```

Para publicar na VPS, veja **[DEPLOY.md](DEPLOY.md)**.

---

## Segurança da sessão

- Login por **e-mail + senha** (Supabase Auth), com recuperação por link enviado por e-mail.
- A sessão é revalidada no servidor a cada request (`supabase.auth.getUser()`), nunca apenas
  lida do cookie.
- **Portal do Cliente**: encerramento automático após **30 minutos de inatividade**
  (`components/inactivity-guard.tsx`). O carimbo de atividade é compartilhado entre abas via
  `localStorage`, então abas paralelas não derrubam umas às outras. O Painel Interno não tem
  esse timeout.
- A recuperação de senha responde sempre a mesma mensagem, existindo a conta ou não, para não
  permitir enumeração de usuários.

---

## Estrutura

```
app/
  login/                  tela de login (logo central, e-mail, senha, esqueci a senha)
  esqueci-senha/          solicitação do link de recuperação
  redefinir-senha/        criação da nova senha
  auth/confirm/           consome o link do e-mail e abre a sessão
  auth/signout/           encerra a sessão
  painel/                 Painel Interno (layout + telas por módulo)
  portal/                 Portal do Cliente (layout com timeout + telas)
components/
  logo.tsx                marca "Full Hub"
  sidebar.tsx             menu lateral já filtrado por role
  app-shell.tsx           moldura comum às duas áreas
  inactivity-guard.tsx    timeout de 30 min do Portal
  page-placeholder.tsx    tela vazia dos módulos futuros
lib/
  auth/roles.ts           perfis, menus e autorização de rota
  auth/session.ts         usuário da sessão + guardas de servidor
  supabase/               clients (browser / server / middleware)
supabase/migrations/      schema e RLS
middleware.ts             refresh de sessão + bloqueio por role
```

---

## Decisões que valem revisar

- **Aprovações de RH** (`/painel/rh/aprovacoes`) ficaram restritas a `socio`, seguindo a
  descrição do perfil. Se `desenvolvedor` também precisar aprovar, basta incluir o role no item
  correspondente em `lib/auth/roles.ts`.
- Rotas internas ainda não mapeadas no menu ficam liberadas aos perfis internos por padrão —
  exceto sob `/painel/financeiro`, que é sempre restrito a `socio`.
- O `role` é lido de `public.users` a cada request no middleware. Se o volume justificar,
  o passo seguinte é promovê-lo a claim no JWT (`app_metadata`) e ler direto do token.
