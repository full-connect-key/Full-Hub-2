"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, isRole, type Audience } from "@/lib/auth/roles";

const OPCOES: { valor: Audience; titulo: string; descricao: string }[] = [
  {
    valor: "colaborador",
    titulo: "Sou Colaborador",
    descricao: "Acesso ao ambiente interno da Full Connect Key.",
  },
  {
    valor: "cliente",
    titulo: "Sou Cliente",
    descricao: "Acesso ao Portal do Cliente.",
  },
];

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [audiencia, setAudiencia] = useState<Audience | null>(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
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

    // A escolha acima define a experiência de entrada. O destino real vem
    // sempre do banco: se não baterem, o banco vence.
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const role = isRole(profile?.role) ? profile.role : "cliente";

    let clientSlug: string | null = null;
    if (role === "cliente") {
      const { data: slug } = await supabase.rpc("current_user_client_slug");
      clientSlug = typeof slug === "string" ? slug : null;
    }

    router.replace(next ?? homeForRole(role, clientSlug));
    router.refresh();
  }

  // Etapa 1: escolher o ambiente de entrada.
  if (!audiencia) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-fh-muted">Como você quer entrar?</p>
        {OPCOES.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => setAudiencia(opcao.valor)}
            className="w-full rounded-xl border border-fh-border bg-white px-4 py-3.5 text-left transition hover:border-fh-brand hover:bg-fh-brand/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-fh-brand/40"
          >
            <span className="block text-sm font-semibold text-fh-text">{opcao.titulo}</span>
            <span className="mt-0.5 block text-xs text-fh-muted">{opcao.descricao}</span>
          </button>
        ))}
      </div>
    );
  }

  const escolhida = OPCOES.find((o) => o.valor === audiencia)!;

  // Etapa 2: credenciais.
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-fh-bg px-3 py-2">
        <span className="text-xs font-medium text-fh-text">{escolhida.titulo}</span>
        <button
          type="button"
          onClick={() => {
            setAudiencia(null);
            setErro(null);
          }}
          className="text-xs text-fh-brand underline underline-offset-2"
        >
          Trocar
        </button>
      </div>

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
          autoFocus
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
        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 pr-16 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-pressed={mostrarSenha}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-fh-muted transition hover:text-fh-text"
          >
            {mostrarSenha ? "Ocultar" : "Mostrar"}
          </button>
        </div>
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
