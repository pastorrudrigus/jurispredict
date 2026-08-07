import { redirect } from "next/navigation";
import { sessaoAtual, temAcesso } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function AguardandoPage() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/entrar");
  if (temAcesso(sessao)) redirect("/");

  const suspenso = sessao.perfil?.status_acesso === "suspenso";

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card max-w-md space-y-3 p-6 text-center">
        <div className="text-3xl">{suspenso ? "⛔" : "⏳"}</div>
        <h1 className="text-lg font-semibold text-zinc-100">
          {suspenso ? "Acesso suspenso" : "Cadastro em análise"}
        </h1>
        <p className="text-sm text-zinc-400">
          {suspenso
            ? "Seu acesso ao pool de leads foi suspenso. Fale com o operador para reativar."
            : "Recebemos seu cadastro. Assim que o acesso for liberado, o pool de repasses aparece aqui — normalmente no mesmo dia."}
        </p>
        <p className="text-xs text-zinc-600">
          Conta: {sessao.perfil?.nome ?? "—"} · {sessao.email}
        </p>
      </div>
    </div>
  );
}
