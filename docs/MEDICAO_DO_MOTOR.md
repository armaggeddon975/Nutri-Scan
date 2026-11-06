# Medicao do motor contra produtos reais - v0.14.0

**Isto e medicao de software contra rotulos. NAO e validacao clinica.** Nao diz
que o motor e seguro, confiavel ou adequado para decisao alimentar, e nao e
orientacao medica. O app continua dizendo o que o rotulo traz; a conduta e da
pessoa. Os numeros abaixo valem para os 71 produtos deste conjunto e para mais
nada.

## O problema, pelo que era

Treze versoes provaram que o motor deterministico (`shared/allergenEngine.js`)
e autoritativo (a resposta do modelo nunca o substitui), consistente (mesmo
produto, mesmo perfil, mesmo veredito em todo lugar), fresco (nunca congelado)
e sensivel ao perfil. Nenhuma mediu se ele ACERTA. Ninguem tinha contado
quantas vezes ele erra contra rotulos reais.

Num app de alergia os dois erros nao pesam igual:

- **falso negativo** - o alergenico esta no rotulo e o motor nao aponta. A
  pessoa come. E o erro grave.
- **falso positivo** - o motor aponta o que nao esta. A pessoa deixa de comer
  algo que podia. Incomoda, nao machuca.

## A ordem: medir, depois corrigir

1. **Montar o conjunto** - `scripts/montar-conjunto-off.js`, com a Open Food
   Facts real, e o gabarito escrito a mao lendo cada rotulo.
2. **Medir o motor como estava** - `medicao/medicao-inicial.txt`, com o
   sha256 do motor da v0.13.0 no cabecalho (`4fa4b753...`, o mesmo objeto git
   do commit `7b035cd`).
3. **So entao corrigir** - tres correcoes, cada uma motivada por produtos do
   conjunto. `medicao/medicao-final.txt` e a medicao depois delas.

O motor nao foi tocado enquanto o conjunto era montado, e o motor nao rodou
sobre o conjunto antes de o gabarito estar gravado.

## Como rodar

```bash
npm run medir:motor               # imprime o relatorio, sem rede
npm run medir:motor -- --conferir # e compara com o registrado (o verify:release roda este)
npm run medir:motor -- --json     # o resultado bruto, em JSON
```

Montar ou atualizar o conjunto e o UNICO passo com rede, e fica desligado sem a
mesma chave dos testes que falam com a OFF:

```bash
RUN_OFF_INTEGRATION_TESTS=true npm run montar:conjunto -- --paginas-de=2026-10-30
RUN_OFF_INTEGRATION_TESTS=true npm run montar:conjunto -- --atualizar
```

`--atualizar` busca de novo os campos dos produtos que ja estao no conjunto e
mantem o gabarito. Se o texto de algum mudou, o gabarito dele para de bater com
o texto (`conferidoContra`) e a medicao recusa o conjunto ate alguem reler o
rotulo.

## O conjunto

**71 produtos reais da Open Food Facts**, em `medicao/conjunto-off.json`, com o
codigo de barras, o texto e as tags que o app recebe, e o gabarito. Dados da
OFF sob a licenca ODbL, (c) colaboradores da Open Food Facts.

### De onde vem

- **Pool brasileiro**: os 1.000 produtos mais lidos vendidos no Brasil
  (`countries_tags_en=brazil&sort_by=unique_scans_n`, 10 paginas de 100), lidos
  em 30/10/2026. A busca v2 da OFF respondeu 503 no meio da leitura; o script
  usa o mesmo endpoint reserva do app (`/cgi/search.pl`), com a mesma ordem.
- **Pool americano**: os 100 mais lidos vendidos nos EUA, so para o grupo de
  texto em ingles.
- **Cada produto** foi lido de novo pelo MESMO endpoint e os MESMOS campos que o
  app usa ao ler um codigo de barras (`/api/v3/product/<codigo>`), em
  06/11/2026: o motor recebe na medicao o que receberia no aparelho.

### Como foram escolhidos

Por regras fixas, aplicadas na ordem; cada produto entra no primeiro grupo que o
aceita e, dentro do grupo, na ordem da busca. Nenhuma regra olha a saida do
motor.

```text
grupo            cota  criterio
tipico            15   os primeiros com lista de ingredientes em portugues, sem outro filtro
negacao           10   sem/zero/isento de/livre de/nao contem + lactose, gluten, leite, soja, ovo, amendoim, trigo
traco             10   pode conter / podem conter / tracos de / contem tracos
dentro-de-outro    8   alergenico dentro dos parenteses de outro ingrediente
grafia             8   leite escrito de outro jeito: leite em po, soro de leite, lactose, caseina, whey...
vazio              5   vendido no Brasil, sem nenhuma lista de ingredientes
so-ingles          6   o unico texto que o app recebe e ingles, segundo o campo lang da OFF
ingles-eua         4   pool dos EUA, texto conferido em ingles (sugar/salt/water/flour/oil, sem acento)
negacao-lactose    5   sem/zero/.../0% + lactose
```

Dois grupos entraram depois da primeira montagem e ANTES de qualquer medicao,
quando li os textos para escrever o gabarito:

- **`ingles-eua`**: dos 6 produtos do `so-ingles`, so 2 tinham texto em ingles
  de verdade. O campo `lang` da OFF dizia "en" para texto em portugues,
  holandes, frances e dinamarques. Os 6 ficaram - sao o que o app recebe de
  fato -, e o grupo novo trouxe 4 com texto conferido.
- **`negacao-lactose`**: os 10 do grupo `negacao` eram todos "NAO CONTEM
  GLUTEN", que e obrigatorio no rotulo brasileiro e enche o grupo sozinho.
  Faltava "sem lactose", a negacao que mais engana. O pool tinha 5; entraram os
  5, como ultimo grupo, para nao mudar a escolha dos anteriores (conferido: os
  66 primeiros sairam identicos).

Dois produtos mudaram de texto na OFF entre 30/10 e 06/11 (uma quebra de linha
no 7892840819170, a ordem dos selos no 6111035003035); o conteudo e o mesmo, e
o gabarito vale para o texto lido em 06/11.

### Por que este tamanho

71 produtos x 14 alergenicos = 994 pares, 924 medidos (5 produtos sem nenhum
dado). Cada produto foi lido por inteiro para escrever o gabarito, e cada
alergenico marcado cita o trecho do rotulo que o prova. Um conjunto maior teria
de ser anotado por maquina - e ai o gabarito seria o que se quer medir.

### Por que ele e dificil

- **22 casos de negacao**: 17 de gluten ("NAO CONTEM GLUTEN", "Sem gluten",
  "does not contain gluten", "contains no gluten") e 5 de lactose - dois deles
  leite SEM lactose, que continua sendo leite.
- **37 pares de traco**, muitos com a lista do "pode conter" quebrada em linhas
  pelo OCR da base.
- **Grafias**: leite em po, soro de leite, lactose, caseinato, gordura anidra
  de leite, creme de leite, whey, "LETE" (erro de leitura da base).
- **Dentro de outro ingrediente**: leite e soja nos parenteses de "aromas",
  trigo e soja dentro do biscoito, soja e aipo dentro do caldo vegetal.
- **Armadilhas**: manteiga de cacau, noz-de-cola (tres refrigerantes), sulfato
  de zinco e de calcio, glutamato, maltodextrina, dioxido de silicio.
- **Texto que nao e lista de ingredientes**: o painel inteiro da embalagem
  (Nescafe, com "acrescente o leite" no modo de preparo) e listas so de
  alegacoes.
- **Idiomas**: portugues do Brasil e de Portugal, ingles, e um produto com
  holandes, frances e dinamarques misturados.
- **5 produtos sem lista nenhuma**.

## O gabarito

Escrito por leitura humana do texto que o app recebe (`ingredients_text_pt`,
`ingredients_text` e `ingredients_text_en`). **Nao vem do motor, e nao passou
por modelo de IA**: o assistente do app nao participa da medicao. As regras
estao gravadas no proprio conjunto (`regrasDoGabarito`):

- **contem**: o texto nomeia o alergenico ou um derivado como ingrediente
  (inclusive dentro dos parenteses de outro), ou a declaracao do rotulo diz que
  contem ("CONTEM DERIVADOS DE...", "CONTEM GLUTEN").
- **traco**: so em pode conter, tracos, vestigios, may contain, peut contenir.
- **ausente**: o resto, inclusive o que o rotulo nega. Ingrediente sem origem
  declarada (lecitina, colageno, oleos vegetais, aromatizante) nao vira
  alergenico: o gabarito nao adivinha.
- Leite sem lactose continua sendo leite. Modo de preparo nao e ingrediente.
  Erro de leitura com sentido inequivoco e lido como a palavra certa. Oleo de
  soja conta como soja (o texto nomeia a soja).

Cada alergenico em `contem` ou `traco` cita o trecho que o prova, e cada negacao
cita o trecho negado. A medicao **recusa o conjunto** se um trecho nao estiver no
texto, ou se o texto tiver mudado depois do gabarito (`conferidoContra`, o
sha256 dos campos). As tags da propria OFF (`allergens_tags`, `traces_tags`) NAO
formam o gabarito: o motor as usa como entrada, e usa-las como gabarito tornaria
a medicao quase circular. Elas ficam como segunda fonte, e cada discordancia com
o texto e listada no relatorio - **49 discordancias**, fora da conta do motor.

## Os dois modos

- **pipeline**: o produto como o app o recebe, texto e tags da OFF. E o numero
  que vale para quem usa o app.
- **so-texto**: o mesmo produto sem `allergens_tags`, `traces_tags`, `traces` e
  `labels_tags`. Mede a leitura do texto pelo motor, sem a ajuda das tags - e e
  o que acontece com produto que a OFF ainda nao processou.

## As saidas

Para cada par produto x alergenico:

- **acerto+**: esta no rotulo (contem ou traco), o motor aponta;
- **FALSO-**: esta no rotulo, o motor nao aponta - **grave**;
- **falso+**: nao esta, o motor aponta;
- **acerto-**: nao esta, o motor nao aponta.

E, a parte: **contem->traco** (declarado lido como traco: falso negativo
parcial, **grave**) e **traco->contem** (traco lido como declarado: falso
positivo). Produto sem nenhum dado para o motor (`not_informed`) sai da conta e
e listado a parte.

## Medicao inicial (motor da v0.13.0, antes de qualquer correcao)

Numeros brutos, de `medicao/medicao-inicial.txt`.

**pipeline** - 924 pares, 5 produtos not_informed:

```text
alergenico   pares  no rotulo (contem+traco)  acerto+  FALSO-  falso+  acerto-   contem->traco  traco->contem
leite           66         44 (36+8)             42       2       1       21               0              1
gluten          66         27 (26+1)             25       2       3       36               0              1
ovo             66          8 (2+6)               7       1       1       57               0              4
soja            66         35 (31+4)             35       0       2       29               0              1
amendoim        66         10 (4+6)              10       0       1       55               0              1
castanhas       66         13 (5+8)              13       0       4       49               0              7
peixe           66          2 (1+1)               2       0       0       64               0              1
crustaceos      66          1 (0+1)               1       0       0       65               0              1
moluscos        66          1 (0+1)               1       0       0       65               0              1
gergelim        66          0 (0+0)               0       0       0       66               0              0
mostarda        66          1 (0+1)               1       0       0       65               0              1
aipo            66          1 (1+0)               1       0       0       65               0              0
tremoco         66          0 (0+0)               0       0       0       66               0              0
sulfito         66          1 (1+0)               1       0       0       65               0              0
TOTAL          924        144 (107+37)          139       5      12      768               0             19
```

**so-texto**:

```text
alergenico   pares  no rotulo (contem+traco)  acerto+  FALSO-  falso+  acerto-   contem->traco  traco->contem
leite           66         44 (36+8)             42       2       1       21               0              0
gluten          66         27 (26+1)             24       3       2       37               0              0
ovo             66          8 (2+6)               7       1       0       58               0              1
soja            66         35 (31+4)             35       0       0       31               0              0
amendoim        66         10 (4+6)               9       1       0       56               0              1
castanhas       66         13 (5+8)              12       1       3       50               0              1
peixe           66          2 (1+1)               2       0       0       64               0              0
crustaceos      66          1 (0+1)               1       0       0       65               0              0
moluscos        66          1 (0+1)               1       0       0       65               0              0
gergelim        66          0 (0+0)               0       0       0       66               0              0
mostarda        66          1 (0+1)               1       0       0       65               0              0
aipo            66          1 (1+0)               1       0       0       65               0              0
tremoco         66          0 (0+0)               0       0       0       66               0              0
sulfito         66          1 (1+0)               1       0       0       65               0              0
TOTAL          924        144 (107+37)          136       8       6      774               0              3
```

Negacao: 22 casos, 20 tratados certo, nos dois modos.

## As correcoes

So em `shared/allergenEngine.js`, sem refatoracao. `shared/allergyVerdict.js` e
`shared/productComparison.js` nao foram tocados. O catalogo
(`shared/allergens.js`) tambem nao: ele alimenta a busca da tela de alergias, o
guia e o assistente, e a correcao tinha de mudar so a leitura do rotulo.

**1. Gluten em ingles - `wheat`** (falso negativo).
Produtos **7891000358764** (Farinha Lactea, texto em ingles "Wheat flour", e as
tags da OFF sem gluten) e **11117780** ("enriched wheat flour"). O catalogo tem
"wheat" so no id `wheat`; o `gluten` tinha so termos em portugues. Mudanca:
`EXTRA_LABEL_TERMS = { gluten: ["wheat"] }`, lido junto com os termos do
catalogo so na leitura do rotulo. A palavra e inteira: "buckwheat" (trigo
sarraceno, sem gluten) nao casa.

**2. Negacao em ingles - `does not contain`, `contains no`** (falso positivo).
Produtos **7893000394209** (Qualy: "does not contain gluten") e
**7896481130137** (farinha de milho: "contains no gluten" - o "may contain soy"
logo antes fazia o gluten virar traco). Mudanca: os dois marcadores entram em
`NEGATION_MARKERS`. A negacao continua parando no ponto: "Contains no gluten.
Ingredients: wheat flour" segue apontando gluten.

**3. Noz-de-cola nao e castanha** (falso positivo).
Produtos **7894900701517**, **78933873** e **7894900011159** (Coca-Cola e
Coca-Cola Zero: "extrato de noz de cola"). Mudanca: exclusao
`noz(es) de cola` para os ids `nuts` e `walnut` - os dois unicos do catalogo com
o termo "noz" sozinho (pecan e noz-moscada tem termos compostos, que "noz de
cola" nao casa). Castanha de verdade ao lado da noz-de-cola continua apontada.

Cada correcao tem teste proprio com os produtos reais (M9) e mutante que a
reverte (MC1 a MC5) - todos mortos.

## Medicao final

`medicao/medicao-final.txt`, e o que `npm run medir:motor` imprime hoje.

**pipeline**:

```text
alergenico   pares  no rotulo (contem+traco)  acerto+  FALSO-  falso+  acerto-   contem->traco  traco->contem
leite           66         44 (36+8)             42       2       1       21               0              1
gluten          66         27 (26+1)             26       1       1       38               0              1
ovo             66          8 (2+6)               7       1       1       57               0              4
soja            66         35 (31+4)             35       0       2       29               0              1
amendoim        66         10 (4+6)              10       0       1       55               0              1
castanhas       66         13 (5+8)              13       0       1       52               0              7
peixe           66          2 (1+1)               2       0       0       64               0              1
crustaceos      66          1 (0+1)               1       0       0       65               0              1
moluscos        66          1 (0+1)               1       0       0       65               0              1
gergelim        66          0 (0+0)               0       0       0       66               0              0
mostarda        66          1 (0+1)               1       0       0       65               0              1
aipo            66          1 (1+0)               1       0       0       65               0              0
tremoco         66          0 (0+0)               0       0       0       66               0              0
sulfito         66          1 (1+0)               1       0       0       65               0              0
TOTAL          924        144 (107+37)          140       4       7      773               0             19
```

**so-texto**:

```text
alergenico   pares  no rotulo (contem+traco)  acerto+  FALSO-  falso+  acerto-   contem->traco  traco->contem
leite           66         44 (36+8)             42       2       1       21               0              0
gluten          66         27 (26+1)             26       1       0       39               0              0
ovo             66          8 (2+6)               7       1       0       58               0              1
soja            66         35 (31+4)             35       0       0       31               0              0
amendoim        66         10 (4+6)               9       1       0       56               0              1
castanhas       66         13 (5+8)              12       1       0       53               0              1
peixe           66          2 (1+1)               2       0       0       64               0              0
crustaceos      66          1 (0+1)               1       0       0       65               0              0
moluscos        66          1 (0+1)               1       0       0       65               0              0
gergelim        66          0 (0+0)               0       0       0       66               0              0
mostarda        66          1 (0+1)               1       0       0       65               0              0
aipo            66          1 (1+0)               1       0       0       65               0              0
tremoco         66          0 (0+0)               0       0       0       66               0              0
sulfito         66          1 (1+0)               1       0       0       65               0              0
TOTAL          924        144 (107+37)          138       6       1      779               0              3
```

Negacao: 22 casos, 22 tratados certo, nos dois modos.

### A diferenca, caso a caso

```text
                          pipeline        so-texto
falso negativo            5 -> 4          8 -> 6
declarado lido como traco 0 -> 0          0 -> 0
falso positivo           12 -> 7          6 -> 1
traco lido como declarado 19 -> 19        3 -> 3
negacao tratada certo    20 -> 22        20 -> 22
```

- 7891000358764 gluten: FALSO- -> acerto+ (pipeline e so-texto) - correcao 1.
- 11117780 gluten: FALSO- -> acerto+ (so-texto; no pipeline a tag da OFF ja
  apontava) - correcao 1.
- 7893000394209 gluten: falso+ -> acerto- (os dois modos) - correcao 2.
- 7896481130137 gluten: falso+ (traco) -> acerto- (os dois modos) - correcao 2.
- 7894900701517, 78933873, 7894900011159 castanhas: falso+ -> acerto- (os
  dois modos) - correcao 3.

Nenhum par piorou. **Nenhuma correcao trocou falso negativo por falso
positivo**: o falso positivo caiu junto (12 -> 7 no pipeline, 6 -> 1 no
so-texto).

## Erros que ficaram, e por que

**Falsos negativos (graves)** - pipeline 4, so-texto 6:

- **7892840819507 leite (traco)**: a base traz "PODE CONTER LETE" - erro de
  leitura do rotulo. Corrigir exigiria aceitar "lete" como leite: caso especial
  para um erro de digitacao, que a regra 4.5 proibe.
- **8718989002640 leite, gluten, ovo (e, no so-texto, amendoim e castanhas)**:
  texto em frances, holandes e dinamarques ("lait ecreme", "hvedemel", "de
  l'oeuf", "arachides", "noisettes"). O motor le portugues e ingles. Ensinar
  outras linguas e funcionalidade nova, nao correcao. No pipeline as tags da
  OFF cobrem amendoim, castanhas e soja desse produto, nao leite, gluten e ovo.

**Falsos positivos** - pipeline 7, so-texto 1:

- **7891000071786 leite**: o texto da base e o painel da embalagem do Nescafe,
  e "milk" / "leite" aparecem no modo de preparo. Uma regra para "a gosto"
  seria fragil e poderia esconder leite de verdade - fica o erro do lado seguro.
- **Herdados das tags da OFF** (so pipeline): 7891167011779 ovo,
  7891000379691 gluten, 3256540000698 soja, amendoim e castanhas, 7893000502888
  soja. O texto nao traz o alergenico; a tag da OFF traz. O motor aceita a tag
  como evidencia, por desenho: prefere apontar a mais do que deixar passar.

**Traco lido como declarado** - pipeline 19, so-texto 3:

- **16 herdados das tags da OFF** (so pipeline): a OFF poe em `allergens_tags`
  o que o texto diz "pode conter" (8480000603067, 78939318, 7891000325131,
  7896066301778, 7896066304571, 7899970402852, 7896002311274, 7896102502756).
  Fazer o texto vencer a tag poderia transformar um "contem" verdadeiro da tag
  em traco - o erro grave.
- **7891203010056 ovo, amendoim, castanhas** (os dois modos): o OCR quebra a
  lista do "PODE CONTER" em linhas, e a quebra de linha separa frases no motor.
  Juntar as linhas faria um ingrediente da linha seguinte a um "pode conter"
  virar traco - o erro grave. Fica o erro do lado seguro.

## Negacao

22 casos: 17 de gluten, 5 de lactose. Inicial: 20 tratados certo (os dois
erros eram negacao em ingles). Final: **22 de 22**, nos dois modos. Os dois
casos de leite sem lactose (7893000502888, 7892999150124) continuam apontando
leite, como o gabarito pede.

## not_informed

5 produtos sem nenhum dado para o motor (sem texto e sem tag): 7622210596413,
7896004006277, 07117815, 7891008116632, 7896004006239. Fora da conta, listados
a parte, em todas as medicoes.

## O teste de regressao

`medicao/resultado-registrado.json` guarda, por modo, a LISTA exata de casos de
cada tipo de erro da medicao final. `backend/tests/medicaoDoMotor.test.js` (M8)
e o `verify:release` (passo "medicao do motor") falham se:

- um tipo de erro passar do numero registrado - o limite;
- aparecer um caso que nao esta no registro - trocar um falso negativo por
  outro, com o mesmo total, tambem falha;
- um caso registrado deixar de acontecer - o ganho tem de ser travado no
  registro, senao o erro pode voltar sem ninguem ver.

Lista, e nao so numero, porque um total igual pode esconder um falso negativo
novo no lugar de um corrigido. Os falsos positivos tambem estao no registro: uma
correcao futura que troque falso negativo por falso positivo aparece no diff.
Atualizar o registro e decisao revisada, nunca automatica - nao ha comando que o
reescreva.

## Limitacoes conhecidas e o que CONTINUA ABERTO

- **Produtos fora do conjunto**: nada aqui vale para eles.
- **Um anotador so**: o gabarito foi escrito por uma leitura, sem segunda
  anotacao independente e sem medida de concordancia.
- **Texto da base nao e o rotulo fisico**: a OFF tem erros de OCR, campos
  trocados e texto que nao e lista de ingredientes. O gabarito le o texto que o
  app recebe, nao a embalagem.
- **Alergenicos com pouca amostra**: gergelim e tremoco tem 0 positivos;
  peixe, crustaceos, moluscos, mostarda, aipo e sulfito tem 1 ou 2. Para eles o
  numero nao sustenta conclusao nenhuma.
- **Outras linguas** alem de portugues e ingles nao sao lidas.
- **A lista do "pode conter" quebrada em linhas** vira declarado.
- **As tags da OFF sao aceitas como evidencia**, com os erros delas.
- **Validacao clinica**: nao foi feita e nao e escopo.
