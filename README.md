# JurisPredict · Previne Brasil

Simulador de **Pagamento por Desempenho** da Atenção Primária à Saúde (APS) para
municípios brasileiros. A aplicação pega os indicadores de saúde apurados pelo
**SISAB/DataSUS**, calcula o **Indicador Sintético Final (ISF)** de cada
município e mostra:

- **quanto o município recebe hoje** no componente Pagamento por Desempenho;
- **quanto ele poderia receber** ao atingir as metas;
- **onde priorizar o esforço** — quais indicadores rendem mais recurso e quantos
  atendimentos/registros a mais são necessários para fechar a lacuna.

> A ideia: dar ao gestor municipal (e a órgãos como a Sefaz) uma visão clara de
> **quanto dinheiro federal está sendo deixado na mesa** e de onde concentrar
> esforços para capturá-lo.

---

## Contexto: como funciona o Previne Brasil

O **Previne Brasil** (Portaria GM/MS nº 2.979/2019) financia a APS por
desempenho em **7 indicadores**. Cada indicador tem uma **meta** e um **peso**
(a soma dos pesos é 10):

| # | Indicador | Meta | Peso |
|---|-----------|:----:|:----:|
| I1 | Pré-natal (6+ consultas, 1ª até a 12ª semana) | 45% | 1 |
| I2 | Sífilis e HIV em gestantes | 60% | 1 |
| I3 | Atendimento odontológico a gestantes | 60% | 2 |
| I4 | Citopatológico (câncer de colo) | 40% | 1 |
| I5 | Vacinação infantil (Penta + Pólio) | 95% | 2 |
| I6 | Hipertensos com PA aferida | 50% | 2 |
| I7 | Diabéticos com HbA1c | 50% | 1 |

### Fórmula (reproduzida fielmente no código)

```
Nota_i = min( (resultado_i / meta_i) × 10 , 10 )      # 0 a 10; resultado 0 → nota 0

ISF    = Σ (Nota_i × Peso_i) / Σ Pesos                # escala 0 a 10  (Σ Pesos = 10)

Repasse (por quadrimestre) = (ISF / 10) × Σ_equipes( valor_máx_equipe × qtd ) × meses
```

**Valores máximos mensais por equipe** (modelo 2022, pagos quando ISF = 10):

| Equipe | Valor máx./mês |
|--------|---------------:|
| eSF (Saúde da Família) | R$ 3.225,00 |
| eAP 30h | R$ 2.418,75 |
| eAP 20h | R$ 1.612,50 |

A avaliação é **quadrimestral** (4 meses).

> **Modelo 2024 (Portaria GM/MS nº 3.493/2024):** o cofinanciamento foi
> reestruturado em um *Componente de Qualidade* com faixas (Excelente / Bom /
> Suficiente / Regular). A classificação por desempenho real passa a valer em
> **janeiro de 2026** — até lá todos os municípios são classificados como "Bom".
> Este projeto implementa o modelo 2022 (fórmula bem documentada e estável) e
> está estruturado para incorporar o novo componente.

---

## Os dados são públicos?

**Sim.** Tudo é aberto e gratuito:

| Fonte | Conteúdo | Acesso |
|-------|----------|--------|
| [Dados Abertos do SUS (CKAN)](https://dadosabertos.saude.gov.br/dataset/indicadores_desempenho_sisab) | Série histórica nacional 2018–2024, por município/quadrimestre | API CKAN / download CSV |
| [Painel público do SISAB](https://sisab.saude.gov.br) | Resultados atuais por município, equipe e quadrimestre | Download CSV/Excel/ODS, sem login |
| [CNES](https://cnes.datasus.gov.br) | Nº de equipes por município (necessário ao cálculo do repasse) | Download |

**Limitações práticas:** a atualização é quadrimestral (defasagem de ~2 a 4
meses) e a API CKAN tem documentação esparsa — por isso o cliente também aceita
CSV exportado do painel do SISAB. Veja [`previne/datasus.py`](previne/datasus.py).

---

## Arquitetura

```
previne/                  núcleo de domínio (puro Python, testável, sem rede)
├── indicators.py         os 7 indicadores: metas, pesos, numerador/denominador
├── financing.py          tipos de equipe e valores máximos
├── calculator.py         notas, ISF, repasse e ANÁLISE DE LACUNAS
├── datasus.py            cliente CKAN/DataSUS + parser de CSV do SISAB
├── repository.py         carga de dados (exemplo embarcado ou JSON externo)
├── ingest.py             CLI de ingestão de dados do DataSUS
└── data/                 conjunto de exemplo (roda offline)

api/                      camada web (FastAPI)
├── main.py               endpoints JSON + páginas HTML
└── templates/            dashboard e página do município

tests/                    suíte de testes (pytest)
```

---

## Como rodar

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Subir a aplicação web (usa dados de exemplo embarcados)
uvicorn api.main:app --reload
#    → abra http://localhost:8000

# 3. Rodar os testes
pytest
```

### Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Dashboard: ranking por recurso não capturado |
| GET | `/municipio/{ibge}` | Página detalhada com prioridades de esforço |
| GET | `/api/indicadores` | Definição dos 7 indicadores |
| GET | `/api/municipios` | Avaliação resumida de todos |
| GET | `/api/municipio/{ibge}` | Avaliação completa de um município |
| POST | `/api/simular` | Simula uma avaliação a partir de dados informados |

Exemplo de simulação:

```bash
curl -X POST http://localhost:8000/api/simular -H 'Content-Type: application/json' -d '{
  "municipio": "Exemplo", "uf": "SP", "ibge": "0000000",
  "equipes": {"eSF": 12, "eAP30": 2},
  "resultados": [
    {"codigo": "I1", "resultado": 40, "numerador": 800, "denominador": 2000},
    {"codigo": "I5", "resultado": 88}
  ],
  "meses": 4
}'
```

### Ingestão de dados reais

```bash
# Listar os arquivos disponíveis no dataset do SISAB (requer rede)
python -m previne.ingest recursos

# Converter um CSV exportado do painel do SISAB para o formato do projeto
python -m previne.ingest csv export_sisab.csv --saida data/municipios.json
```

---

## Viabilidade (resumo)

| Aspecto | Avaliação |
|---------|-----------|
| Disponibilidade dos dados | **Alta** — CSV público + portal de dados abertos |
| Profundidade histórica | **Alta** — 2018–2024, granularidade quadrimestral |
| Reprodutibilidade do cálculo | **Total** — fórmula do ISF é pública |
| Cálculo antecipado do ganho | **Sim** — aritmética direta sobre metas e nº de equipes |
| Cobertura nacional | **~5.570 municípios** |
| Acesso programático | **Médio** — CKAN funciona mas é pouco documentado; CSV é confiável |
| Atualização em tempo real | **Baixa** — cadência quadrimestral |

---

## Fontes

- [Pagamento por Desempenho — Ministério da Saúde](https://www.gov.br/saude/pt-br/composicao/saps/previne-brasil/componentes-do-financiamento/pagamento-por-desempenho)
- [Portal de Dados Abertos do SUS — Indicadores SISAB](https://dadosabertos.saude.gov.br/dataset/indicadores_desempenho_sisab)
- [Como calcular os indicadores (APS, 2022)](https://aps.saude.gov.br/noticia/15956)
- [Portaria GM/MS nº 3.493/2024](https://bvsms.saude.gov.br/bvs/saudelegis/gm/2024/prt3493_11_04_2024.html)
- [Impulso Previne — dados por município](https://www.impulsoprevine.org/dadoPublicos)

---

## Licença

MIT.
