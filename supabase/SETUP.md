# Configurar o Supabase

Roteiro do que precisa existir no projeto Supabase para o Full Hub funcionar.
Pode ser seguido de uma vez ou retomado do ponto em que parou.

**Projeto atual:** `bqrxokpphvvblrturuuh`

A qualquer momento, rode [`verificar.sql`](verificar.sql) no SQL Editor para
saber o que já está pronto e o que falta. Ele não altera nada.

---

## 1. Migrations

No **SQL Editor**, rode os três arquivos **nesta ordem**, um de cada vez:

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1 | `migrations/20260921000001_init.sql` | tabelas base, RLS, proteção do papel |
| 2 | `migrations/20260921000002_client_slug.sql` | endereço de cada cliente |
| 3 | `migrations/20260921000003_admin.sql` | administração, áreas, auditoria |

São idempotentes: rodar de novo por cima não quebra nada. Mensagens
`NOTICE ... skipping` são normais.

> Se você rodou o arquivo 1 antes de 22/09, **rode de novo**: ele mudou duas
> vezes, e é onde estão as duas correções de segurança.

Confira com `verificar.sql`. Deve terminar em "Banco pronto".

---

## 2. URLs do Auth

Em **Authentication → URL Configuration**:

- **Site URL**: a URL onde o Full Hub roda
  (`http://localhost:3000` enquanto testa; depois `https://hub.suaagencia.com.br`)
- **Redirect URLs**: adicione `<sua-url>/auth/confirm`

Sem isso o login funciona, mas a recuperação de senha não fecha o ciclo.

---

## 3. Template do e-mail de recuperação

Em **Authentication → Email Templates → Reset Password**, substitua o corpo por:

```html
<h2>Criar nova senha</h2>
<p>Você pediu para redefinir sua senha no Full Hub.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha">
    Criar nova senha
  </a>
</p>
<p>Se não foi você, ignore este e-mail.</p>
```

O template padrão aponta para outro lugar e o link não abre a sessão.

---

## 4. Desativar o cadastro público

Em **Authentication → Sign In / Providers → Email**, desmarque
**Allow new users to sign up**.

O Full Hub é interno: quem entra é cadastrado pela agência. Com o cadastro
aberto, qualquer pessoa cria uma conta — ela nasceria só como `cliente` sem
empresa vinculada, mas é uma porta que não precisa existir.

---

## 5. Edge Functions

São o único lugar onde a `service_role` existe. Sem elas, criar colaborador e
redefinir senha não funcionam.

Precisa do [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
npx supabase link --project-ref bqrxokpphvvblrturuuh

npx supabase functions deploy criar-usuario
npx supabase functions deploy redefinir-senha-usuario
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pela plataforma —
não precisa configurar.

Confira em **Edge Functions** no painel: as duas devem aparecer como deployed.

---

## 6. Envio de e-mail

É por onde a senha provisória chega a quem foi cadastrado. Usa
[Resend](https://resend.com) (plano gratuito cobre bem o início):

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx
npx supabase secrets set EMAIL_REMETENTE="Full Hub <acessos@suaagencia.com.br>"
npx supabase secrets set SITE_URL=https://hub.suaagencia.com.br
```

O domínio do remetente precisa estar verificado no Resend, senão o envio falha.

**Sem essa configuração o sistema continua funcionando**: o acesso é criado
normalmente e a interface avisa que o e-mail não saiu. Aí a senha provisória
precisa ser passada por outro canal — use **Redefinir Senha** depois de
configurar o envio.

---

## 7. Primeiro sócio

Ovo e galinha: a interface exige um sócio para cadastrar gente, e ainda não há
nenhum. Resolve-se uma vez, no SQL Editor:

1. **Authentication → Users → Add user**, com e-mail e senha. Marque
   *Auto Confirm User*.
2. No SQL Editor:

```sql
update public.profiles
   set role = 'socio',
       nome = 'Seu Nome',
       ativo = true,
       deve_trocar_senha = false
 where email = 'voce@fullconnectkey.com.br';
```

Daí em diante todo mundo entra pela tela **Equipe & Skills**.

---

## 8. Clientes de teste

Opcional, para experimentar o isolamento:

```sql
insert into public.clients (nome_empresa) values ('Mundo Verde'), ('ABF');
```

Os endereços `/portal/mundo-verde` e `/portal/abf` saem automaticamente do nome.
Depois, em **Equipe & Skills → Clientes**, abra cada um e adicione usuários.

---

## Conferindo se ficou de pé

Rode `verificar.sql`. Depois, no Full Hub:

| Teste | Esperado |
|---|---|
| Entrar como sócio | cai em `/dashboard` |
| Abrir Equipe & Skills | duas abas, Colaboradores e Clientes |
| Criar um colaborador | "Acesso criado e credenciais enviadas" |
| Entrar com a senha provisória | vai direto para `/auth/trocar-senha` |
| Criar usuário de um cliente | ele cai em `/portal/<empresa>` |
| Esse usuário abrir outro portal | bloqueado |

---

## Quando algo falha

**"Você não possui permissão para realizar esta ação."** ao criar colaborador —
a Edge Function não reconheceu você como admin. Confira se o seu `profiles.role`
é `socio` ou `desenvolvedor` e se `ativo = true`.

**Erro de rede ao criar colaborador** — a função provavelmente não foi
publicada. Veja o passo 5 e confira em Edge Functions no painel.

**"Acesso criado, mas o e-mail não pôde ser enviado"** — cadastro deu certo, o
envio não. Veja o passo 6; use Redefinir Senha para reenviar depois.

**Login entra mas nada abre** — `deve_trocar_senha` está true e a pessoa está
sendo mandada para a troca de senha. É o comportamento esperado.

**Cliente entra e vê "Acesso ainda não liberado"** — a conta não tem empresa
vinculada. Adicione o usuário por **Equipe & Skills → Clientes → a empresa →
Adicionar Usuário**.

Para ver o erro de verdade de uma Edge Function: **Edge Functions → a função →
Logs**.
