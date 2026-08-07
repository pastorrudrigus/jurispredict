import { exigirAdmin } from "@/lib/sessao";
import ColetorWhatsApp from "./ColetorWhatsApp";

export const dynamic = "force-dynamic";

export default async function ColetarPage() {
  await exigirAdmin();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">
          Coletor — export de WhatsApp
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          No WhatsApp: abra o grupo →{" "}
          <span className="text-zinc-300">⋮ &gt; Mais &gt; Exportar conversa &gt; Sem mídia</span>{" "}
          → salve o <code className="text-zinc-300">.txt</code> e solte aqui. O
          motor quebra o arquivo em mensagens, joga fora sistema, mídia e
          conversa fiada, e só manda para a IA o que parece anúncio de repasse —
          normalmente menos de 20% do arquivo.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-zinc-600">
          O arquivo é lido no seu navegador. Só o texto dos anúncios que você
          selecionar sai daqui.
        </p>
      </div>
      <ColetorWhatsApp />
    </div>
  );
}
