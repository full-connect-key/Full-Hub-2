# Testes de RLS

Verificam o que sustenta a segurança do Full Hub no banco: o isolamento dos
dados por `client_id` e o bloqueio de escalação de privilégio.

Quinze checagens, entre elas:

- toda conta criada no Auth ganha linha em `public.users`
- cliente enxerga apenas a própria empresa, nunca a de outro cliente
- cliente não lê os dados de RH da equipe
- cliente e colaborador **não conseguem** se promover a `socio`
- cliente não consegue se vincular a outra empresa
- sócio continua podendo alterar o perfil de outras pessoas
- o SQL Editor (contexto admin) continua promovendo o primeiro sócio
- visitante sem sessão não lê nada

## Rodando localmente

Precisa de um Postgres 15+ vazio. Não usa o Supabase — `00-supabase-stub.sql`
emula o mínimo necessário (schema `auth`, `auth.users`, `auth.uid()` e os roles
`anon`/`authenticated`).

```bash
createdb fullhub_test

psql -d fullhub_test -v ON_ERROR_STOP=1 -f supabase/tests/00-supabase-stub.sql
psql -d fullhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260921000001_init.sql
psql -d fullhub_test -c "grant select, insert, update, delete on all tables in schema public to authenticated, anon;"

psql -d fullhub_test -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

O teste roda dentro de uma transação e termina em `rollback` — não deixa dados
para trás. Qualquer falha aborta a execução com a mensagem `FALHOU: <descrição>`.
Terminou imprimindo "Todos os testes de RLS passaram" significa aprovado.

## Por que o trigger existe

O RLS do Postgres controla **linhas**, não **colunas**. A policy
`users_update_self` precisa existir para a pessoa editar o próprio nome e avatar
— mas ela libera a linha inteira, inclusive a coluna `role`.

Sem proteção adicional, qualquer usuário logado faria:

```sql
update public.users set role = 'socio' where id = auth.uid();
```

e ganharia acesso ao módulo financeiro. O trigger `users_guard_role_change`
fecha esse caminho: bloqueia a troca de `role` a menos que quem executa seja um
sócio — ou que não haja sessão nenhuma (`auth.uid()` nulo), que é o contexto do
SQL Editor, por onde o primeiro sócio é promovido.

Esse caso está coberto pelos testes; se alguém afrouxar a policy no futuro, eles
quebram.
