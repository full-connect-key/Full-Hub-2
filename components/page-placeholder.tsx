/** Tela ainda sem conteudo — o modulo chega nos proximos sprints. */
export function PagePlaceholder({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-2 text-sm text-fh-muted">
        {descricao ?? "Este módulo será construído nos próximos sprints."}
      </p>
      <div className="mt-8 rounded-2xl border border-dashed border-fh-border bg-fh-surface px-6 py-16 text-center">
        <p className="text-sm text-fh-muted">Nada por aqui ainda.</p>
      </div>
    </div>
  );
}
