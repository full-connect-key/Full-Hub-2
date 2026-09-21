"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, isRole } from "@/lib/auth/roles";

export function ResetPasswordForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

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

    setCarregando(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({ password: senha });

    if (error || !data.user) {
      setErro("Não foi possível alterar a senha. Solicite um novo link de recuperação.");
      setCarregando(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const role = isRole(profile?.role) ? profile.role : "cliente";
    router.replace(homeForRole(role));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="senha" className="block text-sm font-medium">
          Nova senha
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20"
          placeholder="••••••••"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmacao" className="block text-sm font-medium">
          Confirmar nova senha
        </label>
        <input
          id="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20"
          placeholder="••••••••"
        />
      </div>

      {erro && (
        <p role="alert" className="text-sm text-fh-danger">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={carregando}
        className="w-full rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong disabled:opacity-60"
      >
        {carregando ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
