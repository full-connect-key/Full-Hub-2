# Full Hub

Plataforma da agência com dois ambientes sobre o mesmo backend:

- **Dashboard Full** (`/dashboard`) — equipe da Full Connect Key
- **Portal do Cliente** (`/portal/<empresa>`) — cada cliente no seu endereço

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres).

> Estado atual: **fundação**. Autenticação, perfis, controle de acesso, modelagem de dados e
> o shell das duas áreas estão prontos. As telas de cada módulo chegam nos próximos sprints.

---

## Perfis de acesso

| Perfil | Ambiente | Acesso |
|---|---|---|
| `cliente` | Portal do Cliente | Somente a empresa à qual está vinculado |
| `colaborador` | Dashboard Full | Tarefas, Diário, Mês a Mês, Skills, Recomendações |
| `desenvolvedor` | Dashboard Full + qualquer portal | Tudo, **exceto** Financeiro |
| `socio` | Dashboard Full + qualquer portal | Tudo, incluindo Financeiro e Aprovações de RH |

Após o login o destino sai do banco: `cliente` vai para `/portal/<empresa>`, os demais para
`/dashboard`. A escolha "Sou Colaborador / Sou Cliente" na tela de login define só a experiência
de entrada — se não bater com o perfil cadastrado, o banco vence.

### Endereço de cada cliente

Cada empresa tem um `slug` gerado do nome: *Mundo Verde* → `/portal/mundo-verde`. O cliente não
escolhe qual conta abrir; o endereço vem do cadastro. Homônimos recebem sufixo (`mundo-verde-2`).
Trocar o slug na URL não abre a conta alheia — a consulta passa pelo RLS e volta vazia.

### Visita administrativa

`desenvolvedor` e `socio` abrem o portal de qualquer cliente **mantendo a própria identidade** —
não existe "entrar como" o cliente. Uma faixa no topo deixa isso explícito, e a sessão continua
sendo a da pessoa interna.

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

> **Regra arquitetural:** todo dado que pertence a um cliente precisa ter dono identificável por
> `client_id` — direto na tabela ou por uma relação-pai inequívoca. Vale para tudo que vier
> (posts, campanhas, arquivos, aprovações, comentários). Dashboard e Portal trabalham sobre os
> mesmos registros; nunca duplicar base para as duas interfaces.

### Testes

```bash
npm test     # 21 verificações de rota e permissão por perfil
```

Os testes de RLS rodam contra um Postgres local — 23 verificações, ver
[supabase/tests](supabase/tests/README.md).

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
- Trigger que impede a escalação de privilégio na coluna `role`

Para conferir que o isolamento está de pé, rode os testes de RLS — instruções em
[supabase/tests](supabase/tests/README.md).

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

> O perfil de uma conta nova é sempre `cliente`. O `role` só é lido de
> `app_metadata`, que apenas a API de admin escreve — assim ninguém se cadastra
> escolhendo o próprio nível de acesso. Promover é sempre um ato deliberado:
> pelo SQL Editor, como acima, ou por um `socio` dentro do sistema.

Como este é um sistema interno, vale desativar o cadastro público em
*Authentication → Sign In / Providers → Email*, desmarcando **Allow new users to
sign up**. Assim só quem a agência cadastrar entra.

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
  `localStorage`, então abas paralelas não derrubam umas às outras. O Dashboard Full não tem
  esse timeout.
- A recuperação de senha responde sempre a mesma mensagem, existindo a conta ou não, para não
  permitir enumeração de usuários.
- A coluna `role` é protegida por trigger: ninguém altera o próprio perfil, nem mesmo com acesso
  direto à API do Supabase. Só um `socio` promove outra pessoa.
- O perfil de uma conta nova nunca vem do cadastro: é lido de `app_metadata`, gravável apenas pela
  API de admin. Ver [supabase/tests](supabase/tests/README.md).

---

## Estrutura

```
app/
  login/                  escolha do ambiente + e-mail, senha e mostrar/ocultar
  esqueci-senha/          solicitação do link de recuperação
  redefinir-senha/        criação da nova senha
  auth/confirm/           consome o link do e-mail e abre a sessão
  auth/signout/           encerra a sessão
  dashboard/              Dashboard Full (layout + telas por módulo)
  portal/                 raiz: cliente é encaminhado, equipe escolhe a conta
  portal/[slug]/          Portal de uma empresa (timeout + telas)
components/
  logo.tsx                marca "Full Hub"
  sidebar.tsx             menu lateral já filtrado por role
  app-shell.tsx           moldura comum aos dois ambientes
  viewing-as-banner.tsx   faixa de visita administrativa
  inactivity-guard.tsx    timeout de 30 min do Portal
  page-placeholder.tsx    tela vazia dos módulos futuros
lib/
  auth/roles.ts           perfis, menus e autorização de rota
  auth/session.ts         usuário da sessão + guardas de servidor
  supabase/               clients (browser / server / middleware)
supabase/migrations/      schema, RLS e slugs
supabase/tests/           testes de RLS
tests/                    testes de rota e permissão
middleware.ts             refresh de sessão + bloqueio por role
```

---

## Decisões que valem revisar

- **Colaborador não abre portal de cliente.** O roadmap cita apenas `desenvolvedor` e `socio`
  com acesso administrativo às contas. Muda-se em `PORTAL_ADMIN_ROLES`.
- **Aprovações de RH** (`/dashboard/rh/aprovacoes`) ficaram restritas a `socio`, seguindo a
  descrição do perfil. Se `desenvolvedor` também precisar aprovar, basta incluir o role no item
  correspondente em `lib/auth/roles.ts`.
- Rotas internas ainda não mapeadas no menu ficam liberadas aos perfis internos por padrão —
  exceto sob `/dashboard/financeiro`, que é sempre restrito a `socio`.
- O `role` é lido de `public.users` a cada request no middleware. Se o volume justificar,
  o passo seguinte é promovê-lo a claim no JWT (`app_metadata`) e ler direto do token.
