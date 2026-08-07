"use client";

import { useState } from "react";

export default function BotaoCopiar({
  texto,
  rotulo = "Copiar",
  className = "btn",
  aoCopiar,
}: {
  texto: string;
  rotulo?: string;
  className?: string;
  aoCopiar?: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // navegador sem permissão de clipboard — fallback textarea
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiado(true);
    aoCopiar?.();
    setTimeout(() => setCopiado(false), 1800);
  }

  return (
    <button type="button" className={className} onClick={copiar}>
      {copiado ? "✓ Copiado" : rotulo}
    </button>
  );
}
