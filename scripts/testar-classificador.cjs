/**
 * Roda o classificador de anunciante (Parte A) contra a API real, em anúncios
 * fictícios de tipo conhecido. Serve para ver se o prompt separa proprietário
 * de corretor antes de você soltar num lote de verdade.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npm run classificador:testar
 */
const Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");
const { extrairComCliente } = require("../.tmp-cli/extracao.js");
const { classeLead } = require("../.tmp-cli/classe.js");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("\nANTHROPIC_API_KEY não definida.\n");
  process.exit(1);
}

// Anúncios FICTÍCIOS, escritos para o teste. Nomes e telefones inventados.
const CASOS = [
  {
    esperado: "proprietario",
    texto:
      "Gente, preciso repassar meu apartamento que comprei na planta no Residencial Exemplo Alpha, Setor Bueno. " +
      "2 quartos 62m2. Já paguei 90 mil de entrada e parcelas, tô pedindo 80 mil pra sair, o comprador assume o saldo " +
      "de 320 mil com a construtora. Motivo: fui transferido de trabalho pra outro estado e não tenho como levar. " +
      "Entrega junho/2026. Meu zap (62) 90000-0001",
  },
  {
    esperado: "corretor",
    texto:
      "REPASSE — Residencial Exemplo Beta, Jardim Exemplo. 3 quartos, 78m². Ágio de 138 mil, saldo 410 mil. " +
      "Trabalhamos com repasses em toda Goiânia, temos outras opções na região. Agende sua visita com nosso consultor. " +
      "CRECI-GO 00000. Chama no (62) 90000-0002",
  },
  {
    esperado: "imobiliaria",
    texto:
      "Exemplo Imóveis — carteira de repasses atualizada. Studio 32m² no Setor Exemplo Universitário, entrega março/2026, " +
      "financiamento próprio da construtora. Ágio 39 mil. Confira este e outros 40 imóveis no nosso site " +
      "www.exemploimoveis.com.br. Plantão de vendas todos os dias das 8h às 20h.",
  },
  {
    esperado: "indefinido",
    texto:
      "Repasse apto na planta Setor Marista, 58m2, 2 quartos. Pago 72 mil, transfiro por 72 mil. Saldo 295 mil. " +
      "Entrega dezembro/2027. Interessados chamar (62) 90000-0003",
  },
  {
    esperado: "não é repasse",
    texto:
      "Vendo apartamento usado no Setor Oeste, 3 quartos, 110m², escriturado e quitado, aceito financiamento bancário. " +
      "Prédio de 2008, com portaria 24h. Valor 620 mil. (62) 90000-0004",
  },
];

(async () => {
  const client = new Anthropic({ apiKey });
  let acertos = 0;

  for (const caso of CASOS) {
    const e = await extrairComCliente(client, caso.texto);
    const obtido = e.eh_repasse ? e.anunciante_tipo : "não é repasse";
    const ok = obtido === caso.esperado;
    if (ok) acertos++;

    console.log(`\n${ok ? "✅" : "⚠️ "} esperado=${caso.esperado}  obtido=${obtido}`);
    if (e.eh_repasse) {
      console.log(
        `   classe=${classeLead(e)}  confiança=${e.anunciante_confianca}  urgência=${e.score_urgencia}`,
      );
      console.log(`   sinais: ${(e.sinais_anunciante || []).join(" | ") || "—"}`);
    }
  }

  console.log(`\n${acertos}/${CASOS.length} classificações como esperado\n`);
})();
