import { bairrosDisponiveis, leadsPorIds, listarLeads } from "@/app/actions/leads";
import Filtros from "@/components/Filtros";
import GeradorLista from "./GeradorLista";

export const dynamic = "force-dynamic";

type Params = {
  ids?: string;
  bairro?: string;
  status?: string;
  urgencia?: string;
  busca?: string;
};

export default async function ListaPage({ searchParams }: { searchParams: Params }) {
  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const urgencia = Number.parseInt(searchParams.urgencia ?? "", 10);

  const [leads, bairros] = await Promise.all([
    ids.length > 0
      ? leadsPorIds(ids)
      : listarLeads({
          bairro: searchParams.bairro,
          status: searchParams.status,
          urgenciaMinima: Number.isFinite(urgencia) ? urgencia : undefined,
          busca: searchParams.busca,
          limite: 100,
        }),
    bairrosDisponiveis(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">
          Gerador de lista para corretor
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {ids.length > 0
            ? "Leads vindos da seleção do painel. Desmarque o que não quiser enviar."
            : "Filtre e marque os leads que entram na mensagem."}
        </p>
      </div>

      {ids.length === 0 ? <Filtros bairros={bairros} /> : null}

      <GeradorLista leads={leads} preSelecionados={ids} />
    </div>
  );
}
