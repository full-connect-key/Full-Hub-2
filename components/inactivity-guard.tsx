"use client";

import { useEffect, useRef } from "react";
import { CLIENT_IDLE_TIMEOUT_MS } from "@/lib/auth/roles";

const STORAGE_KEY = "fh:last-activity";
const CHECK_INTERVAL_MS = 15_000;
const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "visibilitychange"];

/**
 * Encerra a sessao do Portal do Cliente apos 30 minutos sem interacao.
 * O carimbo de atividade vai para o localStorage, entao varias abas abertas
 * compartilham o mesmo relogio e nenhuma delas derruba as outras sozinha.
 */
export function InactivityGuard({ timeoutMs = CLIENT_IDLE_TIMEOUT_MS }: { timeoutMs?: number }) {
  const encerrando = useRef(false);

  useEffect(() => {
    const marcarAtividade = () => {
      if (encerrando.current) return;
      if (document.visibilityState === "hidden") return;
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // localStorage indisponivel: o fallback abaixo usa o inicio da sessao.
      }
    };

    const ultimaAtividade = (): number => {
      try {
        const valor = Number(localStorage.getItem(STORAGE_KEY));
        return Number.isFinite(valor) && valor > 0 ? valor : Date.now();
      } catch {
        return Date.now();
      }
    };

    const encerrarSessao = () => {
      if (encerrando.current) return;
      encerrando.current = true;

      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignorado
      }

      // POST para limpar os cookies de sessao no servidor.
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/auth/signout?motivo=inatividade";
      document.body.appendChild(form);
      form.submit();
    };

    marcarAtividade();
    EVENTS.forEach((evento) => window.addEventListener(evento, marcarAtividade, { passive: true }));

    const intervalo = window.setInterval(() => {
      if (Date.now() - ultimaAtividade() >= timeoutMs) encerrarSessao();
    }, CHECK_INTERVAL_MS);

    return () => {
      EVENTS.forEach((evento) => window.removeEventListener(evento, marcarAtividade));
      window.clearInterval(intervalo);
    };
  }, [timeoutMs]);

  return null;
}
