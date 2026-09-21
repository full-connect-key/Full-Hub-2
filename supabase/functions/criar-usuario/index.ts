// Edge Function: criar-usuario
//
// Cria o acesso de um colaborador interno ou de um usuário de cliente.
// A service_role vive apenas aqui — nunca no frontend.
//
// Corpo esperado:
//   { tipo: "colaborador", nome, email, cargo?, papel, area_id?, data_admissao?, data_aniversario? }
//   { tipo: "cliente",     nome, email, client_id }

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  CORS,
  ErroDeNegocio,
  clientAdmin,
  emailValido,
  enviarCredenciais,
  exigirAdministrador,
  gerarSenhaProvisoria,
  registrarAuditoria,
  responder,
} from "../_shared/admin.ts";

const PAPEIS_INTERNOS = ["colaborador", "desenvolvedor", "socio"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "Método não suportado." }, 405);

  const admin = clientAdmin();
  let usuarioCriadoId: string | null = null;

  try {
    const solicitante = await exigirAdministrador(req);
    const corpo = await req.json().catch(() => ({}));

    const tipo = corpo.tipo;
    const nome = String(corpo.nome ?? "").trim();
    const email = String(corpo.email ?? "").trim().toLowerCase();

    if (tipo !== "colaborador" && tipo !== "cliente") {
      throw new ErroDeNegocio("Tipo de usuário inválido.");
    }
    if (nome.length < 2) {
      throw new ErroDeNegocio("Informe o nome completo.");
    }
    if (!emailValido(email)) {
      throw new ErroDeNegocio("Informe um e-mail válido.");
    }

    // O papel nunca vem de quem está sendo criado, e um usuário de cliente
    // jamais recebe papel interno.
    let papel: string;
    let clientId: string | null = null;

    if (tipo === "colaborador") {
      papel = String(corpo.papel ?? "");
      if (!PAPEIS_INTERNOS.includes(papel as (typeof PAPEIS_INTERNOS)[number])) {
        throw new ErroDeNegocio("Selecione um papel válido.");
      }
    } else {
      papel = "cliente";
      clientId = String(corpo.client_id ?? "").trim();
      if (!clientId) throw new ErroDeNegocio("Cliente não informado.");

      const { data: cliente } = await admin
        .from("clients")
        .select("id, nome_empresa, ativo")
        .eq("id", clientId)
        .maybeSingle();

      if (!cliente) throw new ErroDeNegocio("Cliente não encontrado.", 404);
      if (!cliente.ativo) {
        throw new ErroDeNegocio("Não é possível adicionar usuários a um cliente inativo.");
      }
    }

    // E-mail duplicado: checa antes para dar mensagem boa, e o Auth ainda
    // barra de novo em caso de corrida.
    const { data: existente } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existente) {
      throw new ErroDeNegocio("Já existe um usuário com este e-mail.", 409);
    }

    const senhaProvisoria = gerarSenhaProvisoria();

    // 1. Conta no Auth. O papel vai em app_metadata, que o usuário não escreve.
    const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
      email,
      password: senhaProvisoria,
      email_confirm: true,
      user_metadata: { nome },
      app_metadata: { role: papel },
    });

    if (erroAuth || !criado.user) {
      const duplicado = erroAuth?.message?.toLowerCase().includes("already");
      throw new ErroDeNegocio(
        duplicado ? "Já existe um usuário com este e-mail." : "Não foi possível criar o acesso.",
        duplicado ? 409 : 500,
      );
    }

    usuarioCriadoId = criado.user.id;

    // 2. Profile. O trigger já criou a linha; aqui completamos os dados.
    const { error: erroProfile } = await admin
      .from("profiles")
      .update({
        nome,
        role: papel,
        ativo: true,
        deve_trocar_senha: true,
        cargo: tipo === "colaborador" ? (corpo.cargo ?? null) : null,
        area_id: tipo === "colaborador" ? (corpo.area_id || null) : null,
        data_admissao: tipo === "colaborador" ? (corpo.data_admissao || null) : null,
        data_aniversario: corpo.data_aniversario || null,
      })
      .eq("id", usuarioCriadoId);

    if (erroProfile) throw new Error(`profile: ${erroProfile.message}`);

    // 3. Vínculo com a empresa, quando for usuário de cliente.
    if (tipo === "cliente" && clientId) {
      const { error: erroVinculo } = await admin
        .from("client_users")
        .insert({ client_id: clientId, user_id: usuarioCriadoId });

      if (erroVinculo) throw new Error(`client_users: ${erroVinculo.message}`);
    }

    // 4. Credenciais por e-mail. Falhar aqui não invalida o cadastro.
    const emailEnviado = await enviarCredenciais({ para: email, nome, senhaProvisoria });

    await registrarAuditoria(admin, {
      acao: tipo === "colaborador" ? "colaborador_criado" : "usuario_cliente_criado",
      ator_id: solicitante.id,
      alvo_user_id: usuarioCriadoId,
      alvo_client_id: clientId,
      dados_novos: { nome, email, papel, client_id: clientId },
    });

    return responder({
      ok: true,
      user_id: usuarioCriadoId,
      email_enviado: emailEnviado,
      mensagem: emailEnviado
        ? "Acesso criado e credenciais enviadas por e-mail."
        : "Acesso criado, mas o e-mail não pôde ser enviado. Use Redefinir Senha para reenviar as credenciais.",
    });
  } catch (erro) {
    // Cadastro pela metade é pior que cadastro nenhum: se o Auth foi criado
    // mas uma etapa seguinte falhou, desfaz antes de responder.
    if (usuarioCriadoId && !(erro instanceof ErroDeNegocio)) {
      const { error: erroLimpeza } = await admin.auth.admin.deleteUser(usuarioCriadoId);
      if (erroLimpeza) {
        console.error(
          `ATENÇÃO: usuário órfão ${usuarioCriadoId} — a limpeza falhou: ${erroLimpeza.message}`,
        );
      }
    }

    if (erro instanceof ErroDeNegocio) {
      return responder({ erro: erro.message }, erro.status);
    }

    console.error("criar-usuario:", erro);
    return responder({ erro: "Não foi possível concluir o cadastro. Tente novamente." }, 500);
  }
});
