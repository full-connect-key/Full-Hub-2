"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge, Campo, ConfirmDialog, Drawer, MenuAcoes, classeCampo, toast } from "@/components/ui";
import { alternarAtivoCliente, criarCliente, editarCliente } from "@/lib/actions/admin";
import type { ClienteAdmin } from "@/lib/auth/session";

/** "Mundo Verde" -> "mundo-verde". Mesma regra do slugify no banco. */
export function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function AbaClientes({ clientes }: { clientes: ClienteAdmin[] }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [criando, setCriando] = useState(false);
  const [emEdicao, setEmEdicao] = useState<ClienteAdmin | null>(null);
  const [confirmacao, setConfirmacao] = useState<{
    titulo: string;
    texto: string;
    rotulo: string;
    perigo?: boolean;
    acao: () => void;
  } | null>(null);
  const [processando, iniciar] = useTransition();

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (termo && ![c.nomeEmpresa, c.slug].some((v) => v.toLowerCase().includes(termo))) return false;
      if (status === "ativos" && !c.ativo) return false;
      if (status === "inativos" && c.ativo) return false;
      return true;
    });
  }, [clientes, busca, status]);

  function executar(acao: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) {
    iniciar(async () => {
      const r = await acao();
      if (r.ok) toast(r.mensagem ?? "Pronto.");
      else toast(r.erro ?? "Não foi possível concluir.", "erro");
      setConfirmacao(null);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou endereço"
          aria-label="Buscar cliente"
          className={`${classeCampo} max-w-xs flex-1`}
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por status"
          className={`${classeCampo} w-auto`}
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>

        <button
          type="button"
          onClick={() => setCriando(true)}
          className="ml-auto rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong"
        >
          + Novo Cliente
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-fh-border bg-fh-surface px-6 py-14 text-center text-sm text-fh-muted">
          Nenhum cliente encontrado.
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-fh-border overflow-hidden rounded-2xl border border-fh-border bg-fh-surface">
          {lista.map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-5 py-3.5">
              <LogoCliente nome={c.nomeEmpresa} url={c.logoUrl} />

              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/equipe/clientes/${c.id}`}
                  className="truncate text-sm font-medium hover:text-fh-brand"
                >
                  {c.nomeEmpresa}
                </Link>
                <p className="truncate font-mono text-xs text-fh-muted">/portal/{c.slug}</p>
              </div>

              <p className="hidden w-32 shrink-0 text-xs text-fh-muted sm:block">
                {c.totalUsuarios} {c.totalUsuarios === 1 ? "usuário" : "usuários"}
              </p>

              <Badge tipo={c.ativo ? "ok" : "off"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>

              <MenuAcoes
                itens={[
                  {
                    rotulo: "Abrir",
                    onClick: () => {
                      window.location.href = `/dashboard/equipe/clientes/${c.id}`;
                    },
                  },
                  { rotulo: "Editar", onClick: () => setEmEdicao(c) },
                  c.ativo
                    ? {
                        rotulo: "Desativar",
                        perigo: true,
                        onClick: () =>
                          setConfirmacao({
                            titulo: "Desativar cliente?",
                            texto:
                              "Todos os usuários desta empresa ficam sem acesso ao Portal enquanto ela estiver inativa. O histórico é preservado.",
                            rotulo: "Desativar",
                            perigo: true,
                            acao: () => executar(() => alternarAtivoCliente(c.id, false)),
                          }),
                      }
                    : {
                        rotulo: "Reativar",
                        onClick: () =>
                          setConfirmacao({
                            titulo: "Reativar cliente?",
                            texto: "Os usuários que ainda estiverem ativos voltam a acessar o Portal.",
                            rotulo: "Reativar",
                            acao: () => executar(() => alternarAtivoCliente(c.id, true)),
                          }),
                      },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <FormularioCliente
        aberto={criando}
        onFechar={() => setCriando(false)}
        onSalvar={(dados) =>
          executar(async () => {
            const r = await criarCliente(dados);
            if (r.ok) setCriando(false);
            return r;
          })
        }
        processando={processando}
      />

      <FormularioCliente
        aberto={Boolean(emEdicao)}
        cliente={emEdicao ?? undefined}
        onFechar={() => setEmEdicao(null)}
        onSalvar={(dados) =>
          executar(async () => {
            const r = await editarCliente(emEdicao!.id, {
              nome_empresa: dados.nome_empresa,
              slug: dados.slug ?? "",
            });
            if (r.ok) setEmEdicao(null);
            return r;
          })
        }
        processando={processando}
      />

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
    </div>
  );
}

export function LogoCliente({ nome, url }: { nome: string; url?: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-fh-bg text-xs font-semibold text-fh-muted">
      {nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

function FormularioCliente({
  aberto,
  cliente,
  onFechar,
  onSalvar,
  processando,
}: {
  aberto: boolean;
  cliente?: ClienteAdmin;
  onFechar: () => void;
  onSalvar: (dados: { nome_empresa: string; slug?: string }) => void;
  processando: boolean;
}) {
  const edicao = Boolean(cliente);
  const [nome, setNome] = useState(cliente?.nomeEmpresa ?? "");
  const [slug, setSlug] = useState(cliente?.slug ?? "");
  const [slugEditado, setSlugEditado] = useState(false);

  function aoDigitarNome(valor: string) {
    setNome(valor);
    // Enquanto ninguém mexer no endereço, ele acompanha o nome.
    if (!slugEditado && !edicao) setSlug(gerarSlug(valor));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSalvar({ nome_empresa: nome, slug: slug || gerarSlug(nome) });
  }

  return (
    <Drawer
      aberto={aberto}
      titulo={edicao ? "Editar cliente" : "Novo cliente"}
      descricao={
        edicao
          ? "O endereço muda a URL do portal. A identidade da conta continua sendo o id."
          : "O cliente pode ser criado agora e ganhar usuários depois."
      }
      onFechar={onFechar}
    >
      <form key={cliente?.id ?? "novo"} onSubmit={onSubmit} className="space-y-4">
        <Campo id="nome_empresa" rotulo="Nome do cliente">
          <input
            id="nome_empresa"
            required
            minLength={2}
            value={nome}
            onChange={(e) => aoDigitarNome(e.target.value)}
            className={classeCampo}
            placeholder="Mundo Verde"
          />
        </Campo>

        <Campo id="slug" rotulo="Endereço do portal" dica={`Ficará em /portal/${slug || "…"}`}>
          <input
            id="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugEditado(true);
              setSlug(gerarSlug(e.target.value));
            }}
            className={`${classeCampo} font-mono`}
            placeholder="mundo-verde"
          />
        </Campo>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-fh-border px-4 py-2.5 text-sm transition hover:bg-fh-bg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={processando}
            className="rounded-lg bg-fh-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fh-brand-strong disabled:opacity-60"
          >
            {processando ? "Salvando…" : edicao ? "Salvar alterações" : "Criar cliente"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
