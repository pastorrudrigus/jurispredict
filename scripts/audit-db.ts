/**
 * Sprint 0 — Auditoria de dados (read-only) contra o Supabase real.
 *
 * O que faz:
 *   1. Lista todos os schemas, tabelas e colunas do banco (com estimativa de linhas).
 *   2. Identifica, por heurística de nomes, as tabelas candidatas a fonte de:
 *      - pedidos / faturamento (NFs)
 *      - contas a receber (títulos)
 *   3. Para cada candidata de contas a receber, mede a completude dos campos de
 *      liquidação de títulos — a variável mais preditiva do score. Sem data de
 *      liquidação por título, o score nasce manco (Seção 10 da spec).
 *   4. Gera relatório em reports/audit-<data>.md e reports/audit-<data>.json.
 *
 * O que NÃO faz: nenhuma escrita. A sessão é forçada a read-only e a role usada
 * na SUPABASE_DB_URL deve ser read-only por si só.
 *
 * Uso:  SUPABASE_DB_URL=postgresql://... npm run audit
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

// ---------------------------------------------------------------------------
// Heurísticas de nomes (pt-BR + variações comuns de ERP). Ajustar aqui se o
// relatório mostrar que o ERP usa outra convenção — nunca inventar nomes.
// ---------------------------------------------------------------------------

const RX = {
  // colunas que indicam data de liquidação/baixa de um título
  liquidacao: /liquid|baixa|pagament|pgto|quitac|recebiment|receb_/i,
  vencimento: /venciment|venc_|due_?date|data_venc/i,
  valor: /valor|vlr|montante|amount|total/i,
  cliente: /cliente|sacado|customer|clifor|pessoa/i,
  cnpj: /cnpj|cpf_cnpj|documento|doc_federal|tax_?id/i,
  emissao: /emiss|data_ped|data_nf|dt_emis|created|data_fat/i,
  status: /status|situac|sit_/i,
  // tabelas candidatas
  contasReceber: /receb|titulo|duplicata|boleto|cobranca|financeiro|parcela|fatura|cr_|contas_r/i,
  pedidos: /pedido|venda|nota|nf|fatur|order|invoice|item/i,
  clientes: /cliente|customer|sacado|cadastro/i,
};

interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
}

interface TableInfo {
  schema: string;
  table: string;
  rowEstimate: number;
  columns: ColumnInfo[];
}

interface LiquidacaoAudit {
  schema: string;
  table: string;
  rowCount: number;
  vencimentoCol: string | null;
  liquidacaoCols: string[];
  statusCol: string | null;
  valorCol: string | null;
  // completude por coluna de liquidação
  completeness: Array<{
    column: string;
    nonNull: number;
    pctNonNull: number;
    // entre títulos já vencidos (proxy de "deveriam estar liquidados ou em atraso")
    nonNullVencidos: number | null;
    pctNonNullVencidos: number | null;
    minDate: string | null;
    maxDate: string | null;
  }>;
  historyMonths: number | null; // cobertura de histórico pela data de vencimento
  statusDistribution: Array<{ value: string; count: number }> | null;
}

function fail(msg: string): never {
  console.error(`\n[audit-db] ERRO: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    fail(
      "variável de ambiente SUPABASE_DB_URL não definida.\n" +
        "  Defina-a com a connection string de uma role READ-ONLY do Supabase:\n" +
        "  SUPABASE_DB_URL=postgresql://usuario_readonly:senha@db.<ref>.supabase.co:5432/postgres npm run audit\n" +
        "  (nunca use o usuário postgres master — Seção 7 da spec)"
    );
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes("localhost") ? undefined : { rejectUnauthorized: false },
    statement_timeout: 60_000,
  });

  console.log("[audit-db] conectando (sessão read-only)...");
  await client.connect();
  // trava a sessão em read-only mesmo que a role tenha mais permissão do que deveria
  await client.query("set default_transaction_read_only = on");
  await client.query("set transaction_isolation to 'repeatable read'");

  // -------------------------------------------------------------------------
  // 1. Inventário: schemas, tabelas, colunas, estimativa de linhas
  // -------------------------------------------------------------------------
  console.log("[audit-db] inventariando schemas/tabelas/colunas...");
  const { rows: tableRows } = await client.query<{
    schema: string;
    table: string;
    row_estimate: string;
  }>(`
    select n.nspname as schema,
           c.relname as table,
           c.reltuples::bigint as row_estimate
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p')  -- tabelas e particionadas
      and n.nspname not in ('pg_catalog','information_schema','pg_toast',
                            'extensions','graphql','graphql_public','realtime',
                            'supabase_functions','vault','pgsodium','pgsodium_masks',
                            'storage','auth','net','cron','pgbouncer')
    order by 1, 2
  `);

  const tables: TableInfo[] = [];
  for (const t of tableRows) {
    const { rows: cols } = await client.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [t.schema, t.table]
    );
    tables.push({
      schema: t.schema,
      table: t.table,
      rowEstimate: Number(t.row_estimate),
      columns: cols.map((c) => ({
        name: c.column_name,
        dataType: c.data_type,
        isNullable: c.is_nullable === "YES",
      })),
    });
  }
  console.log(`[audit-db] ${tables.length} tabelas encontradas.`);

  // -------------------------------------------------------------------------
  // 2. Classificação heurística das fontes
  // -------------------------------------------------------------------------
  const colNames = (t: TableInfo) => t.columns.map((c) => c.name);
  const hasCol = (t: TableInfo, rx: RegExp) => colNames(t).some((n) => rx.test(n));

  const candidatesCR = tables.filter(
    (t) =>
      (RX.contasReceber.test(t.table) || (hasCol(t, RX.vencimento) && hasCol(t, RX.valor))) &&
      hasCol(t, RX.vencimento)
  );
  const candidatesPedidos = tables.filter(
    (t) => RX.pedidos.test(t.table) && hasCol(t, RX.valor) && hasCol(t, RX.emissao)
  );
  const candidatesClientes = tables.filter(
    (t) => RX.clientes.test(t.table) && hasCol(t, RX.cnpj)
  );

  // -------------------------------------------------------------------------
  // 3. Completude dos campos de liquidação nas candidatas de contas a receber
  // -------------------------------------------------------------------------
  const audits: LiquidacaoAudit[] = [];
  for (const t of candidatesCR) {
    const qualified = `"${t.schema}"."${t.table}"`;
    const vencCol = colNames(t).find((n) => RX.vencimento.test(n)) ?? null;
    const liqCols = colNames(t).filter((n) => {
      const col = t.columns.find((c) => c.name === n)!;
      return RX.liquidacao.test(n) && /date|time/i.test(col.dataType);
    });
    const statusCol = colNames(t).find((n) => RX.status.test(n)) ?? null;
    const valorCol = colNames(t).find((n) => RX.valor.test(n)) ?? null;

    console.log(`[audit-db] auditando ${qualified} (venc=${vencCol}, liq=[${liqCols.join(", ")}])...`);

    let rowCount = 0;
    try {
      const { rows } = await client.query<{ n: string }>(`select count(*) as n from ${qualified}`);
      rowCount = Number(rows[0]?.n ?? 0);
    } catch (e) {
      console.warn(`[audit-db]   sem permissão de leitura em ${qualified} — pulando (${(e as Error).message})`);
      continue;
    }

    const completeness: LiquidacaoAudit["completeness"] = [];
    for (const lc of liqCols) {
      const q = `"${lc}"`;
      const vencExpr = vencCol ? `"${vencCol}"` : null;
      const { rows } = await client.query(`
        select
          count(${q}) as non_null,
          min(${q})::text as min_date,
          max(${q})::text as max_date
          ${vencExpr ? `, count(${q}) filter (where ${vencExpr} < now()) as non_null_vencidos,
                        count(*) filter (where ${vencExpr} < now()) as total_vencidos` : ""}
        from ${qualified}
      `);
      const r = rows[0];
      const totalVencidos = vencExpr ? Number(r.total_vencidos) : null;
      completeness.push({
        column: lc,
        nonNull: Number(r.non_null),
        pctNonNull: rowCount > 0 ? Number(r.non_null) / rowCount : 0,
        nonNullVencidos: vencExpr ? Number(r.non_null_vencidos) : null,
        pctNonNullVencidos:
          vencExpr && totalVencidos ? Number(r.non_null_vencidos) / totalVencidos : null,
        minDate: r.min_date,
        maxDate: r.max_date,
      });
    }

    let historyMonths: number | null = null;
    if (vencCol) {
      const { rows } = await client.query(
        `select (extract(epoch from (max("${vencCol}")::timestamp - min("${vencCol}")::timestamp)) / 2629800)::int as meses
         from ${qualified}`
      );
      historyMonths = rows[0]?.meses ?? null;
    }

    let statusDistribution: LiquidacaoAudit["statusDistribution"] = null;
    if (statusCol) {
      const { rows } = await client.query(
        `select coalesce("${statusCol}"::text, '<null>') as value, count(*) as count
         from ${qualified} group by 1 order by 2 desc limit 20`
      );
      statusDistribution = rows.map((r) => ({ value: r.value, count: Number(r.count) }));
    }

    audits.push({
      schema: t.schema,
      table: t.table,
      rowCount,
      vencimentoCol: vencCol,
      liquidacaoCols: liqCols,
      statusCol,
      valorCol,
      completeness,
      historyMonths,
      statusDistribution,
    });
  }

  await client.end();

  // -------------------------------------------------------------------------
  // 4. Relatório
  // -------------------------------------------------------------------------
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = join(process.cwd(), "reports");
  mkdirSync(outDir, { recursive: true });

  const jsonPath = join(outDir, `audit-${stamp}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), tables, candidatesCR: audits, candidatesPedidos: candidatesPedidos.map(t => `${t.schema}.${t.table}`), candidatesClientes: candidatesClientes.map(t => `${t.schema}.${t.table}`) }, null, 2)
  );

  const md: string[] = [];
  md.push(`# Auditoria de dados — Crivo (Sprint 0)`);
  md.push(`Gerado em: ${new Date().toISOString()}\n`);

  md.push(`## Inventário (${tables.length} tabelas)\n`);
  md.push(`| Schema | Tabela | Linhas (est.) | Colunas |`);
  md.push(`|---|---|---:|---|`);
  for (const t of tables) {
    md.push(`| ${t.schema} | ${t.table} | ${t.rowEstimate.toLocaleString("pt-BR")} | ${t.columns.map((c) => c.name).join(", ")} |`);
  }

  md.push(`\n## Candidatas — Pedidos/Faturamento\n`);
  md.push(candidatesPedidos.length ? candidatesPedidos.map((t) => `- \`${t.schema}.${t.table}\``).join("\n") : "_Nenhuma identificada pela heurística — revisar nomes manualmente._");

  md.push(`\n## Candidatas — Cadastro de clientes\n`);
  md.push(candidatesClientes.length ? candidatesClientes.map((t) => `- \`${t.schema}.${t.table}\``).join("\n") : "_Nenhuma identificada pela heurística — revisar nomes manualmente._");

  md.push(`\n## Contas a receber — completude da liquidação de títulos\n`);
  if (!audits.length) {
    md.push(`_Nenhuma tabela candidata de contas a receber identificada. Revisar heurísticas em RX no audit-db.ts com os nomes reais do inventário acima._`);
  }
  for (const a of audits) {
    md.push(`### \`${a.schema}.${a.table}\` — ${a.rowCount.toLocaleString("pt-BR")} títulos\n`);
    md.push(`- Coluna de vencimento: ${a.vencimentoCol ? `\`${a.vencimentoCol}\`` : "**NÃO ENCONTRADA**"}`);
    md.push(`- Coluna de valor: ${a.valorCol ? `\`${a.valorCol}\`` : "**NÃO ENCONTRADA**"}`);
    md.push(`- Histórico coberto: ${a.historyMonths ?? "?"} meses ${a.historyMonths !== null && a.historyMonths < 12 ? "⚠️ **menos de 12 meses — backfill limitado**" : ""}`);
    if (!a.liquidacaoCols.length) {
      md.push(`- ⚠️ **Nenhuma coluna de data de liquidação encontrada.** Sem ela o score nasce manco — resolver antes do Sprint 1 (Seção 10 da spec).`);
    }
    for (const c of a.completeness) {
      md.push(
        `- \`${c.column}\`: ${(c.pctNonNull * 100).toFixed(1)}% preenchida no total` +
          (c.pctNonNullVencidos !== null
            ? `; **${(c.pctNonNullVencidos! * 100).toFixed(1)}% preenchida entre títulos já vencidos** ${c.pctNonNullVencidos! < 0.9 ? "⚠️ completude baixa — investigar se baixa é registrada em outro lugar" : "✅"}`
            : "") +
          ` (período: ${c.minDate ?? "?"} → ${c.maxDate ?? "?"})`
      );
    }
    if (a.statusDistribution) {
      md.push(`- Distribuição de \`${a.statusCol}\`: ${a.statusDistribution.map((s) => `${s.value}=${s.count}`).join(", ")}`);
    }
    md.push("");
  }

  md.push(`\n## Próximos passos\n`);
  md.push(`1. Validar com o financeiro quais tabelas acima são de fato a fonte canônica.`);
  md.push(`2. Se a completude de liquidação entre títulos vencidos for < 90%, mapear onde a baixa é registrada antes de prosseguir.`);
  md.push(`3. Só então: Sprint 1 — migration do schema \`credito\` + job de features com os nomes reais.`);

  const mdPath = join(outDir, `audit-${stamp}.md`);
  writeFileSync(mdPath, md.join("\n"));

  console.log(`\n[audit-db] relatório gerado:\n  ${mdPath}\n  ${jsonPath}`);
  console.log(`[audit-db] ${candidatesCR.length} candidatas de contas a receber auditadas.`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
