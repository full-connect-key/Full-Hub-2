-- =============================================================================
-- Full Hub — diagnóstico do projeto Supabase
--
-- Rode no SQL Editor a qualquer momento. Não altera nada: apenas informa o que
-- já está no lugar e o que falta.
-- =============================================================================

do $$
declare
  r        record;
  faltando int := 0;
  aviso    int := 0;
  n        int;
begin
  raise notice '';
  raise notice '=== TABELAS ===';
  for r in
    select t.nome,
           exists (select 1 from pg_tables p
                   where p.schemaname = 'public' and p.tablename = t.nome) as existe
    from (values ('profiles'), ('clients'), ('client_users'), ('team_members'),
                 ('areas_equipe'), ('activity_log')) as t(nome)
  loop
    if r.existe then
      raise notice '  OK     %', r.nome;
    else
      raise notice '  FALTA  %  -> rode as migrations', r.nome;
      faltando := faltando + 1;
    end if;
  end loop;

  raise notice '';
  raise notice '=== COLUNAS DA ADMINISTRACAO ===';
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
      raise notice '  OK     %.%', r.tabela, r.coluna;
    else
      raise notice '  FALTA  %.%', r.tabela, r.coluna;
      faltando := faltando + 1;
    end if;
  end loop;

  raise notice '';
  raise notice '=== RLS LIGADO ===';
  for r in
    select t.nome,
           coalesce((select c.relrowsecurity from pg_class c
                     join pg_namespace ns on ns.oid = c.relnamespace
                     where ns.nspname = 'public' and c.relname = t.nome), false) as ligado
    from (values ('profiles'), ('clients'), ('client_users'), ('team_members'),
                 ('areas_equipe'), ('activity_log')) as t(nome)
  loop
    if r.ligado then
      raise notice '  OK     %', r.nome;
    else
      raise notice '  FALTA  %  -> SEM RLS: dados expostos', r.nome;
      faltando := faltando + 1;
    end if;
  end loop;

  raise notice '';
  raise notice '=== FUNCOES DE AUTORIZACAO ===';
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
      raise notice '  OK     %()', r.nome;
    else
      raise notice '  FALTA  %()', r.nome;
      faltando := faltando + 1;
    end if;
  end loop;

  raise notice '';
  raise notice '=== TRIGGERS DE PROTECAO ===';
  for r in
    select t.nome, t.tabela,
           exists (select 1 from pg_trigger g
                   join pg_class c on c.oid = g.tgrelid
                   join pg_namespace ns on ns.oid = c.relnamespace
                   where ns.nspname = 'public' and c.relname = t.tabela
                     and g.tgname = t.nome and not g.tgisinternal) as existe
    from (values ('profiles_guard_admin_fields','profiles'),
                 ('clients_set_slug','clients'),
                 ('client_users_guard_move','client_users')) as t(nome, tabela)
  loop
    if r.existe then
      raise notice '  OK     %', r.nome;
    else
      raise notice '  FALTA  % em %', r.nome, r.tabela;
      faltando := faltando + 1;
    end if;
  end loop;

  if exists (select 1 from pg_trigger g
             join pg_class c on c.oid = g.tgrelid
             join pg_namespace ns on ns.oid = c.relnamespace
             where ns.nspname = 'auth' and c.relname = 'users'
               and g.tgname = 'on_auth_user_created' and not g.tgisinternal) then
    raise notice '  OK     on_auth_user_created em auth.users';
  else
    raise notice '  FALTA  on_auth_user_created  -> contas novas nao criam profile';
    faltando := faltando + 1;
  end if;

  raise notice '';
  raise notice '=== DADOS ===';

  -- Sem as tabelas, não há o que contar: a seção inteira é pulada.
  if to_regclass('public.areas_equipe') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.clients') is null
     or to_regclass('public.client_users') is null then
    raise notice '  --     pulado: as tabelas ainda nao existem';
    raise notice '';
    raise notice '================================================';
    raise notice '  % item(ns) faltando. Rode as migrations em ordem.', faltando;
    raise notice '================================================';
    return;
  end if;

  select count(*) into n from public.areas_equipe;
  if n > 0 then
    raise notice '  OK     % area(s) cadastrada(s)', n;
  else
    raise notice '  FALTA  nenhuma area em areas_equipe';
    faltando := faltando + 1;
  end if;

  select count(*) into n from public.profiles where role = 'socio' and ativo;
  if n > 0 then
    raise notice '  OK     % socio(s) ativo(s)', n;
  else
    raise notice '  AVISO  nenhum socio ativo -> crie a conta e rode o update do seed.sql';
    aviso := aviso + 1;
  end if;

  select count(*) into n from public.clients;
  if n > 0 then
    raise notice '  OK     % cliente(s) cadastrado(s)', n;
  else
    raise notice '  AVISO  nenhum cliente ainda (normal no comeco)';
    aviso := aviso + 1;
  end if;

  -- Usuário cliente sem vínculo não entra em portal nenhum.
  select count(*) into n
  from public.profiles p
  where p.role = 'cliente' and p.ativo
    and not exists (select 1 from public.client_users cu where cu.user_id = p.id);

  if n > 0 then
    raise notice '  AVISO  % usuario(s) cliente sem empresa vinculada', n;
    aviso := aviso + 1;
  end if;

  raise notice '';
  raise notice '================================================';
  if faltando = 0 then
    raise notice '  Banco pronto. % aviso(s).', aviso;
  else
    raise notice '  % item(ns) faltando. Rode as migrations em ordem.', faltando;
  end if;
  raise notice '================================================';
  raise notice '';
  raise notice 'O que este script NAO enxerga (confira no painel):';
  raise notice '  - Authentication > URL Configuration';
  raise notice '  - Authentication > Email Templates > Reset Password';
  raise notice '  - Authentication > Providers > Email (cadastro publico)';
  raise notice '  - Edge Functions publicadas e com secrets configurados';
  raise notice '';
end
$$;
