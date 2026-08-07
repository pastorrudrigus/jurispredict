import { listarEmpreendimentos } from "@/app/actions/empreendimentos";
import { exigirAdmin } from "@/lib/sessao";
import GerenciadorEmpreendimentos from "./GerenciadorEmpreendimentos";

export const dynamic = "force-dynamic";

export default async function EmpreendimentosPage() {
  await exigirAdmin();
  const empreendimentos = await listarEmpreendimentos();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Empreendimentos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Base usada para vincular anúncios por fuzzy match (similaridade ≥ 0,35) e
          para preencher a data de entrega no pitch. Rode{" "}
          <code className="text-zinc-300">scripts/seed.sql</code> para carregar os
          placeholders e substitua pelos empreendimentos reais.
        </p>
      </div>
      <GerenciadorEmpreendimentos empreendimentos={empreendimentos} />
    </div>
  );
}
