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
├── calculator.py         notas, ISF, repasse e ANÁLISE DE LACUNAS (agregado)
├── patient.py            análise em NÍVEL DE PACIENTE + instruções por equipe
├── convenio.py           conector autorizado ao DataSUS (LGPD + pseudonimização)
├── datasus.py            cliente CKAN/DataSUS + parser de CSV do SISAB (agregado)
├── repository.py         carga de dados (exemplo embarcado ou JSON externo)
├── ingest.py             CLI de ingestão de dados do DataSUS
└── data/                 conjunto de exemplo (roda offline)

api/                      camada web (FastAPI)
├── main.py               endpoints JSON + páginas HTML
└── templates/            dashboard, município, simulador interativo, equipes

tests/                    suíte de testes (pytest)
```

### Dois níveis de análise

| Nível | Módulo | Pergunta que responde | Fonte de dados |
|-------|--------|-----------------------|----------------|
| **Agregado** (município) | `calculator.py` | *Quanto* recurso está na mesa? | Dados abertos (públicos) |
| **Paciente** (equipe) | `patient.py` + `convenio.py` | *Quem* atender e *qual equipe* age? | Extrato individualizado (convênio) |

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
| GET | `/simulador` | **Simulador interativo** (sliders por indicador) |
| GET | `/equipes/{ibge}` | **Pendências por equipe** (worklist por paciente) |
| GET | `/api/indicadores` | Definição dos 7 indicadores |
| GET | `/api/municipios` | Avaliação resumida de todos |
| GET | `/api/municipio/{ibge}` | Avaliação completa de um município |
| POST | `/api/simular` | Simula uma avaliação a partir de dados informados |
| GET | `/api/equipes/{ibge}` | Pendências por equipe em nível de paciente |

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

### Simulador interativo

Acesse **`/simulador`** (pré-carregado com Goiânia). Arraste os sliders de cada
indicador e ajuste o número de equipes para ver, **em tempo real**, o ISF e
quanto o município passa a receber por quadrimestre.

### Nível de paciente: instruções por equipe

O módulo `previne/patient.py` traduz o recurso "na mesa" em **ação operacional**:
para cada equipe e indicador, calcula quantos pacientes faltam para bater a meta
e gera a **lista nominal** de quem acionar. Exemplo de instrução gerada:

> *ESF Setor Sul — "Hipertensos com PA aferida": cobertura 3/14 (21%), meta 50%.
> Converter +4 paciente(s). Acionar prioritariamente: P-00005, P-00007, P-00026, P-00035.*

```python
from previne.patient import gerar_amostra_sintetica, analisar_equipes

pacientes = gerar_amostra_sintetica()       # amostra sintética (sem PII) p/ demo
for pend in analisar_equipes(pacientes):
    if pend.faltam_para_meta:
        print(pend.instrucao)
```

#### Convênio com o DataSUS e LGPD

Dados em nível de paciente **não são públicos** — são dados pessoais sensíveis
de saúde. O acesso exige instrumento formal (termo de cessão/convênio) e base
legal (LGPD art. 11, II, para execução de política pública). O módulo
`previne/convenio.py` estrutura isso com responsabilidade:

- `Convenio` registra ente, número do termo, finalidade, base legal e vigência;
- `pseudonimizar()` converte CNS/CPF em um identificador **irreversível** (hash
  com sal) **antes** de qualquer processamento — o sistema nunca vê o documento;
- `ConvenioDataSUS.carregar_csv/json()` lê o extrato autorizado já pseudonimizado.

```python
from datetime import date
from previne.convenio import Convenio, ConvenioDataSUS

conv = Convenio(
    ente="Secretaria Municipal de Saúde de Goiânia",
    numero_termo="TC-2026/001",
    finalidade="Monitoramento do desempenho da APS (Previne Brasil)",
    vigencia_ate=date(2027, 12, 31),
    sal="<segredo-do-ente>",
)
pacientes = ConvenioDataSUS(conv).carregar_csv("extrato_autorizado.csv")
```

> Sem o instrumento autorizativo, use apenas dados agregados (públicos) ou a
> amostra sintética para demonstração.

### Ingestão de dados reais

```bash
# Listar os arquivos disponíveis no dataset do SISAB (requer rede)
python -m previne.ingest recursos

# Converter um CSV exportado do painel do SISAB para o formato do projeto
python -m previne.ingest csv export_sisab.csv --saida data/municipios.json
```

---

## Exemplo: Goiânia/GO (IBGE 5208707)

Números **ilustrativos** (estimados até a conexão ao vivo com o SISAB), perfil de
capital com ~1,5 mi de habitantes e 232 eSF + 18 eAP30 + 10 eAP20:

| Métrica | Valor |
|---------|------:|
| ISF | **7,21** / 10 |
| Repasse atual / quadrimestre | R$ 2.329.774,35 |
| Repasse máximo | R$ 3.231.450,00 |
| **Deixado na mesa / quadrimestre** | **R$ 901.675,65** |
| Projeção anual (×3 quadrimestres) | ≈ R$ 2,7 milhões |

Maior oportunidade: **atendimento odontológico a gestantes** (24,1% vs. meta 60%)
— sozinho vale ≈ R$ 387 mil por quadrimestre.

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
