"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { canAdministerPortals } from "@/lib/auth/roles";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

/**
 * Confere que quem chamou administra acessos.
 *
 * Isto é conveniência da interface: quem decide de verdade é o RLS, nas
 * escritas diretas, e a Edge Function, nas operações privilegiadas.
 */
async function exigirAdmin() {
  const user = await getSessionUser();
  if (!user || !user.ativo || !canAdministerPortals(user.role)) {
    return null;
  }
  return user;
}

const SEM_PERMISSAO = "Você não possui permissão para realizar esta ação.";

/** Chama uma Edge Function repassando o JWT de quem está logado. */
async function chamarFuncao(
  nome: string,
  corpo: Record<string, unknown>,
): Promise<Resultado> {
  const supabase = await createClient();

  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });

  if (error) {
    // A função devolve o motivo no corpo; o SDK embrulha em FunctionsHttpError.
    let mensagem = "Não foi possível concluir a operação.";
    const resposta = (error as { context?: Response }).context;
    if (resposta && typeof resposta.json === "function") {
      try {
        const detalhe = await resposta.json();
        if (detalhe?.erro) mensagem = detalhe.erro;
      } catch {
        // Resposta sem JSON: fica a mensagem genérica.
      }
    }
    return { ok: false, erro: mensagem };
  }

  return { ok: true, mensagem: data?.mensagem ?? "Operação concluída." };
}

// ---------------------------------------------------------------- colaborador

export async function criarColaborador(dados: {
  nome: string;
  email: string;
  cargo?: string;
  papel: string;
  area_id?: string;
  data_admissao?: string;
  data_aniversario?: string;
}): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: SEM_PERMISSAO };

  const resultado = await chamarFuncao("criar-usuario", { tipo: "colaborador", ...dados });
  if (resultado.ok) revalidatePath("/dashboard/equipe");
  return resultado;
}

export async function editarColaborador(
  id: string,
  dados: {
    nome: string;
    cargo?: string | null;
    papel: string;
    area_id?: string | null;
    data_admissao?: string | null;
    data_aniversario?: string | null;
  },
): Promise<Resultado> {
  const admin = await exigirAdmin();
  if (!admin) return { ok: false, erro: SEM_PERMISSAO };

  const supabase = await createClient();

  const { data: anterior } = await supabase
    .from("profiles")
    .select("nome, cargo, role, area_id, data_admissao, data_aniversario")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({
      nome: dados.nome,
      cargo: dados.cargo || null,
      role: dados.papel,
      area_id: dados.area_id || null,
      data_admissao: dados.data_admissao || null,
      data_aniversario: dados.data_aniversario || null,
    })
    .eq("id", id);

  if (error) return { ok: false, erro: "Não foi possível salvar as alterações." };

  await registrar(supabase, {
    acao: anterior?.role !== dados.papel ? "papel_alterado" : "colaborador_editado",
    ator_id: admin.id,
    alvo_user_id: id,
    dados_anteriores: anterior,
    dados_novos: dados,
  });

  revalidatePath("/dashboard/equipe");
  return { ok: true, mensagem: "Colaborador atualizado." };
}

export async function alternarAtivoUsuario(id: string, ativo: boolean): Promise<Resultado> {
  const admin = await exigirAdmin();
  if (!admin) return { ok: false, erro: SEM_PERMISSAO };

  if (id === admin.id) {
    return { ok: false, erro: "Você não pode desativar o próprio acesso." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ ativo }).eq("id", id);

  if (error) return { ok: false, erro: "Não foi possível alterar o status." };

  await registrar(supabase, {
    acao: ativo ? "colaborador_reativado" : "colaborador_desativado",
    ator_id: admin.id,
    alvo_user_id: id,
    dados_novos: { ativo },
  });

  revalidatePath("/dashboard/equipe");
  return { ok: true, mensagem: ativo ? "Perfil reativado." : "Perfil desativado." };
}

export async function redefinirSenha(userId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: SEM_PERMISSAO };
  return chamarFuncao("redefinir-senha-usuario", { user_id: userId });
}

// -------------------------------------------------------------------- cliente

export async function criarCliente(dados: {
  nome_empresa: string;
  slug?: string;
}): Promise<Resultado> {
  const admin = await exigirAdmin();
  if (!admin) return { ok: false, erro: SEM_PERMISSAO };

  const nome = dados.nome_empresa.trim();
  if (nome.length < 2) return { ok: false, erro: "Informe o nome do cliente." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .insert({ nome_empresa: nome, slug: dados.slug?.trim() || null })
    .select("id, slug")
    .maybeSingle();

  if (error) {
    const duplicado = error.message.toLowerCase().includes("duplicate");
    return {
      ok: false,
      erro: duplicado ? "Já existe um cliente com esse endereço." : "Não foi possível criar o cliente.",
    };
  }

  await registrar(supabase, {
    acao: "cliente_criado",
    ator_id: admin.id,
    alvo_client_id: data?.id,
    dados_novos: { nome_empresa: nome, slug: data?.slug },
  });

  revalidatePath("/dashboard/equipe");
  return { ok: true, mensagem: "Cliente criado." };
}

export async function editarCliente(
  id: string,
  dados: { nome_empresa: string; slug: string },
): Promise<Resultado> {
  const admin = await exigirAdmin();
  if (!admin) return { ok: false, erro: SEM_PERMISSAO };

  const supabase = await createClient();

  const { data: anterior } = await supabase
    .from("clients")
    .select("nome_empresa, slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("clients")
    .update({ nome_empresa: dados.nome_empresa.trim(), slug: dados.slug.trim() })
    .eq("id", id);

  if (error) {
    const duplicado = error.message.toLowerCase().includes("duplicate");
    return {
      ok: false,
      erro: duplicado ? "Já existe um cliente com esse endereço." : "Não foi possível salvar.",
    };
  }

  await registrar(supabase, {
    acao: "cliente_editado",
    ator_id: admin.id,
    alvo_client_id: id,
    dados_anteriores: anterior,
    dados_novos: dados,
  });

  revalidatePath("/dashboard/equipe");
  return { ok: true, mensagem: "Cliente atualizado." };
}

export async function alternarAtivoCliente(id: string, ativo: boolean): Promise<Resultado> {
  const admin = await exigirAdmin();
  if (!admin) return { ok: false, erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ ativo }).eq("id", id);

  if (error) return { ok: false, erro: "Não foi possível alterar o status." };

  await registrar(supabase, {
    acao: ativo ? "cliente_reativado" : "cliente_desativado",
    ator_id: admin.id,
    alvo_client_id: id,
    dados_novos: { ativo },
  });

  revalidatePath("/dashboard/equipe");
  return {
    ok: true,
    mensagem: ativo
      ? "Cliente reativado. Os usuários ativos voltam a acessar o portal."
      : "Cliente desativado. Os usuários dele ficam sem acesso ao portal.",
  };
}

export async function criarUsuarioCliente(dados: {
  nome: string;
  email: string;
  client_id: string;
}): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: SEM_PERMISSAO };

  // O client_id vem da tela aberta, nunca de um select no formulário.
  const resultado = await chamarFuncao("criar-usuario", { tipo: "cliente", ...dados });
  if (resultado.ok) revalidatePath(`/dashboard/equipe/clientes/${dados.client_id}`);
  return resultado;
}

// ------------------------------------------------------------------ auditoria

type RegistroAuditoria = {
  acao: string;
  ator_id: string;
  alvo_user_id?: string | null;
  alvo_client_id?: string | null;
  dados_anteriores?: unknown;
  dados_novos?: unknown;
};

/** Falha de auditoria não derruba a operação, mas fica no log do servidor. */
async function registrar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  registro: RegistroAuditoria,
) {
  const { error } = await supabase.from("activity_log").insert(registro);
  if (error) console.error("activity_log falhou:", error.message);
}
