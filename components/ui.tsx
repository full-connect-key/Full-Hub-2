"use client";

import { useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------------- toast */

type Toast = { id: number; texto: string; tipo: "ok" | "erro" };

let proximoId = 1;
const ouvintes = new Set<(t: Toast) => void>();

/** Avisos globais. Chamado de qualquer componente cliente. */
export function toast(texto: string, tipo: Toast["tipo"] = "ok") {
  const t = { id: proximoId++, texto, tipo };
  ouvintes.forEach((ouvinte) => ouvinte(t));
}

export function Toasts() {
  const [itens, setItens] = useState<Toast[]>([]);

  useEffect(() => {
    const ouvinte = (t: Toast) => {
      setItens((atual) => [...atual, t]);
      setTimeout(() => setItens((atual) => atual.filter((i) => i.id !== t.id)), 5000);
    };
    ouvintes.add(ouvinte);
    return () => { ouvintes.delete(ouvinte); };
  }, []);

  if (itens.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      {itens.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
            item.tipo === "erro"
              ? "border-fh-danger/30 bg-white text-fh-danger"
              : "border-fh-border bg-white text-fh-text"
          }`}
        >
          {item.texto}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- drawer */

export function Drawer({
  aberto,
  titulo,
  descricao,
  onFechar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    painel.current?.focus();
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-fh-text/25"
        onClick={onFechar}
        aria-hidden="true"
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-fh-border bg-fh-surface shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-fh-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
            {descricao && <p className="mt-1 text-sm text-fh-muted">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg px-2 py-1 text-fh-muted transition hover:bg-fh-bg hover:text-fh-text"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- confirmação */

export function ConfirmDialog({
  aberto,
  titulo,
  texto,
  rotuloConfirmar,
  perigo,
  processando,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  texto: string;
  rotuloConfirmar: string;
  perigo?: boolean;
  processando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <div className="absolute inset-0 bg-fh-text/25" onClick={onCancelar} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative w-full max-w-sm rounded-2xl border border-fh-border bg-fh-surface p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
        <p className="mt-2 text-sm text-fh-muted">{texto}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-fh-border px-4 py-2 text-sm transition hover:bg-fh-bg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={processando}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
              perigo ? "bg-fh-danger hover:brightness-110" : "bg-fh-brand hover:bg-fh-brand-strong"
            }`}
          >
            {processando ? "Aguarde…" : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ menu de ações */

export function MenuAcoes({ itens }: { itens: { rotulo: string; perigo?: boolean; onClick: () => void }[] }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Ações"
        className="rounded-lg px-2 py-1 text-fh-muted transition hover:bg-fh-bg hover:text-fh-text"
      >
        ⋮
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-fh-border bg-fh-surface py-1 shadow-lg"
        >
          {itens.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                item.onClick();
              }}
              className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-fh-bg ${
                item.perigo ? "text-fh-danger" : "text-fh-text"
              }`}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- campos */

export const classeCampo =
  "w-full rounded-lg border border-fh-border bg-white px-3 py-2.5 text-sm outline-none focus:border-fh-brand focus:ring-2 focus:ring-fh-brand/20";

export function Campo({
  id,
  rotulo,
  dica,
  children,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {dica && <p className="text-xs text-fh-muted">{dica}</p>}
    </div>
  );
}

export function Badge({ children, tipo }: { children: React.ReactNode; tipo: "ok" | "off" }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tipo === "ok" ? "bg-fh-ok-soft text-fh-ok" : "bg-fh-bg text-fh-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function Avatar({ nome, url }: { nome: string; url?: string | null }) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }

  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fh-brand/10 text-xs font-semibold text-fh-brand">
      {iniciais || "?"}
    </span>
  );
}
