-- Historico de consultas e favoritos, por usuario.
--
-- O QUE NAO EXISTE AQUI, E POR QUE
--
-- Nenhuma coluna guarda veredito de alergia, nivel de risco ou lista de
-- alergenicos detectados. O perfil de alergia do usuario muda com o tempo; um
-- veredito congelado no passado vira informacao de seguranca errada na tela -
-- o produto que era seguro em marco deixa de ser quando a pessoa marca uma
-- alergia nova em abril.
--
-- Estas tabelas guardam apenas IDENTIDADE do produto. O veredito e sempre
-- recalculado pelo motor deterministico no momento da exibicao, com o perfil
-- atual. Esta regra e de seguranca, nao de arquitetura, e nao deve ser
-- relaxada por conveniencia de consulta.
--
-- Nome e marca vem da Open Food Facts, que e fonte NAO CONFIAVEL. Eles sao
-- persistidos para a lista funcionar offline e sem refazer a consulta externa,
-- mas continuam sendo conteudo nao confiavel na exibicao e nunca viram
-- instrucao se entrarem em contexto de IA.

CREATE TABLE IF NOT EXISTS product_history (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  product_brand text,
  image_url text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  -- Unicidade no BANCO, nao so na aplicacao: consultar o mesmo produto de novo
  -- atualiza a linha existente. Sem esta restricao, duas requisicoes
  -- simultaneas do mesmo produto criariam duas linhas, e a aplicacao nao teria
  -- como impedir - a checagem e a insercao nao sao atomicas entre si.
  CONSTRAINT product_history_user_product_unique UNIQUE (user_id, product_code)
);

-- Serve a consulta real da tela: os itens de um usuario, do mais recente para
-- o mais antigo. O indice cobre o filtro e a ordenacao de uma vez.
CREATE INDEX IF NOT EXISTS idx_product_history_user_viewed
  ON product_history (user_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS product_favorites (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  product_brand text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_favorites_user_product_unique UNIQUE (user_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_product_favorites_user_created
  ON product_favorites (user_id, created_at DESC);
