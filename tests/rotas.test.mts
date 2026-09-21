/**
 * Critérios de aceite do Sprint 1 — camada de navegação.
 *
 * Testa canAccessPath() e homeForRole() diretamente contra lib/auth/roles.ts,
 * que é o mesmo módulo consultado pelo middleware e pelos layouts.
 *
 * Rodar:  npm test
 */
import assert from "node:assert/strict";
import {
  canAccessPath,
  canAdministerPortals,
  homeForRole,
  navForRole,
  type Role,
} from "../lib/auth/roles.ts";

let passou = 0;
const falhas: string[] = [];

function checar(descricao: string, fn: () => void) {
  try {
    fn();
    passou++;
    console.log(`  ok   ${descricao}`);
  } catch (erro) {
    falhas.push(descricao);
    console.log(`  FALHA  ${descricao}`);
    console.log(`         ${(erro as Error).message.split("\n")[0]}`);
  }
}

const MUNDO_VERDE = { clientSlug: "mundo-verde" };

console.log("\nDestino após o login:");

checar("1. colaborador vai para o Dashboard", () => {
  assert.equal(homeForRole("colaborador"), "/dashboard");
});

checar("2. desenvolvedor vai para o Dashboard", () => {
  assert.equal(homeForRole("desenvolvedor"), "/dashboard");
});

checar("3. sócio vai para o Dashboard", () => {
  assert.equal(homeForRole("socio"), "/dashboard");
});

checar("4. cliente Mundo Verde vai para /portal/mundo-verde", () => {
  assert.equal(homeForRole("cliente", "mundo-verde"), "/portal/mundo-verde");
});

checar("5. cliente ABF vai para /portal/abf", () => {
  assert.equal(homeForRole("cliente", "abf"), "/portal/abf");
});

console.log("\nIsolamento entre contas:");

checar("6. Mundo Verde não abre /portal/abf", () => {
  assert.equal(canAccessPath("cliente", "/portal/abf", MUNDO_VERDE), false);
  assert.equal(canAccessPath("cliente", "/portal/abf/arquivos", MUNDO_VERDE), false);
});

checar("6b. Mundo Verde abre a própria conta", () => {
  assert.equal(canAccessPath("cliente", "/portal/mundo-verde", MUNDO_VERDE), true);
  assert.equal(canAccessPath("cliente", "/portal/mundo-verde/projetos", MUNDO_VERDE), true);
});

checar("7. cliente não abre o Dashboard", () => {
  assert.equal(canAccessPath("cliente", "/dashboard", MUNDO_VERDE), false);
  assert.equal(canAccessPath("cliente", "/dashboard/financeiro", MUNDO_VERDE), false);
  assert.equal(canAccessPath("cliente", "/dashboard/tarefas", MUNDO_VERDE), false);
});

checar("7b. cliente sem empresa vinculada não abre portal nenhum", () => {
  assert.equal(canAccessPath("cliente", "/portal/mundo-verde", { clientSlug: null }), false);
});

console.log("\nAcesso administrativo da equipe:");

checar("8. desenvolvedor abre Mundo Verde", () => {
  assert.equal(canAccessPath("desenvolvedor", "/portal/mundo-verde"), true);
});

checar("9. desenvolvedor abre ABF", () => {
  assert.equal(canAccessPath("desenvolvedor", "/portal/abf"), true);
});

checar("10. sócio abre qualquer conta", () => {
  assert.equal(canAccessPath("socio", "/portal/mundo-verde"), true);
  assert.equal(canAccessPath("socio", "/portal/abf/solicitacoes"), true);
});

checar("10b. colaborador não administra portais de cliente", () => {
  assert.equal(canAccessPath("colaborador", "/portal/mundo-verde"), false);
  assert.equal(canAccessPath("colaborador", "/portal/abf"), false);
});

console.log("\nPermissões dentro do Dashboard:");

checar("financeiro é só do sócio", () => {
  assert.equal(canAccessPath("socio", "/dashboard/financeiro"), true);
  assert.equal(canAccessPath("desenvolvedor", "/dashboard/financeiro"), false);
  assert.equal(canAccessPath("colaborador", "/dashboard/financeiro"), false);
});

checar("rota nova sob financeiro continua restrita", () => {
  assert.equal(canAccessPath("desenvolvedor", "/dashboard/financeiro/relatorios/2026"), false);
  assert.equal(canAccessPath("socio", "/dashboard/financeiro/relatorios/2026"), true);
});

checar("aprovações de RH são só do sócio", () => {
  assert.equal(canAccessPath("socio", "/dashboard/rh/aprovacoes"), true);
  assert.equal(canAccessPath("colaborador", "/dashboard/rh/aprovacoes"), false);
});

checar("colaborador acessa o básico da operação", () => {
  for (const rota of ["/dashboard", "/dashboard/tarefas", "/dashboard/diario",
                      "/dashboard/mes-a-mes", "/dashboard/skills", "/dashboard/recomendacoes"]) {
    assert.equal(canAccessPath("colaborador", rota), true, rota);
  }
});

checar("colaborador não acessa a área de gestão", () => {
  // Clientes deixou de ser rota própria: virou aba dentro de Equipe & Skills.
  assert.equal(canAccessPath("colaborador", "/dashboard/equipe"), false);
  assert.equal(canAccessPath("colaborador", "/dashboard/equipe/clientes/abc"), false);
});

console.log("\nSprint 2 — administração:");

checar("Equipe & Skills é só de desenvolvedor e sócio", () => {
  assert.equal(canAccessPath("socio", "/dashboard/equipe"), true);
  assert.equal(canAccessPath("desenvolvedor", "/dashboard/equipe"), true);
  assert.equal(canAccessPath("colaborador", "/dashboard/equipe"), false);
  assert.equal(canAccessPath("cliente", "/dashboard/equipe", MUNDO_VERDE), false);
});

checar("o detalhe de um cliente segue a mesma permissão", () => {
  const rota = "/dashboard/equipe/clientes/abc-123";
  assert.equal(canAccessPath("socio", rota), true);
  assert.equal(canAccessPath("desenvolvedor", rota), true);
  assert.equal(canAccessPath("colaborador", rota), false);
});

checar("quem administra acessos é quem administra portais", () => {
  assert.equal(canAdministerPortals("socio"), true);
  assert.equal(canAdministerPortals("desenvolvedor"), true);
  assert.equal(canAdministerPortals("colaborador"), false);
  assert.equal(canAdministerPortals("cliente"), false);
});

checar("o menu do colaborador não mostra Equipe & Skills", () => {
  const itens = navForRole("colaborador");
  assert.ok(!itens.some((i) => i.href.includes("/equipe")));
});

console.log("\nMenu lateral:");

checar("menu do portal é montado com o slug da conta aberta", () => {
  const itens = navForRole("cliente", "mundo-verde");
  assert.equal(itens[0].href, "/portal/mundo-verde");
  assert.ok(itens.some((i) => i.href === "/portal/mundo-verde/arquivos"));
  assert.ok(!itens.some((i) => i.href.includes("/dashboard")));
});

checar("menu do colaborador não traz financeiro", () => {
  const itens = navForRole("colaborador");
  assert.ok(!itens.some((i) => i.href.includes("financeiro")));
  assert.ok(!itens.some((i) => i.href.includes("aprovacoes")));
});

checar("todo item visível no menu é acessível pelo perfil", () => {
  for (const role of ["colaborador", "desenvolvedor", "socio"] as Role[]) {
    for (const item of navForRole(role)) {
      assert.equal(canAccessPath(role, item.href), true, `${role} → ${item.href}`);
    }
  }
});

console.log("");
if (falhas.length > 0) {
  console.log(`${falhas.length} falha(s) de ${passou + falhas.length}`);
  process.exit(1);
}
console.log(`Todos os ${passou} testes de rota passaram.`);
