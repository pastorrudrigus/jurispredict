import {
  bairrosDisponiveis,
  contadores,
  listarLeads,
  totalSinaisJudiciais,
} from "@/app/actions/leads";
import { ehAdmin, exigirAcesso } from "@/lib/sessao";
import Filtros from "@/components/Filtros";
import TabelaLeads from "@/components/TabelaLeads";

export const dynamic = "force-dynamic";

type Params = {
  bairro?: string;
  status?: string;
  urgencia?: string;
  busca?: string;
};

function Contador({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number | string;
  destaque?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className={`text-2xl font-semibold ${destaque ?? "text-zinc-100"}`}>
        {valor}
      </div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</div>
    </div>
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const sessao = await exigirAcesso();
  const admin = ehAdmin(sessao);

  const urgencia = Number.parseInt(searchParams.urgencia ?? "", 10);

  const [leads, totais, bairros, sinaisJudiciais] = await Promise.all([
    listarLeads({
      bairro: searchParams.bairro,
      status: searchParams.status,
      urgenciaMinima: Number.isFinite(urgencia) ? urgencia : undefined,
      busca: searchParams.busca,
      incluirInvalidos: admin && searchParams.status === "invalido",
    }),
    contadores(),
    bairrosDisponiveis(),
    totalSinaisJudiciais(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            {admin ? "Painel de leads" : "Oportunidades de repasse"}
          </h1>
          {!admin ? (
            <p className="mt-1 text-sm text-zinc-500">
              Estoque de repasses captado hoje em Goiânia. Abra um card para ver o
              anúncio original e falar direto com o vendedor.
            </p>
          ) : null}
        </div>
        <div className="grid grid-flow-col gap-3">
          <Contador rotulo="Total" valor={totais.total} />
          <Contador rotulo="Novos hoje" valor={totais.novosHoje} destaque="text-sky-300" />
          <Contador
            rotulo="Urgentes (≥61)"
            valor={totais.urgentes}
            destaque="text-emerald-300"
          />
          {sinaisJudiciais !== null && sinaisJudiciais > 0 ? (
            <Contador
              rotulo="Distratos ajuizados (GO, desde 2023)"
              valor={sinaisJudiciais}
              destaque="text-amber-300"
            />
          ) : null}
        </div>
      </div>

      <Filtros bairros={bairros} admin={admin} />

      <p className="text-xs text-zinc-500">
        {leads.length} lead{leads.length === 1 ? "" : "s"} no filtro atual · ordenados
        por urgência
      </p>

      <TabelaLeads leads={leads} admin={admin} />
    </div>
  );
}
