"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, isRole } from "@/lib/auth/roles";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error || !data.user) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }

    // Redireciona conforme o perfil: cliente -> Portal, demais -> Painel Interno.
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const role = isRole(profile?.role) ? profile.role : "cliente";
    router.replace(next ?? homeForRole(role));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20"
          placeholder="voce@empresa.com.br"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="senha" className="block text-sm font-medium">
            Senha
          </label>
          <Link
            href="/esqueci-senha"
            className="text-xs text-fh-brand underline underline-offset-2"
          >
            Esqueci minha senha
          </Link>
        </div>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
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
        {carregando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
