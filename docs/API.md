# API NutriScan v0.7.4

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
  "aiProvider": "anthropic",
  "version": "0.7.4"
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

Exige sessao valida. Retorna usuario publico com alergias.

### `PUT /api/profile/allergies`

Exige sessao valida. Substitui a lista completa de alergias do usuario.

Body:

```json
{
  "allergies": ["milk", "gluten"]
}
```

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

As rotas desta secao compartilham um limite de **300 requisicoes por 10
minutos** por IP. E mais folgado que o de autenticacao, que protege senha, e que
o do assistente, que custa por chamada - cada produto aberto gera um `POST` de
historico.

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
