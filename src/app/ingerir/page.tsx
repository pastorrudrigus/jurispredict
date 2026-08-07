import FormularioIngestao from "./FormularioIngestao";

export const dynamic = "force-dynamic";

export default function IngerirPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Caixa de ingestão</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cole um ou vários anúncios brutos. Separe cada anúncio com uma linha
          contendo apenas <code className="text-zinc-300">---</code>. A IA
          estrutura cada um; duplicatas e não-repasses são marcados sem derrubar
          o lote.
        </p>
      </div>
      <FormularioIngestao />
    </div>
  );
}
