// Edge Function: redefinir-senha-usuario
//
// Gera nova senha provisória para um usuário e exige a troca no próximo acesso.
// Quem executa não escolhe nem guarda a senha.
//
// Corpo esperado: { user_id }

import {
  CORS,
  ErroDeNegocio,
  clientAdmin,
  enviarCredenciais,
  exigirAdministrador,
  gerarSenhaProvisoria,
  registrarAuditoria,
  responder,
} from "../_shared/admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "Método não suportado." }, 405);

  const admin = clientAdmin();

  try {
    const solicitante = await exigirAdministrador(req);
    const corpo = await req.json().catch(() => ({}));
    const userId = String(corpo.user_id ?? "").trim();

    if (!userId) throw new ErroDeNegocio("Usuário não informado.");

    const { data: alvo } = await admin
      .from("profiles")
      .select("id, nome, email")
      .eq("id", userId)
      .maybeSingle();

    if (!alvo) throw new ErroDeNegocio("Usuário não encontrado.", 404);

    const senhaProvisoria = gerarSenhaProvisoria();

    const { error: erroSenha } = await admin.auth.admin.updateUserById(userId, {
      password: senhaProvisoria,
    });

    if (erroSenha) throw new Error(`auth: ${erroSenha.message}`);

    const { error: erroProfile } = await admin
      .from("profiles")
      .update({ deve_trocar_senha: true })
      .eq("id", userId);

    if (erroProfile) throw new Error(`profile: ${erroProfile.message}`);

    const emailEnviado = await enviarCredenciais({
      para: alvo.email,
      nome: alvo.nome,
      senhaProvisoria,
    });

    await registrarAuditoria(admin, {
      acao: "senha_redefinida",
      ator_id: solicitante.id,
      alvo_user_id: userId,
    });

    return responder({
      ok: true,
      email_enviado: emailEnviado,
      mensagem: emailEnviado
        ? "Nova senha provisória enviada por e-mail."
        : "Senha redefinida, mas o e-mail não pôde ser enviado. Verifique a configuração de envio.",
    });
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) {
      return responder({ erro: erro.message }, erro.status);
    }
    console.error("redefinir-senha-usuario:", erro);
    return responder({ erro: "Não foi possível redefinir a senha. Tente novamente." }, 500);
  }
});
