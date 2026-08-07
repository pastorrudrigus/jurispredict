/**
 * Roda o coletor de WhatsApp num arquivo e mostra o que ele separou, sem tocar
 * em banco nem gastar token de IA. Serve para calibrar o pré-filtro antes de
 * ingerir de verdade.
 *
 *   npm run coletor:testar                      # usa a fixture fictícia
 *   npm run coletor:testar -- /caminho/export.txt
 */
const { readFileSync } = require("node:fs");
const { coletarDeExportWhatsApp } = require("../.tmp-cli/coletores/whatsapp.js");

const caminho = process.argv[2] ?? "scripts/exemplo-grupo-whatsapp.txt";
const conteudo = readFileSync(caminho, "utf8");
const { candidatos, descartes, totalMensagens } = coletarDeExportWhatsApp(conteudo);

console.log(`\nArquivo: ${caminho}`);
console.log(`Mensagens no export:   ${totalMensagens}`);
console.log(`Candidatos a anúncio:  ${candidatos.length}\n`);

console.log("Descartados:");
for (const [motivo, n] of Object.entries(descartes)) {
  if (n > 0) console.log(`  ${motivo.padEnd(24)} ${n}`);
}

const economizadas = totalMensagens - candidatos.length;
const pct = Math.round((economizadas / Math.max(totalMensagens, 1)) * 100);
console.log(
  `\n${economizadas} mensagens não viram chamada de IA (${pct}% de economia de token).\n`,
);

candidatos.forEach((c, i) => {
  const quando = c.enviadoEm ? new Date(c.enviadoEm).toLocaleString("pt-BR") : "—";
  console.log(`── ${i + 1}. ${c.autor} · ${quando}`);
  console.log(c.texto.split("\n").map((l) => `   ${l}`).join("\n"));
  console.log();
});
