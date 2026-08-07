import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase";
import { MODELO_EXTRACAO, extrairAnuncio } from "@/lib/anthropic";
import { pareceRepasse } from "@/lib/coletores/filtro";
import { aplicarBonusJanela, classeLead } from "@/lib/classe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook Evolution API. Recebe cada mensagem nova de grupos monitorados,
 * pre-filtra por sinais de repasse, extrai com Claude, dedup, salva.
 *
 * Autenticacao: header `x-webhook-secret` deve bater com env EVOLUTION_WEBHOOK_SECRET.
 *
 * Grupos monitorados: env MONITORED_GROUPS = "120363xxx@g.us,120363yyy@g.us"
 * (vazio = escuta todos os grupos — cuidado com custo de token da IA).
 *
 * Payload esperado (Evolution API v2):
 * {
 *   event: "messages.upsert",
 *   instance: "nome-da-instancia",
 *   data: {
 *     key: { remoteJid, fromMe, id, participant? },
 *     pushName: string,
 *     message: { conversation?: string, extendedTextMessage?: { text: string } },
 *     messageTimestamp: number,
 *     messageType: string
 *   }
 * }
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret") ?? req.headers.get("apikey");
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ erro: "secret invalido" }, { status: 401 });
  }

  let payload: {
    event?: string;
    data?: {
      key?: { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string };
      pushName?: string;
      message?: {
        conversation?: string;
        extendedTextMessage?: { text?: string };
      };
      messageTimestamp?: number;
      messageType?: string;
    };
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }

  if (payload.event !== "messages.upsert") {
    return NextResponse.json({ ok: true, ignorado: `evento ${payload.event}` });
  }

  const key = payload.data?.key;
  if (!key || key.fromMe) {
    return NextResponse.json({ ok: true, ignorado: "mensagem propria ou sem key" });
  }

  const jid = key.remoteJid ?? "";
  const soGrupos = jid.endsWith("@g.us");
  const monitorados = (process.env.MONITORED_GROUPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (monitorados.length > 0 && !monitorados.includes(jid)) {
    return NextResponse.json({ ok: true, ignorado: `grupo nao monitorado: ${jid}` });
  }
  if (monitorados.length === 0 && !soGrupos) {
    return NextResponse.json({ ok: true, ignorado: "ignora DMs por default" });
  }

  const texto =
    payload.data?.message?.conversation ??
    payload.data?.message?.extendedTextMessage?.text ??
    "";
  if (!texto || texto.length < 20) {
    return NextResponse.json({ ok: true, ignorado: "texto vazio ou muito curto" });
  }

  if (!pareceRepasse(texto)) {
    return NextResponse.json({ ok: true, ignorado: "pre-filtro nao passou" });
  }

  // Dedup por hash do texto normalizado
  const hashDedup = createHash("md5")
    .update("whatsapp" + texto.toLowerCase().replace(/\s+/g, " ").trim())
    .digest("hex");

  const supabase = db();
  const { data: existente } = await supabase
    .from("anuncios_repasse")
    .select("id")
    .eq("hash_dedup", hashDedup)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ ok: true, ignorado: "duplicado", id: existente.id });
  }

  // Extracao via Claude
  let extraido: Awaited<ReturnType<typeof extrairAnuncio>>;
  try {
    extraido = await extrairAnuncio(texto);
  } catch (e) {
    return NextResponse.json(
      { erro: "extracao falhou", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  if (!extraido.eh_repasse) {
    return NextResponse.json({ ok: true, ignorado: "IA disse que nao e repasse" });
  }

  // Match empreendimento
  let empId: string | null = null;
  let naJanela = false;
  if (extraido.empreendimento_texto) {
    const { data: match } = await supabase.rpc("match_empreendimento", {
      busca: extraido.empreendimento_texto,
    });
    if (Array.isArray(match) && match.length > 0 && (match[0] as { sim: number }).sim >= 0.35) {
      empId = (match[0] as { id: string }).id;
      const { data: emp } = await supabase
        .from("empreendimentos_janela")
        .select("na_janela_critica")
        .eq("id", empId)
        .maybeSingle();
      naJanela = (emp as { na_janela_critica: boolean } | null)?.na_janela_critica === true;
    }
  }

  const classe = classeLead(extraido);
  const scoreFinal = aplicarBonusJanela(
    extraido.score_urgencia ?? 0,
    classe,
    naJanela,
  );

  // Anunciado_em: timestamp da mensagem (Unix segs → ISO)
  const anunciadoEm = payload.data?.messageTimestamp
    ? new Date(payload.data.messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  const { data: inserido, error } = await supabase
    .from("anuncios_repasse")
    .insert({
      fonte: "whatsapp",
      hash_dedup: hashDedup,
      texto_bruto: texto,
      empreendimento_id: empId,
      empreendimento_texto: extraido.empreendimento_texto,
      bairro: extraido.bairro,
      tipologia: extraido.tipologia,
      area_m2: extraido.area_m2,
      valor_pago: extraido.valor_pago,
      valor_pedido: extraido.valor_pedido,
      saldo_devedor: extraido.saldo_devedor,
      fase_obra_mencionada: extraido.fase_obra_mencionada,
      telefone_contato: extraido.telefone_contato ?? key.participant?.split("@")[0] ?? null,
      nome_contato: extraido.nome_contato ?? payload.data?.pushName ?? null,
      score_urgencia: scoreFinal,
      sinais_urgencia: extraido.sinais_urgencia ?? [],
      status: "novo",
      extraido_em: new Date().toISOString(),
      modelo_extracao: MODELO_EXTRACAO,
    })
    .select("id, score_urgencia")
    .single();

  if (error) {
    return NextResponse.json(
      { erro: "insert falhou", detalhe: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: inserido.id,
    score: inserido.score_urgencia,
    classe,
    empreendimento: extraido.empreendimento_texto,
    janela_critica: naJanela,
  });
}
