-- =============================================================================
-- Full Hub — diagnóstico do projeto Supabase
--
-- Cole no SQL Editor e rode. Não altera nada.
--
-- É uma consulta única, que lê apenas o catálogo do Postgres: sempre devolve
-- linhas, mesmo em banco totalmente vazio, e não depende de nenhuma tabela
-- existir. Se voltar "No rows returned", a consulta não chegou a rodar —
-- confira se o texto inteiro foi colado e se nada ficou selecionado no editor.
-- =============================================================================

with itens (ordem, grupo, item, existe) as (

  -- 1. Tabelas
  select 1, '1. Tabelas', t.nome, to_regclass('public.' || t.nome) is not null
  from (values ('profiles'), ('clients'), ('client_users'),
               ('team_members'), ('areas_equipe'), ('activity_log')) as t(nome)

  union all

  -- 2. Colunas da administração
  select 2, '2. Colunas', c.tabela || '.' || c.coluna,
         exists (select 1 from information_schema.columns ic
                 where ic.table_schema = 'public'
                   and ic.table_name = c.tabela
                   and ic.column_name = c.coluna)
  from (values ('profiles','ativo'), ('profiles','deve_trocar_senha'),
               ('profiles','cargo'), ('profiles','area_id'),
               ('profiles','data_admissao'), ('profiles','data_aniversario'),
               ('clients','slug'), ('clients','ativo'), ('clients','logo_url'))
       as c(tabela, coluna)

  union all

  -- 3. RLS ligado
  select 3, '3. RLS', t.nome,
         coalesce((select cl.relrowsecurity from pg_class cl
                   join pg_namespace ns on ns.oid = cl.relnamespace
                   where ns.nspname = 'public' and cl.relname = t.nome), false)
  from (values ('profiles'), ('clients'), ('client_users'),
               ('team_members'), ('areas_equipe'), ('activity_log')) as t(nome)

  union all

  -- 4. Funções de autorização
  select 4, '4. Funções', f.nome || '()',
         exists (select 1 from pg_proc pr
                 join pg_namespace ns on ns.oid = pr.pronamespace
                 where ns.nspname = 'public' and pr.proname = f.nome)
  from (values ('current_user_role'), ('is_internal'), ('is_socio'), ('is_admin'),
               ('current_user_client_ids'), ('current_user_client_slug'),
               ('current_user_status'), ('slugify')) as f(nome)

  union all

  -- 5. Triggers de proteção
  select 5, '5. Triggers', g.nome,
         exists (select 1 from pg_trigger tg
                 join pg_class cl on cl.oid = tg.tgrelid
                 join pg_namespace ns on ns.oid = cl.relnamespace
                 where ns.nspname = g.esquema and cl.relname = g.tabela
                   and tg.tgname = g.nome and not tg.tgisinternal)
  from (values ('on_auth_user_created','users','auth'),
               ('profiles_guard_admin_fields','profiles','public'),
               ('clients_set_slug','clients','public'),
               ('client_users_guard_move','client_users','public'))
       as g(nome, tabela, esquema)
),

resumo as (
  select count(*) filter (where not existe) as faltando from itens
)

select
  case when i.existe then 'OK' else 'FALTA' end as situacao,
  i.grupo,
  i.item,
  case
    when i.existe then ''
    when i.grupo = '3. RLS'      then 'SEM RLS — dados expostos'
    when i.grupo = '5. Triggers' then 'proteção ausente'
    else 'rode as migrations na ordem 1, 2, 3'
  end as observacao
from itens i
cross join resumo r

union all

select
  case when r.faltando = 0 then 'OK' else 'FALTA' end,
  '6. Resumo',
  'situacao do banco',
  case
    when r.faltando = 0
      then 'banco pronto — siga para o passo 2 do SETUP.md'
    else r.faltando || ' item(ns) faltando — rode as migrations na ordem 1, 2, 3'
  end
from resumo r

order by 2, 3;
