"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, isRole } from "@/lib/auth/roles";

export function TrocarSenhaForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    const supabase = createClient();

    const { data, error } = await supabase.auth.updateUser({ password: senha });
    if (error || !data.user) {
      setErro("Não foi possível alterar a senha. Tente novamente.");
      setSalvando(false);
      return;
    }

    // Só depois da troca confirmada é que a exigência sai do perfil.
    const { error: erroPerfil } = await supabase
      .from("profiles")
      .update({ deve_trocar_senha: false })
      .eq("id", data.user.id);

    if (erroPerfil) {
      setErro("A senha foi alterada, mas o perfil não atualizou. Recarregue a página.");
      setSalvando(false);
      return;
    }

    const { data: perfil } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const role = isRole(perfil?.role) ? perfil.role : "cliente";

    let clientSlug: string | null = null;
    if (role === "cliente") {
      const { data: slug } = await supabase.rpc("current_user_client_slug");
      clientSlug = typeof slug === "string" ? slug : null;
    }

    router.replace(homeForRole(role, clientSlug));
    router.refresh();
  }

  const campo =
    "w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="senha" className="block text-sm font-medium">
            Nova senha
          </label>
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            aria-pressed={mostrar}
            className="text-xs text-fh-muted transition hover:text-fh-text"
          >
            {mostrar ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <input
          id="senha"
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          required
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={campo}
          placeholder="Pelo menos 8 caracteres"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmacao" className="block text-sm font-medium">
          Confirmar nova senha
        </label>
        <input
          id="confirmacao"
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className={campo}
          placeholder="Repita a senha"
        />
      </div>

      {erro && (
        <p role="alert" className="text-sm text-fh-danger">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={salvando}
        className="w-full rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong disabled:opacity-60"
      >
        {salvando ? "Salvando…" : "Salvar e continuar"}
      </button>
    </form>
  );
}
