export const FONTES = ["whatsapp", "facebook", "olx", "instagram", "outro"] as const;
export type Fonte = (typeof FONTES)[number];

export const STATUS = [
  "novo",
  "validado",
  "distribuido",
  "vendido",
  "expirado",
  "invalido",
] as const;
export type Status = (typeof STATUS)[number];

export const PAPEIS = ["admin", "corretor"] as const;
export type Papel = (typeof PAPEIS)[number];

export const STATUS_ACESSO = ["pendente", "ativo", "suspenso"] as const;
export type StatusAcesso = (typeof STATUS_ACESSO)[number];

export type Perfil = {
  id: string;
  email: string | null;
  nome: string | null;
  telefone: string | null;
  creci: string | null;
  papel: Papel;
  status_acesso: StatusAcesso;
  criado_em: string;
};

export type Empreendimento = {
  id: string;
  nome: string;
  construtora: string | null;
  bairro: string | null;
  cidade: string | null;
  data_entrega_prevista: string | null;
  fase_obra: string | null;
  total_unidades: number | null;
  financiamento_proprio: boolean | null;
  fonte: string | null;
  criado_em: string;
};

export type Lead = {
  id: string;
  fonte: string;
  url_original: string | null;
  texto_bruto: string;
  empreendimento_id: string | null;
  empreendimento_texto: string | null;
  bairro: string | null;
  tipologia: string | null;
  area_m2: number | null;
  valor_pago: number | null;
  valor_pedido: number | null;
  saldo_devedor: number | null;
  fase_obra_mencionada: string | null;
  telefone_contato: string | null;
  nome_contato: string | null;
  score_urgencia: number | null;
  sinais_urgencia: string[] | null;
  status: string;
  extraido_em: string | null;
  modelo_extracao: string | null;
  criado_em: string;
  empreendimentos?: Pick<
    Empreendimento,
    "id" | "nome" | "construtora" | "bairro" | "data_entrega_prevista"
  > | null;
};

/** Resultado da extração da IA, campo a campo. */
export type Extracao = {
  empreendimento_texto: string | null;
  construtora: string | null;
  bairro: string | null;
  tipologia: string | null;
  area_m2: number | null;
  valor_pago: number | null;
  valor_pedido: number | null;
  saldo_devedor: number | null;
  fase_obra_mencionada: string | null;
  telefone_contato: string | null;
  nome_contato: string | null;
  sinais_urgencia: string[];
  score_urgencia: number;
  eh_repasse: boolean;
};

export type ResultadoItem = {
  indice: number;
  trecho: string;
  situacao: "novo" | "duplicado" | "nao_repasse" | "erro";
  mensagem?: string;
  lead?: Lead | null;
  empreendimento_match?: { nome: string; sim: number } | null;
};
