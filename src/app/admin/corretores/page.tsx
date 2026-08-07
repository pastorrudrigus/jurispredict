import { listarPerfis } from "@/app/actions/corretores";
import { exigirAdmin } from "@/lib/sessao";
import TabelaCorretores from "./TabelaCorretores";

export const dynamic = "force-dynamic";

export default async function CorretoresPage() {
  const sessao = await exigirAdmin();
  const perfis = await listarPerfis();

  const pendentes = perfis.filter((p) => p.status_acesso === "pendente").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Corretores</h1>
        <p className="mt-1 text-sm text-zinc-500">
          O cadastro é self-service, mas o acesso ao pool não: cada conta nasce{" "}
          <strong className="text-zinc-300">pendente</strong> e só enxerga os leads
          depois que você marcar como <strong className="text-zinc-300">ativo</strong>.
          {pendentes > 0 ? (
            <span className="ml-1 text-amber-300">
              {pendentes} aguardando aprovação.
            </span>
          ) : null}
        </p>
      </div>
      <TabelaCorretores perfis={perfis} meuId={sessao.userId} />
    </div>
  );
}
