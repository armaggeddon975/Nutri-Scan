-- 004 - nivel de alerta por alergia (v0.9.0)
--
-- Cada alergia do perfil ganha um nivel de alerta DECLARADO pela pessoa:
--
--   standard   o comportamento de sempre, identico ao da v0.8.0
--   strict     "alerta maximo": o app tambem avisa de traco, e o conflito
--              declarado sobe o piso de risco para urgent
--
-- REGRA PARA O DADO QUE JA EXISTE: toda alergia ja cadastrada recebe
-- `standard`. Ninguem e elevado para `strict` por esta migration. A pessoa
-- nunca declarou alerta maximo, e elevar por conta propria inventaria uma
-- declaracao que ela nao fez - alem de transformar o perfil inteiro em alerta
-- maximo, o que ensina a ignorar o alerta. O `DEFAULT 'standard'` do
-- `ADD COLUMN` preenche as linhas existentes com esse valor, e a mesma regra
-- vale para toda alergia nova gravada sem nivel.
--
-- O nivel e uma COLUNA de `user_allergies`, e nao uma tabela a parte: ele e
-- atributo da alergia da pessoa. Por isso nao existe nivel de alergia que ela
-- nao tem, e a exclusao da conta leva o nivel junto, pela mesma cascata
-- `user_allergies.user_id -> users(id) ON DELETE CASCADE` da migration 001.
--
-- CHECK, E NAO TIPO ENUM
--
-- O valor e restrito no BANCO, nao so na aplicacao: um INSERT direto com
-- qualquer outro valor e recusado. A escolha foi CHECK porque:
--   - mudar a lista depois e trocar uma restricao, numa migration comum e
--     transacional; um ENUM nao perde valor sem recriar o tipo;
--   - a coluna continua `text`, o mesmo tipo de `allergy_id`, sem tipo novo
--     para o driver, para o schema temporario dos testes e para o `pg_dump`;
--   - a regra fica escrita na propria tabela, legivel em `\d user_allergies`.
--
-- IDEMPOTENTE: rodar de novo nao muda nada. A coluna usa `IF NOT EXISTS`, e a
-- restricao so e criada se ainda nao existir nesta tabela.

ALTER TABLE user_allergies
  ADD COLUMN IF NOT EXISTS alert_level text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_allergies_alert_level_check'
       AND conrelid = 'user_allergies'::regclass
  ) THEN
    ALTER TABLE user_allergies
      ADD CONSTRAINT user_allergies_alert_level_check
      CHECK (alert_level IN ('standard', 'strict'));
  END IF;
END
$$;
