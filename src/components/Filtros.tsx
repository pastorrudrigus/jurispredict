"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ANUNCIANTE_TIPOS, STATUS } from "@/lib/types";

const URGENCIAS = [
  { valor: "", rotulo: "Qualquer urgência" },
  { valor: "31", rotulo: "≥ 31 (sinais leves)" },
  { valor: "61", rotulo: "≥ 61 (sinais fortes)" },
  { valor: "81", rotulo: "≥ 81 (crítico)" },
];

/** Status que o corretor consegue ver — os demais são barrados pelo RLS. */
const STATUS_CORRETOR = ["novo", "validado", "distribuido", "vendido"] as const;

export default function Filtros({
  bairros,
  admin = false,
}: {
  bairros: string[];
  admin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const statusVisiveis: readonly string[] = admin ? STATUS : STATUS_CORRETOR;

  function aplicar(chave: string, valor: string) {
    const novos = new URLSearchParams(params.toString());
    if (valor) novos.set(chave, valor);
    else novos.delete(chave);
    iniciar(() => router.replace(`${pathname}?${novos.toString()}`));
  }

  const temFiltro = ["bairro", "status", "urgencia", "busca", "anunciante"].some((k) =>
    params.get(k),
  );

  return (
    <div
      className={`card flex flex-wrap items-end gap-3 p-3 ${pendente ? "opacity-60" : ""}`}
    >
      <div className="min-w-[220px] grow">
        <label className="label" htmlFor="f-busca">
          Busca textual
        </label>
        <input
          id="f-busca"
          className="input"
          defaultValue={params.get("busca") ?? ""}
          placeholder="empreendimento, bairro, contato, texto bruto…"
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicar("busca", e.currentTarget.value.trim());
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v !== (params.get("busca") ?? "")) aplicar("busca", v);
          }}
        />
      </div>

      <div className="w-[200px]">
        <label className="label" htmlFor="f-bairro">
          Bairro
        </label>
        <select
          id="f-bairro"
          className="input"
          value={params.get("bairro") ?? ""}
          onChange={(e) => aplicar("bairro", e.target.value)}
        >
          <option value="">Todos</option>
          {bairros.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[170px]">
        <label className="label" htmlFor="f-status">
          Status
        </label>
        <select
          id="f-status"
          className="input"
          value={params.get("status") ?? ""}
          onChange={(e) => aplicar("status", e.target.value)}
        >
          <option value="">Todos (menos inválidos)</option>
          {statusVisiveis.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[190px]">
        <label className="label" htmlFor="f-urgencia">
          Urgência mínima
        </label>
        <select
          id="f-urgencia"
          className="input"
          value={params.get("urgencia") ?? ""}
          onChange={(e) => aplicar("urgencia", e.target.value)}
        >
          {URGENCIAS.map((u) => (
            <option key={u.valor} value={u.valor}>
              {u.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[180px]">
        <label className="label" htmlFor="f-anunciante">
          Anunciante
        </label>
        <select
          id="f-anunciante"
          className="input"
          value={params.get("anunciante") ?? ""}
          onChange={(e) => aplicar("anunciante", e.target.value)}
        >
          <option value="">Todos</option>
          {ANUNCIANTE_TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {temFiltro ? (
        <button
          type="button"
          className="btn"
          onClick={() => iniciar(() => router.replace(pathname))}
        >
          Limpar
        </button>
      ) : null}
    </div>
  );
}
