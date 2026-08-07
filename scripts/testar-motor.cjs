/**
 * MOTOR COMPLETO, sem infraestrutura: export de WhatsApp -> coleta -> extração
 * pela IA -> pitch pronto. Não toca em Supabase, não precisa de deploy.
 *
 * É o caminho mais curto para saber se o produto funciona com o SEU estoque:
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npm run motor:testar -- /caminho/export.txt
 *
 * Sem argumento usa a fixture fictícia scripts/exemplo-grupo-whatsapp.txt.
 * Use --limite N para gastar menos token no primeiro teste.
 */
const { readFileSync } = require("node:fs");
const Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");

const { coletarDeExportWhatsApp } = require("../.tmp-cli/coletores/whatsapp.js");
const { extrairComCliente, MODELO_EXTRACAO } = require("../.tmp-cli/extracao.js");
const { pitchIndividual, pitchLista } = require("../.tmp-cli/pitch.js");

const args = process.argv.slice(2);
const iLimite = args.indexOf("--limite");
const limite = iLimite >= 0 ? Number(args[iLimite + 1]) : Infinity;
const caminho = args.find((a) => !a.startsWith("--") && a !== String(limite))
  ?? "scripts/exemplo-grupo-whatsapp.txt";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    "\nANTHROPIC_API_KEY não definida.\n" +
      "  ANTHROPIC_API_KEY=sk-ant-... npm run motor:testar -- seu-export.txt\n",
  );
  process.exit(1);
}

const brl = (v) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(v);

(async () => {
  const conteudo = readFileSync(caminho, "utf8");
  const { candidatos, totalMensagens } = coletarDeExportWhatsApp(conteudo);
  const alvo = candidatos.slice(0, limite);

  console.log(`\nArquivo: ${caminho}`);
  console.log(`${totalMensagens} mensagens → ${candidatos.length} candidatos → extraindo ${alvo.length} (modelo ${MODELO_EXTRACAO})\n`);

  const client = new Anthropic({ apiKey });
  const leads = [];
  let invalidos = 0;
  let erros = 0;

  for (const [i, c] of alvo.entries()) {
    process.stdout.write(`[${i + 1}/${alvo.length}] ${c.autor}… `);
    try {
      const e = await extrairComCliente(client, c.texto);
      if (!e.eh_repasse) {
        invalidos++;
        console.log("❌ não é repasse");
        continue;
      }
      const lead = {
        ...e,
        id: String(i),
        fonte: "whatsapp",
        texto_bruto: c.texto,
        status: "novo",
        criado_em: new Date().toISOString(),
        anunciado_em: c.enviadoEm,
        url_original: null,
        empreendimento_id: null,
        empreendimentos: null,
        extraido_em: new Date().toISOString(),
        modelo_extracao: MODELO_EXTRACAO,
      };
      leads.push(lead);
      console.log(
        `✅ ${e.empreendimento_texto ?? "sem nome"} · pedido ${brl(e.valor_pedido)} · 🔥 ${e.score_urgencia}`,
      );
    } catch (err) {
      erros++;
      console.log(`💥 ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `\nResumo: ${leads.length} leads · ${invalidos} descartados pela IA · ${erros} erros\n`,
  );

  if (leads.length === 0) return;

  console.log("═══ PITCH INDIVIDUAL (primeiro lead) ═══\n");
  console.log(pitchIndividual(leads[0]));

  console.log("\n═══ MENSAGEM DE LISTA PARA O CORRETOR ═══\n");
  console.log(pitchLista(leads.sort((a, b) => b.score_urgencia - a.score_urgencia)));
  console.log();
})();
