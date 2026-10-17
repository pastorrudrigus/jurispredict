import { Boxes, FileSpreadsheet, Flag, Gavel, Landmark, ShieldCheck, Trophy, Truck, Users, Zap } from "lucide-react";
import { PageHead } from "../components/ui";

const STEPS = [
  { icon: FileSpreadsheet, title: "1. Monte o mix", text: "Use o mix padrão de 20 produtos, escolha itens e quantidades em “Nova cotação” ou importe um CSV (produto;quantidade).", href: "#/cotacoes?tab=nova" },
  { icon: Gavel, title: "2. Ative a competição", text: "Cinco fornecedores fictícios entram na arena. Itens que ninguém atende ficam explícitos — nunca viram economia.", href: "#/arena" },
  { icon: Zap, title: "3. Pressione por melhores condições", text: "Até 3 rodadas simuladas (o desafiante mais próximo melhora 0,5 p.p.) e melhorias manuais até 12% da tabela inicial.", href: "#/arena" },
  { icon: Truck, title: "4. Ajuste o frete", text: "Informe quem entrega, quem paga, modal, seguro, despesas e prazo. Frete absorvido não é cobrado; frete pago pelo comprador sempre entra.", href: "#/transporte" },
  { icon: Flag, title: "5. Encerre e selecione", text: "O sistema revalida a cesta e as ofertas. Depois disso, lances e mudanças logísticas ficam bloqueados.", href: "#/arena" },
  { icon: Trophy, title: "6. Gere o pedido", text: "Reconheça a falta e gere um único pedido interno. Repetir a confirmação não duplica; mudanças de preço ou estoque bloqueiam.", href: "#/pedidos" },
];

export default function Guia() {
  return (
    <>
      <PageHead eyebrow="Guia da plataforma" title="Como a compra é decidida" sub="Do mix ao pedido em seis passos — com regras explícitas e trilha de auditoria." />
      <div className="grid g3" style={{ marginBottom: 16 }}>
        {STEPS.map((s) => (
          <a key={s.title} className="link-card" href={s.href} style={{ alignItems: "flex-start" }}>
            <div className="ic"><s.icon size={20} /></div>
            <div><b>{s.title}</b><small>{s.text}</small></div>
          </a>
        ))}
      </div>
      <div className="grid g2">
        <div className="card">
          <h2><Boxes size={18} style={{ verticalAlign: -3 }} /> Conceitos</h2>
          <ul className="tight">
            <li><b>Desembolso</b>: o que sai do caixa — mercadorias + frete incremental + seguro + despesas, cada um uma vez.</li>
            <li><b>Custo econômico</b>: desembolso trazido a valor presente pelo prazo de pagamento (taxa anual, base 365).</li>
            <li><b>Proposta apta</b>: atende toda a cesta (estoque, validade e vida mínima), logística válida, dentro do teto e do prazo.</li>
            <li><b>Ranking</b>: custo econômico → desembolso → prazo → identificador estável.</li>
          </ul>
        </div>
        <div className="card">
          <h2><Landmark size={18} style={{ verticalAlign: -3 }} /> Laboratório tributário</h2>
          <ul className="tight">
            <li>ICMS próprio já está no preço: aparece como parcela, não é somado de novo.</li>
            <li>Crédito reduz só o custo econômico (a valor presente), nunca o caixa.</li>
            <li>Simples, uso/consumo e fornecedor do Simples bloqueiam crédito por padrão.</li>
            <li>Hipóteses editáveis — não substituem validação documental ou profissional.</li>
          </ul>
        </div>
        <div className="card">
          <h2><Users size={18} style={{ verticalAlign: -3 }} /> Perfis de acesso</h2>
          <ul className="tight">
            <li><b>Administrador</b>: tudo, inclusive verbas, usuários e restauração da demonstração.</li>
            <li><b>Comprador</b>: cotações, arena, frete, catálogo e pedidos.</li>
            <li><b>Somente leitura</b>: consulta tudo, não altera nada.</li>
          </ul>
        </div>
        <div className="card">
          <h2><ShieldCheck size={18} style={{ verticalAlign: -3 }} /> Segurança e rastreabilidade</h2>
          <ul className="tight">
            <li>Senhas com hash scrypt; sessão em cookie HttpOnly/SameSite, expira em 8 horas.</li>
            <li>Bloqueio de 15 minutos após 5 tentativas inválidas; troca obrigatória de senha temporária.</li>
            <li>Toda ação relevante entra na trilha de auditoria com o usuário responsável.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
