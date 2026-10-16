# API NutriScan v0.11.0

Base local: `http://localhost:3000/api`

O frontend usa cookie HttpOnly com `credentials: "include"`. Em desenvolvimento,
o Vite encaminha `/api` para o backend.

## Health

### `GET /api/health`

Nao exige autenticacao e nao chama o provedor de IA.

Exemplo:

```json
{
  "status": "ok",
  "database": "not_configured",
  "ai": "not_configured",
  "version": "0.11.0"
}
```

`database`: `not_configured`, `connected` ou `error`.

`ai`: `configured` ou `not_configured`, baseado apenas na presenca da variavel
de ambiente do backend.

## Assistente

### `POST /api/assistant/chat`

Autenticacao opcional. Funciona como visitante e como usuario logado.

Body:

```json
{
  "message": "Posso consumir esse produto?",
  "conversation": [
    { "role": "user", "text": "Tenho alergia a leite." },
    { "role": "assistant", "text": "Vou considerar isso na analise." }
  ],
  "product": {
    "barcode": "7890000000000",
    "name": "Chocolate",
    "brand": "Marca",
    "ingredients": "leite, acucar, cacau",
    "ingredients_text_pt": "leite, acucar, cacau",
    "ingredients_text": "milk, sugar, cocoa",
    "ingredients_text_en": "milk, sugar, cocoa",
    "allergens": ["en:milk"],
    "allergens_tags": ["en:milk"],
    "traces": [],
    "traces_tags": [],
    "labels": [],
    "labels_tags": [],
    "nutriments": { "sugars_100g": 42 },
    "nutriscore": "d",
    "quantity": "90 g",
    "servingSize": "25 g"
  },
  "guestAllergies": ["milk"]
}
```

Regras:

- Se houver usuario autenticado, o backend usa alergias oficiais do PostgreSQL.
- Se for visitante, o backend usa `guestAllergies` validado.
- O produto e limitado a campos necessarios.
- O backend gera `allergySnapshot` pelo motor compartilhado em `shared/`.
- Conversa enviada e limitada aos turnos recentes.
- A chave Anthropic nunca vai ao frontend.

Resposta:

```json
{
  "answer": "O rotulo informado indica leite, entao existe conflito com sua alergia.",
  "category": "allergy",
  "safety": "caution",
  "usedProductContext": true,
  "source": "anthropic",
  "allergyVerdict": {
    "status": "conflict",
    "reason": null,
    "source": "deterministic_engine",
    "conflicts": [{ "id": "milk", "label": "Leite/lactose" }],
    "traces": [],
    "profileSource": "postgresql",
    "alert": "Alerta do NutriScan: este produto tem Leite/lactose no seu perfil de alergias...",
    "minimumSafety": "caution",
    "safetyFloorApplied": true
  }
}
```

`source` pode ser `anthropic` ou `local`.

### `allergyVerdict` (v0.6.8)

Campo autoral do servidor. E derivado somente do motor deterministico e o
modelo nao pode escreve-lo: se a resposta da IA trouxer uma chave com esse
nome, ela e rejeitada com `AI_SCHEMA_INVALID`.

`status`:

```text
conflict       alergenico do perfil presente no produto
traces         alergenico do perfil aparece como possivel traco
clear          produto avaliado, sem interseccao com o perfil
not_evaluated  sem produto ou sem alergia no perfil; `reason` diz qual
```

`profileSource` e `postgresql` para usuario autenticado e `request` para
visitante. `alert` e o texto escrito pelo servidor, separado de `answer`, e vem
vazio quando nao ha conflito nem traco.

`safetyFloorApplied` indica que o servidor elevou `safety`. Com
`status: "conflict"`, `safety` nunca e `normal`, qualquer que tenha sido a
resposta do modelo. A elevacao vale para toda resposta do endpoint, inclusive
as locais.

O veredito acompanha tambem as respostas locais de protecao (urgencia, fora de
escopo, tentativa de injecao). Sem backend, o frontend calcula o mesmo veredito
com o motor compartilhado: o alerta de alergia nao depende de IA.

#### Alerta maximo no veredito (v0.9.0)

Quando a alergia esta em nivel `strict` no perfil (ver Perfil, abaixo), o
veredito responde de outro jeito - a classificacao do rotulo nao muda:

```text
declarado + standard   conflito {id, label}, piso caution        (igual a v0.8.0)
declarado + strict     conflito com origin "declared", piso urgent
traco     + standard   em traces, sem piso                         (igual a v0.8.0)
traco     + strict     conflito com origin "traces", piso caution
```

Cada conflito de alergia `strict` traz dois campos a mais:

```json
{ "id": "peanut", "label": "Amendoim", "origin": "traces", "alertLevel": "strict" }
```

`origin` diz de onde veio o conflito (`declared` ou `traces`); `alertLevel` diz
que a alergia esta em alerta maximo. Conflito de alergia `standard` continua
`{ "id", "label" }`, sem os dois campos: ausentes, valem `declared` e
`standard`. Com todas as alergias em `standard`, o veredito e o da v0.8.0, byte
a byte.

`minimumSafety` pode ser `urgent` - so no conflito declarado de alergia
`strict`. O texto de `alert` diz o que o rotulo traz e que a pessoa pediu
alerta maximo; nao diz o que fazer alem de conferir a embalagem.

O nivel vem SO do perfil no PostgreSQL, e o visitante e sempre `standard`. Ele
nao e enviado ao modelo, nem dentro do `allergySnapshot`, e a resposta do modelo
nao o le nem o escreve: uma chave de nivel na resposta da IA derruba a resposta
inteira com `AI_SCHEMA_INVALID`.

Erros mapeados:

- `AI_NOT_CONFIGURED`
- `AI_TIMEOUT`
- `AI_RATE_LIMITED`
- `AI_UNAVAILABLE`
- `AI_REFUSAL`
- `AI_INCOMPLETE`
- `AI_CONTENT_FILTERED`
- `AI_SCHEMA_INVALID`
- `AI_BAD_RESPONSE`
- `VALIDATION_ERROR`

O frontend usa fallback local quando a IA nao esta disponivel. Para recusa por
seguranca (`AI_REFUSAL`), o fallback nao deve ser usado para contornar a recusa.

Rate limit: 20 mensagens por 10 minutos por IP.

## Auth

### `POST /api/auth/register`

Cria conta, salva alergias iniciais e inicia sessao.

#### Unicidade de e-mail E de nome de usuario (documentado na v0.7.4)

```text
409 ACCOUNT_EXISTS   "Já existe uma conta com esse e-mail ou usuário."
```

O `409` acontece quando o e-mail **ou** o nome ja existe. Comparacao de nome e
normalizada, entao "Joao Silva" e "joao silva" sao o mesmo nome.

**Consequencia pratica: duas pessoas com o mesmo nome nao conseguem ter conta.**
Isso nao estava documentado ate a v0.7.4; o auditor externo descobriu por
acidente.

A regra sustenta o login. `POST /api/auth/login` aceita e-mail **ou** nome como
identificador, e a consulta termina em `LIMIT 1`. Com nomes repetidos, entrar
por nome escolheria uma conta qualquer entre as homonimas - defeito de
autenticacao, nao de conveniencia. Retirar a unicidade de nome exige antes
retirar o login por nome.

A mensagem nao diz QUAL campo colidiu. O efeito e limitar enumeracao de contas:
quem recebe `409` sabe que um dos dois ja existe, mas nao qual. Nao ha registro
de que isso tenha sido a intencao original; o comportamento foi mantido e o
motivo esta escrito em `backend/src/services/authService.js`.

### `POST /api/auth/login`

Entra usando e-mail **ou** nome de usuario, no campo `identifier`.

```text
401 INVALID_CREDENTIALS   "Usuário, e-mail ou senha inválidos."
```

A mensagem tambem nao distingue "usuario nao existe" de "senha errada", pelo
mesmo motivo de enumeracao.

### `GET /api/auth/me`

Exige sessao valida. Retorna usuario publico com alergias.

### `POST /api/auth/logout`

Idempotente. Pode ser chamado com sessao valida, expirada, desconhecida ou sem
cookie. O backend sempre tenta limpar o cookie.

## Perfil

### `GET /api/profile`

Exige sessao valida. Retorna usuario publico com alergias e, desde a v0.9.0, o
nivel de alerta de cada uma:

```json
{
  "user": {
    "id": "...",
    "name": "Maria",
    "email": "maria@example.com",
    "allergies": ["milk", "peanut"],
    "alertLevels": { "milk": "standard", "peanut": "strict" },
    "createdAt": "2026-09-30T11:20:05.000Z"
  }
}
```

`alertLevels` traz uma entrada para CADA alergia de `allergies`, `standard`
incluida. `GET /api/auth/me`, o login e o cadastro devolvem o mesmo formato.

### `PUT /api/profile/allergies`

Exige sessao valida. Substitui a lista completa de alergias do usuario - e, com
ela, o nivel de alerta de cada uma.

Body:

```json
{
  "allergies": ["milk", "peanut"],
  "alertLevels": { "peanut": "strict" }
}
```

#### Nivel de alerta por alergia (v0.9.0)

```text
standard   o comportamento de sempre, identico ao da v0.8.0
strict     "alerta maximo": traco do alergenico tambem vira conflito, e o
           conflito declarado sobe o piso de risco para urgent
```

O nivel e DECLARADO pela pessoa. O servidor nao infere, nao sugere e nao
corrige nivel nenhum. Detalhes e decisoes em [NIVEL_DE_ALERTA.md](NIVEL_DE_ALERTA.md).

- `alertLevels` e **opcional**. Corpo sem ele continua valido e significa
  `standard` para todas as alergias - e o contrato de antes da v0.9.0.
- Alergia ausente do mapa e gravada como `standard`. Basta mandar as `strict`.
- Como a rota SUBSTITUI o perfil, um corpo sem `alertLevels` tambem volta para
  `standard` uma alergia que estava `strict`.
- A identidade vem da sessao. `userId` ou `user_id` no corpo sao descartados.

Recusas, todas `400 VALIDATION_ERROR`, sem gravar nada:

```text
nivel fora de standard / strict      "Nível de alerta inválido. Use standard ou strict."
nivel para alergia fora de allergies "Nível de alerta para alergia que não está no perfil."
chave que nao e alergia do catalogo  "Nível de alerta para alergia que não existe no catálogo."
```

O banco tambem recusa: a coluna `user_allergies.alert_level` tem uma restricao
`CHECK (alert_level IN ('standard', 'strict'))`, entao nem um INSERT direto em
SQL grava outro valor.

## Historico e favoritos (v0.7.0)

Todas as rotas desta secao **exigem sessao valida**. A identidade vem sempre do
cookie de sessao; `userId` enviado no corpo e ignorado pelo schema de entrada.

Sem sessao, a resposta e `401` em todas elas. Visitante nao grava no
PostgreSQL: o historico e os favoritos de quem nao tem conta vivem apenas no
navegador e nunca chegam a estas rotas.

### O que NAO e guardado

Nenhuma destas rotas devolve veredito de alergia, nivel de risco ou lista de
alergenicos, porque as tabelas nao guardam nada disso. O perfil de alergia muda
com o tempo, e um veredito congelado vira informacao de seguranca errada. O
veredito e sempre recalculado pelo motor deterministico no momento da exibicao,
com o perfil atual.

### Corpo comum de produto

`POST /api/history`, `POST /api/favorites` e `POST /api/favorites/toggle`
aceitam o mesmo objeto:

```json
{
  "productCode": "7891000100103",
  "productName": "Leite Condensado Integral",
  "productBrand": "Nestle",
  "imageUrl": "https://images.openfoodfacts.org/exemplo.jpg"
}
```

`productCode` e `productName` sao obrigatorios. `productBrand` e `imageUrl` sao
opcionais e aceitam `null`. `imageUrl` precisa ser `https`. Qualquer outra chave
enviada e descartada pelo schema.

#### Validacao de `productCode` (v0.7.3)

```text
formato      letra, digito, ponto, hifen e sublinhado; ate 64 caracteres
digito       EXIGIDO quando o codigo e todo numerico E tem 8, 12 ou 13 digitos
resposta     400, "Código do produto tem dígito verificador inválido."
```

A conferencia usa `shared/barcode.js` - a mesma implementacao que o frontend
usa. **A do frontend e conveniencia; esta e a que vale**: uma requisicao direta,
sem passar pela interface, e recusada do mesmo jeito.

Ela existe porque um digito errado nao produz "produto nao encontrado". Produz
outro produto, que existe e tem outros alergenicos. Guardar aquilo associa o
alergenico de um produto ao codigo de outro.

A regra e estreita de proposito. A base da Open Food Facts tem cadastros com
codigo alfanumerico, e o scanner le ITF e CODE_128, que nao tem digito
verificador de EAN. Esses continuam aceitos:

```text
7891000100103    aceito    EAN-13 com digito correto
7891000100104    RECUSADO  EAN-13 com digito errado
96385074         aceito    EAN-8
036000291452     aceito    UPC-A
20003404_0001    aceito    alfanumerico da base, sem digito de EAN
12345678901234   aceito    14 digitos, ITF-14, fora dos tamanhos de EAN
```

#### Canonicalizacao de `productCode` (v0.7.4)

**O que o banco guarda e o que este endpoint canonicalizou.** Um UPC-A de 12
digitos vira EAN-13 com zero a esquerda, aqui, antes de chegar ao PostgreSQL:

```text
enviado          gravado          motivo
036000291452  -> 0036000291452    UPC-A canonicalizado para EAN-13
0036000291452 -> 0036000291452    ja canonico, inalterado
7891000100103 -> 7891000100103    EAN-13, inalterado
96385074      -> 96385074         EAN-8, inalterado
12345678901234-> 12345678901234   nao e EAN/UPC, inalterado
20003404_0001 -> 20003404_0001    alfanumerico da base, inalterado
```

A canonicalizacao vale para TODO caminho de entrada: app, camera e requisicao
direta a API. **A normalizacao do cliente e conveniencia de exibicao; esta e a
que vale.**

Ela existe pela deduplicacao. A unicidade e `(user_id, product_code)`, entao sem
canonicalizar no servidor o mesmo produto escaneado como EAN-13 e digitado como
UPC-A vira duas linhas de historico, e favoritar por um caminho nao aparece como
favoritado pelo outro.

Ate a v0.7.3 esse defeito existia: o endpoint conferia o digito verificador e
gravava o codigo como veio. Corrigido na v0.7.4 (achado N1). A migration `003`
canonicaliza as linhas gravadas antes.

Codigo que nao e EAN/UPC passa INTACTO. Canonicalizar um ITF-14 ou um codigo
alfanumerico seria inventar um codigo que nao existe.

### `GET /api/history`

Lista do mais recente para o mais antigo.

```json
{
  "items": [
    {
      "id": "6f1b...",
      "productCode": "7891000100103",
      "productName": "Leite Condensado Integral",
      "productBrand": "Nestle",
      "imageUrl": "https://images.openfoodfacts.org/exemplo.jpg",
      "viewedAt": "2026-09-18T14:03:11.204Z"
    }
  ]
}
```

### `POST /api/history`

Registra a consulta. Consultar o mesmo produto de novo **atualiza** o registro
existente em vez de criar outro: a deduplicacao acontece na restricao de
unicidade `(user_id, product_code)` do banco.

Resposta `201` com `{ "item": { ... } }`.

Limite de **100 itens por usuario**. Ao estourar, o mais antigo sai em silencio
- o historico e um registro automatico, e descartar o item 101 nao desfaz
escolha nenhuma do usuario.

### `DELETE /api/history/:id`

Remove um item. Resposta `200` com `{ "id": "..." }`.

Item de outro usuario e item inexistente produzem a **mesma** resposta `404`. Se
um devolvesse `403` e o outro `404`, a diferenca contaria ao atacante quais ids
existem na conta alheia.

### `DELETE /api/history`

Limpa tudo. Resposta `200` com `{ "removed": 12 }`.

### `GET /api/favorites`

Mesma forma do historico, com `createdAt` no lugar de `viewedAt`.

### `POST /api/favorites`

Adiciona. Resposta `201` quando cria, `200` quando o produto ja estava marcado -
marcar de novo nao e erro, e ruido de rede ou toque duplo.

Limite de **200 itens por usuario**. Diferente do historico, aqui o limite
**nao poda**: estourar devolve `409` com codigo `FAVORITES_LIMIT_REACHED`.
Favorito e escolha explicita, e descartar a mais antiga em silencio apagaria uma
decisao do usuario.

### `POST /api/favorites/toggle`

Marca se nao estiver marcado, desmarca se estiver. Usado pelo botao da
interface, que conhece o codigo do produto mas nao o id da linha.

```json
{ "favoritado": true, "favorito": { "id": "...", "productCode": "..." } }
```

### `DELETE /api/favorites/:id`

Remove um favorito. Mesma regra de `404` do historico.

### Limite de requisicoes

As rotas desta secao passam por dois limites ao mesmo tempo, desde a v0.7.2:
**300 requisicoes por 10 minutos por usuario** e **3000 por 10 minutos por IP**.
Passar exige caber nos dois; qualquer um recusando devolve 429. Sao mais
folgados que o de autenticacao, que protege senha, e que o do assistente, que
custa por chamada - cada produto aberto gera um `POST` de historico.

(Ate a v0.7.6 este paragrafo dizia "300 por IP", texto anterior a v0.7.2 que
nao foi atualizado quando os limites mudaram.)

## Conta: dados do titular (v0.8.0)

Duas rotas, as duas com sessao obrigatoria. **O titular e sempre o dono da
sessao**: `userId` no corpo, na query ou em cabecalho e ignorado. Nao existe
rota para ler ou apagar os dados de outra pessoa. Nenhuma das duas chama a IA.

As decisoes de formato, de cabecalho e de exclusao fisica estao em
[DADOS_DO_TITULAR.md](DADOS_DO_TITULAR.md).

### `GET /api/account/export`

Exporta tudo o que o sistema guarda sobre o titular. Sem corpo.

Resposta `200`, com o JSON no corpo e estes cabecalhos:

```text
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="nutriscan-meus-dados-2026-10-12.json"
Cache-Control: no-store
Pragma: no-cache
```

O nome do arquivo e so o produto e o dia - nunca o e-mail nem o nome.

```json
{
  "formato": "nutriscan-dados-do-titular",
  "versaoDoFormato": 1,
  "geradoEm": "2026-10-12T14:03:22.511Z",
  "conta": {
    "nome": "Maria",
    "email": "maria@example.com",
    "criadaEm": "2026-09-30T11:20:05.000Z"
  },
  "alergias": [
    { "id": "milk", "nome": "Leite/lactose", "alertaMaximo": false, "marcadaEm": "2026-09-30T11:20:05.000Z" }
  ],
  "historico": [
    {
      "codigo": "7891000100103",
      "nome": "Leite condensado",
      "marca": "Exemplo",
      "imagem": "https://images.openfoodfacts.org/...",
      "consultadoEm": "2026-10-11T19:42:10.000Z"
    }
  ],
  "favoritos": [
    {
      "codigo": "7891000100103",
      "nome": "Leite condensado",
      "marca": "Exemplo",
      "imagem": null,
      "favoritadoEm": "2026-10-11T19:43:00.000Z"
    }
  ]
}
```

`alertaMaximo` (v0.9.0) e o nivel de alerta que a pessoa declarou para a
alergia: `true` para alerta maximo. Campo acrescentado sem mudar nenhum outro, e
por isso `versaoDoFormato` continua 1.

`historico` vem do mais recente para o mais antigo (`consultadoEm`), e
`favoritos` tambem (`favoritadoEm`). Listas vazias saem como `[]`. `marca` e
`imagem` podem ser `null`.

**Nunca aparecem:** hash ou salt da senha, sessoes, token, cookie, id interno de
linha, `user_id`, dado de outra conta, chave de API, string de conexao.

Limite proprio: **5 por 24 horas por usuario** e **20 por 24 horas por IP** -
passar exige caber nos dois. Acima disso, `429`. Exportar nao gasta a cota de
historico e favoritos.

```text
200                  o arquivo
401 UNAUTHENTICATED  sem sessao, sessao expirada, ou conta excluida
429 (limitador)      passou do limite do dia
```

### `DELETE /api/account`

Exclui a conta do titular e tudo o que esta ligado a ela: alergias, historico,
favoritos e **todas** as sessoes, em todos os aparelhos. Exclusao fisica, numa
transacao so - ou sai tudo, ou nada.

Corpo, obrigatorio - a senha ATUAL, conferida de novo contra o hash:

```json
{ "password": "a-senha-atual" }
```

O parser de JSON aceita corpo em `DELETE`. Corpo que nao e JSON cai no
`400 INVALID_JSON` geral, antes da rota.

Resposta `200`, com o cookie de sessao limpo (`Set-Cookie` expirando o cookie) e
`Cache-Control: no-store`:

```json
{ "ok": true }
```

Depois disso, o cookie antigo - e o de qualquer outro aparelho da conta -
responde `401`. O e-mail e o nome ficam livres para um cadastro novo.

```text
200                       conta excluida
400 VALIDATION_ERROR      sem `password`, ou vazia: "Digite sua senha para confirmar."
400 INVALID_JSON          o corpo nao e JSON
401 UNAUTHENTICATED       sem sessao, ou sessao expirada
403 INVALID_CREDENTIALS   "Senha incorreta. Nada foi apagado."
429 (limitador)           tentativas demais
```

**403, e nao 401, para senha errada:** a sessao continua valida, so a
confirmacao falhou. Nada e apagado.

**Limite: o de autenticacao** - 40 por 15 minutos por IP, o mesmo balde do
login. Cada tentativa confere uma senha, entao conta como tentativa de senha; o
limitador roda antes da autenticacao, e toda tentativa conta.

## Comparacao de produtos (v0.10.0)

Duas rotas. Nenhuma busca produto: as duas buscas acontecem no navegador, pelo
caminho de sempre, e o que chega aqui e o par ja encontrado - dado nao
confiavel. Nenhuma das duas grava nada, com ou sem sessao. As decisoes estao em
[COMPARACAO.md](COMPARACAO.md).

**O perfil.** Com sessao, alergias e nivel de alerta vem do PostgreSQL, do dono
da sessao; `userId`, `user_id` e `user` no corpo sao descartados, e
`guestAllergies` e ignorado. Sem sessao, vale `guestAllergies`, como no
assistente.

**Nao ha vencedor.** Nenhum campo da resposta escolhe, recomenda ou ordena os
produtos. A ordem de `products` e a do pedido.

### `POST /api/compare`

Request:

```json
{
  "products": [
    { "code": "7891000100103", "product": { "product_name": "Leite condensado", "ingredients_text": "leite integral, acucar", "nutriments": { "energy-kcal_100g": 321 } } },
    { "code": "036000291452", "product": { "product_name": "Biscoito de arroz", "ingredients_text": "farinha de arroz, sal" } }
  ],
  "guestAllergies": ["milk"]
}
```

- `products`: exatamente dois. `code` passa pela mesma validacao de
  `productCode` do historico (digito verificador, UPC-A para EAN-13, codigo
  nao-EAN intacto); `product` e o objeto da Open Food Facts, reduzido pelo
  servidor ao contexto controlado do assistente.
- `guestAllergies`: opcional, so para visitante.

Response `200` (visitante com `milk`; listas de nutrientes encurtadas aqui):

```json
{
  "comparison": {
    "profileSource": "request",
    "products": [
      {
        "slot": "a",
        "code": "7891000100103",
        "name": "Leite condensado",
        "brand": "Marca A",
        "allergenData": "informed",
        "allergens": [{ "id": "milk", "label": "Leite/lactose", "state": "contains" }],
        "nutrition": [
          { "key": "energy-kcal", "label": "Energia", "unit": "kcal", "value": 321 },
          { "key": "fiber", "label": "Fibras", "unit": "g", "value": null }
        ],
        "allergyVerdict": {
          "status": "conflict",
          "reason": null,
          "source": "deterministic_engine",
          "conflicts": [{ "id": "milk", "label": "Leite/lactose" }],
          "traces": [],
          "profileSource": "request",
          "alert": "Este produto tem Leite/lactose, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.",
          "minimumSafety": "caution",
          "safetyFloorApplied": true
        },
        "safety": "caution",
        "explanation": null
      },
      {
        "slot": "b",
        "code": "0036000291452",
        "name": "Biscoito de arroz",
        "brand": "Marca B",
        "allergenData": "informed",
        "allergens": [{ "id": "rice", "label": "Arroz", "state": "contains" }],
        "nutrition": [
          { "key": "energy-kcal", "label": "Energia", "unit": "kcal", "value": 387 },
          { "key": "fiber", "label": "Fibras", "unit": "g", "value": null }
        ],
        "allergyVerdict": {
          "status": "clear",
          "reason": null,
          "source": "deterministic_engine",
          "conflicts": [],
          "traces": [],
          "profileSource": "request",
          "alert": "",
          "minimumSafety": null,
          "safetyFloorApplied": false
        },
        "safety": "normal",
        "explanation": null
      }
    ],
    "differences": {
      "allergens": [
        { "id": "milk", "label": "Leite/lactose", "a": "contains", "b": "not_detected" },
        { "id": "rice", "label": "Arroz", "a": "not_detected", "b": "contains" }
      ],
      "nutrition": [
        { "key": "energy-kcal", "label": "Energia", "unit": "kcal", "a": 321, "b": 387 }
      ]
    }
  },
  "explanation": { "status": "not_requested" }
}
```

Os campos:

```text
products[].slot            "a" ou "b" - a posicao do pedido, nada mais
products[].code            a forma canonica (o UPC-A acima virou EAN-13)
products[].allergenData    "informed" ou "not_informed" (rotulo sem texto de
                           ingredientes, alergenicos ou tracos)
products[].allergens       todo alergenico que o motor achou no rotulo, com
                           state "contains" ou "traces"; vazio sem dado
products[].nutrition       por 100 g; value null quando a base nao traz - nunca 0
products[].allergyVerdict  o veredito DESTE produto, do motor. Sem dado de
                           alergenico: status "not_evaluated", reason
                           "no_allergen_data", sem piso
products[].safety          o piso deste produto, imposto produto a produto
products[].explanation     null nesta rota
differences.allergens      so os alergenicos cujo estado difere; cada lado
                           "contains", "traces", "not_detected" ou
                           "not_informed"
differences.nutrition      os nutrientes que pelo menos um dos dois informa;
                           o lado sem dado vem null
```

`not_detected` quer dizer "nao aparece no rotulo deste produto". `not_informed`
quer dizer "este produto nao tem dado de alergenico". Nenhum dos dois quer
dizer "nao contem".

Erros:

```text
400  VALIDATION_ERROR   "A comparação precisa de exatamente dois produtos."
                        "A comparação precisa dos dois produtos encontrados."
                        "Esses dois códigos são do mesmo produto. Escolha outro para comparar."
                        digito verificador invalido em qualquer dos dois
429  (limitador)        30 por 10 min por usuario ou 300 por 10 min por IP
```

### `POST /api/compare/explain`

O mesmo corpo de `POST /api/compare`. Chama o modelo UMA vez para os dois
produtos e devolve a comparacao inteira de novo, com o veredito de cada um
recalculado e `explanation` preenchido:

```json
{
  "comparison": {
    "profileSource": "request",
    "products": [
      { "slot": "a", "code": "7891000100103", "safety": "caution", "explanation": "texto do modelo sobre ESTE produto", "...": "..." },
      { "slot": "b", "code": "0036000291452", "safety": "normal", "explanation": "texto do modelo sobre ESTE produto", "...": "..." }
    ],
    "differences": { "...": "..." }
  },
  "explanation": { "status": "ok", "source": "anthropic", "category": "allergy" }
}
```

- O modelo devolve uma explicacao por `productCode`. O servidor poe cada uma no
  produto pelo CODIGO, nunca pela ordem da lista; codigo repetido, faltando ou
  estranho a comparacao recusa a resposta inteira.
- `allergyVerdict` e `safety` continuam sendo do motor: o piso de cada produto
  e imposto depois da resposta do modelo, e chave fora do contrato na resposta
  dele (`allergyVerdict`, `winner`, `ranking`...) derruba a resposta.
- O nivel de alerta nao e enviado ao modelo.

Erros, alem dos de `POST /api/compare`:

```text
429  (limitador)        tambem o balde do assistente: 20 por 10 min por IP, o mesmo do chat
503  AI_NOT_CONFIGURED  sem chave de IA no servidor
502  AI_SCHEMA_INVALID  resposta do modelo fora do contrato, ou explicacao com
                        codigo repetido, faltando ou estranho
```

Os demais codigos `AI_*` sao os do assistente.

## Uso sem rede (v0.11.0) - nenhuma rota nova

A v0.11.0 nao muda nenhuma rota. O cliente passa a guardar no aparelho, para ler
sem internet, parte do que algumas respostas ja trazem:

```text
GET /api/auth/me, login, cadastro,       id, nome, alergias e alertLevels do user
PUT /api/profile/allergies               (nao o e-mail, nao o createdAt)
GET /api/history, GET /api/favorites     as referencias dos itens
a Open Food Facts                        os campos de produto que o motor e a tela leem
```

Nenhuma resposta da API passa a carregar dado novo por causa disso, e o cliente
nunca guarda veredito. O aparelho trata as respostas assim:

- `401` em `GET /api/auth/me`: a sessao acabou - o cache da conta sai do
  aparelho.
- sem resposta, timeout ou `5xx` em `GET /api/auth/me`: o app usa o perfil
  guardado, marcado como tal.
- `POST /api/auth/logout`: o cache da conta sai do aparelho, responda o
  servidor ou nao.
- `DELETE /api/account` com `200`: o cache da conta sai do aparelho.

Sem rede, o cliente nao chama nenhuma rota de escrita, e nao guarda chamada para
depois. As decisoes estao em [OFFLINE.md](OFFLINE.md).

## Erros

Formato padrao:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados invalidos.",
    "details": ["Use uma senha com pelo menos 6 caracteres."]
  }
}
```

### Corpo que nao e JSON (v0.7.6)

```json
{ "error": { "code": "INVALID_JSON", "message": "O corpo da requisição não é JSON válido." } }
```

Status **400**. Ate a v0.7.5 esse caso respondia `500 INTERNAL_ERROR`: erro do
cliente aparecendo como erro do servidor. A mensagem e fixa - nada do erro do
leitor de JSON chega ao cliente.

### Corpo grande demais

```json
{ "error": { "code": "PAYLOAD_TOO_LARGE", "message": "O corpo da requisição é grande demais." } }
```

Status **413**, para corpo acima de 64 kB. Ate a v0.7.6 respondia
`500 INTERNAL_ERROR`, o mesmo defeito do JSON malformado no caso vizinho.

Os dois - 400 e 413 - valem SO para os erros do leitor de corpo, reconhecidos
pela classe e pelo tipo do erro. Qualquer outro erro inesperado continua
`500 INTERNAL_ERROR`, mesmo que a biblioteca que o lancou traga um status
proprio: uma biblioteca nao escolhe o status nem o texto da resposta.

### Codigos gerais

```text
400  VALIDATION_ERROR    campo invalido; `details` diz qual
400  INVALID_JSON        o corpo nao e JSON valido
413  PAYLOAD_TOO_LARGE   o corpo passa de 64 kB
404  NOT_FOUND           rota inexistente - inclusive qualquer /api/* sem rota
401  UNAUTHENTICATED     rota que exige sessao, chamada sem ela
403  INVALID_CREDENTIALS DELETE /api/account com a senha errada; nada e apagado
429  (limitador)         passou do limite da rota
503  DATABASE_NOT_CONFIGURED
500  INTERNAL_ERROR      erro do servidor; em producao, sem `details`
```
