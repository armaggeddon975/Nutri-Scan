# Nivel de alerta por alergia - v0.9.0

Este documento descreve **o que o software faz** com o nivel de alerta que a
pessoa declara para cada alergia, e por que foi feito assim. Ele nao e
orientacao de saude e nao declara o NutriScan clinicamente adequado nem em
conformidade com lei nenhuma.

## O problema

Ate a v0.8.0 o motor tratava todo conflito de alergia do mesmo jeito:

```text
alergenico declarado no rotulo   conflito, piso de risco caution
"pode conter tracos"             informado, sem elevar nada
```

Isso juntava na mesma tela situacoes muito diferentes. Para quem quer ser
avisado ate do traco, "pode conter tracos de amendoim" e justamente a
informacao que importa - e ela nao elevava nada.

## A decisao: dois niveis, e nao tres

```text
standard   "alerta padrao" - o comportamento de sempre, identico ao da v0.8.0
strict     "alerta maximo" - o app tambem avisa de traco, e o conflito
           declarado vira urgente
```

Tres niveis obrigariam a pessoa a calibrar o do meio, e o do meio nao muda
nada do que ela faz diante do produto. Dois niveis fazem uma pergunta que a
pessoa sabe responder: **"quer o aviso mais forte para esta alergia?"**. Um
terceiro nivel so entra com aprovacao do dono do projeto.

## O rotulo: "alerta maximo", e nao "grave"

O prompt da versao chama o nivel de "severidade" e os valores de PADRAO e
GRAVE. Na interface e no codigo, o nome e outro, de proposito:

- **"Alerta maximo" descreve o que a pessoa quer do APP**, e nao uma condicao
  dela. "Alergia grave" seria a pessoa declarar um diagnostico ao app - e o app
  nao diagnostica nem classifica a saude de ninguem. Quem quer o aviso mais
  forte por qualquer motivo usa o mesmo nivel, sem precisar afirmar nada sobre
  si.
- **No codigo o campo e `alertLevel`**, com os valores `standard` e `strict`.
  `severity` ja existe no motor com outro sentido: `risk.severity` e a
  classificacao do rotulo (`contains` / `traces`). Reusar a palavra faria o
  mesmo objeto ter duas "severidades".

Correspondencia com o prompt:

```text
prompt            codigo        tela
PADRAO            standard      (sem marca; e o normal)
GRAVE             strict        "Alerta maximo"
severidade        alertLevel    "nivel de alerta"
```

Na tela, a opcao aparece assim, para cada alergia marcada:

```text
Alerta maximo
Marque onde voce quer o aviso mais forte. O app passa a avisar tambem quando o
rotulo diz "pode conter".
[ ] Leite/lactose
[x] Amendoim
```

O texto diz o que o APP passa a fazer. Nao diz o que a pessoa deve fazer.

## O padrao preserva o comportamento atual

Toda alergia sem nivel declarado e `standard` - as que ja existiam no banco e as
novas gravadas sem nivel. Nada e elevado para `strict` por conta propria:

- a pessoa nunca declarou alerta maximo, e elevar seria inventar uma declaracao
  que ela nao fez;
- transformar todo perfil em alerta maximo faria o alerta aparecer sempre, e
  alerta que aparece sempre ensina a ignorar o alerta.

A regra esta escrita na propria migration `004_nivel_de_alerta.sql`: a coluna
nasce com `DEFAULT 'standard'`, que preenche as linhas existentes com esse
valor.

**Em compensacao, o app convida a revisar.** Quem tem conta, tem alergia
marcada e ainda nao usou o alerta maximo ve, na tela inicial, um cartao:

```text
Novidade
Alerta maximo
Agora voce escolhe, em cada alergia, se quer o aviso mais forte. Quer revisar
as suas?
[Revisar minhas alergias]  [Agora nao]
```

- e um cartao, nao uma janela: o resto da tela continua usavel;
- qualquer um dos dois botoes o tira de vez;
- "uma vez" vale por conta, **neste aparelho** - a marcacao de "visto" fica no
  navegador, com o id da conta e nada do perfil. Num aparelho novo, o convite
  pode aparecer de novo.

## O que muda no veredito

O que muda e a RESPOSTA a classificacao, nao a classificacao.
`analyzeProductAllergens` continua decidindo o que e declarado e o que e traco,
com as mesmas regras.

```text
                         standard (padrao)            strict (alerta maximo)
declarado no rotulo      conflito, piso caution       conflito, piso URGENT
"pode conter"            traces, sem piso             CONFLITO, piso caution
```

- `urgent` existe so para o conflito declarado de alergia `strict`. Alerta que
  aparece sempre deixa de ser alerta.
- Para alergia `standard`, o veredito e o da v0.8.0 byte a byte. Um teste
  compara 20 combinacoes de produto e perfil com a saida gravada da v0.8.0.
- Para quem consome o veredito, cada conflito de alergia `strict` traz
  `origin` (`declared` ou `traces`) e `alertLevel: "strict"`. Conflito de
  alergia `standard` continua `{ id, label }`. Formato em [API.md](API.md).

## O modelo nao decide, nao le e nao recebe o nivel

- O veredito e montado ANTES da chamada de IA, do perfil no PostgreSQL. O piso
  e imposto DEPOIS da resposta do modelo, por `applyAllergyAuthority`. O modelo
  respondendo "normal" nao derruba piso nenhum.
- Uma chave de nivel na resposta do modelo derruba a resposta inteira com
  `AI_SCHEMA_INVALID` - o schema da resposta e fechado.
- **O nivel nao e enviado ao modelo.** O prompt da versao permitia manda-lo
  dentro do `allergySnapshot`; a decisao foi nao usar a permissao. O modelo nao
  precisa dele (o veredito e o piso sao do servidor), e um modelo que nao recebe
  o nivel nao consegue comenta-lo, questiona-lo nem "corrigi-lo". E dado de
  saude a menos indo para terceiro. Um teste confere que o que vai ao modelo e
  identico com alerta padrao ou maximo.

## Banco

```sql
ALTER TABLE user_allergies
  ADD COLUMN IF NOT EXISTS alert_level text NOT NULL DEFAULT 'standard';
-- e, se ainda nao existir:
ALTER TABLE user_allergies
  ADD CONSTRAINT user_allergies_alert_level_check
  CHECK (alert_level IN ('standard', 'strict'));
```

- **Coluna de `user_allergies`, e nao tabela a parte:** o nivel e atributo da
  alergia da pessoa. Nao existe nivel de alergia que ela nao tem, e a exclusao
  da conta leva o nivel junto, pela cascata que ja existia.
- **CHECK, e nao ENUM:** mudar a lista depois e trocar uma restricao numa
  migration comum; um ENUM nao perde valor sem recriar o tipo. A coluna continua
  `text`, sem tipo novo para o driver e para os testes. E a regra fica escrita
  na propria tabela.
- **Idempotente:** `IF NOT EXISTS` na coluna, e a restricao so e criada se ainda
  nao existir.

## Log

O nivel nunca vai para o log. O registro de "tentativa de minimizacao" (o modelo
dizendo "normal" diante de conflito declarado) deixou de levar `enforcedSafety`,
que passaria a dizer "urgent" justamente quando a alergia e `strict`. Para o
mesmo produto e as mesmas alergias, o registro e identico com alerta padrao ou
maximo - um teste confere.

## Exportacao, exclusao, historico

- **Exportacao:** cada alergia sai com `alertaMaximo: true | false`. E dado do
  titular. Ver [DADOS_DO_TITULAR.md](DADOS_DO_TITULAR.md).
- **Exclusao da conta:** o nivel esta em `user_allergies`, que sai pela cascata.
- **Historico e favoritos nao guardam nivel nem veredito.** O item salvo e so a
  identidade do produto; mudar o nivel muda o que a tela mostra na leitura
  seguinte, e o item continua byte a byte o mesmo.

## Limites conhecidos

- **Visitante nao tem nivel de alerta.** O nivel e guardado no perfil, no banco;
  sem conta, todas as alergias sao `standard`, e a tela diz que a opcao existe
  com conta.
- **App antigo aberto em outro aparelho.** A rota de alergias SUBSTITUI o perfil
  inteiro, e um corpo sem `alertLevels` significa `standard` - como o contrato
  manda. Uma aba com o app de antes da v0.9.0, ainda aberta, que salve as
  alergias, volta todas para `standard`. Descrito para decisao; nao alterado.
- **O convite e por aparelho**, como dito acima.
