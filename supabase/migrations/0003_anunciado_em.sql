-- ============================================================================
-- 0003 — data real do anúncio
-- ============================================================================
-- `criado_em` é quando o lead entrou no banco, não quando o anúncio foi
-- publicado. Um export de WhatsApp pode ter 3 semanas: sem esta coluna, todo
-- anúncio antigo apareceria como "há 2min" no painel e o corretor perseguiria
-- estoque morto achando que era quente.
--
-- Fica NULL para ingestão manual sem data conhecida; a UI cai para criado_em.
-- ============================================================================

alter table anuncios_repasse
  add column anunciado_em timestamptz;

comment on column anuncios_repasse.anunciado_em is
  'Quando o anúncio foi publicado na origem (ex.: timestamp da mensagem no grupo). NULL = desconhecido, usar criado_em.';

-- A ordenação do painel passa a considerar a data real quando ela existe.
create index idx_anuncio_idade
  on anuncios_repasse (coalesce(anunciado_em, criado_em) desc);
