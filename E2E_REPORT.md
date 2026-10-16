# E2E Report - NutriScan v0.11.0

Data: 2026-10-16

## Resultado geral

```text
verify:e2e                 PASS, exit code 0 - na primeira execucao
doctor:e2e                 PASS - "Migrations - 4/4 applied"
e2e:strict                 PASS, mode=strict, ok=true
requisitos strict          23 de 23 em PASSED - os 22 da v0.10.0 e o novo
offlineCache               PASSED
PostgreSQL real            EXECUTADO - banco de producao (o mesmo das versoes anteriores)
Claude real                EXECUTADO - 2 chamadas pagas
residuo no banco           0

migration nova             NENHUMA - o schema do banco do gate nao mudou
verify:deploy simulado     FAIL, exit code 1 - 7 PASS, D2 FAIL (alvo http, sem TLS)
verify:deploy REAL         FAIL, exit code 1 - 7 PASS, D1 FAIL (no ar 0.7.0)

camera em hardware         NAO EXECUTADO
deploy real da 0.11.0      NAO EXECUTADO - nada foi publicado
sem rede em celular real   NAO EXECUTADO
```

Nenhum resultado foi herdado. Os PASS das versoes anteriores estao preservados
na secao historica e nao valem para esta versao.

## Como rodou

```text
PORT=3100 RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

`PORT=3100` pelo mesmo motivo das versoes anteriores: `127.0.0.1:3000` continua
ocupado por outro projeto do dono, que nao foi tocado. A porta e configuracao de
ambiente; nenhum arquivo do gate foi alterado para isso. Uma execucao so, sem
repeticao.

## Saida literal do gate

Os blocos de aviso de SSL do driver `pg` foram suprimidos desta transcricao; sao
o mesmo aviso registrado desde a v0.7.2, sobre a semantica futura de `sslmode`.
Todo o resto e literal, inclusive o JSON.

```text
> nutriscan@0.11.0 verify:e2e
> node scripts/verify-e2e.js

[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
NutriScan Doctor - modo STRICT E2E (C:\Users\diego\OneDrive\Área de Trabalho\PJ)
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 4/4 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3100
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3100
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] severity verdict - alerta maximo: urgent no declarado, caution no traco; padrao igual a v0.8.0; modelo negando nao derruba o piso
[OK] product comparison - um veredito por produto, perfil do banco; o limpo nao herda; explicacao amarrada pelo codigo
[OK] offline cache - perfil do banco e produto guardados, sem veredito nem credencial; perfil novo refeito sem rede; logout real limpa
[OK] account export - tudo de A, nada do vizinho, nada de senha nem de sessao
[OK] account deletion - senha errada nao apaga; senha certa apaga tudo; sessoes caem; vizinha intacta
[OK] auth - register, me, allergies, login, logout idempotente
{
  "version": "0.11.0",
  "mode": "strict",
  "startedAt": "2026-10-16T14:37:00.135Z",
  "finishedAt": "2026-10-16T14:37:38.479Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "severityVerdict": "PASSED",
  "productComparison": "PASSED",
  "offlineCache": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 8,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 32,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 20,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 280,
        "tetoPorIp": 3000,
        "folgaPorIp": 2980,
        "dentroDaMargem": true
      },
      {
        "balde": "comparacao",
        "usado": 4,
        "teto": 30,
        "margemMaxima": 15,
        "folga": 26,
        "tetoPorIp": 300,
        "folgaPorIp": 296,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
accountExport           PASSED
accountDeletion         PASSED
severityVerdict         PASSED
productComparison       PASSED
offlineCache            PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

`anthropicCalls: 2`, `anthropicReal: EXECUTED_GENERIC_AND_PRODUCT`, `ok: true`.

## O que o subgate novo confere

**offlineCache** - com a conta E, criada so para ele e encerrada com logout:

```text
1  recuperarSessao com o /auth/me REAL         "conta"; o perfil do PostgreSQL (amendoim
                                                em alerta maximo) vai para o cache
2  produto aberto com internet + listas reais  produto guardado; historico e favoritos
                                                das rotas reais guardados
3  o cache cru: toda loja, chave e valor       contem o produto e o perfil; nenhuma chave
                                                de veredito ou de credencial; nem o cookie
                                                de sessao real, nem password_hash,
                                                password_salt e token_hash lidos do banco,
                                                nem a senha, nem o e-mail
4  sem rede: sessao do aparelho + leitura      perfil do aparelho; produto lido; veredito
                                                refeito: urgent
5  perfil muda COM rede, pela API real         a leitura sem rede segue o perfil novo:
                                                caution, e nao mais urgent
6  logout REAL por aoSairDaConta               servidor respondeu; /auth/me 401; nenhum
                                                vestigio de amendoim, da conta ou do produto
```

**O que ele prova, e o que nao prova.** Ele prova os modulos do CLIENTE
(`offlineCache`, `offlineSession`, `offlineLookup`) alimentados pelas respostas
do backend real. O IndexedDB dele e o do `fake-indexeddb`, uma implementacao
completa da API em Node - nao o do navegador. A persistencia no navegador de
verdade e a ligacao com a tela foram conferidas a parte, no navegador
(AUDIT_REPORT). Um subgate que abrisse um navegador de verdade seria o lugar
certo para provar isso de ponta a ponta - descrito no AUDIT_REPORT como proposta.

## Contagem de requisicoes do gate por balde

```text
balde        usado   teto/usuario     teto/IP   margem maxima (50%)   dentro
assistente       2             20           -              10          sim
auth             8             40           -              20          sim
colecoes        20            300        3000             150          sim
comparacao       4             30         300              15          sim
exportacao       1              5          20               2          sim
```

Nenhum balde estourou. O subgate novo gastou 1 de auth (o cadastro da conta E) e
3 de colecoes (gravar e ler o historico, ler os favoritos): auth foi de 7 para 8
e colecoes de 17 para 20. Os outros baldes tem os numeros da v0.10.0.

## Limpeza do banco depois do gate

Conferida por script proprio, que usa o pool do backend e so imprime contagens -
a string de conexao nunca e lida nem impressa. A conta E do subgate novo cai no
padrao `nutriscan-e2e-%`.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           1
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
suite de comparacao            comparacao-test-%        0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO (com sobreposicao entre padroes): 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

As quatro contas e a sessao que restam nao batem com nenhum padrao de teste - sao
as mesmas contagens da v0.10.0. O gate cria e apaga so contas `nutriscan-e2e-*`.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore`, entao NAO vai no ZIP. Conteudo integral:

```json
{
  "version": "0.11.0",
  "mode": "strict",
  "startedAt": "2026-10-16T14:37:00.135Z",
  "finishedAt": "2026-10-16T14:37:38.479Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "severityVerdict": "PASSED",
  "productComparison": "PASSED",
  "offlineCache": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 8,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 32,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 20,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 280,
        "tetoPorIp": 3000,
        "folgaPorIp": 2980,
        "dentroDaMargem": true
      },
      {
        "balde": "comparacao",
        "usado": 4,
        "teto": 30,
        "margemMaxima": 15,
        "folga": 26,
        "tetoPorIp": 300,
        "folgaPorIp": 296,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

## `verify:deploy` contra alvo LOCAL simulado

O backend real em `NODE_ENV=production`, servindo o `dist/`, contra o
PostgreSQL LOCAL, na porta 3999, sem chave de IA. O alvo e `http://`, entao o
D2 TEM de reprovar: nao ha TLS local.

```text
[alvo] NutriScan API v0.11.0 ouvindo na porta 3999

verify:deploy - alvo http://127.0.0.1:3999
versao do repositorio: 0.11.0

[PASS        ] D1  versao no ar igual a do repositorio
                ambos declaram 0.11.0
[FAIL        ] D2  resposta por HTTPS, e http:// redireciona
                o alvo foi informado como http:// - o deploy precisa responder por HTTPS
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 400) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE do verify:deploy: 1 ===
```

## `verify:deploy` contra o deploy REAL

Somente leitura, contra `https://nutriscan-h1wp.onrender.com`.

```text

> nutriscan@0.11.0 verify:deploy
> node scripts/verify-deploy.js https://nutriscan-h1wp.onrender.com

verify:deploy - alvo https://nutriscan-h1wp.onrender.com
versao do repositorio: 0.11.0

[FAIL        ] D1  versao no ar igual a do repositorio
                repositorio declara 0.11.0 e o deploy anuncia 0.7.0
[PASS        ] D2  resposta por HTTPS, e http:// redireciona
                HTTPS responde, e http:// redireciona (301) para https://
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy
=== EXIT CODE: 1 ===
```

O D1 reprova porque o servico no ar roda a 0.7.0 - as versoes 0.7.1 a 0.11.0
nunca foram publicadas. Os sete PASS medem a 0.7.0 e **nao provam nada sobre a
0.11.0**. O `scripts/verify-deploy.js` nao mudou uma linha nesta versao, e a
v0.11.0 nao tem rota nova: o cache e do navegador.

## O que este relatorio NAO prova

- A leitura da camera em aparelho real: **NAO EXECUTADO**.
- O deploy real da 0.11.0: **NAO EXECUTADO**.
- HTTPS da 0.11.0: **NAO COMPROVADO** - o alvo simulado nao tem TLS.
- O IndexedDB do navegador, pelo gate: **NAO COMPROVADO** pelo gate - o subgate
  usa o `fake-indexeddb`; o navegador foi conferido a parte (AUDIT_REPORT).
- O modo sem rede num celular de verdade: **NAO EXECUTADO**.

## Historico de auditorias anteriores

## E2E da v0.10.0 - 2026-10-16

## Resultado geral

```text
verify:e2e                 PASS, exit code 0 - na primeira execucao
doctor:e2e                 PASS - "Migrations - 4/4 applied"
e2e:strict                 PASS, mode=strict, ok=true
requisitos strict          22 de 22 em PASSED - os 21 da v0.9.0 e o novo
productComparison          PASSED
PostgreSQL real            EXECUTADO - banco de producao (o mesmo das versoes anteriores)
Claude real                EXECUTADO - 2 chamadas pagas
residuo no banco           0

migration nova             NENHUMA - o schema do banco do gate nao mudou
verify:deploy simulado     FAIL, exit code 1 - 7 PASS, D2 FAIL (alvo http, sem TLS)
verify:deploy REAL         FAIL, exit code 1 - 7 PASS, D1 FAIL (no ar 0.7.0)

camera em hardware         NAO EXECUTADO
deploy real da 0.10.0      NAO EXECUTADO - nada foi publicado
```

Nenhum resultado foi herdado. Os PASS das versoes anteriores estao preservados
na secao historica e nao valem para esta versao.

## Como rodou

```text
PORT=3100 RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

`PORT=3100` pelo mesmo motivo das versoes anteriores: `127.0.0.1:3000` continua
ocupado por outro projeto do dono, que nao foi tocado. A porta e configuracao de
ambiente; nenhum arquivo do gate foi alterado para isso. Uma execucao so, sem
repeticao.

## Saida literal do gate

Os blocos de aviso de SSL do driver `pg` foram suprimidos desta transcricao; sao
o mesmo aviso registrado desde a v0.7.2, sobre a semantica futura de `sslmode`.
Todo o resto e literal, inclusive o JSON.

```text
> nutriscan@0.10.0 verify:e2e
> node scripts/verify-e2e.js

[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
NutriScan Doctor - modo STRICT E2E (C:\Users\diego\OneDrive\Área de Trabalho\PJ)
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 4/4 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3100
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3100
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] severity verdict - alerta maximo: urgent no declarado, caution no traco; padrao igual a v0.8.0; modelo negando nao derruba o piso
[OK] product comparison - um veredito por produto, perfil do banco; o limpo nao herda; explicacao amarrada pelo codigo
[OK] account export - tudo de A, nada do vizinho, nada de senha nem de sessao
[OK] account deletion - senha errada nao apaga; senha certa apaga tudo; sessoes caem; vizinha intacta
[OK] auth - register, me, allergies, login, logout idempotente
{
  "version": "0.10.0",
  "mode": "strict",
  "startedAt": "2026-10-16T12:32:55.546Z",
  "finishedAt": "2026-10-16T12:33:40.590Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "severityVerdict": "PASSED",
  "productComparison": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 7,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 33,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 17,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 283,
        "tetoPorIp": 3000,
        "folgaPorIp": 2983,
        "dentroDaMargem": true
      },
      {
        "balde": "comparacao",
        "usado": 4,
        "teto": 30,
        "margemMaxima": 15,
        "folga": 26,
        "tetoPorIp": 300,
        "folgaPorIp": 296,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
accountExport           PASSED
accountDeletion         PASSED
severityVerdict         PASSED
productComparison       PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

`anthropicCalls: 2`, `anthropicReal: EXECUTED_GENERIC_AND_PRODUCT`, `ok: true`.

## O que o subgate novo confere

**productComparison** - com a conta A do gate, cujo perfil, gravado pelo subgate
anterior, tem leite em alerta padrao e amendoim em alerta maximo:

```text
1  consultarDoisProdutos, um codigo com digito errado     CODIGO_INVALIDO, nenhuma busca
2  consultarDoisProdutos, EAN-13 + UPC-A                   DOIS_ENCONTRADOS; o UPC-A buscado
                                                           e devolvido na forma EAN-13
3  POST /api/compare, leite x produto limpo                200, profileSource "postgresql";
                                                           cada veredito IGUAL ao do produto
                                                           calculado sozinho com o perfil do banco;
                                                           leite conflict/caution, limpo clear/normal
4  POST /api/compare, pacoca x produto limpo               pacoca urgent, limpo normal
5  POST /api/compare, digito errado / codigos iguais       400 / 400
6  explicarComparacao, modelo SIMULADO que devolve as      cada texto no produto do seu codigo;
   explicacoes em ordem TROCADA e safety "normal"          leite continua caution, limpo normal
```

- As buscas usam o caminho de sempre com a busca externa injetada: o subgate nao
  depende de a Open Food Facts estar no ar.
- O corpo das comparacoes leva `guestAllergies: ["soy"]` e `userId:
  "outra-pessoa"`; com sessao, os dois sao ignorados e o perfil vem do banco.
- O modelo e simulado de proposito: e a unica forma de forcar a troca das
  explicacoes e a negacao do conflito, que e o que o auditor faz, e nao custa
  chamada paga. As 2 chamadas pagas sao as de sempre (`anthropicReal`).

## Contagem de requisicoes do gate por balde

```text
balde        usado   teto/usuario     teto/IP   margem maxima (50%)   dentro
assistente       2             20           -              10          sim
auth             7             40           -              20          sim
colecoes        17            300        3000             150          sim
comparacao       4             30         300              15          sim
exportacao       1              5          20               2          sim
```

Nenhum balde estourou. O balde novo, `comparacao`, gastou 4: as duas
comparacoes validas e as duas recusadas com 400 (o limitador conta antes da
validacao). A explicacao foi chamada dentro do processo e nao gastou balde. Os
outros quatro baldes tem os numeros da v0.9.0.

## Limpeza do banco depois do gate

Conferida por script proprio, que usa o pool do backend e so imprime contagens -
a string de conexao nunca e lida nem impressa. O padrao da suite nova
(`comparacao-test-%`) entrou na lista; essa suite roda so contra o PostgreSQL
local, e o padrao confere que nada dela chegou aqui.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           1
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
suite de comparacao            comparacao-test-%        0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO (com sobreposicao entre padroes): 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

As quatro contas e a sessao que restam nao batem com nenhum padrao de teste - sao
as mesmas contagens da v0.9.0. O gate cria e apaga so contas `nutriscan-e2e-*`.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore`, entao NAO vai no ZIP. Conteudo integral:

```json
{
  "version": "0.10.0",
  "mode": "strict",
  "startedAt": "2026-10-16T12:32:55.546Z",
  "finishedAt": "2026-10-16T12:33:40.590Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "severityVerdict": "PASSED",
  "productComparison": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 7,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 33,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 17,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 283,
        "tetoPorIp": 3000,
        "folgaPorIp": 2983,
        "dentroDaMargem": true
      },
      {
        "balde": "comparacao",
        "usado": 4,
        "teto": 30,
        "margemMaxima": 15,
        "folga": 26,
        "tetoPorIp": 300,
        "folgaPorIp": 296,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

## `verify:deploy` contra alvo LOCAL simulado

O backend real em `NODE_ENV=production`, servindo o `dist/`, contra o
PostgreSQL LOCAL, na porta 3999, sem chave de IA. O alvo e `http://`, entao o
D2 TEM de reprovar: nao ha TLS local.

```text
[alvo] NutriScan API v0.10.0 ouvindo na porta 3999

verify:deploy - alvo http://127.0.0.1:3999
versao do repositorio: 0.10.0

[PASS        ] D1  versao no ar igual a do repositorio
                ambos declaram 0.10.0
[FAIL        ] D2  resposta por HTTPS, e http:// redireciona
                o alvo foi informado como http:// - o deploy precisa responder por HTTPS
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 400) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE do verify:deploy: 1 ===
```

## `verify:deploy` contra o deploy REAL

Somente leitura, contra `https://nutriscan-h1wp.onrender.com`.

```text

> nutriscan@0.10.0 verify:deploy
> node scripts/verify-deploy.js https://nutriscan-h1wp.onrender.com

verify:deploy - alvo https://nutriscan-h1wp.onrender.com
versao do repositorio: 0.10.0

[FAIL        ] D1  versao no ar igual a do repositorio
                repositorio declara 0.10.0 e o deploy anuncia 0.7.0
[PASS        ] D2  resposta por HTTPS, e http:// redireciona
                HTTPS responde, e http:// redireciona (301) para https://
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy
=== EXIT CODE: 1 ===
```

O D1 reprova porque o servico no ar roda a 0.7.0 - as versoes 0.7.1 a 0.10.0
nunca foram publicadas. Os sete PASS medem a 0.7.0 e **nao provam nada sobre a
0.10.0**. O `scripts/verify-deploy.js` nao mudou uma linha nesta versao, e as
rotas novas de comparacao sao `POST`: ele nao as toca.

## O que este relatorio NAO prova

- A leitura da camera em aparelho real: **NAO EXECUTADO**.
- O deploy real da 0.10.0: **NAO EXECUTADO**.
- HTTPS da 0.10.0: **NAO COMPROVADO** - o alvo simulado nao tem TLS.
- A explicacao da comparacao contra o modelo REAL: **NAO EXECUTADO**. O gate a
  exercita com modelo simulado; nenhuma chamada paga foi feita com o schema da
  comparacao. Ver o AUDIT_REPORT.

## E2E da v0.9.0 - 2026-10-16

## Resultado geral

```text
verify:e2e                 PASS, exit code 0 - na execucao FINAL; houve tres (ver abaixo)
doctor:e2e                 PASS - "Migrations - 4/4 applied"
e2e:strict                 PASS, mode=strict, ok=true
requisitos strict          21 de 21 em PASSED - os 20 da v0.8.0 e o novo
severityVerdict            PASSED
PostgreSQL real            EXECUTADO - banco de producao (o mesmo das versoes anteriores)
Claude real                EXECUTADO - 2 chamadas pagas na execucao final
residuo no banco           0

migration 004 no banco     APLICADA no banco de producao, por decisao do dono (ver abaixo)
verify:deploy simulado     FAIL, exit code 1 - 7 PASS, D2 FAIL (alvo http, sem TLS)
verify:deploy REAL         FAIL, exit code 1 - 7 PASS, D1 FAIL (no ar 0.7.0)

camera em hardware         NAO EXECUTADO
deploy real da 0.9.0       NAO EXECUTADO - nada foi publicado
```

Nenhum resultado foi herdado. Os PASS das versoes anteriores estao preservados
na secao historica e nao valem para esta versao.

## Tres execucoes, e por que

```text
1a  FAIL  doctor strict: migration 004 pendente no banco do gate
2a  FAIL  a API temporaria subiu com database=error; a chamada real do visitante falhou
3a  PASS  mesmo codigo, mesmo comando
```

### A primeira: a migration nova ainda nao estava no banco

```text
[FAIL] strict requirement: Migrations - pending 004_nivel_de_alerta.sql - run npm run db:migrate
[FAIL] Doctor strict-e2e - 1 requisito(s) obrigatorio(s) ausente(s)
[FAIL] doctor:e2e - exit code 1
[FAIL] verify:e2e - o gate exige 2 etapa(s) executada(s), recebeu 1
=== EXIT CODE: 1 ===
```

O doctor em modo strict exige as migrations aplicadas no banco do gate antes de
rodar - e o banco do gate e o de producao, que a 0.7.0 no ar tambem usa. Nenhuma
chamada a IA foi feita.

Aplicar a 004 la e mudar o schema de producao antes de qualquer publicacao. **A
decisao foi do dono do projeto**, perguntado antes. O que pesou: a 004 so
acrescenta uma coluna com padrao e uma restricao; o codigo da 0.7.0 so faz
`SELECT allergy_id`, `DELETE` e `INSERT (user_id, allergy_id)` em
`user_allergies` (conferido no commit `694c6c2`), entao o padrao preenche
`standard` e a restricao aceita; e e reversivel com `DROP COLUMN`. Foi o mesmo
caminho da 003 na v0.7.4.

Aplicada com o runner do proprio projeto, que imprime so o nome dos arquivos:

```text
> nutriscan-backend@0.9.0 db:migrate
> node scripts/migrate.js
skip 001_initial_schema.sql
skip 002_history_favorites.sql
skip 003_canonicaliza_upca.js
applied 004_nivel_de_alerta.sql
=== EXIT: 0 ===
```

Lido de volta do catalogo, so leitura:

```text
coluna   alert_level  text  NOT NULL  DEFAULT 'standard'
check    user_allergies_alert_level_check
         CHECK ((alert_level = ANY (ARRAY['standard'::text, 'strict'::text])))
dados    as 7 alergias que ja existiam: todas 'standard'
FKs      product_favorites, product_history, sessions, user_allergies: todas CASCADE
```

As 7 alergias existentes ficaram `standard`: a regra da migration conferida em
dado real. E o servico no ar continuou de pe depois dela:

```text
GET https://nutriscan-h1wp.onrender.com/api/health
status ok | database connected | ai configured | versao 0.7.0
(campos da resposta JSON, reescritos em texto: o bloco desta versao so carrega
JSON da propria 0.9.0, regra do teste T9c)
```

### A segunda: falha de rede, sem causa no log

```text
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3100
[OK] health - status=degraded database=error ai=configured
[WARN] assistant guest - adiado - chamada real da Anthropic (visitante) falhou
[FAIL] E2E real - PostgreSQL nao conectado (health.database=error); modo strict exige banco real
[FAIL] e2e:strict - exit code 1
=== EXIT CODE: 1 ===
```

O gate aplicou as migrations (o banco respondeu) e, segundos depois, a API
temporaria viu o banco com erro; a chamada real do visitante tambem falhou -
`anthropicCalls: 1`. O log nao traz a causa, e ela **nao foi comprovada**. Logo
depois, tres `SELECT 1` no banco responderam em cerca de 200 ms cada, e a API da
Anthropic respondia; a explicacao mais provavel, e nao medida, e uma falha de
rede passageira. O gate reprovou corretamente: nao aprovou nada que nao
executou.

A terceira rodou com o mesmo codigo e o mesmo comando, sem nenhuma mudanca no
gate. Somando as tres, foram ate 3 chamadas pagas (1 na segunda, 2 na terceira).

## Como rodou

```text
PORT=3100 RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

`PORT=3100` pelo mesmo motivo das versoes anteriores: `127.0.0.1:3000` continua
ocupado por outro projeto do dono, que nao foi tocado. A porta e configuracao de
ambiente; nenhum arquivo do gate foi alterado para isso.

## Saida literal do gate - a execucao final

Os blocos de aviso de SSL do driver `pg` foram suprimidos desta transcricao; sao
o mesmo aviso registrado desde a v0.7.2, sobre a semantica futura de `sslmode`.
Todo o resto e literal, inclusive o JSON.

```text
> nutriscan@0.9.0 verify:e2e
> node scripts/verify-e2e.js

[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
NutriScan Doctor - modo STRICT E2E (C:\Users\diego\OneDrive\Área de Trabalho\PJ)
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 4/4 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3100
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3100
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] severity verdict - alerta maximo: urgent no declarado, caution no traco; padrao igual a v0.8.0; modelo negando nao derruba o piso
[OK] account export - tudo de A, nada do vizinho, nada de senha nem de sessao
[OK] account deletion - senha errada nao apaga; senha certa apaga tudo; sessoes caem; vizinha intacta
[OK] auth - register, me, allergies, login, logout idempotente
{
  "version": "0.9.0",
  "mode": "strict",
  "startedAt": "2026-10-16T10:51:24.612Z",
  "finishedAt": "2026-10-16T10:51:58.870Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "severityVerdict": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 7,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 33,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 17,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 283,
        "tetoPorIp": 3000,
        "folgaPorIp": 2983,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
accountExport           PASSED
accountDeletion         PASSED
severityVerdict         PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

`anthropicCalls: 2`, `anthropicReal: EXECUTED_GENERIC_AND_PRODUCT`, `ok: true`.

## O que o subgate novo confere

**severityVerdict** - com a conta A do gate:

- grava pela API real `{ allergies: ["milk", "peanut"], alertLevels: { peanut: "strict" } }`
  e exige de volta `{ milk: "standard", peanut: "strict" }`;
- le o perfil por OUTRO aparelho da mesma conta (clientB) e exige o mesmo nivel;
- pergunta ao assistente, com o codigo do backend lendo o perfil do PostgreSQL,
  sobre quatro produtos. O modelo e SIMULADO e responde `safety: "normal"` nos
  quatro - e a unica forma de forcar o modelo a negar o conflito, e nao custa
  chamada paga. O que se confere e o que chegaria ao cliente:

```text
amendoim (alerta maximo) declarado    status conflict, piso urgent, safety urgent,
                                      conflito com origin "declared" e alertLevel "strict"
amendoim (alerta maximo) em traco     status conflict, piso caution, safety caution,
                                      conflito com origin "traces" e alertLevel "strict"
leite (alerta padrao) declarado       safety caution; conflito exatamente {id, label},
                                      sem campo novo; o texto do alerta da v0.8.0
leite (alerta padrao) em traco        status traces, sem conflito, sem piso,
                                      safety "normal" do modelo mantido - como na v0.8.0
```

O subgate nao faz requisicao a nenhum balde limitado: grava e le o perfil, que
nao passa por limitador, e chama o assistente dentro do processo.

## Contagem de requisicoes do gate por balde

```text
balde        usado   teto/usuario     teto/IP   margem maxima (50%)   dentro
assistente      2             20           -              10          sim
auth            7             40           -              20          sim
colecoes       17            300        3000             150          sim
exportacao      1              5          20               2          sim
```

Nenhum balde estourou. Os numeros sao os da v0.8.0: o subgate novo nao gasta
nenhum.

## Limpeza do banco depois do gate

Conferida por script proprio, que usa o pool do backend e so imprime contagens -
a string de conexao nunca e lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           1
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO (com sobreposicao entre padroes): 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

As quatro contas e a sessao que restam nao batem com nenhum padrao de teste. O
gate cria e apaga so contas `nutriscan-e2e-*`.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore`, entao NAO vai no ZIP. Conteudo integral da
execucao final:

```json
{
  "version": "0.9.0",
  "mode": "strict",
  "startedAt": "2026-10-16T10:51:24.612Z",
  "finishedAt": "2026-10-16T10:51:58.870Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "severityVerdict": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 7,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 33,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 17,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 283,
        "tetoPorIp": 3000,
        "folgaPorIp": 2983,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

## `verify:deploy` contra alvo LOCAL simulado

O backend real em `NODE_ENV=production`, servindo o `dist/`, contra o
PostgreSQL LOCAL, na porta 3999, sem chave de IA. O alvo e `http://`, entao o
D2 TEM de reprovar: nao ha TLS local.

```text
[alvo] NutriScan API v0.9.0 ouvindo na porta 3999

verify:deploy - alvo http://127.0.0.1:3999
versao do repositorio: 0.9.0

[PASS        ] D1  versao no ar igual a do repositorio
                ambos declaram 0.9.0
[FAIL        ] D2  resposta por HTTPS, e http:// redireciona
                o alvo foi informado como http:// - o deploy precisa responder por HTTPS
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 400) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE do verify:deploy: 1 ===
=== EXIT (script): 1 ===
```

## `verify:deploy` contra o deploy REAL

Somente leitura, contra `https://nutriscan-h1wp.onrender.com`.

```text

> nutriscan@0.9.0 verify:deploy
> node scripts/verify-deploy.js https://nutriscan-h1wp.onrender.com

verify:deploy - alvo https://nutriscan-h1wp.onrender.com
versao do repositorio: 0.9.0

[FAIL        ] D1  versao no ar igual a do repositorio
                repositorio declara 0.9.0 e o deploy anuncia 0.7.0
[PASS        ] D2  resposta por HTTPS, e http:// redireciona
                HTTPS responde, e http:// redireciona (301) para https://
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy
=== EXIT CODE: 1 ===
```

O D1 reprova porque o servico no ar roda a 0.7.0 - as versoes 0.7.1 a 0.9.0
nunca foram publicadas. Os sete PASS medem a 0.7.0 e **nao provam nada sobre a
0.9.0**.

## O que este relatorio NAO prova

- A leitura da camera em aparelho real: **NAO EXECUTADO**.
- O deploy real da 0.9.0: **NAO EXECUTADO**.
- HTTPS da 0.9.0: **NAO COMPROVADO** - o alvo simulado nao tem TLS.
- A causa da falha da segunda execucao: **NAO COMPROVADA**.

## E2E da v0.8.0 - 2026-10-12

## Resultado geral

```text
verify:e2e                 PASS, exit code 0 - uma execucao, sobre o codigo entregue
doctor:e2e                 PASS - "Migrations - 3/3 applied"
e2e:strict                 PASS, mode=strict, ok=true
requisitos strict          20 de 20 em PASSED - os 18 da v0.7.6 e os 2 novos
accountExport              PASSED
accountDeletion            PASSED
PostgreSQL real            EXECUTADO - banco de producao (o mesmo das versoes anteriores)
Claude real                EXECUTADO - 2 chamadas pagas
residuo no banco           0

verify:deploy simulado     FAIL, exit code 1 - 7 PASS, D2 FAIL (alvo http, sem TLS)
verify:deploy REAL         FAIL, exit code 1 - 7 PASS, D1 FAIL (no ar 0.7.0)

camera em hardware         NAO EXECUTADO
deploy real da 0.8.0       NAO EXECUTADO - nada foi publicado
```

Nenhum resultado foi herdado. Os PASS das versoes anteriores estao preservados
na secao historica e nao valem para esta versao.

## Como rodou

```text
PORT=3100 RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

`PORT=3100` pelo mesmo motivo da v0.7.6: `127.0.0.1:3000` continua ocupado por
outro projeto do dono (`next start -H 127.0.0.1`), que nao foi tocado. A porta
e configuracao de ambiente - o gate le `env.port` -, e nenhum arquivo do gate
foi alterado para isso.

O `doctor:e2e` agora diz `3/3 applied`. Ate a v0.7.6 ele dizia
`2/2 applied, 1 unknown in database`, porque so contava migrations `.sql` e a
`003` e `.js` - a correcao autorizada pelo dono entrou nesta versao.

## Saida literal do gate

Os dois blocos de aviso de SSL do driver `pg` (9 linhas cada) foram suprimidos
desta transcricao; sao o mesmo aviso registrado desde a v0.7.2, sobre a
semantica futura de `sslmode`. Todo o resto e literal, inclusive o JSON.

```text
> nutriscan@0.8.0 verify:e2e
> node scripts/verify-e2e.js

[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
NutriScan Doctor - modo STRICT E2E (C:\Users\diego\OneDrive\Área de Trabalho\PJ)
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 3/3 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3100
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3100
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] account export - tudo de A, nada do vizinho, nada de senha nem de sessao
[OK] account deletion - senha errada nao apaga; senha certa apaga tudo; sessoes caem; vizinha intacta
[OK] auth - register, me, allergies, login, logout idempotente
{
  "version": "0.8.0",
  "mode": "strict",
  "startedAt": "2026-10-12T05:50:45.465Z",
  "finishedAt": "2026-10-12T05:51:01.513Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 7,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 33,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 17,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 283,
        "tetoPorIp": 3000,
        "folgaPorIp": 2983,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
accountExport           PASSED
accountDeletion         PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

`anthropicCalls: 2`, `anthropicReal: EXECUTED_GENERIC_AND_PRODUCT`, `ok: true`.

## O que os dois subgates novos conferem

**accountExport** - a conta A exporta, depois que a conta de isolamento (a
vizinha, `nutriscan-e2e-b-*`) gravou um historico proprio:

- formato `nutriscan-dados-do-titular`, versao 1, e o e-mail e o de A;
- as alergias de A vieram, e o produto do historico de A esta no arquivo;
- o e-mail da vizinha, o codigo e o nome do produto dela NAO estao no arquivo;
- o `password_hash`, o `password_salt` e o `token_hash` de A - lidos do
  banco, pelo VALOR - e o cookie de sessao de A NAO estao no arquivo;
- nenhum campo chamado `password`, `password_hash`, `password_salt`,
  `token`, `token_hash` ou `cookie`;
- `Cache-Control: no-store`, e o nome do arquivo no formato
  `nutriscan-meus-dados-AAAA-MM-DD.json`, sem o e-mail.

**accountDeletion** - uma conta D criada pelo proprio gate
(`nutriscan-e2e-d-<carimbo>@example.test`), com alergia, historico, favorito e
um segundo aparelho logado:

- senha errada: 403, e D continua em `users`;
- senha certa: 200;
- o cookie antigo de D e o segundo aparelho de D: 401 em `/auth/me`;
- para cada tabela que o catalogo do PostgreSQL lista com chave estrangeira para
  `users`, nenhuma linha com o id de D; e D nao esta em `users`;
- A, a vizinha, continua autenticada, com o mesmo numero de itens de historico.

O e-mail de D entra na limpeza do gate junto com os de A e B, antes e depois da
execucao.

## Contagem de requisicoes do gate por balde

```text
balde        usado   teto/usuario   teto/IP   margem maxima (50%)   dentro
assistente       2         20           -            10              sim
auth             7         40           -            20              sim
colecoes        17        300        3000           150              sim
exportacao       1          5          20             2              sim
```

O balde novo e o da exportacao: o gate exporta uma vez. As duas tentativas de
exclusao (senha errada e senha certa) caem no balde `auth`, junto com
cadastros e logins - e o limitador que a rota usa. Nenhum balde estourou.

## Limpeza do banco depois do gate

Conferida por script proprio, que usa o pool do backend e so imprime contagens -
a string de conexao nunca e lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           1
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO (com sobreposicao entre padroes): 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

As quatro contas e a sessao que restam nao batem com nenhum padrao de teste. O
gate cria e apaga so contas `nutriscan-e2e-*`.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore` (`.gitignore:19`), entao NAO vai no ZIP. Conteudo
integral desta execucao:

```json
{
  "version": "0.8.0",
  "mode": "strict",
  "startedAt": "2026-10-12T05:50:45.465Z",
  "finishedAt": "2026-10-12T05:51:01.513Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "accountExport": "PASSED",
  "accountDeletion": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 7,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 33,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 17,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 283,
        "tetoPorIp": 3000,
        "folgaPorIp": 2983,
        "dentroDaMargem": true
      },
      {
        "balde": "exportacao",
        "usado": 1,
        "teto": 5,
        "margemMaxima": 2,
        "folga": 4,
        "tetoPorIp": 20,
        "folgaPorIp": 19,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

## `verify:deploy` contra alvo LOCAL simulado

O backend real em `NODE_ENV=production`, servindo o `dist/`, contra o
PostgreSQL LOCAL, na porta 3999, sem chave de IA. O alvo e `http://`, entao o
D2 TEM de reprovar: nao ha TLS local.

```text
[alvo] NutriScan API v0.8.0 ouvindo na porta 3999

verify:deploy - alvo http://127.0.0.1:3999
versao do repositorio: 0.8.0

[PASS        ] D1  versao no ar igual a do repositorio
                ambos declaram 0.8.0
[FAIL        ] D2  resposta por HTTPS, e http:// redireciona
                o alvo foi informado como http:// - o deploy precisa responder por HTTPS
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 400) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE do verify:deploy: 1 ===
=== EXIT (script): 1 ===
```

O D6 mede 400: no codigo desta versao, o JSON quebrado da sonda e erro do
cliente desde a v0.7.6.

## `verify:deploy` contra o deploy REAL

Somente leitura, contra `https://nutriscan-h1wp.onrender.com`.

```text

> nutriscan@0.8.0 verify:deploy
> node scripts/verify-deploy.js https://nutriscan-h1wp.onrender.com

verify:deploy - alvo https://nutriscan-h1wp.onrender.com
versao do repositorio: 0.8.0

[FAIL        ] D1  versao no ar igual a do repositorio
                repositorio declara 0.8.0 e o deploy anuncia 0.7.0
[PASS        ] D2  resposta por HTTPS, e http:// redireciona
                HTTPS responde, e http:// redireciona (301) para https://
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy
=== EXIT CODE: 1 ===
```

O D1 reprova porque o servico no ar roda a 0.7.0 - as versoes 0.7.1 a 0.8.0
nunca foram publicadas. O D6 no ar ainda mede 500: codigo antigo. Os sete PASS
medem a 0.7.0 e **nao provam nada sobre a 0.8.0**. As rotas de conta nao foram
tocadas no deploy real: o `verify:deploy` nao as testa, de proposito.

## O que este relatorio NAO prova

- A leitura da camera em aparelho real: **NAO EXECUTADO**.
- O deploy real da 0.8.0: **NAO EXECUTADO**.
- HTTPS da 0.8.0: **NAO COMPROVADO** - o alvo simulado nao tem TLS.

## E2E da v0.7.6 - 2026-10-12

## Resultado geral

```text
verify:e2e                 PASS, exit code 0 - na execucao FINAL, sobre o codigo
                           entregue; houve tres execucoes (ver abaixo)
doctor:e2e                 PASS
e2e:strict                 PASS, mode=strict, ok=true
PostgreSQL real            EXECUTADO - Neon de producao
Claude real                EXECUTADO - 2 chamadas pagas
residuo no banco           0

verify:deploy simulado     FAIL, exit code 1 - 7 PASS, D2 FAIL (alvo http, sem TLS)
verify:deploy REAL         FAIL, exit code 1 - 7 PASS, D1 FAIL (no ar 0.7.0)

camera em hardware         NAO EXECUTADO
```

Nenhum resultado foi herdado. Os PASS das versoes anteriores estao preservados
na secao historica e nao valem para esta versao.

## Tres execucoes, e por que

```text
1a  FAIL  porta 3000 ocupada por outro projeto do dono - detalhe abaixo
2a  PASS  PORT=3100; dependencias ainda com proxy-addr 2.0.7
3a  PASS  PORT=3100; codigo FINAL, com proxy-addr 2.0.8 e source-map-js 1.2.2
```

Entre a segunda e a terceira, o `npm audit` apontou dois alertas novos, um em
cada pacote, e a correcao trocou o `proxy-addr` - a biblioteca que o Express usa
para calcular o `req.ip` atras de proxy. Um resultado obtido com a dependencia
antiga nao vale para o codigo entregue, entao o gate rodou de novo. As linhas de
status da segunda e da terceira sao identicas (41 de 41, conferido); muda so o
horario no JSON. A transcricao e o JSON abaixo sao da TERCEIRA. As duas que
passaram fizeram 2 chamadas pagas cada - 4 no total.

### A primeira reprovou

```text
[RUN] backend - iniciando API temporaria na porta 3000
[FAIL] E2E real - API nao respondeu /health: health check timed out after 30000ms (HTTP 404)
NutriScan API v0.7.6 ouvindo na porta 3000
[FAIL] e2e:strict - exit code 1
[FAIL] verify:e2e - e2e:strict falhou com exit code 1
```

`ok: false`, `anthropicCalls: 0`, e todos os subgates de fluxo - de `database`
a `privacy` - em `NOT_EXECUTED`; so `backendProcess` (STARTED_BY_RUNNER) e
`migrations` (EXECUTED_IDEMPOTENT) chegaram a rodar. O gate nao aprovou nada que
nao executou.

A causa nao era o NutriScan. Investigado antes de tentar de novo:

```text
127.0.0.1:3000  pid 4412  node  inicio 12/10/2026 00:26:10
linha de comando: next start -H 127.0.0.1 --keepAliveTimeout 65000
pasta:            C:\Desenvolvimento Softwares Claude Code\OneDrive Grátis
GET 127.0.0.1:3000/api/health -> 404
```

Outro projeto do dono, ja em execucao nesta maquina, ocupava `127.0.0.1:3000` e
responde 404 em `/api/health` - medido. O backend do gate tambem anunciou "ouvindo
na porta 3000". A explicacao mais provavel, e nao medida, e que os dois
coexistiram em enderecos diferentes da mesma porta, e a checagem de saude, feita
em `127.0.0.1`, caiu no outro processo.

**O outro processo nao foi tocado.** A segunda execucao usou `PORT=3100`,
definida so no comando. O gate le a porta de `env.port`, entao isso e
configuracao de ambiente - nenhum arquivo do gate foi alterado, e o `git diff`
dos arquivos do gate esta vazio.

## Saida literal do gate - a execucao final

Os avisos de SSL do driver `pg` foram suprimidos desta transcricao; sao o mesmo
aviso registrado desde a v0.7.2, sobre a semantica futura de `sslmode`. Todo o
resto e literal.

```text
> nutriscan@0.7.6 verify:e2e
> node scripts/verify-e2e.js
[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
NutriScan Doctor - modo STRICT E2E (C:\Users\diego\OneDrive\Área de Trabalho\PJ)
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 2/2 applied, 1 unknown in database
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3100
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3100
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados

=== EXIT CODE: 0 ===
```

`2/2 applied, 1 unknown in database`: o doctor conta so as migrations `.sql`; a
`003`, em `.js`, aparece como desconhecida. Imprecisao de relatorio ja
registrada na v0.7.5. Nao foi corrigida porque o doctor faz parte do gate, que
esta versao nao pode tocar - a correcao existe e esta guardada fora da versao
(ver AUDIT_REPORT).

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

**Nenhum subgate em SKIP ou NOT_EXECUTED.** `findMissingRequirements` sobre o
arquivo abaixo devolve `[]`.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore` (`.gitignore:19`) e por isso NAO vai no ZIP. E o
da execucao final - cada execucao sobrescreve o da anterior; a que reprovou
esta resumida acima. Conteudo integral:

```json
{
  "version": "0.7.6",
  "mode": "strict",
  "startedAt": "2026-10-12T04:04:37.134Z",
  "finishedAt": "2026-10-12T04:04:53.644Z",
  "baseUrl": "http://127.0.0.1:3100/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 3,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 37,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 12,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 288,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

Gasto por balde identico ao da v0.7.5: colecoes 12, auth 3, assistente 2.

## Residuo no banco apos a execucao

Conferido com o pool do proprio backend, que carrega `backend/.env` sozinho: a
string de conexao nao foi lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           1
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO: 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

**Residuo zero.** As sessoes cairam de 5 para 1 desde a v0.7.5 porque as
expiradas foram limpas; as contas continuam 4.

## `verify:deploy` contra alvo LOCAL simulado

O backend real em `NODE_ENV=production`, servindo o `dist/` desta versao, contra o
PostgreSQL local, com as 12 variaveis definidas explicitamente e
`ANTHROPIC_API_KEY` vazia.

```text
[alvo] NutriScan API v0.7.6 ouvindo na porta 3999

verify:deploy - alvo http://127.0.0.1:3999
versao do repositorio: 0.7.6

[PASS        ] D1  versao no ar igual a do repositorio
                ambos declaram 0.7.6
[FAIL        ] D2  resposta por HTTPS, e http:// redireciona
                o alvo foi informado como http:// - o deploy precisa responder por HTTPS
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 400) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE do verify:deploy: 1 ===
```

O D2 reprova porque nao ha TLS local - comportamento correto. O D6 mede **HTTP
400** em vez do 500 da v0.7.5: e o O2 visivel de ponta a ponta, no processo de
producao.

## `verify:deploy` contra o deploy REAL

O prompt pede NAO EXECUTADO "porque nao ha deploy". Ha: o servico responde e
roda a 0.7.0. O comando e somente leitura, entao foi executado - reportar NAO
EXECUTADO havendo URL seria inventar a ausencia de um resultado.

`https://nutriscan-h1wp.onrender.com`, medido em 2026-10-12 00:57 (-03:00), com
a forma do comando documentada no `docs/DEPLOY.md` (sem `--`):

```text
> nutriscan@0.7.6 verify:deploy
> node scripts/verify-deploy.js https://nutriscan-h1wp.onrender.com

verify:deploy - alvo https://nutriscan-h1wp.onrender.com
versao do repositorio: 0.7.6

[FAIL        ] D1  versao no ar igual a do repositorio
                repositorio declara 0.7.6 e o deploy anuncia 0.7.0
[PASS        ] D2  resposta por HTTPS, e http:// redireciona
                HTTPS responde, e http:// redireciona (301) para https://
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE: 1 ===
```

**Os sete PASS medem a v0.7.0. Nenhum prova nada sobre a v0.7.6**, que nao esta
publicada. O D6 no ar ainda mede 500 - e o codigo antigo, sem a correcao do O2.

## Suite completa do backend

Com `RUN_DB_INTEGRATION_TESTS=true`, contra PostgreSQL 17.10 local, sobre o
codigo final:

```text
ℹ tests 301
ℹ pass 300
ℹ fail 0
ℹ skipped 1
[R11] gasto de colecoes desta suite: 403 de 3000 (folga 7.44x)
=== EXIT CODE: 0 ===
```

A suite cresceu de 276 para 301: 9 testes de sincronia com o `render.yaml`, 9 do
O2 e 7 do checklist de publicacao e do O1.

O unico SKIP:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

Protecao contra chamada paga acidental num `npm test` comum. **NAO EXECUTADO
nao conta como PASS** - a propriedade que ele cobriria foi provada no gate.

A suite pesada **nao** rodou contra o Neon, pela mesma decisao das versoes
anteriores.

Antes de os relatorios desta versao existirem, a mesma suite deu 294 testes com
5 falhas: os quatro testes que exigem AUDIT_REPORT e E2E_REPORT da versao
corrente e o que exige a entrada 0.7.6 no CHANGELOG. Eram as falhas esperadas, e
sumiram com os documentos.

## Validacao por mutacao

```text
mortas 56 | nao executadas 0 | problemas 0 | linha de base: antes verde, depois verde
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Sete mutantes novos, quarenta e nove herdados. Detalhe no AUDIT_REPORT.

## O que NAO foi executado

```text
camera em hardware real          NAO EXECUTADO - exige aparelho com camera
decodificacao optica             NAO EXECUTADO
Open Food Facts real             NAO EXECUTADO - a busca do gate e injetada
v0.7.6 no deploy real            NAO PUBLICADA - o verify:deploy mediu a v0.7.0
HTTPS da v0.7.6                  NAO COMPROVADO - so o deploy real prova
suite de colecoes no Neon        NAO EXECUTADO - por decisao de risco
carga simultanea real            NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA.** Esta versao nao a fecha.

## E2E da v0.7.5 - 2026-10-02

## Resultado geral

```text
verify:e2e                 PASS, exit code 0
doctor:e2e                 PASS
e2e:strict                 PASS, mode=strict, ok=true
PostgreSQL real            EXECUTADO - Neon de producao
Claude real                EXECUTADO - 2 chamadas pagas
residuo no banco           0

verify:deploy simulado     FAIL, exit code 1 - 7 PASS, D2 FAIL (alvo http, sem TLS)
verify:deploy REAL         FAIL, exit code 1 - 7 PASS, D1 FAIL (no ar 0.7.0)

camera em hardware         NAO EXECUTADO
```

Nenhum resultado foi herdado. Os PASS da v0.7.4, da v0.7.3, da v0.7.2 e da
v0.6.8 estao preservados na secao historica e nao valem para esta versao.

**Os dois FAIL do `verify:deploy` sao resultados corretos, e nao foram
contornados.** O simulado nao tem TLS, e o D2 existe para reprovar isso. O real
esta com codigo de outra versao no ar, e o D1 existe para reprovar isso.

## Saida literal do gate E2E

Os avisos de SSL do driver `pg` foram suprimidos desta transcricao; sao o mesmo
aviso registrado na v0.7.2, sobre a semantica futura de `sslmode`. Todo o resto
e literal.

```text
[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
NutriScan Doctor - modo STRICT E2E (C:\Users\diego\OneDrive\Área de Trabalho\PJ)
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 2/2 applied, 1 unknown in database
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3000
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3000
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados

=== EXIT CODE: 0 ===
```

### `2/2 applied, 1 unknown in database`

Na v0.7.4 esta linha dizia `2/2 applied`. A diferenca nao e regressao: o doctor
inspeciona so as migrations `.sql`, e a `003` e `.js`. Na execucao da v0.7.4 o
doctor rodou ANTES de o `e2e:strict` aplicar a `003` no Neon; agora ela ja esta
registrada em `schema_migrations`, e o doctor a ve como desconhecida. O runner,
que conhece as duas extensoes, aplica e pula as tres - e o que diz a linha
`migrations - aplicadas duas vezes (idempotente)`.

O doctor contar so `.sql` e imprecisao de relatorio, anterior a esta versao.
Nao foi alterado: o doctor faz parte do gate E2E, que esta versao nao pode
tocar.

## Tabela de subgates do gate E2E

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

**Nenhum subgate em SKIP ou NOT_EXECUTED.** Os 18 requisitos do modo strict
foram satisfeitos: `findMissingRequirements` sobre este arquivo devolve `[]`.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore` (`.gitignore:19`) e por isso NAO vai no ZIP.
Conteudo integral:

```json
{
  "version": "0.7.5",
  "mode": "strict",
  "startedAt": "2026-10-02T23:50:57.157Z",
  "finishedAt": "2026-10-02T23:51:11.049Z",
  "baseUrl": "http://127.0.0.1:3000/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 3,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 37,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 12,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 288,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

Gasto por balde identico ao da v0.7.4: colecoes 12, auth 3, assistente 2. Esta
versao nao acrescentou requisicao ao gate.

## Residuo no banco apos a execucao

Conferido com o pool do proprio backend, que carrega `backend/.env` sozinho: a
string de conexao nao foi lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           5
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO: 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

**Residuo zero.**

## `verify:deploy` contra alvo LOCAL simulado

O backend real (`node backend/src/server.js`) em `NODE_ENV=production`, servindo
o `dist/` desta versao, contra o PostgreSQL local. As 12 variaveis que o backend
le foram definidas explicitamente, para que o `backend/.env` nao preenchesse
nenhuma lacuna; `ANTHROPIC_API_KEY` vazia.

```text
[alvo] NutriScan API v0.7.5 ouvindo na porta 3999

verify:deploy - alvo http://127.0.0.1:3999
versao do repositorio: 0.7.5

[PASS        ] D1  versao no ar igual a do repositorio
                ambos declaram 0.7.5
[FAIL        ] D2  resposta por HTTPS, e http:// redireciona
                o alvo foi informado como http:// - o deploy precisa responder por HTTPS
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE do verify:deploy: 1 ===
```

O D2 reprova porque nao ha TLS local. Isso e o comportamento correto: o D2 nao
pode aceitar http, e um alvo local nao prova HTTPS. A prova de HTTPS so pode vir
do deploy real.

## `verify:deploy` contra o deploy REAL

`https://nutriscan-h1wp.onrender.com`, medido em 2026-10-02 20:53 (-03:00).
Somente leitura.

```text
verify:deploy - alvo https://nutriscan-h1wp.onrender.com
versao do repositorio: 0.7.5

[FAIL        ] D1  versao no ar igual a do repositorio
                repositorio declara 0.7.5 e o deploy anuncia 0.7.0
[PASS        ] D2  resposta por HTTPS, e http:// redireciona
                HTTPS responde, e http:// redireciona (301) para https://
[PASS        ] D3  cabecalhos de seguranca (HSTS, CSP, nosniff)
                HSTS max-age=31536000, CSP e nosniff presentes
[PASS        ] D4  rota /api inexistente da 404 de API, nao index.html
                404 de API, em JSON
[PASS        ] D5  rota autenticada sem sessao da 401
                4 rotas autenticadas recusam sem sessao com 401
[PASS        ] D6  erro provocado nao vaza stack, SQL nem caminho
                erro provocado (HTTP 500) sem stack, SQL, tabela nem caminho
[PASS        ] D7  o frontend e servido e carrega
                HTML e 2 asset(s) servidos (1 script(s))
[PASS        ] D8  nenhuma chave no HTML nem nos bundles
                3 arquivo(s) inspecionado(s), nenhum segredo

PASS 7 | FAIL 1 | NOT_EXECUTED 0
[FAIL] verify:deploy

=== EXIT CODE: 1 ===
```

**O D1 reprova porque o que esta no ar e a v0.7.0.** Os commits da v0.7.1 a
v0.7.4 nunca foram enviados ao GitHub - `origin/main` esta em `641aa5f` -, entao
o Render nunca os publicou. E o achado R3 da v0.6.9 se repetindo, desta vez pego
por gate.

O que os sete PASS provam, e o que NAO provam: eles medem a v0.7.0 que esta no
ar. HTTPS, cabecalhos, 404 de API, 401 sem sessao, ausencia de vazamento e de
chave valem para AQUELE codigo. **Nenhum deles prova nada sobre a v0.7.5**, que
nao esta publicada. O endurecimento desta versao - `FRONTEND_ORIGIN`
obrigatoria, boot que recusa configuracao incompleta, health sem `aiProvider` -
so pode ser provado no ar depois de publicado, rodando o mesmo comando.

O D6 mediu `500` para JSON quebrado tambem no deploy real. Nao vaza nada, mas o
codigo deveria ser `400` - observacao registrada no AUDIT_REPORT, nao corrigida.

## Suite completa do backend

Com `RUN_DB_INTEGRATION_TESTS=true`, contra PostgreSQL 17.10 local:

```text
ℹ tests 276
ℹ pass 275
ℹ fail 0
ℹ skipped 1
[R11] gasto de colecoes desta suite: 403 de 3000 (folga 7.44x)
=== EXIT CODE: 0 ===
```

A suite cresceu de 238 para 276: 23 testes em `productionHardening.test.js` e 15
em `verifyDeploy.test.js`. A suite de colecoes rodou inteira contra o banco:
32 declarados, 32 verdes.

Uma execucao anterior desta mesma suite, nesta versao, teve **44 falhas**: 4
eram os testes que exigem estes relatorios atualizados, e 40 eram de banco - o
PostgreSQL local estava parado desde 2026-09-20. O banco foi religado e a suite
refeita; o numero acima e o da execucao com o banco de pe. O mesmo banco parado
invalidou tres rodadas de mutacao, descritas no AUDIT_REPORT.

O unico SKIP:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

Protecao contra chamada paga acidental num `npm test` comum. **NAO EXECUTADO
nao conta como PASS** - a propriedade que ele cobriria foi provada no gate, com
duas chamadas reais.

A suite pesada **nao** rodou contra o Neon, pela mesma decisao das versoes
anteriores.

## Validacao por mutacao

```text
mortas 49 | nao executadas 0 | problemas 0 | linha de base: antes verde, depois verde
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Treze mutantes novos, trinta e seis herdados. **Tres rodadas anteriores desta
versao rodaram com o PostgreSQL local parado e nao valem** - detalhe no
AUDIT_REPORT. A rodada acima foi feita sobre o codigo final, depois da ultima
alteracao de teste, e a linha de base verde antes e depois confirma que o banco
estava de pe do comeco ao fim.

## O que NAO foi executado

```text
camera em hardware real          NAO EXECUTADO - exige aparelho com camera
decodificacao optica             NAO EXECUTADO
Open Food Facts real             NAO EXECUTADO - a busca do gate e injetada
v0.7.5 no deploy real            NAO PUBLICADA - o verify:deploy mediu a v0.7.0
HTTPS da v0.7.5                  NAO COMPROVADO - so o deploy real prova, e ela
                                 nao esta no ar
suite de colecoes no Neon        NAO EXECUTADO - por decisao de risco
carga simultanea real            NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA.** Esta versao nao a fecha.

## E2E da v0.7.4 - 2026-09-20

## Resultado geral

```text
verify:e2e          PASS, exit code 0
doctor:e2e          PASS
e2e:strict          PASS, mode=strict, ok=true
manualCodeLookup    PASSED
PostgreSQL real     EXECUTADO - Neon de producao
Claude real         EXECUTADO - 2 chamadas pagas
migration 003       EXECUTADA e idempotente
residuo no banco    0
camera em hardware  NAO EXECUTADO
```

Nenhum resultado foi herdado. Os PASS da v0.7.3, da v0.7.2 e da v0.6.8 estao
preservados na secao historica e nao valem para esta versao.

## Saida literal do gate

```text
[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 2/2 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3000
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3000
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados

=== EXIT CODE: 0 ===
```

`[OK] Migrations - 2/2 applied` conta apenas as `.sql`, que e o que o doctor
inspeciona. A `003`, em JavaScript, e aplicada pelo runner e aparece na linha
`migrations - aplicadas duas vezes (idempotente)`.

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

**Nenhum subgate em SKIP ou NOT_EXECUTED.** Os 18 requisitos do modo strict
foram satisfeitos; o gate nao reportaria PASS se algum tivesse ficado.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore` e por isso NAO vai no ZIP, conforme a secao 11 do
prompt. Conteudo integral:

```json
{
  "version": "0.7.4",
  "mode": "strict",
  "startedAt": "2026-09-21T00:01:47.223Z",
  "finishedAt": "2026-09-21T00:02:03.959Z",
  "baseUrl": "http://127.0.0.1:3000/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 3,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 37,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 12,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 288,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

## A14 - contagem de requisicoes do gate por balde

```text
colecoes      12 de 300 por usuario (margem 150)  e de 3000 por IP
auth           3 de 40  (margem 20)
assistente     2 de 20  (margem 10)
```

Igual a v0.7.3: o subgate de consulta manual ja existia e esta versao nao
acrescentou requisicao. Nenhum limitador foi encostado.

O rotulo `"teto": 300` no balde de colecoes continua se referindo ao teto POR
USUARIO; o orcamento nao mostra o teto por IP de 3000. E imprecisao de
relatorio, herdada da v0.7.1, e corrigi-la custaria outra execucao paga do gate.
A medicao esta correta.

## Residuo no banco apos a execucao

Conferido com o pool do proprio backend, que carrega `backend/.env` sozinho: a
string de conexao nao foi lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           5
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO: 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

**Residuo zero.**

## A migration 003 em producao

```text
003 historico: 0 renomeada(s), 0 fundida(s) | favoritos: 0 renomeada(s), 0 fundida(s)
```

Producao nao tinha nenhuma linha a canonicalizar - as duas tabelas estavam
vazias antes e depois. Os zeros sao o resultado correto e estao registrados
porque silencio nao e prova de que a migration rodou.

## Suite completa do backend

Com `RUN_DB_INTEGRATION_TESTS=true`, contra PostgreSQL 17.10 local:

```text
ℹ tests 238
ℹ pass 237
ℹ fail 0
ℹ skipped 1
[R11] gasto de colecoes desta suite: 403 de 3000 (folga 7.44x)
```

A suite cresceu de 224 para 238: cinco testes de canonicalizacao no schema e
nove na suite de integracao (N1a a N1g).

O unico SKIP:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

Protecao contra chamada paga acidental num `npm test` comum. **NAO EXECUTADO
nao conta como PASS** - e a propriedade que ele cobriria foi provada no gate,
com duas chamadas reais.

## Suite de integracao - PostgreSQL local

A suite pesada **nao** rodou contra o Neon, pela mesma decisao das versoes
anteriores: a trava `RUN_DB_INTEGRATION_TESTS` ficou desligada em toda execucao
apontada para producao.

```text
✔ N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica
✔ N1b favoritar por um formato aparece favoritado pelo outro
✔ N1c requisicao DIRETA ao backend grava a forma canonica
✔ N1d codigo nao-EAN passa intacto pela canonicalizacao
✔ N1e EAN-13 e EAN-8 passam inalterados
✔ N1f a deduplicacao continua funcionando apos a canonicalizacao
✔ N1g a migration canonicaliza linha antiga sem colisao
✔ N1g a migration funde as duas formas pela regra declarada
✔ N1g a migration e idempotente e nao toca codigo nao-EAN
✔ I1 ✔ I2 ✔ I3 (isolamento)   ✔ M10 ✔ M11   ✔ R11
ℹ tests 32, pass 32, fail 0, skipped 0
```

## Validacao por mutacao

```text
mortas 36 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Nove mutantes novos, vinte e sete herdados. Detalhe no AUDIT_REPORT, incluindo
os tres que precisaram de correcao.

## O que NAO foi executado

```text
camera em hardware real        NAO EXECUTADO - exige aparelho com camera
decodificacao optica           NAO EXECUTADO
Open Food Facts real           NAO EXECUTADO - a busca do gate e injetada
suite de colecoes no Neon      NAO EXECUTADO - por decisao, descrita acima
migration 003 com dados reais  NAO EXECUTADO EM PRODUCAO - as tabelas estavam
                               vazias; a logica foi exercitada contra
                               PostgreSQL local, com as duas formas presentes
carga simultanea real          NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA.** Esta versao nao a fecha.

## E2E da v0.7.3 - 2026-09-20

## Resultado geral

```text
verify:e2e          PASS, exit code 0
doctor:e2e          PASS
e2e:strict          PASS, mode=strict, ok=true
manualCodeLookup    PASSED  (subgate novo desta versao)
PostgreSQL real     EXECUTADO - Neon de producao
Claude real         EXECUTADO - 2 chamadas pagas
residuo no banco    0
camera em hardware  NAO EXECUTADO
```

Nenhum resultado foi herdado. O PASS da v0.7.2 e o da v0.6.8 continuam
preservados na secao historica, ao fim deste documento, e nao valem para esta
versao.

## Saida literal do gate

```text
[OK] pre-requisito - Claude real exigido nesta execucao, contra o backend local
[RUN] doctor:e2e
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 2/2 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3000
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3000
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] manual code lookup - digito verificador barra antes da rede; manual e camera dao o mesmo veredito
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados

=== EXIT CODE: 0 ===
```

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
manualCodeLookup        PASSED     <- novo nesta versao
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

**Nenhum subgate em SKIP ou NOT_EXECUTED.** O gate nao reportaria PASS se algum
tivesse ficado: `decideGateOutcome` exige as duas etapas com exit 0, e
`findMissingRequirements` exige os 18 requisitos do modo strict.

### O que `manualCodeLookup` executou

Seis conferencias, contra o backend real e o PostgreSQL real:

```text
1  codigo com digito verificador errado e recusado
   e o contador de busca continua em ZERO - nao houve requisicao de rede

2  UPC-A digitado (036000291452) normaliza para EAN-13 (0036000291452)
   e encontra o produto

3  o MESMO produto pelo caminho da camera devolve objeto identico

4  o perfil vem do PostgreSQL (nao do cliente), o motor marca conflito de
   leite, o piso de risco e "caution", e a origem do veredito e
   "deterministic_engine"
   o veredito do caminho manual e IGUAL ao do caminho da camera

5  requisicao DIRETA ao backend com digito verificador invalido -> HTTP 400
   (sem passar pelo frontend; e esta a barreira que vale)

6  o codigo valido grava no historico, e o item salvo nao carrega
   allergyVerdict, safety, conflicts, verdict nem allergens
```

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore` e por isso NAO vai no ZIP, conforme a secao 13 do
prompt. O conteudo integral fica transcrito aqui:

```json
{
  "version": "0.7.3",
  "mode": "strict",
  "startedAt": "2026-09-20T23:03:04.089Z",
  "finishedAt": "2026-09-20T23:03:19.391Z",
  "baseUrl": "http://127.0.0.1:3000/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "manualCodeLookup": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 3,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 37,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 12,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 288,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

`anthropicCalls: 2` bate com o teto de duas chamadas por execucao.

## A11 - contagem de requisicoes do gate por balde

```text
colecoes      12 de 300 por usuario (margem 150)  e de 3000 por IP
auth           3 de 40  (margem 20)
assistente     2 de 20  (margem 10)
```

Colecoes subiu de 9 para 12: o subgate novo faz tres requisicoes - a gravacao
recusada, a aceita e a leitura de conferencia. Continua dentro da margem, com
folga de 288.

Nenhum limitador foi encostado. O orcamento e fail-closed: passar de metade do
teto lanca antes de `report.ok = true`.

### A mesma imprecisao de relatorio da v0.7.2, ainda presente

O balde `colecoes` mostra `"teto": 300`, que e o teto POR USUARIO. O orcamento
foi escrito na v0.7.1, quando havia um teto so, e nao mostra o teto por IP de
3000. Corrigir exigiria outra execucao do gate - mais duas chamadas pagas - e
nao se justifica por um rotulo.

A medicao esta correta e e o que importa: 12 requisicoes, muito abaixo dos dois
tetos.

## Residuo no banco apos a execucao

Conferido com o proprio pool do backend, que carrega `backend/.env` sozinho: a
string de conexao nao foi lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           5
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO: 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

**Residuo zero.** Os 4 usuarios sao contas reais, anteriores a execucao. O
subgate novo grava no historico e o `cleanupUsers` do runner apaga a conta no
`finally`, levando historico e favoritos junto pela cascata - `product_history`
voltou a zero.

## Suite completa do backend

Com `RUN_DB_INTEGRATION_TESTS=true`, contra PostgreSQL 17.10 local:

```text
ℹ tests 224
ℹ pass 223
ℹ fail 0
ℹ skipped 1
[R11] gasto de colecoes desta suite: 382 de 3000 (folga 7.85x)
```

A suite cresceu de 188 para 224 testes: 16 de `barcode.test.js`, 13 de
`productLookup.test.js`, 4 na suite de integracao (M10 e M11) e 3 no gate
(A10).

O unico SKIP:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental num `npm test` comum. **NAO
EXECUTADO nao conta como PASS** - e a propriedade que ele cobriria foi provada
no gate, com duas chamadas reais.

## Suite de integracao de colecoes - PostgreSQL local

Esta suite **nao** rodou contra o Neon de producao, pela mesma decisao da
v0.7.2: ela grava muito, e a trava `RUN_DB_INTEGRATION_TESTS` existe desde o
incidente da v0.6.6. A flag foi mantida desligada em toda execucao apontada
para o Neon.

```text
✔ H1 ✔ F1 ✔ H2 ✔ H3 ✔ H4 ✔ F2 ✔ F3 ✔ F4  ✔ S1 ✔ S2 ✔ S3
✔ I1 ✔ I2 ✔ I3 ✔ I4 e V1  ✔ A1 ✔ D1
✔ a migration aplica e reaplica sem quebrar
✔ M10 consulta manual grava no historico e deduplica pelo codigo canonico
✔ M10 UPC-A digitado e EAN-13 escaneado viram UMA linha de historico
✔ M10 o backend recusa gravar codigo com digito verificador invalido
✔ M11 visitante nao grava no PostgreSQL pelo caminho manual
✔ R11 o gasto de colecoes desta suite cabe no teto por IP
ℹ tests 23, pass 23, fail 0, skipped 0
```

## Validacao por mutacao

```text
mortas 27 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Treze mutantes novos nesta versao, doze herdados. Detalhe no AUDIT_REPORT.

## O que NAO foi executado

```text
camera em hardware real        NAO EXECUTADO - exige aparelho com camera
decodificacao optica           NAO EXECUTADO - nenhuma imagem foi decodificada
Open Food Facts real           NAO EXECUTADO - a busca do gate e injetada
suite de colecoes no Neon      NAO EXECUTADO - por decisao, descrita acima
carga simultanea real          NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA.** Esta versao nao a fecha.

A busca a Open Food Facts e injetada no subgate de proposito: o que se prova ali
e o NOSSO caminho - conferencia, normalizacao, motor, veredito, gravacao -, nao
a disponibilidade de um terceiro. Um gate que depende da Open Food Facts estar
no ar falharia por motivo alheio ao codigo.

## E2E da v0.7.2 - 2026-09-20

## Resultado geral

```text
verify:e2e          PASS, exit code 0
doctor:e2e          PASS
e2e:strict          PASS, mode=strict, ok=true
PostgreSQL real     EXECUTADO - Neon de producao
Claude real         EXECUTADO - 2 chamadas pagas
residuo no banco    0
```

**Esta e a primeira versao do projeto em que o gate E2E completo fecha.** Ate a
v0.7.1 ele reprovava antes de qualquer chamada, por falta de credencial, e o
relatorio registrava `FAIL BEFORE CALL`. Nenhum resultado aqui foi herdado de
versao anterior.

O PASS historico da v0.6.8 continua preservado na secao historica, ao fim deste
documento, e nao vale para esta versao.

## Saida literal do gate

```text
NutriScan Doctor - modo STRICT E2E
[OK] Node.js - 24.19.0
[OK] npm - 11.17.0
[OK] Frontend dependencies - installed (3 modules resolved)
[OK] Backend dependencies - installed (4 modules resolved)
[OK] backend/.env - found
[OK] Env loader - backend/src/config/env.js
[OK] DATABASE_URL - configured
[OK] PostgreSQL - accessible
[OK] Migrations - 2/2 applied
[OK] ANTHROPIC_API_KEY - configured
[OK] ANTHROPIC_MODEL - claude-sonnet-5
[OK] RUN_ANTHROPIC_INTEGRATION_TESTS - enabled
[OK] Backend port - 3000
[OK] Frontend origin - http://localhost:5173
[WARN] Docker - unavailable (optional)
[OK] Doctor strict-e2e - todos os requisitos obrigatorios atendidos
[OK] doctor:e2e
[RUN] e2e:strict
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3000
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados

=== EXIT CODE: 0 ===
```

`[WARN] Docker - unavailable (optional)` e opcional por desenho e nao bloqueia o
gate: o PostgreSQL usado foi real, nao um contêiner.

## Tabela de subgates

```text
backendProcess          STARTED_BY_RUNNER
database                EXECUTED
migrations              EXECUTED_IDEMPOTENT
auth                    PASSED
sessionSchema           PASSED
multiDevice             PASSED
isolation               PASSED
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
logout                  PASSED
deterministicEngine     PASSED
assistantGuest          PASSED
assistantAuthenticated  PASSED
assistantAuthority      PASSED
fallback                PASSED
privacy                 PASSED
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
```

**`anthropicReal` saiu de `NOT_EXECUTED`.** Na v0.7.1 ele era `NOT_EXECUTED` por
falta de chave; agora registra as duas chamadas reais, uma generica e uma com
produto em conflito sob sessao autenticada.

`historySync`, `favoritesSync` e `verdictFreshness` estao em `PASSED`, contra
banco real.

Nenhum subgate ficou em SKIP ou NOT_EXECUTED. O gate nao reportaria PASS se
algum tivesse ficado - `decideGateOutcome` exige as duas etapas com exit 0, e
`findMissingRequirements` exige os 17 requisitos em modo strict.

## E2E_LAST_RUN.json - conteudo integral

O arquivo esta no `.gitignore` e por isso NAO vai no ZIP, conforme a secao 12 do
prompt. O conteudo integral fica transcrito aqui:

```json
{
  "version": "0.7.2",
  "mode": "strict",
  "startedAt": "2026-09-20T21:17:13.577Z",
  "finishedAt": "2026-09-20T21:17:28.112Z",
  "baseUrl": "http://127.0.0.1:3000/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true,
  "rateLimitBudget": {
    "margem": "no maximo 50% do teto",
    "baldes": [
      {
        "balde": "assistente",
        "usado": 2,
        "teto": 20,
        "margemMaxima": 10,
        "folga": 18,
        "dentroDaMargem": true
      },
      {
        "balde": "auth",
        "usado": 3,
        "teto": 40,
        "margemMaxima": 20,
        "folga": 37,
        "dentroDaMargem": true
      },
      {
        "balde": "colecoes",
        "usado": 9,
        "teto": 300,
        "margemMaxima": 150,
        "folga": 291,
        "dentroDaMargem": true
      }
    ],
    "estouraram": []
  }
}
```

`anthropicCalls: 2` bate com o teto de duas chamadas por execucao. Nenhuma
chamada a mais foi feita.

### Uma imprecisao neste JSON, declarada

O balde `colecoes` mostra `"teto": 300`. Esse numero e o teto POR USUARIO. O
orcamento foi escrito na v0.7.1, quando havia um teto so, e nao foi atualizado
para mostrar tambem o teto por IP de 3000 - corrigi-lo exigiria outra execucao
do gate, ou seja, mais duas chamadas pagas, o que nao se justifica.

A medicao em si esta correta e e o que importa: **9 requisicoes de colecoes**,
muito abaixo dos dois tetos. Fica registrado como ajuste de relatorio para uma
proxima versao.

## Medicao de 4.2 (b): quanto o gate gasta por limitador

```text
colecoes      9 de 300 por usuario e de 3000 por IP
auth          3 de 40
assistente    2 de 20
```

Nenhum limitador foi encostado. O gate e fail-closed quanto a isso: passar de
metade do teto lanca antes de `report.ok = true`.

## 6.4 - residuo no banco apos a execucao

Conferido com o proprio pool do backend, que carrega `backend/.env` sozinho: a
string de conexao nao foi lida nem impressa.

```text
=== CONTAGEM TOTAL NO BANCO ===
users              4
sessions           5
product_history    0
product_favorites  0

=== RESIDUO DE TESTE (deve ser 0 em todas as linhas) ===
gate E2E (e2e-real.js)         nutriscan-e2e-%          0
suite de colecoes              colecoes-test-%          0
suite de integracao antiga     e2e-%@example.test       0
reproducao do E1               repro-e1-%               0
qualquer @example.test         %@example.test           0
qualquer @example.com          %@example.com            0

RESIDUO SOMADO: 0

=== LINHAS ORFAS (cascata da migration) ===
product_history sem dono    0
product_favorites sem dono  0
```

**Residuo zero.** Os 4 usuarios sao contas reais, anteriores a esta execucao. O
`cleanupUsers` do runner roda no `finally`, entao apaga mesmo quando uma etapa
falha, e a cascata `ON DELETE CASCADE` da migration levou historico e favoritos
junto.

## Observacao de ambiente: aviso de SSL do driver

O `pg` emitiu, em toda conexao:

```text
Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'
are treated as aliases for 'verify-full'.
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'
```

E um aviso de depreciacao do driver, nao um erro, e nao afeta o resultado desta
versao: o comportamento atual ja e o mais estrito dos dois. **Nao foi corrigido
aqui de proposito** - a secao 5 do prompt manda descrever em vez de implementar
o que estiver fora do escopo. Fica para decisao do auditor.

## Suite de integracao de colecoes - PostgreSQL local

Esta suite **nao** rodou contra o Neon de producao, por decisao explicita: ela
grava muito - so F4 cria 201 favoritos, e H3 mais de 100 linhas de historico - e
existe uma trava (`RUN_DB_INTEGRATION_TESTS`) criada depois do incidente da
v0.6.6, quando um `npm test` com a string de producao no `.env` deixou linha de
teste em producao. A flag foi mantida desligada em toda execucao apontada para o
Neon.

Contra PostgreSQL 17.10 local:

```text
✔ H1 ✔ F1 ✔ H2 ✔ H3 ✔ H4 ✔ F2 ✔ F3 ✔ F4
✔ S1 ✔ S2 ✔ S3
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
✔ I4 e V1 ✔ A1 ✔ D1
✔ a migration aplica e reaplica sem quebrar
[R11] gasto de colecoes desta suite: 372 de 3000 (folga 8.06x)
✔ R11 o gasto de colecoes desta suite cabe no teto por IP
ℹ tests 19
ℹ pass 19
ℹ fail 0
ℹ skipped 0
```

**R8 confirmado com o teto por IP ligado: 19/19, zero SKIP, zero falha por
quota.** D1 nao voltou.

## Suite do limitador

```text
✔ R1 ✔ R2 ✔ R3
✔ R4 (tres casos)  ✔ R5 (cinco casos)  ✔ R6 ✔ R7
✔ Q2 ✔ Q3 (dois casos) ✔ Q4
ℹ tests 17
ℹ pass 17
ℹ fail 0
ℹ skipped 0
```

## Suite completa do backend

Com `RUN_DB_INTEGRATION_TESTS=true`, contra PostgreSQL 17.10 local:

```text
ℹ tests 188
ℹ pass 187
ℹ fail 0
ℹ skipped 1
ℹ todo 0
=== EXIT CODE: 0 ===
```

O unico SKIP:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental num `npm test` comum. **NAO EXECUTADO
nao conta como PASS** - e, nesta versao, a propriedade que ele cobriria foi
provada no gate, com duas chamadas reais.

### `verify:release` conta SKIP diferente, e isso pode enganar

`verify:release` roda sem a flag de banco, e a partir desta versao existe um
`DATABASE_URL` em `backend/.env`. As suites de banco entao se declaram NAO
EXECUTADO em vez de ausentes:

```text
ℹ tests 188
ℹ pass 163
ℹ fail 0
ℹ skipped 25
[OK] release verification
=== EXIT CODE: 0 ===
```

Os 25 SKIP sao as mesmas suites que passam verdes acima com a flag ligada: 19 de
colecoes, 5 de integracao e 1 da chamada paga. Nao sao regressao e nao contam
como PASS.

## Validacao por mutacao

```text
mortas 14 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Dois mutantes sobreviveram em rodadas anteriores e apontaram defeitos reais nos
testes. Detalhe no AUDIT_REPORT.

## O que NAO foi executado

```text
camera real em aparelho        NAO EXECUTADO - exige hardware
carga simultanea real          NAO EXECUTADO - o limitador foi provado em processo
suite de colecoes no Neon      NAO EXECUTADO - por decisao, descrita acima
```

Nenhum destes foi contornado, simulado ou declarado como aprovado.


## E2E da v0.7.1 - 2026-09-20

## Resultado geral

```text
PostgreSQL real:      EXECUTADO  - PostgreSQL 17.10, porta 5433
integracao (18):      EXECUTADO  - 18 pass, 0 fail, 0 skip
e2e:real:             EXECUTADO  - ok: true
verify-release:       EXECUTADO  - OK
verify:e2e:           FAIL BEFORE CALL (exit 1) - sem ANTHROPIC_API_KEY
Claude real:          NAO EXECUTADO - sem ANTHROPIC_API_KEY
camera real:          NAO EXECUTADO - exige hardware
```

`verify:e2e` reprovou, e isso esta certo. Ele exige chamada real a Claude, e
recusa ANTES de gastar dinheiro:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
[INFO] como habilitar - RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

Um gate bloqueado por ambiente para o trabalho e e reportado. **Ele nao vira
aprovacao.** Esta versao nao afirma ter passado no gate E2E completo.

Esta e a primeira versao em que a suite de integracao roda inteira contra um
banco real. Na v0.7.0 ela nunca rodou: sem banco ficava em SKIP, e com banco
falhava por quota do limitador. Era exatamente o defeito D1.

Nenhum resultado foi herdado de versao anterior. Nenhuma credencial foi
inventada e nenhuma chamada paga foi feita.

## Ambiente

O ambiente de trabalho nao tem Docker nem permissao de administrador, e o
caminho do projeto tem acento - `Área de Trabalho` -, o que faz o `initdb`
recusar com `invalid byte sequence for encoding "UTF8": 0xc1 0x72`. A saida foi
instalar os binarios do PostgreSQL 17.10 fora do caminho acentuado:

```text
binarios   C:\Users\diego\AppData\Local\nutriscan-pg
dados      C:\Users\diego\AppData\Local\nutriscan-pgdata
porta      5433
```

```text
DATABASE_URL=postgresql://nutriscan:nutriscan_dev@localhost:5433/nutriscan
DATABASE_SSL=false
RUN_DB_INTEGRATION_TESTS=true
```

`scripts/dev-db.js` sobe um cluster local para quem quiser reproduzir, e aceita
`DEV_DB_DATA_DIR` para desviar do caminho acentuado.

## Suite de integracao - antes e depois da correcao

ANTES:

```text
ℹ tests 18
ℹ pass 9
ℹ fail 9
```

Primeira falha em F4, e dali em diante sempre a mesma causa:

```text
SyntaxError: Unexpected token 'T', "Too many r"... is not valid JSON
```

DEPOIS:

```text
✔ H1 o historico grava e devolve o item gravado
✔ F1 favoritar e desfavoritar altera apenas a conta que pediu
✔ H2 consultar o mesmo produto de novo atualiza a linha, sem duplicar
✔ H3 o limite de historico e aplicado pela poda mais antiga
✔ H4 limpar o historico nao toca nos favoritos
✔ F2 favoritar o mesmo produto duas vezes nao cria duas linhas
✔ F3 o toggle devolve o estado resultante
✔ F4 o limite de favoritos e aplicado e devolve erro, sem podar (3464.6631ms)
✔ S1 a leitura reflete escrita de outro dispositivo da mesma conta
✔ S2 remocao em um dispositivo some no outro
✔ S3 a ultima escrita vence pelo relogio do servidor
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
✔ I4 e V1 sem sessao valida todas as rotas novas respondem 401
✔ A1 o item salvo nao guarda veredito de alergia
✔ D1 a cota de um usuario nao esgota a cota de outro
✔ a migration aplica e reaplica sem quebrar
ℹ tests 18
ℹ pass 18
ℹ fail 0
ℹ skipped 0
```

**Zero SKIP.** I1, I2 e I3 rodaram e passaram pela primeira vez.

## e2e:real contra PostgreSQL real

```text
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] assistant guest - AI_NOT_CONFIGURED conforme esperado
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] assistant authenticated - rota autenticada alcancada, AI_NOT_CONFIGURED
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] auth - register, me, allergies, login, logout idempotente
```

```json
{
  "version": "0.7.1",
  "mode": "normal",
  "baseUrl": "http://127.0.0.1:3000/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "AI_NOT_CONFIGURED",
  "assistantAuthenticated": "AI_NOT_CONFIGURED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "not_configured",
  "anthropicReal": "NOT_EXECUTED",
  "anthropicCalls": 0,
  "ok": true
}
```

`mode: normal`, e nao `strict`: o modo strict exige `anthropicReal` e
`assistantAuthenticated`, que dependem de uma chave real e de uma chamada paga.
Sem a chave, `npm run e2e:strict` reprova - e esse e o comportamento correto.
**A execucao em modo normal nao substitui a strict e nao e apresentada como
tal.**

## Orcamento de limite medido na execucao

```json
{
  "margem": "no maximo 50% do teto",
  "baldes": [
    { "balde": "assistente", "usado": 2, "teto": 20,  "margemMaxima": 10,  "folga": 18,  "dentroDaMargem": true },
    { "balde": "auth",       "usado": 3, "teto": 40,  "margemMaxima": 20,  "folga": 37,  "dentroDaMargem": true },
    { "balde": "colecoes",   "usado": 9, "teto": 300, "margemMaxima": 150, "folga": 291, "dentroDaMargem": true }
  ],
  "estouraram": []
}
```

Nenhum limitador foi encostado. A margem de 50% existe para que um teste novo
nao descubra o teto do jeito ruim, que foi como a v0.7.0 descobriu.

## Suite completa do backend

```text
ℹ tests 179
ℹ pass 178
ℹ fail 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 56362.9663
```

O unico SKIP, com a propria declaracao:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental. **NAO EXECUTADO nao e PASS.**

## Validacao por mutacao

```text
mortas 8 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Detalhe por mutacao no AUDIT_REPORT, incluindo a que sobreviveu na primeira
rodada e obrigou a refazer um teste.

## Build

```text
npm run build   ✓ built in 15.40s
```

## O que NAO foi executado

```text
Claude real (chamada paga)     NAO EXECUTADO - sem ANTHROPIC_API_KEY
npm run verify:e2e             FAIL BEFORE CALL (exit 1) - depende da chave acima
npm run e2e:strict             NAO EXECUTADO - depende da chave acima
camera real em aparelho        NAO EXECUTADO - exige hardware
Neon em producao               NAO EXECUTADO - testado contra PostgreSQL 17.10 local
carga simultanea real          NAO EXECUTADO - o limitador foi provado em processo
```

Nenhum destes foi contornado, simulado ou declarado como aprovado.


## E2E da v0.7.0 - 2026-09-18

## Resultado geral

```text
PostgreSQL real: NAO EXECUTADO
Claude real:     NAO EXECUTADO
verify:e2e:      FAIL BEFORE CALL (exit 1)
camera real:     NAO EXECUTADO
```

Nenhum resultado foi herdado de versao anterior. O PASS de `verify:e2e`
registrado na v0.6.8, em 2026-08-27, esta preservado na secao historica no fim
deste documento e nao vale para esta versao.

Nenhuma credencial foi inventada e nenhuma chamada paga foi feita.

## Por que o gate reprovou, e por que isso esta certo

```text
DATABASE_URL                        ausente no ambiente de trabalho
ANTHROPIC_API_KEY                   ausente
RUN_ANTHROPIC_INTEGRATION_TESTS     desabilitado
webcam                              inexistente na maquina
```

Saida literal:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
[INFO] como habilitar - RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
exit code 1
```

O gate e fail-closed: sem banco e sem chave ele reprova **antes** de subir
qualquer etapa. Esse e o comportamento correto. Forcar um PASS aqui exigiria
fabricar credencial, o que o projeto proibe.

## Subgates do modo strict

O runner foi executado direto (`npm run e2e:strict`) para registrar o estado de
cada subgate. Saida real do relatorio:

| Subgate | Estado | Motivo |
|---|---|---|
| `backendProcess` | NOT_EXECUTED | runner abortou antes de subir a API |
| `database` | NOT_EXECUTED | `DATABASE_URL` ausente |
| `migrations` | NOT_EXECUTED | depende do banco |
| `auth` | NOT_EXECUTED | depende do banco |
| `sessionSchema` | NOT_EXECUTED | depende do banco |
| `multiDevice` | NOT_EXECUTED | depende do banco |
| `isolation` | NOT_EXECUTED | depende do banco |
| **`historySync`** | **NOT_EXECUTED** | subgate novo, depende do banco |
| **`favoritesSync`** | **NOT_EXECUTED** | subgate novo, depende do banco |
| **`verdictFreshness`** | **NOT_EXECUTED** | subgate novo, depende do banco |
| `logout` | NOT_EXECUTED | depende do banco |
| `deterministicEngine` | NOT_EXECUTED | runner abortou antes |
| `assistantGuest` | NOT_EXECUTED | depende da chave |
| `assistantAuthenticated` | NOT_EXECUTED | depende da chave |
| `assistantAuthority` | NOT_EXECUTED | depende do banco e da chave |
| `fallback` | NOT_EXECUTED | runner abortou antes |
| `privacy` | NOT_EXECUTED | runner abortou antes |
| `anthropicReal` | NOT_EXECUTED | chave ausente, `anthropicCalls: 0` |
| **`ok`** | **false** | |

```text
[FAIL] E2E real - DATABASE_URL nao configurada; modo strict exige PostgreSQL real
exit code 1
```

Nenhum subgate em SKIP foi contado como PASS.

## Os tres subgates novos

Sao separados de proposito. Um unico subgate "colecoes" esconderia qual das tres
promessas quebrou, e o auditor precisa saber se o problema foi sincronizar,
isolar ou recalcular.

```text
historySync        A grava historico, B le, conta isolada nao ve
favoritesSync      o mesmo para favoritos, mais remocao cruzada recusada com 404
verdictFreshness   item salvo sem veredito; mudar o perfil nao altera o registro
```

Sao requisitos BASE em `buildStrictRequirements`, e nao condicionais a flag da
Anthropic: dependem apenas de PostgreSQL. Amarra-los a IA deixaria o gate
aprovar uma execucao sem banco que nunca exercitou sincronizacao.

## Requisitos do modo strict: 14 para 17

Nenhum requisito anterior foi perdido. `backend/tests/e2eGate.test.js` nomeia os
14 que existiam antes desta versao e prova, um a um, que cada um ainda reprova
sozinho quando ausente:

```text
✔ A12: os 14 requisitos anteriores a v0.7.0 continuam exigidos, um a um
✔ A12: os tres requisitos novos tambem reprovam sozinhos
✔ D2: o conjunto de requisitos do modo strict e exatamente este
```

## O que foi executado

### Build

```bash
npm run build
```

SUCCESS.

### Testes

```bash
npm --prefix backend test
```

```text
total   170
passed  146
failed  0
skipped 24
```

Os 24 pulados sao os que exigem PostgreSQL real ou Claude real, cada um com
motivo declarado na saida:

```text
NAO EXECUTADO - PostgreSQL nao disponivel
NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

SKIP nao conta como PASS.

Testes novos desta versao:

```text
backend/tests/collections.test.js             forma do SQL, servicos, migration
backend/tests/collectionsIntegration.test.js  comportamento com banco real (SKIP aqui)
backend/tests/productName.test.js             P1t, residuo de nome
backend/tests/auditThreshold.test.js          P2t, limiar do gate de audit
backend/tests/e2eGate.test.js                 A12, os 14 requisitos antigos
```

### Auditoria de dependencias

```text
npm audit --audit-level=moderate                  0 vulnerabilidades, exit 0
npm --prefix backend audit --audit-level=moderate 0 vulnerabilidades, exit 0
secret scan                                       0 segredos reais
```

Antes da correcao, o backend tinha tres avisos moderate em `qs`. Saida literal
antes e depois esta no AUDIT_REPORT.

### verify:release

```text
[OK] doctor
[OK] frontend build
[OK] backend tests
[OK] frontend audit
[OK] backend audit
[OK] secret scan - 0 real secrets
[OK] release verification
exit code 0
```

### Validacao por mutacao

Oito mutantes, sete mortos, um sobrevivente **provado equivalente** com execucao
lado a lado. Detalhe e prova no AUDIT_REPORT.

### Visitante, verificado no navegador

Com a interface rodando, um visitante abriu um produto e favoritou. A lista de
requisicoes de rede mostra apenas `GET /api/auth/me`; **nenhuma** chamada a
`/api/history` ou `/api/favorites`. Os dois itens ficaram em `localStorage`, um
em cada chave.

Isso e V1 verificado por execucao, e nao apenas por leitura de codigo.

### version:check

```text
node scripts/version-check.js https://nutriscan-h1wp.onrender.com
[FAIL] version:check - repositorio declara 0.7.0 e o deploy anuncia 0.6.8
exit code 1
```

A ferramenta encontrou a divergencia real que motivou a pendencia P4.

## Gates

| Item | Resultado |
|---|---|
| Frontend build | PASS |
| Backend tests | PASS |
| npm audit frontend (moderate) | PASS |
| npm audit backend (moderate) | PASS |
| Secret scan | PASS |
| verify:release | PASS |
| P1t residuo de nome | PASS |
| P2t limiar do gate de audit | PASS |
| A12 os 14 requisitos antigos | PASS |
| Mutacao I1, I2, I3, F3, A1, A2 | PASS (1 equivalente reportado) |
| V1 visitante nao grava no banco | PASS (verificado no navegador) |
| version:check | PASS (detectou divergencia real) |
| PostgreSQL real | NAO EXECUTADO |
| Claude real | NAO EXECUTADO |
| verify:e2e | FAIL BEFORE CALL |
| historySync / favoritesSync / verdictFreshness | NAO EXECUTADO |
| Leitura em camera fisica | NAO EXECUTADO |

## O que NAO foi comprovado neste ambiente

```text
PostgreSQL real        sem DATABASE_URL; H1, F1, F3, S1-S3, I1, I2, D1 em SKIP
Claude real            sem ANTHROPIC_API_KEY
Camera fisica          sem webcam
Docker e WSL           ausentes; opcionais
Carga e concorrencia   fora do escopo
```

A ausencia mais relevante desta versao e o PostgreSQL. As features entregues
sao, por natureza, sobre persistencia e isolamento entre usuarios: o que foi
provado aqui e a forma do SQL e a ordem das decisoes no servico, nao o
comportamento contra um banco de verdade. A bateria comportamental existe,
esta escrita e SKIPa com motivo - ela roda inteira assim que houver
`DATABASE_URL` e `RUN_DB_INTEGRATION_TESTS=true`.


### Execucao da v0.6.9 - 2026-09-18

## Resultado geral

```text
PostgreSQL real: NAO EXECUTADO
Claude real:     NAO EXECUTADO
verify:e2e:      NAO EXECUTADO
camera real:     NAO EXECUTADO
```

Nenhum desses resultados foi herdado da versao anterior. O PASS de `verify:e2e`
registrado na v0.6.8 pertence aquela execucao, em 2026-08-27, e esta preservado
na secao historica no fim deste documento.

Nenhuma credencial foi inventada e nenhuma chamada paga foi feita.

## Por que nao foi executado

```text
DATABASE_URL                        ausente no ambiente de trabalho
ANTHROPIC_API_KEY                   ausente
RUN_ANTHROPIC_INTEGRATION_TESTS     desabilitado
webcam                              inexistente na maquina
```

`verify:e2e` exige PostgreSQL real e Claude real. Sem os dois, o gate reprova
antes de subir qualquer etapa - e reprovar e o comportamento correto dele.
Forcar um PASS aqui exigiria fabricar credencial, o que o projeto proibe.

## O que esta versao mudou, e o que isso implica

A v0.6.9 e uma versao de interface. Ela nao toca em banco, sessao,
autenticacao, motor de alergia nem camada de IA. As areas que `verify:e2e`
exercita saem identicas da v0.6.8.

Isso nao transforma a ausencia em aprovacao. Significa apenas que a lacuna esta
em integracao, e nao nas areas alteradas.

## O que foi executado

### Build

```bash
npm run build
```

SUCCESS. A logo entra no pacote como `dg-nutricao-BXAUdiut.jpg`, 71 KB, e o
simbolo como `dg-simbolo.png`, 36 KB.

### Testes

```bash
npm --prefix backend test
```

```text
total   124
passed  118
failed  0
skipped 6
```

Dezenove testes novos nesta versao:

```text
backend/tests/scannerReliability.test.js       10 testes
backend/tests/openFoodFactsResilience.test.js   9 testes
```

Os 10 de scanner cobrem o defeito D1: erro transitorio de mira nao pode derrubar
a camera, falha real continua fatal, a camera e pedida com resolucao alta e foco
continuo, e a confirmacao exige duas leituras iguais. Um deles carrega as
classes reais da `@zxing/library` e se declara SKIP com mensagem
`NAO EXECUTADO` quando so o backend foi instalado - ambiente ausente e
reportado, nao contornado.

Os 9 de Open Food Facts cobrem D2: retentativa em 503, queda para o endpoint
reserva, ausencia de retentativa no endpoint lento, e 404 respondido na primeira
tentativa por ser resposta definitiva.

Os 6 pulados sao os destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o de integracao real da Anthropic. SKIP
nao conta como PASS.

### Auditoria de dependencias

```text
npm audit --audit-level=high                  0 vulnerabilidades, exit 0
npm --prefix backend audit --audit-level=high 0 vulnerabilidades, exit 0
secret scan                                   0 segredos reais
```

O aviso `high` em `browserslist`, anterior a esta versao, foi resolvido com
`npm audit fix`. O build sai com os mesmos hashes de asset depois da troca.

### Medicao de interface no navegador

Auditoria sobre o que esta renderizado: cor computada de cada elemento contra o
fundo real herdado, e `scrollWidth` contra `clientWidth` para detectar estouro.

```text
320px    7 telas   0 estouros   0 rolagem lateral
375px    7 telas   0 reprovacoes de contraste   menor fonte 15px
1360px   7 telas   0 reprovacoes de contraste   menor fonte 16px
```

### Verificacao funcional contra servicos reais

Executada no site publicado, contra o backend em producao e a API publica da
Open Food Facts:

```text
codigo 7891000100103   produto carregado em 1,0s
busca "iogurte"        resultado em 1,0s
busca "cafe"           11 resultados em 1,0s
busca "bolacha"        11 resultados em 3,3s
```

Antes da correcao D2, a busca por nome falhava em cerca de metade das
tentativas. Seis termos medidos depois da correcao retornaram resultado, entre
1,0s e 3,3s.

### Erros transitorios da camera, com as classes reais

Executado no navegador, importando `@zxing/library` de verdade:

```text
NotFoundException          camera continua ligada
ChecksumException          camera continua ligada
FormatException            camera continua ligada
Error("stream perdido")    camera desliga
```

## Gates

| Item | Resultado |
|---|---|
| Frontend build | PASS |
| Backend tests | PASS |
| npm audit frontend | PASS |
| npm audit backend | PASS |
| Secret scan | PASS |
| verify:release | PASS |
| Contraste e estouro em 3 larguras | PASS |
| Consulta por codigo contra backend real | PASS |
| Busca por nome contra Open Food Facts real | PASS |
| Erros transitorios com classes reais do ZXing | PASS |
| PostgreSQL real | NAO EXECUTADO |
| Claude real | NAO EXECUTADO |
| verify:e2e | NAO EXECUTADO |
| Leitura em camera fisica | NAO EXECUTADO |

## O que NAO foi comprovado neste ambiente

```text
Camera fisica          sem webcam; e a correcao central desta versao
PostgreSQL real        sem DATABASE_URL
Claude real            sem ANTHROPIC_API_KEY
Docker e WSL           ausentes; opcionais, nao exigidos por nenhum gate
Carga e concorrencia   fora do escopo desta versao
Navegadores reais      medicao feita em um unico motor
```

A camera merece destaque: o defeito D1 e sobre leitura de codigo de barras e
nenhuma das verificacoes acima toca em hardware de camera. E o unico item desta
entrega que so pode ser fechado com um telefone na mao.

### Execucao da v0.6.8 - 2026-08-27

Preservada como registro. Os numeros e estados abaixo sao daquela versao.

## Resultado geral

```text
PostgreSQL real: EXECUTADO (Neon, sa-east-1)
Claude real:     EXECUTADO (2 chamadas)
verify:e2e:      PASS
```

Este e o primeiro relatorio do projeto em que `verify:e2e` termina em PASS. Nas
versoes anteriores ele ficou BLOCKED por ambiente, e isso foi registrado como
`NAO EXECUTADO` em vez de aprovado.

Nenhuma credencial foi inventada.

## Ambiente

- Sistema: Windows 11.
- Node.js: 24.15.0 / npm: 11.12.1.
- SDK de IA: `@anthropic-ai/sdk` 0.117.1.
- `DATABASE_URL`: configurada, PostgreSQL gerenciado (Neon).
- `ANTHROPIC_API_KEY`: configurada, somente no backend.
- `RUN_ANTHROPIC_INTEGRATION_TESTS`: habilitado apenas nesta execucao.
- `RUN_DB_INTEGRATION_TESTS`: desabilitado (padrao). Os testes destrutivos de
  banco continuam SKIP em `npm test`.
- Docker e distro WSL: ausentes (opcionais).

## verify:e2e

```bash
RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

Exit code 0.

```text
[OK] doctor:e2e
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3000
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
```

```json
{
  "version": "0.6.8",
  "mode": "strict",
  "startedAt": "2026-08-27T20:30:09.082Z",
  "finishedAt": "2026-08-27T20:30:23.594Z",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true
}
```

Limpeza conferida direto no banco depois da execucao: `usuarios totais: 1`
(a conta real do dono do projeto), `residuo de teste: 0`.

## B2 - diagnostico por execucao

Cenario da auditoria externa reproduzido aqui: PostgreSQL real, migrations
aplicadas, `ANTHROPIC_API_KEY` falsa e `RUN_ANTHROPIC_INTEGRATION_TESTS=true`.

Antes da v0.6.8, o runner abortava na primeira chamada Anthropic e o relatorio
saia com `database: NOT_EXECUTED` mesmo com o banco acessivel.

Depois:

```text
[OK]   migrations, health, deterministic engine, privacy
[WARN] assistant guest - adiado - chamada real da Anthropic (visitante) falhou
[OK]   fallback, session schema, assistant authority
[WARN] assistant authenticated - adiado - chamada real da Anthropic falhou
[OK]   multi-device, isolation, auth
[FAIL] E2E real - falha em etapa dependente da IA: assistant guest ... | assistant authenticated ...
```

```text
database        EXECUTED       (era NOT_EXECUTED)
auth            PASSED
sessionSchema   PASSED
multiDevice     PASSED
isolation       PASSED
logout          PASSED
assistantGuest  NOT_EXECUTED
anthropicReal   NOT_EXECUTED
ok              false
```

O gate continua reprovando. Adiar a falha serve para diagnostico e nunca para
transformar FAIL em PASS: `deferredFailures` e relancado antes de `report.ok` e
antes da avaliacao strict.

## Exploit C1

Reproduzido antes da correcao e bloqueado depois. Saidas completas no
AUDIT_REPORT.

```text
antes   safety "normal", sem veredito         -> falso seguro entregue
depois  safety "caution", veredito do motor   -> exploit bloqueado
```

## Gates

| Item | Resultado |
|---|---|
| Veredito deterministico autoral do servidor | PASS |
| Piso de risco com conflito declarado | PASS |
| Schema `.strict()` rejeita campo do modelo | PASS |
| Interface mostra o veredito acima do texto | PASS |
| Veredito sem IA (fallback) | PASS |
| Autoridade do perfil (PostgreSQL vence request) | PASS |
| Privacidade do payload | PASS |
| Migrations idempotentes | PASS |
| Sessao com `token_hash` e sem token bruto | PASS |
| Multi-dispositivo e isolamento entre contas | PASS |
| Logout idempotente | PASS |
| Claude real, 2 chamadas | PASS |
| Doctor normal e strict | PASS |
| Frontend build | PASS |
| Backend tests | PASS |
| npm audits | PASS |
| Secret scan | PASS |
| **verify:e2e** | **PASS** |

## Build

```bash
npm run build
```

SUCCESS.

## Tests

```bash
npm --prefix backend test
```

```text
total   104
passed  98
failed  0
skipped 6
```

Os 6 pulados sao os testes destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o teste de integracao real da Anthropic.
SKIP nao conta como PASS.

## Audits e secret scan

```text
npm audit --audit-level=high                  0 vulnerabilidades
npm --prefix backend audit --audit-level=high 0 vulnerabilidades
secret scan                                   0 segredos reais
```

## Varredura OpenAI

Nenhuma ocorrencia executavel nova. As que permanecem sao intencionais e estao
descritas no AUDIT_REPORT: testes de regressao que provam a ausencia da flag
antiga, o padrao de secret scan da chave antiga, e o registro historico no
CHANGELOG e nos documentos de arquitetura.

## O que NAO foi comprovado neste ambiente

```text
Docker e WSL           ausentes; opcionais, nao exigidos por nenhum gate
Carga e concorrencia   fora do escopo desta versao
Navegadores reais      T7 renderiza o componente no servidor, nao em browser
```
