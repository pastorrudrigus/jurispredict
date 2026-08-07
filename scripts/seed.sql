-- ============================================================================
-- SEED DE EMPREENDIMENTOS — 100% PLACEHOLDER / DADOS FICTÍCIOS
-- ============================================================================
-- ATENÇÃO: NENHUMA linha abaixo é um empreendimento real. Nomes, datas de
-- entrega, número de unidades e flags de financiamento próprio foram INVENTADOS
-- apenas para dar forma à tabela e permitir testar o fuzzy match.
--
-- Os campos `construtora` citam construtoras que atuam em Goiânia apenas como
-- lembrete de ONDE buscar os dados reais — a associação construtora↔nome abaixo
-- é fictícia.
--
-- ANTES DE USAR EM PRODUÇÃO: apague tudo (`delete from empreendimentos;`) e
-- substitua pelos 15-20 empreendimentos reais coletados nos sites das
-- construtoras (FGR, Opus, EBM, Sim, Terral, etc.), preenchendo `fonte` com a
-- URL de onde o dado veio.
--
-- Os bairros são bairros reais de Goiânia (informação pública de geografia
-- urbana) para que o filtro por bairro e o match textual funcionem no teste.
-- ============================================================================

insert into empreendimentos (nome, construtora, bairro, data_entrega_prevista, total_unidades, financiamento_proprio, fonte) values
  ('[PLACEHOLDER 01] Residencial Bueno Alpha',      'FGR (verificar)',    'Setor Bueno',        '2026-06-30', 180, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 02] Edifício Marista Prime',       'Opus (verificar)',   'Setor Marista',      '2026-12-31', 120, true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 03] Jardim Goiás Life',            'EBM (verificar)',    'Jardim Goiás',       '2027-03-31', 240, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 04] Park Lozandes Residence',      'Terral (verificar)', 'Park Lozandes',      '2026-09-30', 160, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 05] Oeste Torres Duo',             'Sim (verificar)',    'Setor Oeste',        '2027-06-30', 200, true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 06] Nova Suiça Garden',            'FGR (verificar)',    'Setor Nova Suíça',   '2026-11-30', 144, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 07] Alto da Glória Sky',           'Opus (verificar)',   'Alto da Glória',     '2027-09-30', 110, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 08] Coimbra Smart Living',         'EBM (verificar)',    'Setor Coimbra',      '2026-08-31', 96,  true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 09] Pedro Ludovico Vertice',       'Terral (verificar)', 'Setor Pedro Ludovico','2027-01-31', 130, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 10] Aeroporto Urban Home',         'Sim (verificar)',    'Setor Aeroporto',    '2026-07-31', 88,  true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 11] Vila Rosa Parque',             'FGR (verificar)',    'Vila Rosa',          '2027-04-30', 210, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 12] Jardim América Classic',       'Opus (verificar)',   'Jardim América',     '2026-10-31', 105, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 13] Bela Vista Horizonte',         'EBM (verificar)',    'Setor Bela Vista',   '2027-07-31', 175, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 14] Faiçalville Viva',             'Terral (verificar)', 'Setor Faiçalville',  '2026-05-31', 150, true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 15] Negrão de Lima Station',       'Sim (verificar)',    'Setor Negrão de Lima','2027-02-28', 190, true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 16] Sudoeste Vista Clube',         'FGR (verificar)',    'Setor Sudoeste',     '2026-12-15', 220, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 17] Universitário Campus Flat',    'Opus (verificar)',   'Setor Universitário','2026-04-30', 78,  true,  'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 18] Cidade Jardim Reserva',        'EBM (verificar)',    'Cidade Jardim',      '2027-05-31', 132, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 19] Serrinha Green Towers',        'Terral (verificar)', 'Setor Serrinha',     '2027-08-31', 168, false, 'placeholder — substituir pela URL da construtora'),
  ('[PLACEHOLDER 20] Buritis Mirante',              'Sim (verificar)',    'Setor dos Buritis',  '2026-03-31', 92,  true,  'placeholder — substituir pela URL da construtora');
