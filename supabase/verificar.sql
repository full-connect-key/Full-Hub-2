-- =============================================================================
-- Full Hub — diagnóstico do projeto Supabase
--
-- Cole no SQL Editor e rode. Não altera nada: devolve uma tabela dizendo o que
-- já está no lugar e o que falta.
--
-- Situação:
--   OK     está pronto
--   FALTA  precisa ser resolvido (rode as migrations)
--   AVISO  não impede o sistema de funcionar
-- =============================================================================

-- Função temporária: some sozinha ao fim da sessão, não fica no banco.
create or replace function pg_temp.fh_verificar()
returns table (situacao text, grupo text, item text, observacao text)
language plpgsql
as $$
declare
  r record;
  n bigint;
  faltando int := 0;
  avisos   int := 0;
  tem_tabelas boolean;
begin
  -- ---------------------------------------------------------------- tabelas
  for r in
    select t.nome,
           to_regclass('public.' || t.nome) is not null as existe
    from (values ('profiles'), ('clients'), ('client_users'), ('team_members'),
                 ('areas_equipe'), ('activity_log')) as t(nome)
  loop
    if r.existe then
      situacao := 'OK'; observacao := '';
    else
      situacao := 'FALTA'; observacao := 'rode as migrations na ordem';
      faltando := faltando + 1;
    end if;
    grupo := '1. Tabelas'; item := r.nome;
    return next;
  end loop;

  -- ---------------------------------------------------------------- colunas
  for r in
    select c.tabela, c.coluna,
           exists (select 1 from information_schema.columns ic
                   where ic.table_schema = 'public'
                     and ic.table_name = c.tabela
                     and ic.column_name = c.coluna) as existe
    from (values ('profiles','ativo'), ('profiles','deve_trocar_senha'),
                 ('profiles','cargo'), ('profiles','area_id'),
                 ('profiles','data_admissao'), ('profiles','data_aniversario'),
                 ('clients','slug'), ('clients','ativo'), ('clients','logo_url'))
         as c(tabela, coluna)
  loop
    if r.existe then
      situacao := 'OK'; observacao := '';
    else
      situacao := 'FALTA'; observacao := 'falta a migration 3';
      faltando := faltando + 1;
    end if;
    grupo := '2. Colunas'; item := r.tabela || '.' || r.coluna;
    return next;
  end loop;

  -- -------------------------------------------------------------------- RLS
  for r in
    select t.nome,
           coalesce((select c.relrowsecurity from pg_class c
                     join pg_namespace ns on ns.oid = c.relnamespace
                     where ns.nspname = 'public' and c.relname = t.nome), false) as ligado,
           coalesce((select count(*) from pg_policies p
                     where p.schemaname = 'public' and p.tablename = t.nome), 0) as politicas
    from (values ('profiles'), ('clients'), ('client_users'), ('team_members'),
                 ('areas_equipe'), ('activity_log')) as t(nome)
  loop
    if r.ligado then
      situacao := 'OK'; observacao := r.politicas || ' policies';
    else
      situacao := 'FALTA'; observacao := 'SEM RLS — dados expostos';
      faltando := faltando + 1;
    end if;
    grupo := '3. RLS'; item := r.nome;
    return next;
  end loop;

  -- --------------------------------------------------------------- funções
  for r in
    select f.nome,
           exists (select 1 from pg_proc p
                   join pg_namespace ns on ns.oid = p.pronamespace
                   where ns.nspname = 'public' and p.proname = f.nome) as existe
    from (values ('current_user_role'), ('is_internal'), ('is_socio'), ('is_admin'),
                 ('current_user_client_ids'), ('current_user_client_slug'),
                 ('current_user_status'), ('slugify')) as f(nome)
  loop
    if r.existe then
      situacao := 'OK'; observacao := '';
    else
      situacao := 'FALTA'; observacao := 'falta uma migration';
      faltando := faltando + 1;
    end if;
    grupo := '4. Funções'; item := r.nome || '()';
    return next;
  end loop;

  -- -------------------------------------------------------------- triggers
  for r in
    select t.nome, t.tabela, t.schema_,
           exists (select 1 from pg_trigger g
                   join pg_class c on c.oid = g.tgrelid
                   join pg_namespace ns on ns.oid = c.relnamespace
                   where ns.nspname = t.schema_ and c.relname = t.tabela
                     and g.tgname = t.nome and not g.tgisinternal) as existe
    from (values ('on_auth_user_created','users','auth'),
                 ('profiles_guard_admin_fields','profiles','public'),
                 ('clients_set_slug','clients','public'),
                 ('client_users_guard_move','client_users','public')) as t(nome, tabela, schema_)
  loop
    if r.existe then
      situacao := 'OK'; observacao := '';
    else
      situacao := 'FALTA';
      observacao := case when r.nome = 'on_auth_user_created'
                         then 'contas novas não criam profile'
                         else 'proteção ausente' end;
      faltando := faltando + 1;
    end if;
    grupo := '5. Triggers'; item := r.nome;
    return next;
  end loop;

  -- ----------------------------------------------------------------- dados
  tem_tabelas := to_regclass('public.profiles') is not null
             and to_regclass('public.clients') is not null
             and to_regclass('public.areas_equipe') is not null
             and to_regclass('public.client_users') is not null;

  if not tem_tabelas then
    grupo := '6. Dados'; item := '(pulado)';
    situacao := 'AVISO'; observacao := 'as tabelas ainda não existem';
    return next;
  else
    -- EXECUTE dinâmico: sem ele, a consulta falharia caso a tabela não exista.
    execute 'select count(*) from public.areas_equipe' into n;
    grupo := '6. Dados'; item := 'áreas cadastradas'; observacao := n || '';
    if n > 0 then situacao := 'OK';
    else situacao := 'FALTA'; observacao := 'nenhuma área'; faltando := faltando + 1;
    end if;
    return next;

    execute 'select count(*) from public.profiles where role = ''socio'' and ativo' into n;
    grupo := '6. Dados'; item := 'sócios ativos'; observacao := n || '';
    if n > 0 then situacao := 'OK';
    else
      situacao := 'AVISO';
      observacao := 'nenhum — crie a conta e rode o update do passo 7';
      avisos := avisos + 1;
    end if;
    return next;

    execute 'select count(*) from public.clients' into n;
    grupo := '6. Dados'; item := 'clientes cadastrados'; observacao := n || '';
    if n > 0 then situacao := 'OK';
    else situacao := 'AVISO'; observacao := 'nenhum ainda (normal no começo)'; avisos := avisos + 1;
    end if;
    return next;

    execute 'select count(*) from public.profiles p where p.role = ''cliente'' and p.ativo '
            'and not exists (select 1 from public.client_users cu where cu.user_id = p.id)' into n;
    if n > 0 then
      grupo := '6. Dados'; item := 'usuários cliente sem empresa';
      situacao := 'AVISO'; observacao := n || ' — não entram em portal nenhum';
      avisos := avisos + 1;
      return next;
    end if;
  end if;

  -- --------------------------------------------------------------- resumo
  grupo := '7. Resumo'; item := 'situação do banco';
  if faltando = 0 then
    situacao := 'OK';
    observacao := 'banco pronto' || case when avisos > 0 then ', ' || avisos || ' aviso(s)' else '' end;
  else
    situacao := 'FALTA';
    observacao := faltando || ' item(ns) faltando — rode as migrations na ordem 1, 2, 3';
  end if;
  return next;

  grupo := '7. Resumo'; item := 'conferir no painel'; situacao := 'AVISO';
  observacao := 'URLs do Auth, template de e-mail, cadastro público e Edge Functions '
             || 'não aparecem aqui — veja SETUP.md';
  return next;
end;
$$;

select * from pg_temp.fh_verificar();
