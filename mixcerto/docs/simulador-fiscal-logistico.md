# Simulador fiscal e logístico

## Entradas do cenário
Destino (DF por padrão), data, produto, NCM, CEST, quantidade, regime do comprador (normal/Simples), finalidade (revenda, uso/consumo, industrialização), taxa anual, dias até a realização do crédito, preço de revenda (opcional) e a hipótese de revisão específica.

## Por origem (MG, SP, GO, PR, BA — hipóteses editáveis)
Regime do vendedor, preço unitário, frete absorvido ou cobrado, alíquota própria (padrão pela regra geral 7%/12%), percentual de crédito utilizável, MVA, alíquota de destino, ST (sem ST, informada ou calculada), revenda já em ST final, benefício ao comprador, nota de benefício do vendedor e outros tributos manuais.

## Cálculo
| Grandeza | Fórmula |
|---|---|
| Mercadoria | preço × quantidade |
| ICMS próprio incluído | (mercadoria + frete cobrado) × alíquota própria — **parcela exibida, não somada de novo** |
| ST calculada (didática) | max(0, (mercadoria + frete + outros) × (1 + MVA) × alíquota destino − ICMS próprio) |
| Desembolso (caixa) | mercadoria + frete cobrado + ST + outros tributos |
| Crédito condicionado | ICMS próprio × % utilizável (0 se bloqueado) |
| VP do crédito | crédito / (1 + taxa anual)^(dias/365) |
| Custo econômico | desembolso − VP(crédito) − VP(benefício ao comprador) |
| Débito de saída teórico | revenda × quantidade × alíquota destino (só revenda, sem ST encerrando a cadeia) |
| Saldo teórico | débito de saída − crédito condicionado |

## Regras de proteção
- O crédito **não reduz o caixa**.
- Comprador do Simples, uso/consumo e fornecedor do Simples **bloqueiam o crédito por padrão**. Liberar exige a hipótese de revisão específica.
- O benefício do vendedor **nunca** vira desconto ou crédito do comprador.
- O crédito ordinário de ST não é atribuído automaticamente. A revenda declarada em ST final não recebe ST de novo.
- CBS/IBS de teste (2026) não são somados ao ICMS.
- **Exemplificar crédito fiscal** muda para revenda por contribuinte do regime normal e mostra a sensibilidade do custo econômico ao percentual utilizável (0–100%).

## Transporte
- Modais declarados: rodoviário, ferroviário, aéreo e cabotagem.
- Cabotagem até UF sem acesso marítimo (como o DF) exige um trecho terrestre final; o valor e o prazo informados devem cobrir a combinação.
- Se o vendedor não entrega, a contratação é do comprador. O frete incluído exige que o vendedor entregue e pague.
- O laboratório **Entrega e transporte** é local (salvo no navegador) e não altera a arena. Na arena, use **Ajustar frete**, que altera a proposta persistida.
- Não foram consultadas rotas, capacidades ou transportadoras reais.
