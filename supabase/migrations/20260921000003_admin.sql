-- =============================================================================
-- Full Hub — Sprint 2: administração de colaboradores, clientes e acessos
--
-- public.users passa a se chamar public.profiles, alinhando com a convenção do
-- Supabase e eliminando a ambiguidade com auth.users.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Renomeia users -> profiles (idempotente)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'users')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles')
  then
    alter table public.users rename to profiles;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- areas_equipe: áreas da agência, reutilizáveis nos formulários
-- -----------------------------------------------------------------------------
create table if not exists public.areas_equipe (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.areas_equipe (nome)
values ('Atendimento'), ('Social Media'), ('Redação'), ('Conteúdo'), ('Design'),
       ('Criação'), ('Direção de Arte'), ('Desenvolvimento'), ('Performance'), ('Gestão')
on conflict (nome) do nothing;

-- -----------------------------------------------------------------------------
-- profiles: dados administrativos
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists ativo              boolean not null default true;
alter table public.profiles add column if not exists deve_trocar_senha  boolean not null default false;
alter table public.profiles add column if not exists cargo              text;
alter table public.profiles add column if not exists area_id            uuid references public.areas_equipe (id) on delete set null;
alter table public.profiles add column if not exists data_admissao      date;
alter table public.profiles add column if not exists data_aniversario   date;

create index if not exists profiles_role_idx  on public.profiles (role);
create index if not exists profiles_ativo_idx on public.profiles (ativo);

-- -----------------------------------------------------------------------------
-- clients: status e logo
-- -----------------------------------------------------------------------------
alter table public.clients add column if not exists ativo    boolean not null default true;
alter table public.clients add column if not exists logo_url text;

-- -----------------------------------------------------------------------------
-- client_users: um usuário cliente pertence a uma única conta
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.client_users
    group by user_id having count(*) > 1
  ) then
    raise exception 'Existem usuarios vinculados a mais de um cliente. Resolva antes de aplicar a restricao.';
  end if;
end
$$;

create unique index if not exists client_users_user_id_key on public.client_users (user_id);

-- O vínculo é definido administrativamente e não muda pela interface.
create or replace function public.guard_client_user_move()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id then
    raise exception 'O cliente de um usuario nao pode ser trocado por atualizacao direta'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists client_users_guard_move on public.client_users;
create trigger client_users_guard_move
  before update on public.client_users
  for each row execute function public.guard_client_user_move();

-- -----------------------------------------------------------------------------
-- activity_log: auditoria das ações administrativas
-- -----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id                uuid primary key default gen_random_uuid(),
  acao              text not null,
  ator_id           uuid references public.profiles (id) on delete set null,
  alvo_user_id      uuid references public.profiles (id) on delete set null,
  alvo_client_id    uuid references public.clients (id) on delete set null,
  dados_anteriores  jsonb,
  dados_novos       jsonb,
  criado_em         timestamptz not null default now()
);

create index if not exists activity_log_criado_em_idx on public.activity_log (criado_em desc);
create index if not exists activity_log_alvo_user_idx on public.activity_log (alvo_user_id);

-- -----------------------------------------------------------------------------
-- Helpers de autorização
--
-- Todos consideram o usuário INATIVO como se não tivesse perfil: um acesso
-- desativado deixa de enxergar qualquer coisa, sem precisar mexer nas policies
-- uma a uma.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and ativo;
$$;

create or replace function public.is_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('colaborador', 'desenvolvedor', 'socio'), false);
$$;

create or replace function public.is_socio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'socio', false);
$$;

-- Perfis que administram pessoas, clientes e acessos.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('desenvolvedor', 'socio'), false);
$$;

-- Empresa do usuário logado. Vazio quando o usuário OU o cliente está inativo:
-- é assim que desativar a empresa bloqueia todo mundo de uma vez.
create or replace function public.current_user_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cu.client_id
  from public.client_users cu
  join public.profiles p on p.id = cu.user_id
  join public.clients  c on c.id = cu.client_id
  where cu.user_id = auth.uid() and p.ativo and c.ativo;
$$;

create or replace function public.current_user_client_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.slug
  from public.client_users cu
  join public.profiles p on p.id = cu.user_id
  join public.clients  c on c.id = cu.client_id
  where cu.user_id = auth.uid() and p.ativo and c.ativo
  order by cu.created_at
  limit 1;
$$;

-- Situação do usuário logado, consultada pelo app a cada request.
create or replace function public.current_user_status()
returns table (role public.user_role, ativo boolean, deve_trocar_senha boolean, client_slug text)
language sql
stable
security definer
set search_path = public
as $$
  select p.role, p.ativo, p.deve_trocar_senha, public.current_user_client_slug()
  from public.profiles p
  where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Provisionamento e proteção da coluna role
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- O role sai de raw_app_meta_data, nunca de raw_user_meta_data: o primeiro só
  -- é gravável pela API de admin, enquanto o segundo vem do próprio cadastro.
  begin
    v_role := coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'cliente');
  exception when others then
    v_role := 'cliente';
  end;

  insert into public.profiles (id, email, nome, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', ''), v_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Ninguém promove a si mesmo, nem reativa o próprio acesso.
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() nulo = contexto administrativo (SQL Editor, service_role,
  -- Edge Function). É assim que o primeiro sócio é promovido.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Somente desenvolvedor ou socio pode alterar o perfil de um usuario'
        using errcode = '42501';
    end if;

    if new.ativo is distinct from old.ativo then
      raise exception 'Somente desenvolvedor ou socio pode ativar ou desativar um acesso'
        using errcode = '42501';
    end if;

    -- A pessoa pode concluir a própria troca de senha, nunca exigir outra.
    if new.deve_trocar_senha is distinct from old.deve_trocar_senha
       and new.deve_trocar_senha = true then
      raise exception 'Somente desenvolvedor ou socio pode exigir troca de senha'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard_role_change on public.profiles;
drop trigger if exists profiles_guard_admin_fields on public.profiles;
create trigger profiles_guard_admin_fields
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.client_users  enable row level security;
alter table public.team_members  enable row level security;
alter table public.areas_equipe  enable row level security;
alter table public.activity_log  enable row level security;

-- profiles --------------------------------------------------------------------
drop policy if exists "users_select_self"     on public.profiles;
drop policy if exists "users_select_internal" on public.profiles;
drop policy if exists "users_update_self"     on public.profiles;
drop policy if exists "users_write_socio"     on public.profiles;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());

-- A equipe interna enxerga a equipe interna; cliente nunca recebe essa lista.
drop policy if exists "profiles_select_equipe" on public.profiles;
create policy "profiles_select_equipe" on public.profiles
  for select using (public.is_internal() and role <> 'cliente');

-- Admin enxerga todo mundo, inclusive os usuários dos clientes.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

-- Campos pessoais. role, ativo e deve_trocar_senha ficam protegidos pelo trigger.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_write_admin" on public.profiles;
create policy "profiles_write_admin" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- clients ---------------------------------------------------------------------
drop policy if exists "clients_select_internal" on public.clients;
create policy "clients_select_internal" on public.clients
  for select using (public.is_internal());

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own" on public.clients
  for select using (id in (select public.current_user_client_ids()));

drop policy if exists "clients_write_internal" on public.clients;
drop policy if exists "clients_write_admin" on public.clients;
create policy "clients_write_admin" on public.clients
  for all using (public.is_admin()) with check (public.is_admin());

-- client_users ----------------------------------------------------------------
drop policy if exists "client_users_select_internal" on public.client_users;
drop policy if exists "client_users_select_own"      on public.client_users;
drop policy if exists "client_users_write_internal"  on public.client_users;

-- O cliente enxerga apenas o próprio vínculo — nunca a lista de quem mais
-- acessa outras contas.
drop policy if exists "client_users_select_own" on public.client_users;
create policy "client_users_select_own" on public.client_users
  for select using (user_id = auth.uid());

drop policy if exists "client_users_select_admin" on public.client_users;
create policy "client_users_select_admin" on public.client_users
  for select using (public.is_admin());

drop policy if exists "client_users_write_admin" on public.client_users;
create policy "client_users_write_admin" on public.client_users
  for all using (public.is_admin()) with check (public.is_admin());

-- team_members ----------------------------------------------------------------
drop policy if exists "team_members_select_internal" on public.team_members;
create policy "team_members_select_internal" on public.team_members
  for select using (public.is_internal());

drop policy if exists "team_members_write_socio" on public.team_members;
drop policy if exists "team_members_write_admin" on public.team_members;
create policy "team_members_write_admin" on public.team_members
  for all using (public.is_admin()) with check (public.is_admin());

-- areas_equipe ----------------------------------------------------------------
drop policy if exists "areas_select_autenticado" on public.areas_equipe;
create policy "areas_select_autenticado" on public.areas_equipe
  for select using (auth.uid() is not null);

drop policy if exists "areas_write_admin" on public.areas_equipe;
create policy "areas_write_admin" on public.areas_equipe
  for all using (public.is_admin()) with check (public.is_admin());

-- activity_log ----------------------------------------------------------------
drop policy if exists "activity_select_admin" on public.activity_log;
create policy "activity_select_admin" on public.activity_log
  for select using (public.is_admin());

drop policy if exists "activity_insert_admin" on public.activity_log;
create policy "activity_insert_admin" on public.activity_log
  for insert with check (public.is_admin());
