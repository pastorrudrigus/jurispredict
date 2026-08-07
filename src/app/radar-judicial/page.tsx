import Link from "next/link";
import { linhaDoTempoEntregas, panoramaJudicial } from "@/app/actions/judicial";
import { exigirAdmin } from "@/lib/sessao";
import { dataBR, tempoRelativo } from "@/lib/format";
import type { LeadJudicialLinha } from "@/app/actions/judicial";

export const dynamic = "force-dynamic";

const ROTULO_CATEGORIA: Record<string, string> = {
  distrato_comprador: "Distrato (comprador saindo)",
  retomada_construtora: "Retomada pela construtora",
  execucao: "Execução / cumprimento",
  execucao_condominial: "Execução condominial",
  inventario: "Inventário / arrolamento",
  busca_apreensao: "Busca e apreensão",
  leilao: "Leilão / hasta",
};

function Cartao({
  rotulo,
  valor,
  destaque,
  nota,
}: {
  rotulo: string;
  valor: number | string;
  destaque?: string;
  nota?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className={`text-2xl font-semibold ${destaque ?? "text-zinc-100"}`}>{valor}</div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</div>
      {nota ? <div className="mt-1 text-xs text-zinc-600">{nota}</div> : null}
    </div>
  );
}

function ListaLeads({
  titulo,
  descricao,
  leads,
  vazio,
}: {
  titulo: string;
  descricao: string;
  leads: LeadJudicialLinha[];
  vazio: string;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-zinc-100">{titulo}</h2>
      <p className="mb-3 mt-0.5 text-xs text-zinc-500">{descricao}</p>
      {leads.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-600">{vazio}</p>
      ) : (
        <ul className="divide-y divide-edge/60">
          {leads.map((l) => (
            <li key={l.id} className="py-2">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-zinc-200">{l.pessoa_alvo ?? "parte não identificada"}</span>
                <span className="shrink-0 rounded border border-edge px-1.5 text-xs text-zinc-400">
                  {l.score_oportunidade ?? 0}/100
                </span>
              </div>
              {l.resumo ? <p className="mt-0.5 text-xs text-zinc-500">{l.resumo}</p> : null}
              {l.proximo_passo ? (
                <p className="mt-1 text-xs text-sky-300">→ {l.proximo_passo}</p>
              ) : null}
              <p className="mt-1 text-xs text-zinc-600">{tempoRelativo(l.criado_em)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function RadarJudicialPage() {
  await exigirAdmin();
  const [p, entregas] = await Promise.all([panoramaJudicial(), linhaDoTempoEntregas()]);

  const naJanela = entregas.filter((e) => e.na_janela_critica);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Radar Judicial</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          O anúncio é o vendedor que já decidiu vender — mercado visível, com
          corrida entre corretores. O processo é o vendedor <em>antes</em> de
          anunciar. Chegar aqui primeiro é a exclusividade.
        </p>
      </div>

      <div className="grid grid-flow-col gap-3 overflow-x-auto">
        <Cartao rotulo="Processos captados" valor={p.totalSinais} />
        <Cartao
          rotulo="Aguardando enriquecimento"
          valor={p.pendentesEnriquecimento}
          destaque="text-amber-300"
          nota="precisa das partes (Estágio 2)"
        />
        <Cartao rotulo="Sigilosos" valor={p.sigilosos} nota="só entram como estatística" />
        <Cartao
          rotulo="Cruzamentos anúncio × processo"
          valor={p.cruzamentos}
          destaque="text-rose-300"
          nota="urgência 100 automática"
        />
        <Cartao
          rotulo="Empreendimentos na janela crítica"
          valor={naJanela.length}
          destaque="text-sky-300"
          nota="-6 a +8 meses da entrega"
        />
      </div>

      {p.totalSinais === 0 ? (
        <div className="card p-6 text-sm text-zinc-400">
          <p className="font-medium text-zinc-200">Nenhum processo captado ainda.</p>
          <p className="mt-1 text-zinc-500">
            A varredura roda em <code className="text-zinc-300">/api/cron/datajud</code>{" "}
            (diária pelo <code className="text-zinc-300">vercel.json</code>). Para a
            carga inicial desde 2023, chame uma vez com{" "}
            <code className="text-zinc-300">?completo=1</code>. Exige{" "}
            <code className="text-zinc-300">DATAJUD_API_KEY</code> configurada.
          </p>
        </div>
      ) : (
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-zinc-100">
            Processos por categoria e comarca
          </h2>
          <p className="mb-3 mt-0.5 text-xs text-zinc-500">
            Volume bruto da varredura. Distrato e retomada só se separam depois do
            enriquecimento, que é quem revela o polo das partes.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs uppercase text-zinc-500">
                <th className="py-2">Categoria</th>
                <th className="py-2">Comarca / órgão</th>
                <th className="py-2 text-right">Processos</th>
              </tr>
            </thead>
            <tbody>
              {p.porCategoria.map((c) => (
                <tr key={`${c.categoria}-${c.comarca}`} className="border-b border-edge/50">
                  <td className="py-1.5 text-zinc-200">
                    {ROTULO_CATEGORIA[c.categoria] ?? c.categoria}
                  </td>
                  <td className="py-1.5 text-zinc-400">{c.comarca ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-100">{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ListaLeads
          titulo="Unidades voltando ao estoque"
          descricao="Distrato com construtora no polo passivo — negocie a revenda direto com ela."
          leads={p.unidadesVoltandoEstoque}
          vazio="Depende do Estágio 2 (partes do processo)."
        />
        <ListaLeads
          titulo="Fila de captação silenciosa"
          descricao="Vendedores pressionados e inventários, antes de virarem anúncio."
          leads={p.filaCaptacao}
          vazio="Depende do Estágio 2 (partes do processo)."
        />
        <ListaLeads
          titulo="Calendário de leilões"
          descricao="Deals de aquisição para a rede de investidores."
          leads={p.leiloes}
          vazio="Nenhum leilão identificado ainda."
        />
      </div>

      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-100">Linha do tempo de entregas</h2>
          <Link href="/empreendimentos" className="text-xs text-sky-300 hover:underline">
            editar empreendimentos →
          </Link>
        </div>
        <p className="mb-3 mt-0.5 text-xs text-zinc-500">
          O mapa da onda. A janela crítica vai de 8 meses antes a 6 meses depois
          da entrega — é quando o comprador bate no muro das chaves e precisa da
          aprovação bancária do saldo corrigido por INCC.
        </p>
        {entregas.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-600">
            Nenhum empreendimento com data de entrega cadastrada.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs uppercase text-zinc-500">
                <th className="py-2">Empreendimento</th>
                <th className="py-2">Construtora</th>
                <th className="py-2">Entrega</th>
                <th className="py-2 text-right">Meses</th>
                <th className="py-2 text-right">Anúncios</th>
                <th className="py-2 text-right">Classe A</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-edge/50 ${e.na_janela_critica ? "bg-sky-500/5" : ""}`}
                >
                  <td className="py-1.5 text-zinc-200">
                    {e.nome}
                    {e.na_janela_critica ? (
                      <span className="ml-2 rounded border border-sky-500/40 bg-sky-500/10 px-1 text-xs text-sky-300">
                        janela
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-zinc-400">{e.construtora ?? "—"}</td>
                  <td className="py-1.5 text-zinc-400">
                    {dataBR(e.data_entrega_prevista) ?? "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-400">
                    {e.meses_ate_entrega ?? "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-300">{e.anuncios}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-300">
                    {e.anuncios_classe_a}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
