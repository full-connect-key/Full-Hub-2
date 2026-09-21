"use client";

import { useState, useTransition } from "react";
import {
  Avatar,
  Badge,
  Campo,
  ConfirmDialog,
  Drawer,
  MenuAcoes,
  Toasts,
  classeCampo,
  toast,
} from "@/components/ui";
import { LogoCliente } from "../../aba-clientes";
import {
  alternarAtivoUsuario,
  criarUsuarioCliente,
  redefinirSenha,
} from "@/lib/actions/admin";
import type { ClienteAdmin, UsuarioCliente } from "@/lib/auth/session";

export function DetalheCliente({
  cliente,
  usuarios,
}: {
  cliente: ClienteAdmin;
  usuarios: UsuarioCliente[];
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{
    titulo: string;
    texto: string;
    rotulo: string;
    perigo?: boolean;
    acao: () => void;
  } | null>(null);
  const [processando, iniciar] = useTransition();

  function executar(acao: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) {
    iniciar(async () => {
      const r = await acao();
      if (r.ok) toast(r.mensagem ?? "Pronto.");
      else toast(r.erro ?? "Não foi possível concluir.", "erro");
      setConfirmacao(null);
    });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-4">
        <LogoCliente nome={cliente.nomeEmpresa} url={cliente.logoUrl} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{cliente.nomeEmpresa}</h1>
          <p className="truncate font-mono text-xs text-fh-muted">/portal/{cliente.slug}</p>
        </div>

        <Badge tipo={cliente.ativo ? "ok" : "off"}>{cliente.ativo ? "Ativo" : "Inativo"}</Badge>

        {/* Abre o portal como a própria pessoa da equipe, sem impersonar ninguém. */}
        <a
          href={`/portal/${cliente.slug}`}
          className="rounded-lg border border-fh-border px-4 py-2.5 text-sm font-medium transition hover:bg-fh-bg"
        >
          Abrir Portal do Cliente
        </a>
      </div>

      {!cliente.ativo && (
        <p className="mt-5 rounded-xl border border-fh-danger/25 bg-fh-danger/5 px-4 py-3 text-sm text-fh-danger">
          Esta empresa está inativa: nenhum usuário dela acessa o Portal, e não é possível
          adicionar novos usuários enquanto estiver assim.
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight">
          Usuários do cliente
          <span className="ml-2 text-sm font-normal text-fh-muted">{usuarios.length}</span>
        </h2>

        <button
          type="button"
          onClick={() => setAdicionando(true)}
          disabled={!cliente.ativo}
          className="rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong disabled:opacity-50"
        >
          + Adicionar Usuário
        </button>
      </div>

      {usuarios.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-fh-border bg-fh-surface px-6 py-14 text-center text-sm text-fh-muted">
          Nenhum usuário ainda. O cliente pode existir sem usuários até você cadastrá-los.
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-fh-border overflow-hidden rounded-2xl border border-fh-border bg-fh-surface">
          {usuarios.map((u) => (
            <li key={u.id} className="flex items-center gap-4 px-5 py-3.5">
              <Avatar nome={u.nome} url={u.avatarUrl} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.nome}</p>
                <p className="truncate text-xs text-fh-muted">{u.email}</p>
              </div>

              <Badge tipo={u.ativo ? "ok" : "off"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>

              <MenuAcoes
                itens={[
                  {
                    rotulo: "Redefinir Senha",
                    onClick: () =>
                      setConfirmacao({
                        titulo: "Redefinir senha?",
                        texto: `Uma nova senha provisória será gerada e enviada para ${u.email}.`,
                        rotulo: "Redefinir",
                        acao: () => executar(() => redefinirSenha(u.id)),
                      }),
                  },
                  u.ativo
                    ? {
                        rotulo: "Desativar Usuário",
                        perigo: true,
                        onClick: () =>
                          setConfirmacao({
                            titulo: "Desativar usuário?",
                            texto:
                              "O acesso desta pessoa será bloqueado. Os demais usuários da empresa continuam acessando normalmente.",
                            rotulo: "Desativar",
                            perigo: true,
                            acao: () => executar(() => alternarAtivoUsuario(u.id, false)),
                          }),
                      }
                    : {
                        rotulo: "Reativar Usuário",
                        onClick: () =>
                          setConfirmacao({
                            titulo: "Reativar usuário?",
                            texto: "O acesso será liberado novamente.",
                            rotulo: "Reativar",
                            acao: () => executar(() => alternarAtivoUsuario(u.id, true)),
                          }),
                      },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <Drawer
        aberto={adicionando}
        titulo="Adicionar usuário"
        descricao={`A conta será vinculada a ${cliente.nomeEmpresa}.`}
        onFechar={() => setAdicionando(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            executar(async () => {
              const r = await criarUsuarioCliente({
                nome: String(form.get("nome") ?? "").trim(),
                email: String(form.get("email") ?? "").trim(),
                // O cliente vem da tela aberta — não existe seletor de empresa.
                client_id: cliente.id,
              });
              if (r.ok) setAdicionando(false);
              return r;
            });
          }}
          className="space-y-4"
        >
          <Campo id="nome" rotulo="Nome completo">
            <input id="nome" name="nome" required minLength={2} className={classeCampo} />
          </Campo>

          <Campo id="email" rotulo="E-mail" dica="Receberá a senha provisória.">
            <input id="email" name="email" type="email" required className={classeCampo} />
          </Campo>

          <div className="rounded-lg bg-fh-bg px-3.5 py-3 text-xs text-fh-muted">
            <strong className="font-medium text-fh-text">Empresa: {cliente.nomeEmpresa}</strong>
            <br />
            O vínculo é definido aqui e não pode ser trocado depois pela interface.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAdicionando(false)}
              className="rounded-lg border border-fh-border px-4 py-2.5 text-sm transition hover:bg-fh-bg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={processando}
              className="rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong disabled:opacity-60"
            >
              {processando ? "Criando usuário…" : "Criar usuário"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        aberto={Boolean(confirmacao)}
        titulo={confirmacao?.titulo ?? ""}
        texto={confirmacao?.texto ?? ""}
        rotuloConfirmar={confirmacao?.rotulo ?? "Confirmar"}
        perigo={confirmacao?.perigo}
        processando={processando}
        onConfirmar={() => confirmacao?.acao()}
        onCancelar={() => setConfirmacao(null)}
      />

      <Toasts />
    </div>
  );
}
