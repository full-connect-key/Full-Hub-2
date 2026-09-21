/**
 * Faixa exibida quando alguem da equipe abre o Portal de um cliente.
 *
 * A sessao continua sendo a da pessoa interna — ninguem entra "como" o
 * cliente. A faixa deixa isso explicito na tela.
 */
export function ViewingAsBanner({
  nomeEmpresa,
  nomeUsuario,
}: {
  nomeEmpresa: string;
  nomeUsuario: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-fh-brand/25 bg-fh-brand/5 px-4 py-3 text-sm">
      <span className="font-medium text-fh-brand">Visita administrativa</span>
      <span className="text-fh-muted">
        Você está no portal de <strong className="font-medium text-fh-text">{nomeEmpresa}</strong>{" "}
        como {nomeUsuario}, da equipe — não como o cliente.
      </span>
    </div>
  );
}
