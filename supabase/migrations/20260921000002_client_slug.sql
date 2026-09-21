-- =============================================================================
-- Full Hub — Sprint 1: endereço próprio por cliente
--
-- Cada empresa cliente ganha um slug, usado na rota do Portal:
--   Mundo Verde  ->  /portal/mundo-verde
--
-- O slug é apenas o endereço. Quem decide o que a pessoa enxerga continua
-- sendo o RLS por client_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- slugify: "Mundo Verde" -> "mundo-verde"
-- Sem depender da extensão unaccent: os acentos do português saem por translate.
-- -----------------------------------------------------------------------------
create or replace function public.slugify(texto text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          lower(translate(
            coalesce(texto, ''),
            'áàâãäéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ',
            'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
          '[^a-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g')),
    '');
$$;

-- -----------------------------------------------------------------------------
-- clients.slug
-- -----------------------------------------------------------------------------
alter table public.clients add column if not exists slug text;

-- Preenche o que já existe antes de exigir unicidade.
update public.clients
set slug = public.slugify(nome_empresa)
where slug is null;

-- Desempata homônimos criados antes desta migration.
with duplicados as (
  select id, slug,
         row_number() over (partition by slug order by created_at, id) as n
  from public.clients
  where slug is not null
)
update public.clients c
set slug = c.slug || '-' || d.n
from duplicados d
where c.id = d.id and d.n > 1;

create unique index if not exists clients_slug_key on public.clients (slug);

-- -----------------------------------------------------------------------------
-- Gera o slug em toda inserção/renomeação, resolvendo colisões
-- -----------------------------------------------------------------------------
create or replace function public.set_client_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  -- Slug informado à mão vence; senão sai do nome da empresa.
  v_base := coalesce(public.slugify(new.slug), public.slugify(new.nome_empresa), 'cliente');
  v_slug := v_base;

  while exists (
    select 1 from public.clients
    where slug = v_slug and id is distinct from new.id
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

drop trigger if exists clients_set_slug on public.clients;
create trigger clients_set_slug
  before insert or update of nome_empresa, slug on public.clients
  for each row execute function public.set_client_slug();

alter table public.clients alter column slug set not null;

-- -----------------------------------------------------------------------------
-- Slug da empresa do usuário logado — usado no redirecionamento pós-login.
-- SECURITY DEFINER para responder sem depender das policies de leitura.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_client_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.slug
  from public.client_users cu
  join public.clients c on c.id = cu.client_id
  where cu.user_id = auth.uid()
  order by cu.created_at
  limit 1;
$$;
