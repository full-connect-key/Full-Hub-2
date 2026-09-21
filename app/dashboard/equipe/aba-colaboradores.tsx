"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Avatar,
  Badge,
  Campo,
  ConfirmDialog,
  Drawer,
  MenuAcoes,
  classeCampo,
  toast,
} from "@/components/ui";
import {
  alternarAtivoUsuario,
  criarColaborador,
  editarColaborador,
  redefinirSenha,
} from "@/lib/actions/admin";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { AreaEquipe, Colaborador } from "@/lib/auth/session";

const PAPEIS: { valor: Role; rotulo: string; descricao: string }[] = [
  {
    valor: "colaborador",
    rotulo: "Colaborador",
    descricao: "Acesso aos módulos operacionais destinados à equipe.",
  },
  {
    valor: "desenvolvedor",
    rotulo: "Desenvolvedor",
    descricao: "Acesso administrativo ao Dashboard Full e gestão dos clientes.",
  },
  {
    valor: "socio",
    rotulo: "Sócio",
    descricao:
      "Acesso administrativo completo, incluindo funções exclusivas definidas em módulos específicos.",
  },
];

const ROTULO_PAPEL: Record<string, string> = {
  colaborador: "Colaborador",
  desenvolvedor: "Desenvolvedor",
  socio: "Sócio",
  cliente: "Cliente",
};

type Confirmacao = {
  titulo: string;
  texto: string;
  rotulo: string;
  perigo?: boolean;
  acao: () => Promise<void>;
};

export function AbaColaboradores({
  colaboradores,
  areas,
}: {
  colaboradores: Colaborador[];
  areas: AreaEquipe[];
}) {
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState("todas");
  const [papel, setPapel] = useState("todos");
  const [status, setStatus] = useState("todos");

  const [emEdicao, setEmEdicao] = useState<Colaborador | null>(null);
  const [criando, setCriando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [processando, iniciar] = useTransition();

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return colaboradores.filter((c) => {
      if (termo && ![c.nome, c.email, c.cargo ?? ""].some((v) => v.toLowerCase().includes(termo))) {
        return false;
      }
      if (area !== "todas" && c.areaId !== area) return false;
      if (papel !== "todos" && c.role !== papel) return false;
      if (status === "ativos" && !c.ativo) return false;
      if (status === "inativos" && c.ativo) return false;
      return true;
    });
  }, [colaboradores, busca, area, papel, status]);

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
          placeholder="Buscar por nome, e-mail ou cargo"
          aria-label="Buscar colaborador"
          className={`${classeCampo} max-w-xs flex-1`}
        />

        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Filtrar por área"
          className={`${classeCampo} w-auto`}
        >
          <option value="todas">Todas as áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>

        <select
          value={papel}
          onChange={(e) => setPapel(e.target.value)}
          aria-label="Filtrar por papel"
          className={`${classeCampo} w-auto`}
        >
          <option value="todos">Todos os papéis</option>
          {PAPEIS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </select>

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
          + Adicionar Colaborador
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-fh-border bg-fh-surface px-6 py-14 text-center text-sm text-fh-muted">
          Nenhum colaborador encontrado com esses filtros.
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-fh-border overflow-hidden rounded-2xl border border-fh-border bg-fh-surface">
          {lista.map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-5 py-3.5">
              <Avatar nome={c.nome} url={c.avatarUrl} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="truncate text-xs text-fh-muted">{c.email}</p>
              </div>

              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="truncate text-sm">{c.cargo || "—"}</p>
                <p className="truncate text-xs text-fh-muted">{c.areaNome || "Sem área"}</p>
              </div>

              <div className="hidden w-28 shrink-0 md:block">
                <p className="text-xs text-fh-muted">{ROTULO_PAPEL[c.role] ?? c.role}</p>
                <p className="text-xs text-fh-muted">{formatarData(c.dataAdmissao)}</p>
              </div>

              <Badge tipo={c.ativo ? "ok" : "off"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>

              <MenuAcoes
                itens={[
                  { rotulo: "Editar", onClick: () => setEmEdicao(c) },
                  {
                    rotulo: "Redefinir Senha",
                    onClick: () =>
                      setConfirmacao({
                        titulo: "Redefinir senha?",
                        texto: `Uma nova senha provisória será gerada e enviada para ${c.email}. A pessoa precisará trocá-la no próximo acesso.`,
                        rotulo: "Redefinir",
                        acao: async () => executar(() => redefinirSenha(c.id)),
                      }),
                  },
                  c.ativo
                    ? {
                        rotulo: "Desativar Perfil",
                        perigo: true,
                        onClick: () =>
                          setConfirmacao({
                            titulo: "Desativar colaborador?",
                            texto:
                              "O acesso deste usuário será bloqueado, mas seu histórico será preservado.",
                            rotulo: "Desativar Perfil",
                            perigo: true,
                            acao: async () => executar(() => alternarAtivoUsuario(c.id, false)),
                          }),
                      }
                    : {
                        rotulo: "Reativar Perfil",
                        onClick: () =>
                          setConfirmacao({
                            titulo: "Reativar colaborador?",
                            texto: "O acesso será liberado novamente, com o mesmo cadastro.",
                            rotulo: "Reativar Perfil",
                            acao: async () => executar(() => alternarAtivoUsuario(c.id, true)),
                          }),
                      },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <FormularioColaborador
        aberto={criando}
        areas={areas}
        onFechar={() => setCriando(false)}
        onSalvar={(dados) =>
          executar(async () => {
            const r = await criarColaborador(dados);
            if (r.ok) setCriando(false);
            return r;
          })
        }
        processando={processando}
      />

      <FormularioColaborador
        aberto={Boolean(emEdicao)}
        areas={areas}
        colaborador={emEdicao ?? undefined}
        onFechar={() => setEmEdicao(null)}
        onSalvar={(dados) =>
          executar(async () => {
            const r = await editarColaborador(emEdicao!.id, dados);
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

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

type DadosColaborador = {
  nome: string;
  email: string;
  cargo?: string;
  papel: string;
  area_id?: string;
  data_admissao?: string;
  data_aniversario?: string;
};

function FormularioColaborador({
  aberto,
  areas,
  colaborador,
  onFechar,
  onSalvar,
  processando,
}: {
  aberto: boolean;
  areas: AreaEquipe[];
  colaborador?: Colaborador;
  onFechar: () => void;
  onSalvar: (dados: DadosColaborador) => void;
  processando: boolean;
}) {
  const edicao = Boolean(colaborador);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSalvar({
      nome: String(form.get("nome") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      cargo: String(form.get("cargo") ?? "").trim(),
      papel: String(form.get("papel") ?? "colaborador"),
      area_id: String(form.get("area_id") ?? ""),
      data_admissao: String(form.get("data_admissao") ?? ""),
      data_aniversario: String(form.get("data_aniversario") ?? ""),
    });
  }

  return (
    <Drawer
      aberto={aberto}
      titulo={edicao ? "Editar colaborador" : "Adicionar colaborador"}
      descricao={
        edicao
          ? "Alterações de papel e área valem assim que o perfil for atualizado."
          : "O acesso é criado com senha provisória, enviada por e-mail."
      }
      onFechar={onFechar}
    >
      {/* key força o formulário a recarregar os valores ao trocar de pessoa */}
      <form key={colaborador?.id ?? "novo"} onSubmit={onSubmit} className="space-y-4">
        <Campo id="nome" rotulo="Nome completo">
          <input
            id="nome"
            name="nome"
            required
            minLength={2}
            defaultValue={colaborador?.nome}
            className={classeCampo}
          />
        </Campo>

        <Campo
          id="email"
          rotulo="E-mail"
          dica={
            edicao
              ? "O e-mail é a identidade do acesso e não muda por aqui."
              : "Usado para entrar no Full Hub."
          }
        >
          <input
            id="email"
            name="email"
            type="email"
            required
            readOnly={edicao}
            defaultValue={colaborador?.email}
            className={`${classeCampo} ${edicao ? "bg-fh-bg text-fh-muted" : ""}`}
          />
        </Campo>

        <Campo id="cargo" rotulo="Cargo" dica="Ex.: Diretor de Arte, Redator Pleno.">
          <input id="cargo" name="cargo" defaultValue={colaborador?.cargo ?? ""} className={classeCampo} />
        </Campo>

        <Campo id="papel" rotulo="Papel">
          <select id="papel" name="papel" required defaultValue={colaborador?.role ?? "colaborador"} className={classeCampo}>
            {PAPEIS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <ul className="space-y-1.5 rounded-lg bg-fh-bg px-3.5 py-3">
          {PAPEIS.map((p) => (
            <li key={p.valor} className="text-xs text-fh-muted">
              <strong className="font-medium text-fh-text">{p.rotulo}</strong> — {p.descricao}
            </li>
          ))}
        </ul>

        <Campo id="area_id" rotulo="Área">
          <select id="area_id" name="area_id" required defaultValue={colaborador?.areaId ?? ""} className={classeCampo}>
            <option value="">Selecione</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="data_admissao" rotulo="Data de admissão" dica="Opcional agora, necessária para Full Days.">
          <input
            id="data_admissao"
            name="data_admissao"
            type="date"
            defaultValue={colaborador?.dataAdmissao ?? ""}
            className={classeCampo}
          />
        </Campo>

        <Campo id="data_aniversario" rotulo="Data de aniversário">
          <input
            id="data_aniversario"
            name="data_aniversario"
            type="date"
            defaultValue={colaborador?.dataAniversario ?? ""}
            className={classeCampo}
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
            {processando
              ? edicao
                ? "Salvando…"
                : "Criando usuário…"
              : edicao
                ? "Salvar alterações"
                : "Criar colaborador"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
