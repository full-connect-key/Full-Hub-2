-- =============================================================================
-- Ambiente de teste do Full Hub
--
-- Cria as empresas e as áreas. As CONTAS (auth.users) devem ser criadas pela
-- própria aplicação, em Equipe & Skills, para passarem pela Edge Function e
-- receberem senha provisória — este arquivo não inventa senha para ninguém.
--
-- Rodar no SQL Editor depois das migrations.
-- =============================================================================

insert into public.clients (nome_empresa, nome_contato, email_contato)
values
  ('Mundo Verde', 'Contato Mundo Verde', 'contato@mundoverde.com.br'),
  ('ABF',         'Contato ABF',         'contato@abf.com.br')
on conflict do nothing;

-- Confere o que foi criado.
select nome_empresa, slug, ativo from public.clients order by nome_empresa;

-- -----------------------------------------------------------------------------
-- Primeiro sócio
--
-- 1. Crie a conta em Authentication > Users > Add user.
-- 2. Rode o update abaixo com o e-mail usado.
-- 3. Entre no Full Hub e cadastre o resto da equipe pela interface.
-- -----------------------------------------------------------------------------
-- update public.profiles
--    set role = 'socio', nome = 'Seu Nome', ativo = true, deve_trocar_senha = false
--  where email = 'voce@fullconnectkey.com.br';
