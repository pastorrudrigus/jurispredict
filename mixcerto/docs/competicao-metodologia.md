# Metodologia da competição do mix

## Cesta
- O mix original tem **20 produtos**. Um item entra na **cesta atendível** se ao menos um fornecedor cumpre ao mesmo tempo **estoque ≥ quantidade** e **vida útil restante ≥ vida mínima** (validade do lote − data de referência).
- Itens não atendíveis ficam **explícitos** em `unavailable`, com o motivo por fornecedor. Eles nunca entram como economia.
- A cesta é **congelada** na criação da arena. Se estoque, validade ou vida mínima mudarem a ponto de alterar a cesta, **encerrar** e **gerar pedido** retornam `409 BASKET_CHANGED`: é preciso criar uma nova arena. Retirar itens da base não pode parecer economia de negociação.

## Avaliação de cada proposta
- **Mercadorias** = Σ round(preço de tabela × quantidade × (1 − redução acumulada)). Não há média entre produtos distintos nem rebate futuro.
- **Logística** = frete incremental + seguro + despesas, cada um uma única vez. O frete absorvido ou incluído pelo vendedor é exibido sem cobrança. O frete pago pelo comprador (transportadora ou retirada) entra mesmo quando o vendedor não entrega.
- **Desembolso** = mercadorias + logística.
- **Custo econômico** = desembolso a valor presente pelo prazo de pagamento: `desembolso / (1 + taxa anual)^(dias/365)`, com taxa anual padrão de 12%.
- **Aptidão**: todas as linhas da cesta atendidas, logística válida, desembolso ≤ teto da verba e prazo ≤ prazo máximo. Propostas inaptas mostram o alerta com os motivos.

## Ranking
Somente entre aptas: **custo econômico → desembolso → prazo → identificador estável**. Preço nominal mais baixo não vence automaticamente.

## Rodadas
- Até **3 rodadas simuladas**. Em cada uma, o desafiante apto com a **menor diferença de custo econômico** para o líder melhora sua tabela em **0,5 p.p.** (empate pelo identificador), respeitando o limite de 12%.
- A simulação é determinística e **não** prevê o comportamento dos vendedores.
- **Lance manual**: redução acumulada estritamente maior que a atual e ≤ 12% da tabela inicial.
- Cada alteração gera um ponto na linha do tempo (o orçamento inicial é preservado) e um evento de auditoria.

## Concorrência, encerramento e pedido
- Toda operação de escrita exige `expectedVersion`. Uma versão desatualizada retorna `409 VERSION_CONFLICT`.
- **Encerrar** revalida a cesta e as ofertas, congela a avaliação do vencedor e bloqueia novos lances e mudanças logísticas (`409 ARENA_CLOSED`).
- **Gerar pedido** exige: arena encerrada, versão atual, `acknowledgeShortage: true` quando há falta, a mesma cesta e a oferta vencedora idêntica à do encerramento (preço, estoque/aptidão, logística, desembolso). Cria **um único** pedido interno. Repetir devolve o mesmo pedido (`replayed: true`).
- A **cotação-base** (`/api/cotacoes`) apenas delega para a mesma função de criação de pedido, então não contorna essas regras.
