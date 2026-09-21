"use client";

import { useState } from "react";
import { Toasts } from "@/components/ui";
import type { AreaEquipe, ClienteAdmin, Colaborador } from "@/lib/auth/session";
import { AbaColaboradores } from "./aba-colaboradores";
import { AbaClientes } from "./aba-clientes";

type Aba = "colaboradores" | "clientes";

export function EquipeTabs({
  colaboradores,
  clientes,
  areas,
}: {
  colaboradores: Colaborador[];
  clientes: ClienteAdmin[];
  areas: AreaEquipe[];
}) {
  const [aba, setAba] = useState<Aba>("colaboradores");

  const abas: { id: Aba; rotulo: string; total: number }[] = [
    { id: "colaboradores", rotulo: "Colaboradores", total: colaboradores.length },
    { id: "clientes", rotulo: "Clientes", total: clientes.length },
  ];

  return (
    <div className="mt-7">
      <div role="tablist" className="flex gap-1 border-b border-fh-border">
        {abas.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={aba === item.id}
            onClick={() => setAba(item.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
              aba === item.id
                ? "border-fh-brand font-medium text-fh-brand"
                : "border-transparent text-fh-muted hover:text-fh-text"
            }`}
          >
            {item.rotulo}
            <span className="ml-1.5 text-xs text-fh-muted">{item.total}</span>
          </button>
        ))}
      </div>

      <div className="pt-6">
        {aba === "colaboradores" ? (
          <AbaColaboradores colaboradores={colaboradores} areas={areas} />
        ) : (
          <AbaClientes clientes={clientes} />
        )}
      </div>

      <Toasts />
    </div>
  );
}
