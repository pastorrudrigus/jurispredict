import { chaveDedup, normalizar, pareceRepasse } from "./filtro";
import {
  descartesZerados,
  type AnuncioBruto,
  type ResultadoColeta,
} from "./tipos";

/**
 * Coletor de export de conversa do WhatsApp ("Exportar conversa" > "Sem mídia").
 *
 * Não há API de leitura de grupo — e não deveria haver, é conversa privada. O
 * dado aqui é o que VOCÊ já tem por ser membro do grupo; o motor só quebra o
 * .txt em mensagens, joga fora ruído e separa o que parece anúncio.
 *
 * Cobre os dois formatos que o app exporta:
 *   Android:  07/08/2026 14:32 - Fulano: mensagem
 *   iOS:      [07/08/2026 14:32:10] Fulano: mensagem
 * (com ou sem marca LRM invisível, ano com 2 ou 4 dígitos, vírgula opcional)
 */
const CABECALHO =
  /^‎?\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:[AP]M)?\]?\s*(?:-\s*)?(.*)$/i;

const MARCADORES_MIDIA = [
  "arquivo de midia oculto",
  "imagem ocultada",
  "video ocultado",
  "audio ocultado",
  "figurinha omitida",
  "gif omitido",
  "documento omitido",
  "sticker omitted",
  "image omitted",
  "video omitted",
  "audio omitted",
];

const MARCADORES_APAGADA = [
  "esta mensagem foi apagada",
  "you deleted this message",
  "voce apagou esta mensagem",
  "mensagem apagada",
];

/** Frases que o próprio WhatsApp injeta — nunca são anúncio. */
const FRASES_SISTEMA = [
  "as mensagens e as chamadas sao criptografadas",
  "mensagens e ligacoes sao criptografadas",
  "criou o grupo",
  "criou este grupo",
  "entrou usando o link",
  "entrou no grupo",
  "saiu do grupo",
  "adicionou ",
  "removeu ",
  "mudou o assunto",
  "mudou a descricao",
  "mudou a imagem do grupo",
  "alterou as configuracoes",
  "agora e admin",
  "seu codigo de seguranca",
  "essa mensagem foi editada",
];

type Mensagem = {
  autor: string | null;
  enviadoEm: string | null;
  texto: string;
};

function dataISO(
  dia: string,
  mes: string,
  ano: string,
  hora: string,
  minuto: string,
  segundo?: string,
): string | null {
  const a = ano.length === 2 ? 2000 + Number(ano) : Number(ano);
  const d = new Date(
    a,
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    segundo ? Number(segundo) : 0,
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Quebra o arquivo em mensagens, juntando as linhas de continuação. */
export function separarMensagens(conteudo: string): Mensagem[] {
  const linhas = conteudo.replace(/\r\n?/g, "\n").split("\n");
  const mensagens: Mensagem[] = [];
  let atual: Mensagem | null = null;

  for (const linha of linhas) {
    const m = CABECALHO.exec(linha);

    if (m) {
      if (atual) mensagens.push(atual);

      const [, dia, mes, ano, hora, minuto, segundo, resto] = m;
      const corpo = (resto ?? "").replace(/^‎/, "");
      const sep = corpo.indexOf(": ");

      atual =
        sep > 0
          ? {
              autor: corpo.slice(0, sep).trim(),
              texto: corpo.slice(sep + 2),
              enviadoEm: dataISO(dia, mes, ano, hora, minuto, segundo),
            }
          : // sem "Autor: " => mensagem de sistema
            { autor: null, texto: corpo, enviadoEm: dataISO(dia, mes, ano, hora, minuto, segundo) };
    } else if (atual) {
      // linha de continuação da mensagem anterior
      atual.texto += `\n${linha}`;
    }
  }

  if (atual) mensagens.push(atual);
  return mensagens;
}

export function coletarDeExportWhatsApp(conteudo: string): ResultadoColeta {
  const mensagens = separarMensagens(conteudo);
  const descartes = descartesZerados();
  const vistos = new Set<string>();
  const candidatos: AnuncioBruto[] = [];

  for (const msg of mensagens) {
    const texto = msg.texto.trim();
    const t = normalizar(texto);

    if (!msg.autor || FRASES_SISTEMA.some((f) => t.includes(f))) {
      descartes.mensagem_de_sistema++;
      continue;
    }
    if (MARCADORES_APAGADA.some((f) => t.includes(f))) {
      descartes.apagada++;
      continue;
    }
    if (!texto || MARCADORES_MIDIA.some((f) => t.includes(f))) {
      descartes.midia_sem_texto++;
      continue;
    }
    if (texto.length < 40) {
      descartes.curta_demais++;
      continue;
    }
    if (!pareceRepasse(texto)) {
      descartes.sem_sinal_de_repasse++;
      continue;
    }

    const chave = chaveDedup(texto);
    if (vistos.has(chave)) {
      descartes.duplicada_no_lote++;
      continue;
    }
    vistos.add(chave);

    candidatos.push({
      texto,
      fonte: "whatsapp",
      autor: msg.autor,
      enviadoEm: msg.enviadoEm,
      urlOriginal: null,
    });
  }

  return { candidatos, descartes, totalMensagens: mensagens.length };
}
