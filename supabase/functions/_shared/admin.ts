// Peças compartilhadas pelas Edge Functions administrativas.
//
// Regra que vale para as duas: a autorização é decidida aqui, no servidor,
// consultando o banco com o JWT de quem chamou. Nada que venha do corpo da
// requisição ("sou socio") é levado em conta.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function responder(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Erro com mensagem já pronta para a interface. */
export class ErroDeNegocio extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Client com service_role — existe apenas dentro da Edge Function. */
export function clientAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type Administrador = {
  id: string;
  email: string;
  nome: string;
  role: "desenvolvedor" | "socio";
};

/**
 * Identifica quem chamou e confirma que pode administrar acessos.
 *
 * Passos: valida o JWT, carrega o profile correspondente, confere que está
 * ativo e que o papel é desenvolvedor ou socio.
 */
export async function exigirAdministrador(req: Request): Promise<Administrador> {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new ErroDeNegocio("Você não possui permissão para realizar esta ação.", 401);
  }

  const admin = clientAdmin();

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new ErroDeNegocio("Você não possui permissão para realizar esta ação.", 401);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, nome, role, ativo")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.ativo) {
    throw new ErroDeNegocio("Você não possui permissão para realizar esta ação.", 403);
  }

  if (profile.role !== "desenvolvedor" && profile.role !== "socio") {
    throw new ErroDeNegocio("Você não possui permissão para realizar esta ação.", 403);
  }

  return {
    id: profile.id,
    email: profile.email,
    nome: profile.nome,
    role: profile.role,
  };
}

const ALFABETO = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SIMBOLOS = "!@#$%&*?";

/**
 * Senha provisória forte, sorteada com CSPRNG.
 * Nunca é gravada no banco: vive no Auth e segue no e-mail de boas-vindas.
 */
export function gerarSenhaProvisoria(tamanho = 14): string {
  const fonte = ALFABETO + SIMBOLOS;
  const bytes = new Uint32Array(tamanho);
  crypto.getRandomValues(bytes);

  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += fonte[bytes[i] % fonte.length];

  // Garante ao menos um símbolo e um dígito, sem enfraquecer o resto.
  const extra = new Uint32Array(2);
  crypto.getRandomValues(extra);
  const posSimbolo = extra[0] % tamanho;
  const posDigito = (posSimbolo + 1 + (extra[1] % (tamanho - 1))) % tamanho;

  const comSimbolo =
    senha.slice(0, posSimbolo) + SIMBOLOS[extra[0] % SIMBOLOS.length] + senha.slice(posSimbolo + 1);
  return (
    comSimbolo.slice(0, posDigito) +
    "23456789"[extra[1] % 8] +
    comSimbolo.slice(posDigito + 1)
  );
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Registra a ação administrativa. Falha aqui nunca derruba a operação. */
export async function registrarAuditoria(
  admin: SupabaseClient,
  registro: {
    acao: string;
    ator_id: string;
    alvo_user_id?: string | null;
    alvo_client_id?: string | null;
    dados_anteriores?: unknown;
    dados_novos?: unknown;
  },
): Promise<void> {
  const { error } = await admin.from("activity_log").insert(registro);
  if (error) console.error("activity_log falhou:", error.message);
}

/**
 * E-mail de boas-vindas com as credenciais.
 *
 * Integra com RESEND_API_KEY quando configurada. Sem a chave, apenas registra
 * o envio pendente e devolve false — quem chamou avisa na interface que o
 * cadastro foi concluído mas o e-mail não saiu.
 */
export async function enviarCredenciais(params: {
  para: string;
  nome: string;
  senhaProvisoria: string;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const remetente = Deno.env.get("EMAIL_REMETENTE");
  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

  if (!apiKey || !remetente) {
    console.warn(`E-mail de boas-vindas não enviado para ${params.para}: envio não configurado.`);
    return false;
  }

  const html = `
    <div style="font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #10141a; line-height: 1.55;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">Bem-vindo(a) ao Full Hub</h1>
      <p style="margin: 0 0 16px;">Olá, ${escaparHtml(params.nome)}. Seu acesso foi criado.</p>
      <table style="border-collapse: collapse; margin: 0 0 16px;">
        <tr><td style="padding: 4px 16px 4px 0; color: #667085;">E-mail</td>
            <td style="padding: 4px 0;"><strong>${escaparHtml(params.para)}</strong></td></tr>
        <tr><td style="padding: 4px 16px 4px 0; color: #667085;">Senha provisória</td>
            <td style="padding: 4px 0;"><strong style="font-family: ui-monospace, monospace;">${escaparHtml(params.senhaProvisoria)}</strong></td></tr>
      </table>
      <p style="margin: 0 0 20px;">Ao acessar pela primeira vez, você deverá criar uma nova senha.</p>
      ${siteUrl ? `<a href="${siteUrl}/login" style="display: inline-block; background: #1c4ed8; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 9px; font-weight: 600;">Acessar Full Hub</a>` : ""}
    </div>`;

  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: params.para,
        subject: "Seu acesso ao Full Hub",
        html,
      }),
    });

    if (!resposta.ok) {
      console.error("Envio de e-mail falhou:", await resposta.text());
      return false;
    }
    return true;
  } catch (erro) {
    console.error("Envio de e-mail falhou:", erro);
    return false;
  }
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
