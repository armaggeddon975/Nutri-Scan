# Comparacao de dois produtos - v0.10.0

Este documento registra as decisoes da comparacao: por que sao dois produtos e
nao N, por que o app nao elege vencedor, e como cada veredito fica preso ao seu
produto. Ele descreve o que o software faz. Nao e orientacao de saude nem de
nutricao.

## O problema

Na gondola, a pergunta costuma ser "qual destes dois?". Ate a v0.9.0 a pessoa
escaneava um produto, lia, escaneava o outro, perdia o primeiro de vista e
decidia de memoria. A comparacao poe os dois lado a lado, cada um com o veredito
do motor calculado para o perfil atual.

## Dois, e nao N

Exatamente dois. A API recusa um, tres ou nenhum com `400 VALIDATION_ERROR`
("A comparação precisa de exatamente dois produtos.").

- Dois cabem lado a lado na tela do celular, em duas colunas iguais. Tres viram
  uma tabela que ninguem le no supermercado.
- E a situacao real: duas embalagens na mao.
- Cada produto a mais e mais texto nao confiavel da Open Food Facts no contexto
  da IA.

## Por que o app nao elege vencedor

A comparacao MOSTRA os dois. Ela nao escolhe.

Eleger vencedor em alimento e aconselhamento. "Mais seguro para o seu perfil"
parece objetivo e nao e: depende de quanto a pessoa come, com que frequencia e
do resto da dieta dela - nada disso o app conhece. Mostrar os fatos lado a lado
deixa a decisao com quem tem a informacao completa.

No codigo, isso e ausencia:

- nenhum campo da resposta diz "melhor", "recomendado", "escolha segura",
  "vencedor" ou "ranking" - um teste confere as chaves da resposta, da
  comparacao e de cada produto contra esse vocabulario, em ingles e em
  portugues, e outro confere o texto da tela;
- a ordem e a que a pessoa escolheu: o primeiro codigo e o "Primeiro", o
  segundo e o "Segundo". Nada reordena por conflito, por nutriente ou por nota;
- as duas colunas tem o mesmo estilo. Nenhuma ganha destaque, selo ou cor de
  "aprovado";
- o modelo nao recebe pedido de escolha, e o schema da resposta dele nao tem
  onde escrever uma;
- a tela termina com "O app mostra o que está no rótulo. A escolha é sua."

Uma ordenacao "neutra" (por exemplo, produto com conflito por ultimo) NAO foi
implementada. Ela ja seria um julgamento sobre qual produto vem primeiro.

## Um veredito por produto

Nao existe veredito "da comparacao". Existe um veredito por produto, e um nao
toca o outro.

```text
compareProducts([a, b], perfil)
  analyzeComparedProduct(a.product, perfil)   -> veredito de A
  analyzeComparedProduct(b.product, perfil)   -> veredito de B   (chamada propria)

aplicarPisoPorProduto(comparacao, ...)
  para CADA produto: finalizar(resposta daquele produto, veredito DAQUELE produto)
```

- Os dois vereditos saem de `buildAllergyVerdict`, o mesmo do assistente, em
  duas chamadas independentes. Nada do resultado de A entra no calculo de B.
- O piso de risco e imposto produto a produto. Um produto em conflito nao eleva
  o outro, e o produto limpo nao rebaixa o que tem conflito.
- O nivel de alerta (v0.9.0) vale do mesmo jeito: `urgent` vai so para o produto
  que declara a alergia em alerta maximo.

## A IA explica; nao decide

O botao "Explicar as diferenças" chama `POST /api/compare/explain`. O modelo
recebe os dois produtos e devolve UMA explicacao por produto.

- **Os vereditos vao prontos.** Sao calculados antes da chamada, e o modelo
  recebe, de cada produto, o mesmo `allergySnapshot` do chat. O nivel de alerta
  nao vai.
- **A amarracao e por codigo, conferida pelo servidor.** Cada explicacao traz o
  `productCode` do produto a que se refere. O servidor poe cada uma no produto
  pelo CODIGO, nunca pela posicao na lista. Codigo repetido, faltando ou de
  produto que nao esta na comparacao derruba a resposta inteira com
  `AI_SCHEMA_INVALID`. Um modelo que troca a ordem nao troca o que aparece em
  cada coluna.
- **O modelo nao escreve veredito.** O schema da resposta e fechado em todos os
  niveis: `allergyVerdict`, `verdict`, `winner`, `ranking`, `recommended` ou
  qualquer outra chave derruba a resposta com `AI_SCHEMA_INVALID`. O veredito
  devolvido ao cliente e sempre o do motor.
- **O piso continua imposto depois da resposta**, produto a produto, pelo mesmo
  `finalizeAssistantResponse` do chat. O modelo dizendo `normal` nao derruba o
  piso de nenhum dos dois.
- **Dado externo fica fora do `system`.** Nome, marca e ingredientes dos DOIS
  produtos vao no bloco de dados da mensagem do usuario, nunca nas instrucoes.

## Dado ausente: "nao informado"

"Nao informado" e diferente de "nao contem". Num app de alergia essa diferenca
importa.

```text
produto sem texto de ingredientes, alergenicos ou tracos
  allergenData       "not_informed"
  allergens          []
  allergyVerdict     status "not_evaluated", reason "no_allergen_data", sem piso
  na tela            "Sem dados de alergênicos. Confira o rótulo físico."
  nas diferencas     o lado dele aparece como "Não informado"

nutriente que a base nao traz
  value              null - nunca 0
  na tela            "Não informado"
```

- Um alergenico que o rotulo de um produto declara e o do outro nao menciona
  aparece como "Não aparece no rótulo" - o que o texto mostra, e nao uma
  afirmacao de que o produto nao o contem.
- O veredito de um produto sem dado nunca e `clear`: nao ha como dizer "sem
  conflito" sobre um rotulo que nao foi lido.

## De onde vem os codigos

A tela tem dois campos de codigo e tres jeitos de preenche-los:

- **digitando** o numero embaixo das barras;
- **escaneando**: "Escanear" abre a camera, e a leitura preenche o primeiro
  campo vazio. Com os dois preenchidos, a comparacao roda sozinha;
- **escolhendo em Meus produtos**: o historico e os favoritos da pessoa aparecem
  como botoes, e o escolhido preenche o primeiro campo vazio.

Da tela de um produto, "Comparar com outro produto" abre a comparacao com esse
produto no primeiro campo.

Os tres jeitos terminam no MESMO caminho de busca de um produto, chamado duas
vezes: `consultarDoisProdutos` usa `prepararCodigo` (digito verificador de
`shared/barcode.js`, UPC-A para EAN-13, codigo nao-EAN intacto) e a mesma busca
de `openFoodFactsService`, com a retentativa que ja estava la. Nao existe
segundo caminho de busca nem segundo cliente da Open Food Facts. O servidor
confere os dois codigos de novo antes de comparar.

## Codigos iguais: recusados

"Esses dois códigos são do mesmo produto. Escolha outro para comparar."

O app recusa, no aparelho - antes de qualquer busca - e na API, com `400`.
UPC-A e EAN-13 do mesmo produto sao o mesmo codigo. Comparar um produto com ele
mesmo mostraria duas colunas identicas; quase sempre e a mesma embalagem lida
duas vezes, e dizer isso ajuda mais do que mostrar a repeticao.

## Produto nao encontrado: o que veio aparece

Se um dos dois nao for encontrado - ou a busca falhar por rede -, a comparacao
nao falha inteira:

- o produto encontrado aparece na sua coluna, com o seu veredito;
- a outra coluna diz o que faltou: "Não encontrei o produto X na Open Food
  Facts." ou "Não consegui buscar o produto X agora. Verifique sua internet.";
- nao ha tabela de diferencas: diferenca contra nada inventaria ausencia.

A API, por sua vez, so compara um par completo: produto faltando no corpo e
`400` ("A comparação precisa dos dois produtos encontrados."). Ela nunca devolve
uma "comparacao" com um lado vazio.

## Limites

A busca de produto roda no navegador, direto na Open Food Facts, e nenhum
limitador do backend a cobre - nem antes nem agora. A comparacao nao muda isso.

```text
POST /api/compare           30 / 10 min por usuario  e  300 / 10 min por IP
POST /api/compare/explain   os mesmos dois, e TAMBEM o balde do assistente
                            (20 / 10 min por IP, o mesmo do chat)
```

- Usuario E IP, o mais restritivo vence, usuario conferido primeiro - o desenho
  da v0.7.2, pela mesma fabrica. Sem sessao, o balde por usuario usa o IP.
- 30 por usuario: uns 10 pares em 10 minutos, com folga para refazer cada um
  duas vezes. Ninguem compara 30 pares olhando a prateleira.
- 300 por IP: dez pessoas atras do mesmo endereco no limite da propria cota, e
  contem script que troca de conta.
- A explicacao divide o balde com o chat: um balde proprio deixaria somar 20
  perguntas e mais N explicacoes na mesma janela. O teto de custo com IA
  continua onde estava.

Nenhum limitador existente foi afrouxado.

## Persistencia

Comparar nao e um tipo novo de dado.

- Nao existe tabela de comparacoes, e nenhuma comparacao e guardada.
- **Comparar nao grava os dois produtos no historico.** O historico registra o
  que a pessoa abriu; um par comparado de passagem, muitas vezes descartado na
  hora, ocuparia o limite do historico com produtos que ela nao escolheu ver.
  Quem quer guardar toca em "Abrir este produto", e o produto entra no
  historico pelo caminho de sempre - com deduplicacao, limite e
  canonicalizacao.
- Visitante nao grava nada no PostgreSQL, como sempre. Usuario tambem nao: a
  comparacao so LE o perfil.
- Nenhum veredito e congelado. Cada comparacao recalcula os dois com o perfil
  daquele momento.

## Perfil e identidade

- Com sessao, vale o perfil da SESSAO, lido do PostgreSQL: alergias e nivel de
  alerta. `userId`, `user_id` ou `user` no corpo sao descartados, e
  `guestAllergies` e ignorado.
- Sem sessao, vale `guestAllergies` do corpo - o mesmo comportamento do
  assistente. O visitante nao tem nivel de alerta.
- Sem servidor, a tela compara no aparelho, com o mesmo modulo compartilhado
  (`shared/productComparison.js`) e o perfil do aparelho, e avisa: "Servidor
  fora do ar. A comparação foi feita no aparelho."
