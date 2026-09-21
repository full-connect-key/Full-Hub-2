# Edge Functions

Operações que exigem privilégio de administrador. A `service_role` do Supabase
existe **apenas aqui** — nunca no frontend, onde qualquer pessoa leria a chave
no navegador.

| Função | O que faz |
|---|---|
| `criar-usuario` | Cria o acesso de um colaborador interno ou de um usuário de cliente |
| `redefinir-senha-usuario` | Gera nova senha provisória e exige a troca no próximo acesso |

## Autorização

As duas funções decidem a permissão no servidor, sempre assim:

1. lê o JWT de quem chamou;
2. carrega o `profile` correspondente **no banco**;
3. confere que o perfil está ativo;
4. confere que o papel é `desenvolvedor` ou `socio`.

Nada que venha no corpo da requisição participa dessa decisão. Um colaborador
que chame a função direto por `curl` recebe 403.

## Deploy

```bash
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy criar-usuario
npx supabase functions deploy redefinir-senha-usuario
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pela plataforma.

## Envio de e-mail

As credenciais vão por e-mail via [Resend](https://resend.com). Configure:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx
npx supabase secrets set EMAIL_REMETENTE="Full Hub <acessos@suaagencia.com.br>"
npx supabase secrets set SITE_URL=https://hub.suaagencia.com.br
```

Sem essas variáveis o cadastro continua funcionando, mas o e-mail não sai — a
interface avisa e o administrador reenvia com **Redefinir Senha**.

## Senha provisória

Sorteada com CSPRNG (`crypto.getRandomValues`), 14 caracteres, com símbolo e
dígito garantidos. Nunca é gravada no banco: existe no Auth e segue no e-mail.
Nem o administrador a vê depois da operação.

## Cadastro pela metade

Criar um acesso toca em Auth, `profiles` e, para cliente, `client_users`. Se
uma etapa depois do Auth falhar, `criar-usuario` apaga a conta recém-criada
antes de responder — não fica usuário órfão. Se até a limpeza falhar, o id vai
para o log com destaque, para intervenção manual.
