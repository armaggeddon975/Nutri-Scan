# API NutriScan v0.7.0

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
  "version": "0.7.0"
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

### `POST /api/auth/login`

Entra usando e-mail ou usuario.

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
