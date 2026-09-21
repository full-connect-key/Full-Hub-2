-- =============================================================================
-- Full Hub - migration inicial
-- Cria os perfis de usuario, as tabelas base e as policies de RLS que garantem
-- o isolamento por client_id no Portal do Cliente.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum de perfis
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('cliente', 'colaborador', 'desenvolvedor', 'socio');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- users: espelha auth.users e guarda o perfil (role) de cada pessoa
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  nome        text not null default '',
  role        public.user_role not null default 'cliente',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- clients: empresas atendidas pela agencia
-- -----------------------------------------------------------------------------
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  nome_empresa    text not null,
  nome_contato    text,
  email_contato   text,
  telefone        text,
  drive_folder_id text,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- client_users: vinculo N:N entre usuarios e empresas cliente.
-- Todos os usuarios de um mesmo cliente tem o mesmo nivel de acesso.
-- -----------------------------------------------------------------------------
create table if not exists public.client_users (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);

create index if not exists client_users_client_id_idx on public.client_users (client_id);
create index if not exists client_users_user_id_idx on public.client_users (user_id);

-- -----------------------------------------------------------------------------
-- team_members: dados de RH da equipe interna
-- -----------------------------------------------------------------------------
create table if not exists public.team_members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.users (id) on delete cascade,
  cargo         text,
  area          text,
  data_admissao date,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Provisionamento automatico: toda conta criada no auth ganha linha em users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'cliente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Helpers de autorizacao.
-- SECURITY DEFINER para que as policies possam consultar public.users sem
-- disparar recursao infinita de RLS.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
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

-- Empresas as quais o usuario logado esta vinculado
create or replace function public.current_user_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.client_users where user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.users        enable row level security;
alter table public.clients      enable row level security;
alter table public.client_users enable row level security;
alter table public.team_members enable row level security;

-- users -----------------------------------------------------------------------
drop policy if exists "users_select_self" on public.users;
create policy "users_select_self" on public.users
  for select using (id = auth.uid());

drop policy if exists "users_select_internal" on public.users;
create policy "users_select_internal" on public.users
  for select using (public.is_internal());

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Somente socio administra perfis (evita escalacao de privilegio via update).
drop policy if exists "users_write_socio" on public.users;
create policy "users_write_socio" on public.users
  for all using (public.is_socio()) with check (public.is_socio());

-- clients ---------------------------------------------------------------------
drop policy if exists "clients_select_internal" on public.clients;
create policy "clients_select_internal" on public.clients
  for select using (public.is_internal());

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own" on public.clients
  for select using (id in (select public.current_user_client_ids()));

drop policy if exists "clients_write_internal" on public.clients;
create policy "clients_write_internal" on public.clients
  for all
  using (public.current_user_role() in ('desenvolvedor', 'socio'))
  with check (public.current_user_role() in ('desenvolvedor', 'socio'));

-- client_users ----------------------------------------------------------------
drop policy if exists "client_users_select_internal" on public.client_users;
create policy "client_users_select_internal" on public.client_users
  for select using (public.is_internal());

drop policy if exists "client_users_select_own" on public.client_users;
create policy "client_users_select_own" on public.client_users
  for select using (user_id = auth.uid());

drop policy if exists "client_users_write_internal" on public.client_users;
create policy "client_users_write_internal" on public.client_users
  for all
  using (public.current_user_role() in ('desenvolvedor', 'socio'))
  with check (public.current_user_role() in ('desenvolvedor', 'socio'));

-- team_members ----------------------------------------------------------------
drop policy if exists "team_members_select_internal" on public.team_members;
create policy "team_members_select_internal" on public.team_members
  for select using (public.is_internal());

drop policy if exists "team_members_write_socio" on public.team_members;
create policy "team_members_write_socio" on public.team_members
  for all using (public.is_socio()) with check (public.is_socio());
