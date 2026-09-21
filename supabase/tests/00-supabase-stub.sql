-- Emula o mínimo do ambiente Supabase para testar a migration fora dele:
-- o schema auth, a tabela auth.users, auth.uid() e os roles anon/authenticated.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  -- raw_user_meta_data: preenchido pelo proprio usuario no signUp.
  -- raw_app_meta_data: gravavel apenas pela API de admin (service_role).
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- auth.uid() no Supabase lê o claim "sub" do JWT da requisição.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
