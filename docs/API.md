# API NutriScan v0.6.7

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
  "version": "0.6.7"
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
  "source": "anthropic"
}
```

`source` pode ser `anthropic` ou `local`.

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
