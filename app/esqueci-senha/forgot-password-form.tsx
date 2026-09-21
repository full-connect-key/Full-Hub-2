"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCarregando(true);

    const supabase = createClient();
    const origem =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? window.location.origin;

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origem}/auth/confirm?next=/redefinir-senha`,
    });

    // Resposta sempre igual, exista ou nao a conta — evita enumerar usuarios.
    setEnviado(true);
    setCarregando(false);
  }

  if (enviado) {
    return (
      <p className="rounded-lg border border-fh-border bg-fh-bg px-4 py-3 text-sm text-fh-muted">
        Se houver uma conta para <strong className="text-fh-text">{email}</strong>, o link de
        recuperação chegará em instantes. Verifique também a caixa de spam.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20"
          placeholder="voce@empresa.com.br"
        />
      </div>

      <button
        type="submit"
        disabled={carregando}
        className="w-full rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong disabled:opacity-60"
      >
        {carregando ? "Enviando…" : "Enviar link de recuperação"}
      </button>
    </form>
  );
}
