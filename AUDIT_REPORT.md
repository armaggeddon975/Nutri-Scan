# Relatorio de Auditoria - NutriScan v0.13.0

Data: 2026-10-30

## Escopo

Entrada 0.12.0, saida 0.13.0. App instalavel e service worker. Minor: o app
passa a abrir sem rede e a poder ser instalado. Nao ha migration, rota nova nem
variavel nova.

**O problema, pelo que era.** A v0.11.0 entregou o modo sem rede - o IndexedDB
guarda produto e perfil, e o veredito e refeito no aparelho -, mas o APP nao era
guardado. Sem rede, o navegador nao buscava o HTML, o JavaScript nem o CSS: o
modo sem rede existia, funcionava, foi auditado e nao tinha como ser alcancado.

**Isto nao e orientacao de saude nem de nutricao.** O relatorio descreve o que
o software faz.

**Preservado (secao 3).** `git diff` contra a v0.12.0 (commit `2399b45`):

```text
shared/ (motor, veredito, comparacao, codigo de barras)   vazio - prova abaixo, A15
src/services/ (cache IndexedDB, consulta, sessao)         vazio
scripts/verify-e2e.js, e2e-real.js, lib/ (gate E2E)       vazio
src/components/assistant/, src/utils/estadoDoVeredito.js  vazio (acessibilidade da v0.12.0)
src/styles.css (arquivo do design)                        vazio
backend/src/                                              1 arquivo: app.js, os cabecalhos do
                                                          sw.js e do manifesto (secao 8.2)
scripts/verify-deploy.js                                  D9 a D12, so leitura (secao 8.2)
```

Codigo da entrega:

```text
NOVO  src/sw/politicaDeCache.js            a decisao: o que pode e o que nunca pode ser guardado
NOVO  src/sw/service-worker.js             o service worker (gerado como /sw.js no build)
NOVO  src/sw/montarServiceWorker.js        o build do sw.js: versao e lista do shell (Node)
NOVO  src/sw/registro.js                   registro, aviso de versao nova, atualizar
NOVO  src/sw/limpezaDoCacheStorage.js      a limpeza do Cache Storage na volta a visitante
NOVO  src/sw/instalacao.js                 o convite para instalar
NOVO  src/components/common/AvisoDeVersaoNova.jsx   o aviso "Há uma versão nova"
NOVO  public/manifest.webmanifest           o manifesto
NOVO  public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
      vite.config.js                       o plugin que gera dist/sw.js
      index.html                           <link rel="manifest">, apple-touch-icon
      src/main.jsx                         desenha o app e SO DEPOIS registra o service worker
      src/App.jsx                          limpeza do Cache Storage na volta a visitante; aviso;
                                           convite; contagem de produtos abertos
      src/pages/Home/HomePage.jsx          o convite para instalar
      src/styles-v070.css                  o aviso (reusa o desenho do aviso "Sem internet")
      backend/src/app.js                   no-cache e tipo do sw.js e do manifesto
      scripts/verify-deploy.js             D9 a D12
```

Testes: `backend/tests/serviceWorker.test.js` (novo, 33 testes),
`backend/tests/helpers/ambienteDoServiceWorker.js` (novo), `verifyDeploy.test.js`
(12 subgates, 4 defeitos novos, o backend real servindo os arquivos) e
`deployDoc.test.js` (D1 a D12 documentados). `scripts/mutation-check.js`: 20
mutantes novos (PW1 a PW20). `esbuild` 0.25.12 virou dependencia de
desenvolvimento declarada - ja vinha instalado com o Vite, na mesma versao; nada
novo foi baixado.

## Estrategia por tipo de recurso

```text
recurso                          estrategia                   por que
/api/* - toda a API              o service worker NAO TOCA    perfil, alergias, historico,
                                 (so rede)                    favoritos, exportacao, comparacao,
                                                              assistente e conta trazem dado de
                                                              saude, sessao e veredito. Sem
                                                              rede, a chamada falha e o app cai
                                                              no caminho sem rede da v0.11.0
/api/health                      o service worker NAO TOCA    diz o estado do servidor AGORA;
                                                              guardado, mentiria
escrita (POST, PUT, DELETE...)   o service worker NAO TOCA    escrita nunca e guardada nem
                                                              repetida (regra da v0.11.0)
outra origem (Open Food Facts)   o service worker NAO TOCA    dado de terceiro, nao confiavel;
                                                              imagem ocupa espaco - decisao 6.1
a pagina (navegacao)             rede primeiro; sem rede ou   online, sempre a versao publicada
                                 apos 4 s, o index.html       (5.4); o shell guardado so entra
                                 guardado DESTA versao        quando a rede nao responde. O HTML
                                                              guardado nunca e regravado pela
                                                              rede: aponta para os arquivos dele
arquivo do build (JS, CSS,       cache primeiro               o nome do arquivo muda a cada
fonte, icone, manifesto)                                      build: o guardado e sempre o certo,
                                                              e servir do cache nao arrisca
                                                              versao velha
qualquer outra coisa da origem   o service worker NAO TOCA    nao e do shell
(/sw.js, caminho desconhecido)
```

Nao ha estrategia unica: a pagina e rede primeiro porque servir HTML velho e o
risco de 5.4; os arquivos do build sao cache primeiro porque o nome deles ja
carrega a versao; e a API nem passa pelo service worker.

## O que NUNCA e guardado, e como a regra e imposta em codigo

A decisao esta num arquivo so, `src/sw/politicaDeCache.js`, usado pelo service
worker E pela limpeza do logout - e e ele que os testes exercitam.

1. **Camada 1 - nao interceptar.** `estrategiaPara` devolve `IGNORAR` para todo
   caminho que comeca com `/api` (sem diferenciar maiuscula: `/API/PROFILE`
   tambem), para escrita e para outra origem. Com `IGNORAR`, o service worker nao
   chama `respondWith`: a requisicao vai a rede como se ele nao existisse, e
   nada dela passa perto do Cache Storage.
2. **Camada 2 - recusar na gravacao.** Toda gravacao, na instalacao e depois,
   passa por `podeGuardar`, que exige: leitura, mesma origem, fora de `/api/`,
   caminho NA LISTA do build, status 200, sem `Set-Cookie`, sem `Cache-Control:
   no-store` ou `private`. Mesmo que a lista do shell incluisse por engano uma
   rota de `/api/`, a gravacao recusa - e o P3 testa exatamente isso.
3. **Exportacao (`/api/account/export`)**: coberta pelas duas camadas, em toda
   grafia (P5). A resposta ainda vem com `no-store` do backend.
4. **Set-Cookie**: no navegador, o service worker nem enxerga esse cabecalho; a
   regra fica para a garantia nao depender disso (P4). E o `index.html` servido
   com Set-Cookie faz a INSTALACAO falhar: nenhum shell com cookie assume.
5. **Veredito**: so viaja em resposta de `/api/` (assistente, comparacao) - logo
   nunca entra (P6).
6. **Chave de API**: vive so no backend e nunca viaja numa resposta; o P18
   procura a forma de chave no `sw.js`, em cada arquivo do build e em tudo o que
   ficou guardado.

Nenhuma resposta de `/api/` foi julgada segura para guardar. Nao ha nada a
decidir ai (secao 5.1).

## Logout e exclusao limpam os dois armazenamentos

`restoreGuestSession` - por onde passam sair, conta excluida e sessao recusada
(401) - chama o `aoPerderSessao()` da v0.11.0 (IndexedDB) e, logo depois,
`limparCacheStorage()` (v0.13.0):

- todo cache cujo nome nao e `nutriscan-shell-*` sai inteiro;
- dentro do cache do shell, sai toda entrada que nao tem a FORMA de arquivo do
  shell - `/index.html`, `/assets/<arquivo>.<js|css|woff2|png|...>` ou um icone/
  manifesto da raiz, sem query string, fora de `/api/`.

O shell fica: nao e de nenhuma conta, e e o que abre o app sem rede para a proxima
pessoa do aparelho. As chamadas que os testes O9 e O10 da v0.11.0 exigem no App
(`aoSairDaConta`, `aoExcluirConta`, `aoPerderSessao`) nao mudaram uma letra.

## Invalidacao por versao

- O nome do cache e `nutriscan-shell-<versao>`; a versao vem do `package.json`,
  posta no `sw.js` pelo plugin do build. Sem versao, `nomeDoCache` lanca.
- Versao nova = `sw.js` com bytes novos. O navegador confere o `sw.js` a cada
  abertura do app: o backend o serve com `no-cache` e o registro usa
  `updateViaCache: "none"`. Com o app aberto por dias (instalado), ele confere
  tambem a cada volta para a tela, no maximo uma vez por hora.
- A versao nova baixa o shell DELA inteiro, num cache novo, ao lado do antigo. Um
  arquivo que falhe faz a instalacao falhar: shell pela metade nao assume.
- Ao assumir, ela apaga todo cache que nao e o dela, e passa a servir.

## Decisao de 5.4 - o momento seguro para atualizar

**A pagina so recarrega por um toque da pessoa.** Nunca sozinha: ela pode estar
no meio de um veredito, de uma comparacao ou digitando um codigo, e recarregar
ali apagaria o que ela le - exatamente o que o prompt proibe.

A versao nova se instala e ESPERA (sem `skipWaiting` na instalacao). Ela assume:

- **sozinha, quando nenhuma aba da versao antiga estiver aberta** - a proxima
  abertura do app. E o momento seguro por definicao: nao ha nada na tela;
- **ou pelo toque em "Atualizar agora"**, no aviso "Há uma versão nova do
  NutriScan. Atualize quando terminar o que está lendo. A tela recarrega." O
  aviso fica no topo do conteudo, sem cobrir o veredito, numa regiao `polite`
  que ja existe na pagina, ate a pessoa atualizar.

Nao ha como ficar preso: o aviso nao some sozinho, e a proxima abertura atualiza
de qualquer jeito. E, com rede, a PAGINA ja vem da rede a cada abertura - o que
espera e o shell guardado para usar sem rede. Uma troca de controle que a pessoa
nao pediu (a primeira instalacao assumindo, outra aba atualizando) nao recarrega
esta aba.

## Decisoes de 6.1 a 6.5

- **6.1 O que cacheia.** O shell: HTML, JavaScript, CSS, fontes, icones,
  manifesto. Nada de `/api/`. `/api/health`: nao (diz o estado de agora).
  Imagens da Open Food Facts: nao - dado de terceiro, nao confiavel, cada imagem
  ocupa espaco, e o modo sem rede da v0.11.0 ja tinha decidido nao guarda-las.
- **6.2 Estrategias.** Tabela acima: rede primeiro com prazo para a pagina,
  cache primeiro para o build, nada para a API.
- **6.3 Manifesto e instalacao.** `name` e `short_name` "NutriScan", `id`,
  `start_url` e `scope` "/", `display: standalone`, `orientation: portrait`,
  `theme_color` `#3d472b` (o `--chrome` do design, o mesmo do `<meta
  theme-color>`), `background_color` `#f5f2ea` (o `--bg`), `lang` pt-BR,
  descricao. Icones: o `nutriscan-icon.svg` que ja existia, e PNG de 192, 512,
  512 maskable e 180 (iPhone), desenhados com a geometria, as cores e a fonte
  (Cormorant Garamond 600) do SVG - nenhuma marca nova. O maskable e o do iPhone
  vao sem cantos, porque o sistema os recorta; o "N" fica dentro da zona segura.
  **Convite**: nao na primeira visita. O `beforeinstallprompt` e segurado (o
  Chrome mostraria uma barra sozinho de cara); o convite aparece na tela Inicio
  so depois de 2 produtos abertos neste aparelho, e "Agora nao" dispensa de vez.
- **6.4 Escopo.** `/sw.js`, escopo `/`: o app vive na raiz (as telas sao
  `#scan`, `#conta`...), entao o escopo tem de incluir `/`. A API tambem fica
  debaixo de `/` e nao da para tira-la do escopo - por isso a regra de `/api/`
  esta no codigo, e o P16 confere o que NAO e interceptado.
- **6.5 Tamanho.** Abaixo.

## Tamanho do shell

Do build real da v0.13.0, medido pelo P17 (os mesmos numeros na suite e na
verificacao do navegador):

```text
pre-carregamento: 22 arquivos, 1169.0 KB
sw.js: 7.9 KB
```

```text
pre-carregado     22 arquivos, 1.169 KB
  JavaScript        3 arquivos, 791 KB  (o app com o React, 358 KB; o leitor de codigo
                                         de barras, 407 KB + 26 KB, carregado so quando
                                         a camera abre)
  CSS               1 arquivo, 43 KB
  fontes            10 WOFF2 (latin e latin-ext), 156 KB
  logo e icones     177 KB (a logo da barra, 134 KB, e o maior)
  index.html e manifesto  2 KB
fora do pre-carregamento   23 arquivos: faixas de fonte que o portugues nao usa
                           (cirilico, grego, vietnamita) e o formato WOFF antigo.
                           Guardados so se pedidos - nenhum navegador atual pede.
```

**Dentro do limite.** 1,17 MB e abaixo de "alguns megabytes": quase tudo e o
proprio JavaScript do app, que o navegador baixaria de qualquer jeito na primeira
abertura. O leitor de codigo de barras entra no pre-carregamento porque sem ele a
camera nao funciona sem rede. O P17 trava o pre-carregamento em **1,5 MB**: folga
para o crescimento normal, e pega inchaco (uma imagem grande, um pacote inteiro).

## Decisoes de 8.1 e 8.2

- **8.1 - sem subgate novo no E2E.** O service worker e comportamento de cliente
  em contexto seguro; o gate E2E roda contra o backend real e nao tem navegador.
  Um subgate ali provaria, no maximo, que o backend serve o `sw.js` - o que o
  `verify:deploy` ja prova melhor. A verificacao fica nos testes que rodam o
  `sw.js` do build real e no navegador. Os 23 requisitos continuam exigidos, um
  a um (A13).
- **8.2 - quatro subgates novos no `verify:deploy`**, todos por GET:
  D9 (o HTML aponta um manifesto da propria origem, servido como manifesto, JSON
  valido, com os campos de instalacao e icones de 192 e 512), D10 (cada icone
  declarado e servido como imagem), D11 (`/sw.js` servido como JavaScript, e nao
  como a pagina do fallback) e D12 (`/sw.js` sem cache longo: no-cache, no-store
  ou max-age=0). D10 depende do D9 e D12 do D11, como o D8 do D7: sem o que
  conferir, NOT_EXECUTED - nunca PASS. O P13 continua verde: o registro de
  requisicoes so tem GET, alem da sonda declarada do D6.

## Como os testes exercitam a logica real de decisao de cache

`serviceWorker.test.js` constroi o app de verdade com o Vite (`vite.build`, a
mesma `vite.config.js`, o mesmo plugin) numa pasta temporaria. O `sw.js` desse
build - com `politicaDeCache.js` dentro - roda num contexto `vm` com os globais
que o navegador da a um service worker, e recebe os eventos de verdade: install,
activate, fetch, message. `Request`, `Response` e `Headers` sao os do Node, que
seguem a especificacao Fetch.

O Cache Storage do teste e um duble que SO GUARDA, com o corpo inteiro: quem
decide o que entra, o que sai e quando e o codigo do service worker. A rede do
teste serve os arquivos desse build e, para `/api/`, respostas com nome, e-mail,
alergia, cookie de sessao e veredito PLANTADOS. Depois, o teste procura esses
dados nas CHAVES e nos CORPOS de tudo que ficou guardado, e confere que cada corpo
guardado e IDENTICO, byte a byte, a um arquivo do build.

A limpeza do logout e testada com o IndexedDB do `fake-indexeddb` (o cache da
v0.11.0, de verdade) e o duble do Cache Storage, os dois com dado plantado; o P7
confere tambem, no fonte do App, que a volta a visitante chama as duas limpezas -
como o O9 da v0.11.0 faz. O P12 e o P13 empacotam o `main.jsx` de verdade com o
esbuild e o rodam com um `navigator` cujo registro falha, lanca ou nao existe:
o app tem de ser desenhado ANTES de qualquer promessa resolver.

O que o duble nao prova - o Cache Storage e o ciclo de vida do navegador - foi
conferido no Chromium, abaixo.

## Verificacao no navegador

Build real (`npm run build`, 0.13.0), servido pelo backend local na porta 3200
(`createApp`, com os cabecalhos novos), contra o PostgreSQL LOCAL, sem chave de
IA, no Chromium do painel do ambiente. `http://127.0.0.1` e contexto seguro para
service worker (a excecao de localhost), entao o service worker de verdade
registrou, instalou e controlou a pagina. O Cache Storage inspecionado e o do
proprio Chromium.

```text
registro            escopo http://127.0.0.1:3200/, script /sw.js, "activated", pagina controlada
cache               "nutriscan-shell-0.13.0", 22 entradas = exatamente o pre-carregamento
cabecalhos          /sw.js: text/javascript; charset=utf-8, Cache-Control no-cache
                    /manifest.webmanifest: application/manifest+json; charset=utf-8, no-cache
```

**P3 e P6 - navegando autenticado.** Conta de teste descartavel criada no app
local (e-mail @example.test, senha gerada dentro da pagina e nunca impressa).
Pela interface: produto aberto (historico gravado), favoritado, comparacao com
dois produtos, tela Meus produtos, alergia Amendoim marcada; pela pagina, a
exportacao dos dados. No servidor: alergias milk e peanut, 1 no historico, 1
favorito. Depois, o Cache Storage do Chromium, cru:

```text
caches                     ["nutriscan-shell-0.13.0"]
entradas                   22, nenhuma de /api/
nome / e-mail / perfil     0 ocorrencias em qualquer chave ou corpo
  ("allergies":["milk","peanut"])
cookie de sessao           0
"milk", "peanut",          so em /assets/index-CICWKpTk.js (4, 2 e 9 vezes): o
allergyVerdict             CODIGO do app - o catalogo de alergias e o nome do campo
SHA-256 de cada corpo      22 de 22 identicos ao arquivo do build em dist/
```

Um corpo identico, byte a byte, a um arquivo do build nao pode ter dado de
ninguem: o build e o mesmo para todo mundo.

**P7 - logout real.** Antes de sair, foram PLANTADOS no Cache Storage, como o
resto de uma versao defeituosa: um cache "dados-da-conta" com /api/history e o
nome da pessoa, e /api/profile com nome e alergias dentro do cache do shell. O
IndexedDB tinha o nome e "peanut". Depois de "Sair da conta" pela interface:

```text
caches         ["nutriscan-shell-0.13.0"] - o plantado saiu
entradas       22, nenhuma de /api/, nenhuma com o nome
IndexedDB      sem o nome, sem o e-mail, sem "peanut"
```

**P8 - exclusao real.** Entrou de novo, plantou-se de novo ("outra-coisa" com
/api/favorites e o nome; /index.html?conta=<e-mail> no cache do shell). "Excluir
minha conta", a caixa "Entendo que nao da para desfazer.", a senha, "Excluir
para sempre":

```text
/api/auth/me   401 - a conta nao existe mais
caches         ["nutriscan-shell-0.13.0"], 22 entradas, nenhuma com query, nenhuma com dado
IndexedDB      sem o nome, sem o e-mail, sem "peanut"
PG local       0 contas sw-verif-* (conferido por consulta)
```

**P1 - sem servidor, de verdade.** O servidor da porta 3200 foi DERRUBADO
(conexao recusada, conferido). A pagina recarregada abriu: o HTML, o
JavaScript, o CSS e a fonte Cormorant Garamond vieram do Cache Storage; o
service worker estava no controle.

**P2 - fim a fim sem rede.** Como visitante, com Leite/lactose marcado, a
Nutella foi aberta com rede (o IndexedDB da v0.11.0 a guardou). Servidor
derrubado, pagina recarregada pelo service worker, e a internet cortada do jeito
que o navegador sinaliza (`navigator.onLine` falso e o evento "offline", feito
no JavaScript da pagina - o Chromium do ambiente nao tem botao de modo aviao).
Busca pelo codigo:

```text
aviso          "Sem internet - O app mostra só o que está guardado neste aparelho."
produto        Nutella, "Do aparelho · guardado em 30/10/2026"
veredito       "Nutella: Conflito com o seu perfil", classe danger
origem         "Verificação do próprio app, feita agora neste aparelho."
anuncio        "Nutella. Conflito com o seu perfil: Contém Leite/lactose."
```

Observacao: so derrubando o servidor, a Nutella ainda vinha da Open Food Facts,
que o app consulta direto do navegador - o servidor do NutriScan fora nao e
"sem internet". O P2 de verdade exigiu cortar os dois.

**P9, P10, P11 - versao nova, de verdade.** Pagina aberta na 0.13.0 e marcada
(variavel na janela). Publicada localmente uma versao de teste
(`0.13.1-verificacao`: o package.json trocado so para o build e restaurado em
seguida). O navegador conferiu o sw.js:

```text
versao nova           instalada e ESPERANDO ("installed"); os dois caches presentes
aviso                 "Há uma versão nova do NutriScan. Atualize quando terminar o
                      que está lendo. A tela recarrega. [Atualizar agora]"
                      na regiao role=status, aria-live=polite
4 s depois            a pagina NAO recarregou (a marca continuava)
toque em Atualizar    a pagina recarregou UMA vez; a nova assumiu ("activated")
depois                caches ["nutriscan-shell-0.13.1-verificacao"] - o da 0.13.0 saiu;
                      /sw.js no ar e o da 0.13.1-verificacao; o aviso sumiu
```

Depois o build da 0.13.0 foi refeito e o navegador voltou a ela pelo mesmo
caminho (aviso, toque): cache unico "nutriscan-shell-0.13.0".

**Ressalva de metodo.** O painel do navegador do ambiente nao desenha quadros
quando a janela esta escondida; parte dos cliques foi feita pelo DOM (o mesmo
botao da tela, `click()`), sem mudar codigo do app.

## A1 - P1 a P18, R1 a R8

Presentes e verdes, sem banco e contra PostgreSQL real - 33 testes em
`backend/tests/serviceWorker.test.js`:

```text
P1 sem rede, o HTML, o JavaScript e o CSS do app vem do cache
P1 com rede, a pagina vem da rede - o shell guardado so entra sem ela
P2 sem rede: o shell abre e o produto guardado volta com o veredito refeito
P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada
P3 navegando autenticado, nenhum Cache Storage guarda resposta de /api/ - chaves e corpos
P4 resposta com Set-Cookie nunca e guardada - nem de /api/, nem de arquivo do shell
P5 /api/account/export nunca e guardada, em nenhuma grafia
P6 o veredito nao aparece em nenhum Cache Storage
P7 logout limpa o Cache Storage e o IndexedDB - os dois conferidos
P8 exclusao de conta limpa o Cache Storage e o IndexedDB - so depois de o servidor confirmar
P7 a limpeza tira o que nao e shell e deixa o shell, pela regra de politicaDeCache
P9 versao nova publicada: o cache antigo e descartado e a versao nova passa a ser servida
P9 a chave do cache e a versao do package.json - no build real
P10 versao nova esperando: o app avisa, e o toque em Atualizar faz ela assumir
P10 versao nova encontrada depois: o aviso aparece; com o app aberto por dias, ele confere de novo
P10 o aviso de versao nova esta na tela, com o botao, e a regiao existe antes dele
P11 a pagina nunca recarrega sozinha: so pelo toque em Atualizar
P11 a versao nova nunca assume sozinha na instalacao - espera
P12 com o registro do service worker falhando, o app carrega e funciona
P13 navegador sem service worker, ou fora de contexto seguro: o app carrega e funciona
P14 manifesto valido, com os campos decididos
P15 todo icone declarado existe no projeto, no tamanho declarado
P16 escopo '/': o service worker so intercepta a pagina e os arquivos do build
P17 o tamanho do shell e reportado e fica dentro do teto
P18 chave de API em nenhum cache de nenhum tipo, nem no sw.js, nem no build
R1 regressao: cache IndexedDB da v0.11.0 sem veredito, logout limpa, perfil atual vence
R2 regressao: acessibilidade da v0.12.0 - estado sem cor, ordem de leitura, aria-live polite
R3 regressao: exploit C1 - o modelo negando o conflito nao entrega falso seguro
R4 regressao: matriz de severidade nos quatro casos
R5 regressao: comparacao sem contaminacao, explicacao amarrada pelo codigo
R6 regressao: sem sessao, exportar, excluir e ler colecoes respondem 401
R7 regressao: digito verificador, UPC-A canonicalizado e tetos da comparacao
R8 regressao: JSON malformado e 400 sem detalhe; rota desconhecida e 404 de API
```

R1 a R8 executam de novo, pelo codigo real, no mesmo arquivo; as suites completas
de cada um seguem no gate, verdes: R1 offline O1-O16; R2 accessibility A1t-A17;
R3 allergyVerdict T1-T8; R4 alertLevel S1-S18; R5 comparison C1t-C16; R6 account
E6-E8 e accountIntegration E1-E8; R7 barcode M1-M12 e N1; R8 bodyParseError
O2a-O2e e productionHardening P5, P9.

O `verifyDeploy.test.js` ganhou os defeitos de D9 a D12 (sem manifesto, manifesto
incompleto, icone faltando, sw.js servido como pagina, sw.js com cache longo), a
prova de que o D11 confere o mesmo caminho que o app registra, e D9 a D12 PASS
contra o `createApp` real servindo um dist com manifesto, icones e sw.js.

## A2 - validacao por mutacao

Rodada completa, com banco, sobre o codigo entregue:

```text
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<PostgreSQL LOCAL> DATABASE_SSL=false \
  node scripts/mutation-check.js --com-banco
```

```text
mortas 158 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde

REPROVADO: ha teste que nao detecta o defeito que deveria detectar.
=== EXIT: 1 ===
```

**159 mutantes: 158 mortos, 1 sobrevivente (W1, o equivalente da v0.8.0), 0 nao
executados.** A linha de base - as 19 suites sem mutacao, incluida a nova
(`tests/serviceWorker.test.js`) - estava verde antes e depois. **Os 20 mutantes
novos morreram todos.** O script sai com codigo 1 por causa do W1, e isso fica
registrado como esta.

### Os mutantes pedidos pelo prompt (P3, P7, P9, P12)

```text
pedido pelo prompt                                   mutante  teste que o pegou  resultado
a regra de rota passa a cachear /api/ tambem         PW1      P3                 MORTA
  (e a segunda camada, a gravacao, deixa de recusar) PW2      P3                 MORTA
o logout deixa de limpar o Cache Storage             PW3      P7                 MORTA
  (e a limpeza deixa de apagar o que nao e shell)    PW4      P7                 MORTA
a chave de cache deixa de incluir a versao do app    PW5      P9                 MORTA
  (e a versao nova deixa de apagar a antiga)         PW6      P9                 MORTA
o app passa a depender do service worker p/ carregar PW7      P12                MORTA
  (e o registro deixa a falha escapar como erro)     PW8      P12                MORTA
```

O que cada um injeta:

- **PW1** - `politicaDeCache.js`: `estrategiaPara` devolve `DO_SHELL` (cache
  primeiro) para `/api/` no lugar de IGNORAR.
- **PW2** - a outra camada: `podeGuardar` deixa de recusar `/api/`. Com as duas
  camadas, cada uma tem o seu mutante - e o P3 pega os dois, porque testa as duas
  separadamente (a gravacao recusa `/api/` mesmo com a rota NA lista do shell).
- **PW3** - `App.jsx`: a volta a visitante deixa de chamar `limparCacheStorage()`.
- **PW4** - `limpezaDoCacheStorage.js`: os caches que nao sao do shell ficam.
- **PW5** - `politicaDeCache.js`: `nomeDoCache` devolve so o prefixo, sem a versao.
- **PW6** - `service-worker.js`: ao assumir, a versao nova nao apaga a antiga.
- **PW7** - `main.jsx`: o app so e desenhado depois de o registro do service
  worker dar certo.
- **PW8** - `registro.js`: o `catch` do registro sai; a falha vira erro solto.

### Os outros doze mutantes novos

```text
PW9   P4   resposta com Set-Cookie passa a poder ser guardada                    MORTA
PW10  P11  a versao nova passa a assumir sozinha na instalacao                   MORTA
PW11  P11  a pagina passa a recarregar em qualquer troca de controle             MORTA
PW12  P3   a regra de /api/ passa a diferenciar maiuscula (/API/ escaparia)      MORTA
PW13  P16  o service worker passa a interceptar outra origem                     MORTA
PW14  P1   sem rede, a pagina deixa de cair no shell guardado                    MORTA
PW15  P5   a exportacao passa a poder ser guardada se estiver na lista do shell  MORTA
PW16  P15  o manifesto passa a declarar um icone que nao existe                  MORTA
PW17  P17  todas as fontes passam a ser pre-carregadas                           MORTA
PW18  8.2  o D12 passa a aceitar service worker com cache longo                  MORTA
PW19  8.2  o D10 deixa de conferir se o icone e servido                          MORTA
PW20  8.2  o backend volta a servir o sw.js com o cache de 1 hora                MORTA
```

Antes da rodada oficial, os 20 foram rodados sozinhos contra as suites deles: 20
mortos. Dois testes foram endurecidos ANTES dessa rodada, porque eu ja via um
mutante passando: o P5 passou a conferir cada grafia da exportacao com ela NA
lista do shell (senao o PW15 sobreviveria), e o P16 passou a incluir outra origem
com o mesmo caminho de um arquivo do shell (senao o PW13 sobreviveria).

### O sobrevivente: W1, o mesmo da v0.8.0

O W1 faz o repositorio da exportacao devolver a linha inteira de `users`, mas o
servico monta o arquivo campo a campo - a exportacao nao muda, e o teste esta
certo em passar. E equivalente, foi descrito na v0.8.0 com a demonstracao de que
a suite estatica (`nunca usa SELECT *`) o pega, e esta versao nao mexeu nele nem
no `mutation-check.js` por causa dele.

### A rodada inteira

Linha de base:

```text
[linha de base - antes] 19 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
  VERDE    tests/comparison.test.js
  VERDE    tests/comparisonIntegration.test.js
  VERDE    tests/offline.test.js
  VERDE    tests/accessibility.test.js
  VERDE    tests/serviceWorker.test.js
```

```text
T1  P2   MORTA                  "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta" falhou, como deveria
T1b  P2   MORTA                  "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost" falhou, como deveria
T2  P5   MORTA                  "P5 erro do driver do banco nao chega ao cliente" falhou, como deveria
T2b  P5   MORTA                  "P5 o detalhe do erro vai para o log do servidor" falhou, como deveria
T3  P9   MORTA                  "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual" falhou, como deveria
T3b  P9   MORTA                  "P9 valor booleano nao reconhecido nao cai em default silencioso" falhou, como deveria
T4  P12  MORTA                  "P12 versao no ar diferente da do repositorio reprova o D1" falhou, como deveria
T5  P13  MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
T5b  P13  MORTA                  "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada" falhou, como deveria
T6  P3   MORTA                  "P3 CORS devolve a origem configurada, nunca a do request" falhou, como deveria
T7  P4   MORTA                  "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha" falhou, como deveria
T8  P11  MORTA                  "P11 NOT_EXECUTED nao conta como PASS no agregado" falhou, como deveria
T9  P11  MORTA                  "P11 o comando de verdade sai com codigo 1 quando um subgate falha" falhou, como deveria
V1  S1/S4 MORTA                  "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO" falhou, como deveria
V1b  S2   MORTA                  "S2 render.yaml nao declara variavel que o codigo nao le" falhou, como deveria
V1c  S3   MORTA                  "S3 nenhuma credencial com valor literal no render.yaml" falhou, como deveria
V2  O2a  MORTA                  "O2a JSON malformado responde 400, nao 500 - a medicao do auditor" falhou, como deveria
V3  O2d  MORTA                  "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status" falhou, como deveria
V3b  O2d  MORTA                  "O2d copiar o type do body-parser nao basta para ganhar 400" falhou, como deveria
V4  R7   MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
U1  C2   MORTA                  "C2 a camera nunca transforma um codigo em outro" falhou, como deveria
U2  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U3  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U4  O2e  MORTA                  "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor" falhou, como deveria
U4b  O2e  MORTA                  "O2e copiar name, type e status do corpo grande nao basta para ganhar 413" falhou, como deveria
U5  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U5b  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U6  MIG  MORTA                  "MIG migration que nao alcanca o banco falha dizendo por que" falhou, como deveria
U7  MIG  MORTA                  "o doctor conta as mesmas migrations que o runner aplica, .sql e .js" falhou, como deveria
U8  ORC  MORTA                  "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP" falhou, como deveria
W1  E2   MUTACAO SOBREVIVEU     a suite passou com o defeito aplicado
W1b  E2   MORTA                  "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor" falhou, como deveria
W2  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W2b  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W3  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W3b  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W4  D2   MORTA                  "D2 exclusao com senha errada nao remove nada" falhou, como deveria
W5  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W5b  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W6  D8   MORTA                  "D8 falha simulada no meio da exclusao deixa o estado anterior intacto" falhou, como deveria
W7  E8   MORTA                  "E8 a rota real recusa a exportacao acima do teto do usuario" falhou, como deveria
W8  D9   MORTA                  "D9 a tentativa com senha errada gasta o mesmo balde do login" falhou, como deveria
W9  D1   MORTA                  "D1 exclusao com a senha correta remove a conta e limpa o cookie" falhou, como deveria
W10  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W10b  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W11  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
S1  N1a  MORTA                  "N1 o schema canonicaliza UPC-A para EAN-13" falhou, como deveria
S1b  N1a  MORTA                  "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" falhou, como deveria
S1c  N1c  MORTA                  "N1c requisicao DIRETA ao backend grava a forma canonica" falhou, como deveria
S2  N1e  MORTA                  "N1e o schema nao altera EAN-13 nem EAN-8" falhou, como deveria
S2b  N1d  MORTA                  "N1d codigo nao-EAN passa intacto pela canonicalizacao" falhou, como deveria
S3  N1g  MORTA                  "N1g a migration funde as duas formas pela regra declarada" falhou, como deveria
S4  N1g  MORTA                  "N1g a migration e idempotente e nao toca codigo nao-EAN" falhou, como deveria
S5  R2   MORTA                  "N1 a canonicalizacao nao afrouxa a conferencia do digito" falhou, como deveria
S6  N1   MORTA                  "N1 a canonicalizacao usa shared/barcode.js, sem copia local" falhou, como deveria
P1  M1   MORTA                  "M1 codigos com digito verificador errado sao recusados pelo motivo certo" falhou, como deveria
P1b  M1   MORTA                  "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos" falhou, como deveria
P2  M3   MORTA                  "M3 o backend recusa productCode com digito verificador invalido" falhou, como deveria
P2b  M3   MORTA                  "M3 a regra do backend e estreita e nao quebra cadastro legitimo" falhou, como deveria
P3  M4   MORTA                  "o caminho manual nao monta o resultado por conta propria" falhou, como deveria
P3b  M4   MORTA                  "M2 codigo invalido nao chega a rede" falhou, como deveria
P4  M5   MORTA                  "M5 o piso de risco vale no caminho manual" falhou, como deveria
P5  M9   MORTA                  "M9 nao existe segunda implementacao do digito verificador" falhou, como deveria
P5b  M9   MORTA                  "M9 backend e frontend usam a MESMA implementacao de shared/" falhou, como deveria
P6  M7   MORTA                  "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo" falhou, como deveria
P7  M6   MORTA                  "M6 cada motivo de recusa tem mensagem propria" falhou, como deveria
P8  M8   MORTA                  "M8 nenhum outro caractere e removido em silencio" falhou, como deveria
P9  M10  MORTA                  "M10 o backend recusa gravar codigo com digito verificador invalido" falhou, como deveria
N1  R1/R3 MORTA                  "R1 usuario dentro do teto mas IP estourado recebe 429" falhou, como deveria
N1b  R3   MORTA                  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP" falhou, como deveria
N2  R2   MORTA                  "R2 IP dentro do teto mas usuario estourado recebe 429" falhou, como deveria
N2b  R4   MORTA                  "R4 dois usuarios atras do MESMO IP mantem cotas separadas" falhou, como deveria
N3  R4   MORTA                  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP" falhou, como deveria
N4  R5   MORTA                  "R5 dados forjados no request nao conseguem balde de IP novo" falhou, como deveria
N5  R5   MORTA                  "R5 um bloco IPv6 /64 nao vira infinitos baldes" falhou, como deveria
M1  R6   MORTA                  "R6 os tres tetos por rota seguem nos valores declarados" falhou, como deveria
M2  R7   MORTA                  "R7 o teto por IP esta no valor medido" falhou, como deveria
M3  Q3   MORTA                  "Q3 nenhuma variavel de ambiente desliga os limitadores" falhou, como deveria
M3b  Q4   MORTA                  "Q4 nenhum dos limitadores tem opcao de pular requisicao" falhou, como deveria
M4  Q2   MORTA                  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto" falhou, como deveria
M6  R9   MORTA                  "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7  R9   MORTA                  "I2 usuario B nao remove item de A" falhou, como deveria
X1  S2   MORTA                  "S2 alerta maximo + conflito declarado: piso urgent" falhou, como deveria
X2  S3   MORTA                  "S3 alerta maximo + traco: conflito no veredito, piso caution" falhou, como deveria
X3  S5   MORTA                  "S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos" falhou, como deveria
X4  S6   MORTA                  "S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta" falhou, como deveria
X5  S12  MORTA                  "S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations" falhou, como deveria
X6  S13  MORTA                  "S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations" falhou, como deveria
X6b  S13  MORTA                  "S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo" falhou, como deveria
X7  S17  MORTA                  "S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo" falhou, como deveria
X8  S18  MORTA                  "S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot" falhou, como deveria
X9  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
X10  S9   MORTA                  "S9 nivel para alergia ausente do perfil e recusado pela validacao" falhou, como deveria
X11  S1   MORTA                  "S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0" falhou, como deveria
X12  S8   MORTA                  "S8 nivel desconhecido e recusado pela validacao" falhou, como deveria
X13  S16  MORTA                  "S16 o nivel de A nao e visivel nem alteravel por B" falhou, como deveria
Y1  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y2  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y3  C5t  MORTA                  "C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo" falhou, como deveria
Y4  C7t  MORTA                  "C7t o modelo nao escreve, nao altera e nao reordena veredito" falhou, como deveria
Y5  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5b  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5c  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y6  C6t  MORTA                  "C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois" falhou, como deveria
Y7  C9t  MORTA                  "C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca" falhou, como deveria
Y8  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y8b  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y9  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
Y10  C13  MORTA                  "C13 a sessao de B com o id de A no corpo compara com o perfil de B" falhou, como deveria
Y11  C15  MORTA                  "C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente" falhou, como deveria
Z1  O3   MORTA                  "O3 o cache NAO contem allergyVerdict nem resultado do motor em nenhuma chave" falhou, como deveria
Z2  O4   MORTA                  "O4 perfil alterado DEPOIS do cache: a leitura offline reflete o perfil NOVO" falhou, como deveria
Z3  O9   MORTA                  "O9 LOGOUT limpa o cache: nenhuma chave e nenhum VALOR com o id de alergia ou o historico da conta" falhou, como deveria
Z4  O11  MORTA                  "O11 o cache nunca contem senha, hash, salt, token, cookie, chave de API nem e-mail" falhou, como deveria
Z5  O14  MORTA                  "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram" falhou, como deveria
Z5b  O14  MORTA                  "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram" falhou, como deveria
Z6  O2   MORTA                  "O2 produto NAO guardado + sem rede: 'nao disponivel offline', explicito - nunca resultado vazio nem aproximado" falhou, como deveria
Z7  O7   MORTA                  "O7 codigo invalido offline e recusado pela mesma funcao, ANTES de consultar o cache" falhou, como deveria
Z8  O8   MORTA                  "O8 UPC-A offline acha o produto guardado como EAN-13 - e o contrario" falhou, como deveria
Z9  O10  MORTA                  "O10 exclusao de conta limpa o cache no aparelho - so depois de o servidor confirmar" falhou, como deveria
Z10  O12  MORTA                  "O12 o cache de A nao e legivel por B no mesmo aparelho" falhou, como deveria
Z11  O16  MORTA                  "O16 dado expirado nao e servido como valido: depois de 30 dias, e tratado como ausente, com o motivo" falhou, como deveria
Z12  O15  MORTA                  "O15 a sessao 'sem resposta' usa o perfil do aparelho, marcado; 401 tira o cache" falhou, como deveria
Z13  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
AC1  A1t  MORTA                  "A1t sem cor, os quatro estados do veredito continuam distinguiveis por texto" falhou, como deveria
AC2  A2t  MORTA                  "A2t cada alergenico do veredito vem com o seu estado escrito" falhou, como deveria
AC3  A3t  MORTA                  "A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3" falhou, como deveria
AC4  A3t  MORTA                  "A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3" falhou, como deveria
AC5  A5t  MORTA                  "A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro" falhou, como deveria
AC6  A5t  MORTA                  "A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro" falhou, como deveria
AC7  A6t  MORTA                  "A6t no assistente, na tela do produto e na comparacao, o veredito vem antes" falhou, como deveria
AC8  A7t  MORTA                  "A7t na comparacao, coluna, veredito e cabecalho de tabela dizem o nome do produto" falhou, como deveria
AC9  A11  MORTA                  "A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais" falhou, como deveria
AC10  A11  MORTA                  "A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais" falhou, como deveria
AC11  A9t  MORTA                  "A9t o anel de foco existe, tem 2px e nenhum campo do caminho o perde" falhou, como deveria
AC12  A10  MORTA                  "A10 a folga de rolagem cobre a barra de cima e as abas, no celular e no computador" falhou, como deveria
AC13  A13  MORTA                  "A13 cada motivo de recusa e distinto, ligado ao campo e anunciado uma vez" falhou, como deveria
AC14  A17  MORTA                  "A17 nome de produto vindo da Open Food Facts chega como texto, nunca como HTML" falhou, como deveria
AC15  A8t  MORTA                  "A8t todo controle do caminho do alerta e nativo, alcancavel e sem armadilha" falhou, como deveria
PW1  P3   MORTA                  "P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada" falhou, como deveria
PW2  P3   MORTA                  "P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada" falhou, como deveria
PW3  P7   MORTA                  "P7 logout limpa o Cache Storage e o IndexedDB - os dois conferidos" falhou, como deveria
PW4  P7   MORTA                  "P7 logout limpa o Cache Storage e o IndexedDB - os dois conferidos" falhou, como deveria
PW5  P9   MORTA                  "P9 versao nova publicada: o cache antigo e descartado e a versao nova passa a ser servida" falhou, como deveria
PW6  P9   MORTA                  "P9 versao nova publicada: o cache antigo e descartado e a versao nova passa a ser servida" falhou, como deveria
PW7  P12  MORTA                  "P12 com o registro do service worker falhando, o app carrega e funciona" falhou, como deveria
PW8  P12  MORTA                  "P12 com o registro do service worker falhando, o app carrega e funciona" falhou, como deveria
PW9  P4   MORTA                  "P4 resposta com Set-Cookie nunca e guardada - nem de /api/, nem de arquivo do shell" falhou, como deveria
PW10  P11  MORTA                  "P11 a versao nova nunca assume sozinha na instalacao - espera" falhou, como deveria
PW11  P11  MORTA                  "P11 a pagina nunca recarrega sozinha: so pelo toque em Atualizar" falhou, como deveria
PW12  P3   MORTA                  "P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada" falhou, como deveria
PW13  P16  MORTA                  "P16 escopo '/': o service worker so intercepta a pagina e os arquivos do build" falhou, como deveria
PW14  P1   MORTA                  "P1 sem rede, o HTML, o JavaScript e o CSS do app vem do cache" falhou, como deveria
PW15  P5   MORTA                  "P5 /api/account/export nunca e guardada, em nenhuma grafia" falhou, como deveria
PW16  P15  MORTA                  "P15 todo icone declarado existe no projeto, no tamanho declarado" falhou, como deveria
PW17  P17  MORTA                  "P17 o tamanho do shell e reportado e fica dentro do teto" falhou, como deveria
PW18  8.2  MORTA                  "P11 cada defeito derruba o seu subgate e o agregado" falhou, como deveria
PW19  8.2  MORTA                  "P11 cada defeito derruba o seu subgate e o agregado" falhou, como deveria
PW20  8.2  MORTA                  "D9 a D12 contra o backend REAL: manifesto, icones e service worker servidos certo" falhou, como deveria
mortas 158 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
```

```text
[linha de base - depois] 19 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
  VERDE    tests/comparison.test.js
  VERDE    tests/comparisonIntegration.test.js
  VERDE    tests/offline.test.js
  VERDE    tests/accessibility.test.js
  VERDE    tests/serviceWorker.test.js
```

## A7 a A11

```text
A7  npm run build                          sucesso (vite 6.4.5; dist/sw.js da 0.13.0, 7,9 KB)
A8  npm --prefix backend test              493 testes, 418 pass, 0 fail, 75 skipped
                                           (os pulados exigem PostgreSQL, IA real ou
                                           Open Food Facts real - todos declarados
                                           NAO EXECUTADO, nenhum PASS)
A9  suite contra PostgreSQL real (local)   493 testes, 490 pass, 0 fail, 3 skipped
                                           (1 IA real, 2 Open Food Facts real)
A10 npm audit --audit-level=moderate       frontend: found 0 vulnerabilities
    npm --prefix backend audit (moderate)  backend:  found 0 vulnerabilities
A11 npm run verify:release                 exit 0, na primeira execucao - doctor, build, testes
                                           (493 / 418 pass / 0 fail / 75 skipped),
                                           os dois audits com 0 e "secret scan - 0
                                           real secrets"
```

O A9 rodou com `RUN_DB_INTEGRATION_TESTS=true` contra o PostgreSQL LOCAL (porta
5433), com `DATABASE_URL` definida no comando - nunca contra o banco de producao.

## A12 - `verify:e2e`

**PASS, exit code 0, na primeira execucao**, com PostgreSQL real e Claude real -
2 chamadas pagas. Os 23 requisitos em `PASSED`, `ok: true`. A saida literal, a
tabela de subgates, a contagem por balde e o `E2E_LAST_RUN.json` integral estao no
`E2E_REPORT.md`. Nao ha migration nova: o doctor leu "4/4 applied". Nenhum
subgate novo (decisao 8.1); o gate tem diff vazio contra a v0.12.0.

## A13 - os 23 requisitos antigos continuam exigidos, um a um

Prova por execucao, sobre o `E2E_LAST_RUN.json` desta versao: cada requisito,
sozinho em `NOT_EXECUTED`, reprova o modo strict - e so ele.

```text
requisitos no modo strict (flag da IA ligada): 23
faltando no E2E_LAST_RUN.json desta versao: []

requisito                valor no relatorio   NOT_EXECUTED sozinho reprova
backendProcess           STARTED_BY_RUNNER    sim, e so ele
database                 EXECUTED             sim, e so ele
migrations               EXECUTED_IDEMPOTENT  sim, e so ele
auth                     PASSED               sim, e so ele
sessionSchema            PASSED               sim, e so ele
multiDevice              PASSED               sim, e so ele
isolation                PASSED               sim, e so ele
logout                   PASSED               sim, e so ele
assistantAuthority       PASSED               sim, e so ele
deterministicEngine      PASSED               sim, e so ele
fallback                 PASSED               sim, e so ele
privacy                  PASSED               sim, e so ele
historySync              PASSED               sim, e so ele
favoritesSync            PASSED               sim, e so ele
verdictFreshness         PASSED               sim, e so ele
manualCodeLookup         PASSED               sim, e so ele
accountExport            PASSED               sim, e so ele
accountDeletion          PASSED               sim, e so ele
severityVerdict          PASSED               sim, e so ele
anthropicReal            EXECUTED_GENERIC_AND_PRODUCT sim, e so ele
assistantAuthenticated   PASSED               sim, e so ele
productComparison        PASSED               sim, e so ele
offlineCache             PASSED               sim, e so ele

os 23 da v0.11.0 presentes: 23 de 23
requisitos alem dos 23: []
falhas: 0
```

`scripts/lib/e2eGate.js` tem diff vazio contra a v0.12.0.

## Limpeza do banco depois do gate

Residuo **0** em todos os padroes de teste, e nenhuma linha orfa, depois do gate.
A conta de teste da verificacao no navegador (`sw-verif-*@example.test`, no
PostgreSQL LOCAL) foi excluida pela propria tela de exclusao - era o teste P8 -, e
uma consulta confirmou 0 contas `sw-verif-*`. Saida completa do gate no
`E2E_REPORT.md`.

## A14 - `verify:deploy` continua somente leitura

`verify:deploy` ganhou D9 a D12 (secao 8.2), todos por GET. O registro de
requisicoes do P13 segue sem escrita, e o P13 contra o roteador real segue verde.

```text
verify:deploy simulado (local, http)   FAIL, exit 1 - 11 PASS, D2 FAIL (sem TLS local);
                                       D9, D10, D11 e D12 em PASS
verify:deploy REAL (somente leitura)   FAIL, exit 1 - 7 PASS; D1 FAIL ("repositorio declara
                                       0.13.0 e o deploy anuncia 0.7.0"); D9 FAIL (sem
                                       manifesto); D11 FAIL (/sw.js devolve a pagina,
                                       text/html); D10 e D12 NOT_EXECUTED
```

Os FAIL sao os esperados: no ar esta a 0.7.0. O D11 contra o deploy real pegou
exatamente o defeito para o qual existe - o fallback do app devolvendo a pagina no
lugar do service worker. Saidas literais no `E2E_REPORT.md`.

## A15 - `shared/` inalterado

```text
git diff --stat 2399b45 -- shared/   (v0.12.0)
(vazio = nenhuma linha mudou)

git status --short -- shared/
(vazio = nada fora do commit)

arquivo                              objeto git no commit 2399b45              objeto git da arvore entregue             igual  fim de linha na copia
shared/allergenEngine.js             f57650364eb23e75583c4f83063bfcc0289e35df  f57650364eb23e75583c4f83063bfcc0289e35df  sim    CRLF
shared/allergens.js                  8e806b817f45ea7b83e3e1d6d573452dd8b1a318  8e806b817f45ea7b83e3e1d6d573452dd8b1a318  sim    CRLF
shared/allergyVerdict.js             9b64b377c9854a2169516af1ada09923cec1b80e  9b64b377c9854a2169516af1ada09923cec1b80e  sim    CRLF
shared/barcode.js                    9d405872450fddcb26c78514ecc99ed884c32167  9d405872450fddcb26c78514ecc99ed884c32167  sim    CRLF
shared/productAllergenAdapter.js     a624d9cb880583d5a448a814d27e8c4c4c87f2d6  a624d9cb880583d5a448a814d27e8c4c4c87f2d6  sim    CRLF
shared/productComparison.js          cc396178169758edb29af88886cd104ad67fd23a  cc396178169758edb29af88886cd104ad67fd23a  sim    CRLF
shared/text.js                       9d10de1e52a6759757a20dcc7acef71b493e0272  9d10de1e52a6759757a20dcc7acef71b493e0272  sim    CRLF

arquivos em shared/: 7
core.autocrlf = true
```

Os sete arquivos de `shared/` tem o MESMO objeto git do commit da v0.12.0
(`2399b45`): conteudo identico, byte a byte, depois da normalizacao de fim de
linha que o git faz (`core.autocrlf = true`; a copia de trabalho no Windows esta
em CRLF, o repositorio em LF). O `git diff` e vazio e nada esta fora do commit.

## A16 - varredura do nome antigo

```text
=== varredura de 'nutriva' (sem diferenciar maiuscula), fora de node_modules, dist, .git e releases
./AUDIT_REPORT.md
./backend/tests/productName.test.js
./CHANGELOG.md
=== ocorrencias por arquivo
./AUDIT_REPORT.md:21
./backend/tests/productName.test.js:3
./CHANGELOG.md:24
```

O nome antigo aparece so em `backend/tests/productName.test.js`, o teste que o
procura, e nas secoes historicas do `AUDIT_REPORT.md` e do `CHANGELOG.md` - a
contagem do AUDIT_REPORT subiu de 20 para 21 porque o relatorio arquivado da
v0.12.0 transcreve a propria varredura.

## A17 - versao nos sete pontos

```text
package.json                                       0.13.0
backend/package.json                               0.13.0
package-lock.json (raiz e packages[""])            0.13.0 / 0.13.0
backend/package-lock.json (raiz e packages[""])    0.13.0 / 0.13.0
GET /api/health (app real, em memoria)             0.13.0
README.md (titulo)                                 # NutriScan v0.13.0
CHANGELOG.md (entrada mais recente)                ## NutriScan v0.13.0 - 2026-10-30
```

O `/api/health` foi lido de verdade, numa instancia do app em memoria; a versao
dele vem do `package.json` (fonte unica, P8 da v0.7.5).

## Observacoes descritas e NAO alteradas - para decisao

1. **Mesma versao, build diferente.** O nome do cache e a versao. Um build
   republicado sem subir a versao reaproveita o cache; as regras do projeto mandam
   subir a versao a cada entrega. Acrescentar um hash do build ao nome resolveria
   - fica para decisao.
2. **Cota de armazenamento.** O navegador pode apagar o Cache Storage de um app
   pouco usado; ai o app volta a precisar de rede para abrir. Nao medido.
3. **Primeira abertura sem rede**: impossivel por construcao - o shell so e
   guardado depois de uma abertura com rede.
4. **Herdados**: o chat diz "sem conflito" para produto sem dado de alergenico
   (v0.10.0); os textos de conduta do assistente (v0.9.0); a tela Conta rola de
   lado em 320 px; o possivel anuncio em dobro (v0.12.0).

## O que esta versao NAO prova

- **Instalacao em aparelho real: NAO VERIFICADO.** Ninguem instalou o app num
  Android ou num iPhone. O convite e o pedido do navegador foram testados com
  dubles; o manifesto, os icones e o service worker, no Chromium do ambiente.
- **Service worker em HTTPS real: NAO VERIFICADO.** Rodou em `http://127.0.0.1`,
  que o navegador trata como seguro. O D2, que exige HTTPS, segue em FAIL no alvo
  simulado.
- **Leitor de tela real: NAO VERIFICADO**, como na v0.12.0 - inclusive para o
  aviso de versao nova.
- **Toque em aparelho real: NAO VERIFICADO.**
- **A camera em hardware: NAO EXECUTADO.**
- **O deploy real da 0.13.0: NAO EXECUTADO.** Nada foi publicado; no ar esta a
  0.7.0.
- **Safari e Firefox**: nao abertos.

## Historico de auditorias anteriores

## Auditoria da v0.12.0 - 2026-10-30

## Escopo

Entrada 0.11.0, saida 0.12.0. Acessibilidade do alerta de alergia, no nivel AA da
WCAG 2.2, no caminho do alerta. Minor: muda como o veredito e APRESENTADO. Nao ha
migration, rota nova nem variavel nova.

**Isto nao e declaracao de conformidade WCAG.** Conformidade exige auditoria
humana com tecnologia assistiva real, e ela nao foi feita. O relatorio diz quais
criterios foram cobertos por teste, quais foram conferidos no navegador e quais
nao foram verificados. Tambem nao e orientacao de saude nem de nutricao.

**O problema, pelo que era.** Onze versoes garantiram que o veredito esteja
CORRETO. Nenhuma garantiu que ele CHEGUE a pessoa. O motor calculava certo, e a
tela entregava o alerta por cor, por leitura visual e por posicao.

**Preservado sem refatoracao (secao 3).** `git diff` contra a v0.11.0 (commit
`61f0661`):

```text
shared/ (motor, veredito, comparacao, codigo de barras)        vazio
scripts/verify-e2e.js, e2e-real.js, lib/ (gate E2E)            vazio
scripts/verify-deploy.js, verify-release.js, version-check.js  vazio
scripts/doctor.js                                              vazio
src/services/ (cache offline, consulta, sessao)                vazio
src/styles.css (arquivo do design)                             vazio
backend/src/                                                   2 arquivos - so a troca do zod 3
                                                               pelo zod 4, por seguranca (A9)
```

Codigo de producao da entrega, todo no cliente:

```text
NOVO  src/utils/estadoDoVeredito.js             o estado em palavras: fonte unica do bloco e do anuncio
NOVO  src/components/common/AnuncioDoVeredito.jsx  a regiao viva unica, polite
      src/components/assistant/AllergyVerdict.jsx  quatro estados por texto; grupo com nome
      src/components/food/ProductAnalysis.jsx      o bloco do motor para todo produto
      src/pages/Compare/ComparePage.jsx            nome do produto no bloco, na coluna e na tabela
      src/pages/Assistant/AssistantPage.jsx        rotulo visivel; h3; ocupado sem disabled
      src/pages/Scanner/ScannerPage.jsx            um botao so; ocupado sem disabled; status calado
      src/pages/Search/SearchPage.jsx              recusa do codigo ligada ao campo
      src/components/common/StatusLine.jsx         modo calado; a mesma mensagem e lida de novo
      src/components/common/PageHeader.jsx         h1 por tela; titulo focavel
      src/components/allergies/AllergyPicker.jsx   nivel do cabecalho conforme a tela
      src/components/allergies/AlertLevelPicker.jsx  nome completo na caixa; nivel do cabecalho
      src/pages/Account/AccountPage.jsx            h5 no cartao da Conta
      src/pages/Home/HomePage.jsx                  titulo focavel
      src/App.jsx                                  veredito de todo produto, anuncio, foco na troca
                                                   de tela, recusa do codigo marca o campo
      src/styles-v070.css                          so acrescimo; o styles.css do design intocado
```

Testes e mutacao: `backend/tests/accessibility.test.js` (novo, 24 testes) e
`scripts/mutation-check.js` (15 mutantes novos, AC1 a AC15). Documento novo:
`docs/ACESSIBILIDADE.md`.

## 6.1 - A cor nunca e o unico sinal (1.4.1)

**Antes.** O bloco de veredito so existia no assistente e na comparacao, e so
para conflito, traco e sem conflito; "nao avaliado" nao renderizava nada. Na tela
do produto - onde o alerta mais chega - nao havia bloco do motor: a lista
"Alertas do perfil" montava o proprio texto a partir da analise. Ali:

- o alergenico declarado aparecia so como "Leite/lactose", numa etiqueta
  vermelha - o estado estava na cor;
- quem nao marcou nenhuma alergia lia "Sem conflito com o perfil", sem que nada
  tivesse sido conferido - o motor diz `not_evaluated` nesse caso.

**O que mudou.** Um titulo por estado, que E o estado: "Conflito com o seu
perfil" (ou "Alerta máximo: conflito com o seu perfil"), "Pode conter traços",
"Sem conflito com o seu perfil", "Não avaliado" - este com o motivo. Cada
alergenico diz o seu estado: "Contém Leite/lactose", "Pode conter Amendoim",
"· alerta máximo". A tela do produto mostra o MESMO bloco, com o veredito do
motor, calculado por `avaliarNoAparelho` - a funcao que o modo sem rede usa
desde a v0.11.0 - para todo produto. O icone ficou decorativo.

**O conteudo do veredito nao mudou.** O bloco le `status`, `conflicts`,
`traces`, `minimumSafety`, `reason` e `alert`, e nada mais; o texto do estado sai
de `src/utils/estadoDoVeredito.js`, que nao acrescenta campo ao veredito.

**Teste.** A1t tira toda a cor da arvore renderizada - classe, estilo inline e
os icones - e confere que os quatro estados seguem distintos, que o texto de
cada um diz o estado e que o titulo e o estado; faz o mesmo na comparacao. A2t
confere que nenhuma etiqueta e so o nome do alergenico.

## 6.2 - Contraste (1.4.3, 1.4.11)

**Antes.** Dois pares reprovavam:

```text
linha "Verificação do próprio app..." (15px, opacidade 0.85)
  tom de tracos                                     3.89:1   minimo 4.5
  tom de sem conflito                               3.97:1   minimo 4.5
dica da busca do topo ("Buscar alimento", 18px)     4.40:1   minimo 4.5
```

**O que mudou.** Em `src/styles-v070.css`, sem tocar o arquivo de design: a
linha de origem com a tinta cheia (`opacity: 1`): 5.17 e 5.38. A dica do topo em
creme a 80%: 4.99 - e ainda mais clara que o texto digitado (6.71), para seguir
lendo como dica. A borda do campo da comparacao, o unico campo do caminho com
borda desenhada, passou de 1.58:1 para 5.53:1 (`--ink-3`). O criterio nao foi
afrouxado.

**Temas.** O app tem um tema so, claro (`color-scheme: light`). O A3t falha se
um tema escuro aparecer em qualquer dos dois CSS sem ser medido.

**Como e calculado.** O A3t le os dois CSS como o navegador: na ordem do
`main.jsx`, a ultima declaracao vencendo; resolve `var()` contra os tokens reais
de `:root`; mistura transparencia (rgba e opacidade) sobre o fundo; aplica a
formula de luminancia relativa da WCAG. As cores de cada par saem do seletor
real que as declara - nao de uma lista de tokens escrita no teste.

```text
par                                                        valor   minimo  tipo
------------------------------------------------------------------------------------
veredito danger: titulo (24px)                             6.04:1  3       texto grande
veredito danger: motivo e alerta (17px)                    6.04:1  4.5     texto
veredito danger: origem (15px, opacidade 1)                6.04:1  4.5     texto
veredito warning: titulo (24px)                            5.17:1  3       texto grande
veredito warning: motivo e alerta (17px)                   5.17:1  4.5     texto
veredito warning: origem (15px, opacidade 1)               5.17:1  4.5     texto
veredito safe: titulo (24px)                               5.38:1  3       texto grande
veredito safe: motivo e alerta (17px)                      5.38:1  4.5     texto
veredito safe: origem (15px, opacidade 1)                  5.38:1  4.5     texto
veredito neutral: titulo (24px)                            8.52:1  3       texto grande
veredito neutral: motivo e alerta (17px)                   8.52:1  4.5     texto
veredito neutral: origem (15px, opacidade 1)               8.52:1  4.5     texto
etiqueta de risco (Contém/Pode conter)                     6.91:1  4.5     texto
erro do campo sobre --bg                                   6.45:1  4.5     texto
dica do campo sobre --bg                                   5.53:1  4.5     texto
erro do campo sobre --surface                              6.91:1  4.5     texto
dica do campo sobre --surface                              5.92:1  4.5     texto
erro do campo sobre --surface-2                            5.89:1  4.5     texto
dica do campo sobre --surface-2                            5.05:1  4.5     texto
linha de status success                                    5.38:1  4.5     texto
linha de status warning                                    5.17:1  4.5     texto
linha de status error                                      6.04:1  4.5     texto
linha de status neutra                                     9.99:1  4.5     texto
comparacao: falta de dado (compare-missing)                5.67:1  4.5     texto
comparacao: 'Do aparelho'                                  5.67:1  4.5     texto
comparacao: mensagem de aviso                              5.30:1  4.5     texto
comparacao: texto do campo                                 15.85:1 4.5     texto
aviso sem rede: titulo                                     14.46:1 4.5     texto
aviso sem rede: texto                                      9.12:1  4.5     texto
rotulo do campo (busca e camera)                           9.33:1  4.5     texto
rotulo da pergunta ao assistente                           9.99:1  4.5     texto
texto digitado no campo                                    13.52:1 4.5     texto
dica dentro do campo (placeholder)                         5.05:1  4.5     texto
sobretitulo da tela                                        5.53:1  4.5     texto
botao principal                                            5.94:1  4.5     texto
botao secundario                                           13.52:1 4.5     texto
botao de busca do campo                                    5.94:1  4.5     texto
botao de enviar pergunta                                   5.94:1  4.5     texto
sugestao de pergunta                                       8.52:1  4.5     texto
escolha em Meus produtos                                   8.52:1  4.5     texto
linha de alergia                                           15.85:1 4.5     texto
linha de alergia marcada                                   6.41:1  4.5     texto
linha de alerta maximo marcada                             6.04:1  4.5     texto
alergia escolhida (etiqueta)                               6.41:1  4.5     texto
titulo de grupo de alergias (14px)                         5.05:1  4.5     texto
texto do nivel de alerta                                   9.99:1  4.5     texto
aba inativa (rotulo 14px)                                  5.46:1  4.5     texto
aba ativa                                                  8.79:1  4.5     texto
busca do topo: texto                                       6.71:1  4.5     texto
busca do topo: dica                                        4.99:1  4.5     texto
anel de foco sobre --bg                                    5.31:1  3       indicador
anel de foco sobre --surface                               5.69:1  3       indicador
anel de foco sobre --surface-2                             4.85:1  3       indicador
anel de foco sobre --danger-soft                           4.97:1  3       indicador
anel de foco sobre --warn-soft                             5.19:1  3       indicador
anel de foco sobre --ok-soft                               5.04:1  3       indicador
anel de foco sobre --brand-soft                            4.55:1  3       indicador
anel de foco nas barras escuras                            8.79:1  3       indicador
anel da busca do topo                                      8.79:1  3       indicador
borda do campo da comparacao sobre --bg                    5.53:1  3       indicador
borda do campo da comparacao sobre o campo                 5.92:1  3       indicador
caixa de alergia marcada                                   5.69:1  3       indicador
caixa de alerta maximo marcada                             6.04:1  3       indicador
```

63 pares, 0 abaixo do minimo. O tema e um so (claro).

**Fora da regra, e por que:**

- icones em salvia (`--sage`, 2.93:1 sobre o creme): decorativos, com
  `aria-hidden`; o texto ao lado diz o mesmo;
- borda rosada da etiqueta de risco (`--danger-line`, 1.68:1): decorativa; a
  etiqueta e identificada pelo texto "Contém ...";
- fundo dos campos do design (areia sobre creme, cerca de 1.1:1): o 1.4.11 nao
  exige contorno quando o rotulo identifica o campo, e todo campo do caminho tem
  rotulo (A12); o foco desenha o anel de 2px (A9t).

## 6.3 - Leitor de tela recebe o alerta (1.3.1, 4.1.2, 4.1.3)

**Antes.** O bloco era `role="status"` - uma regiao viva que nascia junto com o
texto, e dentro do log do assistente, que ja e regiao viva. Na tela do produto,
nada anunciava o veredito. Na comparacao, so a posicao dizia de quem era cada
veredito.

**O que mudou.**

- **Papel e nome:** o bloco e `role="group"`, com nome pelo titulo -
  "Nutella: Conflito com o seu perfil". O nome do produto vai num trecho
  invisivel (`sr-only`), para quem ouve dois blocos na mesma tela.
- **Anuncio:** uma regiao viva UNICA, `#anuncio-do-veredito`, montada uma vez no
  app, fora das telas, e nunca desmontada. Recebe o texto quando um produto abre
  (camera, codigo digitado, busca, lista), quando o veredito do produto aberto
  muda (alergia ou nivel alterado) e quando a comparacao fica pronta - completa
  ou com um lado faltando. O texto poe o estado primeiro.
- **Ordem de leitura:** o veredito antes do texto do modelo no DOM - no
  assistente, na tela do produto (logo depois do nome, antes de tabela,
  ingredientes e pontos de atencao) e em cada coluna da comparacao.
- **Comparacao:** a coluna se chama "Primeiro produto: Nutella"; o bloco,
  "Nutella: Conflito com o seu perfil"; os cabecalhos "Primeiro" e "Segundo"
  das tabelas levam o nome, que o leitor le junto com cada celula. O anuncio
  diz "Primeiro produto, Nutella. Conflito com o seu perfil: ...".
- **O assistente** segue anunciando pelo proprio log (`role="log"`,
  `aria-live="polite"`), com o veredito antes da resposta. Ali a regiao unica
  nao e usada: seria o mesmo alerta lido duas vezes.

## Decisao de politeness

**`polite`, e nao `assertive`.** O anuncio do veredito responde a uma acao da
propria pessoa - ela acabou de escanear, digitar ou comparar e esta esperando o
resultado. `polite` e lido assim que o leitor termina a frase em curso, sem
cortar nada. `assertive` interromperia a leitura no meio; num app em que cada
produto aberto traz um veredito, interromper toda vez o tornaria insuportavel, e
um alerta que a pessoa aprende a silenciar e um alerta que deixa de chegar.

Nada no app e `assertive`. O unico anuncio que interrompe e o `role="alert"` do
erro de codigo digitado, que existe desde a v0.7.3 e e travado pelo M12: ali a
pessoa acabou de enviar e o envio foi recusado - e o campo dela. Com esse erro na
tela, a linha de status cala (`aria-live="off"`), para a recusa nao ser lida duas
vezes.

**Por que uma regiao so.** Leitor de tela anuncia mudanca numa regiao que ja
existia; uma regiao que nasce junto com o texto pode ficar muda. Por isso a
regiao vive no app inteiro e esta no primeiro HTML, vazia (A5t, sobre o App
renderizado). O mesmo veredito anunciado duas vezes seguidas - o mesmo produto
reaberto - muda um espaco no fim, para ser lido de novo.

## Decisao de destino do foco

**Depois de uma acao, o foco FICA no controle acionado**, e o resultado chega
pela regiao viva. Enviar o codigo, comparar, marcar uma alergia: o foco nao se
move. Mover o foco para o veredito tiraria a pessoa do campo onde ela
provavelmente vai digitar o proximo codigo - no supermercado, um produto atras
do outro - e faria o leitor reler a pagina a partir do bloco.

**Quando a tela troca, o foco vai para o titulo da tela nova** (`h2` com
`tabIndex=-1`, `data-titulo-da-tela`). Antes, o botao que a pessoa acionava
sumia com a troca - "Comparar com outro produto", por exemplo - e o foco caia no
`<body>`: o leitor recomecava do topo da pagina. Na primeira carga o foco fica
onde o navegador o poe.

**Para isso funcionar, nada que a pessoa acabou de usar pode sumir:**

- os controles que esperam resposta usam `aria-disabled` (e `readOnly` no campo)
  em vez de `disabled`, que tirava o foco do controle e o jogava no `<body>`; o
  envio repetido e barrado no codigo;
- o botao da camera e um elemento so, que alterna entre "Ligar câmera" e
  "Desligar câmera" - eram dois, e a camera desliga sozinha depois de ler.

## 6.4 - Foco e teclado (2.1.1, 2.4.3, 2.4.7, 2.4.11)

**Antes.** Quatro campos do design trocavam o anel de foco (`outline: none`) por
uma borda de 1px e um halo claro; a caixa do seletor de alergias e a busca do
topo tambem. Os controles ocupados usavam `disabled`. A barra de cima e as abas,
fixas, podiam cobrir o campo focado.

**O que mudou.** O anel de 2px volta nesses campos (`:focus-visible`) e nas
caixas que envolvem o campo (`:focus-within`), em creme na barra escura. A
pagina tem `scroll-padding` com a altura medida de cada barra: 9.5rem (152px) em
cima no celular, 7rem (112px) no computador; embaixo, a altura das abas mais o
recorte do iPhone mais 16px. A folga de cima e em `rem` para crescer junto com a
letra do navegador. Nenhum controle nao nativo, nenhum `tabindex` positivo,
nenhuma armadilha de foco.

**Medido no navegador** (build real, 375x812, comparacao com dois produtos):
Tab real sete vezes e Shift+Tab quatro - 11 de 11 focos visiveis, nenhum sob as
barras. Controle negativo, com a folga zerada so na pagina inspecionada: o botao
"Explicar as diferenças" ficou em 764-812, sob as abas (736); o campo de cima
ficou em 0, sob a barra (145). Com a folga: 672-720 e 152.

**Teste.** A8t (controles nativos, sem tabindex positivo, `tabindex=-1` so nos
titulos, ocupado sem `disabled`, botao da camera estavel, lista de alergias com
`aria-expanded`); A9t (o anel global existe; toda regra que zera o outline tem o
anel devolvido depois, no mesmo seletor ou na caixa que envolve o campo; nenhum
outline inline); A10 (a folga cobre as barras, no celular e no computador, e a
folga menor vale exatamente onde as abas somem).

## 6.5 - Alvo de toque (2.5.8)

**Antes e depois:** ja estava correto - o design usa 48px de toque. Nada mudou
alem do botao da camera, que manteve o tamanho.

**Medido no navegador**, build real, sem rolagem lateral em nenhuma tela:

```text
largura   tela                          alvos   menor lado
320 px    Inicio                           24        48 px
320 px    Camera                           11        48 px
320 px    Comparar (com dois produtos)     15        48 px
320 px    Alergias                        207        40 px
320 px    Assistente                       13        48 px
375 px    Produto (Nutella aberta)         22        45 px
```

Caixas de marcar contam pela linha inteira (o rotulo e o alvo). **No CSS** (A11),
o tamanho declarado de cada alvo do caminho:

```text
Ligar/Desligar câmera, Comparar, Escanear                  altura             56 px
Abrir este produto (comparação)                            altura             48 px
botões da comparação                                       altura             48 px
Buscar / Buscar código (só ícone na câmera)                altura             56 px
Buscar / Buscar código (só ícone na câmera)                largura (padding)  48 px
Perguntar ao assistente (só ícone)                         altura             56 px
Perguntar ao assistente (só ícone)                         largura (padding)  48 px
sugestão de pergunta                                       altura             48 px
Meus produtos (comparação)                                 altura             48 px
Tentar de novo                                             altura             48 px
aba de navegação                                           altura             48 px
conta (topo, só ícone)                                     altura             48 px
conta (topo, só ícone)                                     largura            48 px
linha de alergia e de alerta máximo (o rótulo é o alvo)    altura             52 px
remover alergia (×)                                        altura             32 px
remover alergia (×)                                        largura            32 px
abrir lista de alergias                                    altura             40 px
abrir lista de alergias                                    largura            40 px
campo de busca/código                                      altura             56 px
campo da pergunta                                          altura             56 px
campo da comparação                                        altura             48 px
campo de buscar alergia                                    altura             48 px
busca do topo                                              altura             54 px
```

## 6.6 - Formulario e erro (3.3.1, 3.3.2, 3.3.3)

**Antes.** O campo de codigo da camera ja tinha `<label>` e erro ligado por
`aria-describedby`, com `role="alert"` (v0.7.3, M12) - mas a linha de status
anunciava a mesma recusa de novo. A busca, que tambem aceita codigo, nao ligava
a recusa ao campo. A pergunta ao assistente nao tinha rotulo visivel. As caixas
de alerta maximo se chamavam so "Leite/lactose".

**O que mudou.** A recusa do codigo marca o campo na busca tambem
(`aria-invalid`, `aria-describedby`, `role="alert"`); com o erro no campo, a
linha de status cala. "Nao encontrado" e resultado, nao erro de digitacao: nao
marca o campo. Rotulo visivel "Sua pergunta". As caixas de alerta maximo se
chamam "Alerta máximo para Leite/lactose".

**Medido no navegador**, os quatro motivos na camera - vazio, letra, tamanho e
digito verificador - com mensagens diferentes, `role="alert"`, ligados ao campo
junto com a dica, `aria-invalid="true"`, a linha de status em `aria-live="off"`
e o foco no campo. Na busca, o mesmo com o digito verificador.

**Teste.** A12 (rotulo visivel associado em cada campo; o filtro do seletor de
alergias, campo de busca com lupa, tem nome acessivel que contem o texto
visivel - 2.5.3); A13 (os quatro motivos distintos, ligados, anunciados uma vez,
na camera e na busca); A14 (nome e estado de cada caixa de alergia e de alerta
maximo).

## 6.7 - Movimento (2.3.3)

**Ja estava correto.** O design ja tinha `prefers-reduced-motion: reduce` para
`*`, `::before` e `::after` - animacao, transicao e rolagem suave. A camera nao
comunica estado por animacao: o botao e a linha de status dizem o estado em
texto, e o icone que gira e decorativo. A15 trava as duas coisas.

## 6.8 - Idioma e estrutura (3.1.1, 1.3.1)

**Antes.** `lang="pt-BR"` ja estava. As telas comecavam em `h2` (o design desenha
o titulo da tela no tamanho de `h2`), e havia pulos: "Nutri Assistente" em `h4`
direto abaixo do `h2`; os grupos do seletor de alergias em `h5`; o titulo do
nivel de alerta em `h4`.

**O que mudou.** Cada tela tem um `h1` invisivel ("NutriScan: Buscar") e desce
sem pular: "Nutri Assistente" e `h3`; os grupos e o nivel de alerta sao `h3` na
tela de Alergias e `h5` no cartao da Conta, abaixo do `h4` dele. O estilo segue
pela classe: o tamanho na tela nao mudou. Landmarks: `header`, duas `nav` com
nome, um `main`, rodape, link "Pular para o conteúdo". A16 confere as cinco
telas do caminho renderizadas.

## Decisao sobre o subgate do gate E2E

**Nenhum subgate novo.** O gate E2E roda contra o backend real; acessibilidade e
comportamento do cliente - o HTML que a tela gera, o CSS, o foco, o anuncio. Um
subgate contra o backend real nao provaria nada disso: a API nao mudou nenhum
campo, e o `allergyVerdict` que ela devolve e o mesmo. A verificacao fica onde
prova alguma coisa: nos testes que renderizam o JSX real (A1t a A17) e no
navegador, sobre o build real (acima). **Proposta, nao implementada:** um gate de
navegador de verdade (Playwright com axe, por exemplo) que abra o app, escaneie
por codigo e leia a arvore de acessibilidade do Chromium - complementaria os
testes, sem substituir o leitor de tela real.

Os 23 requisitos continuam exigidos, um a um - A12, abaixo.

## Como os testes inspecionam a arvore renderizada

`accessibility.test.js` empacota com esbuild o JSX REAL de `src/` - o App
inteiro, as telas e os componentes - e renderiza com `renderToStaticMarkup`,
como o `assistantPageRender.test.js` faz desde a v0.6.8. Os vereditos dos testes
saem do motor de `shared/` (`buildAllergyVerdict`, `compareProducts`,
`avaliarNoAparelho`), nunca escritos a mao. As assercoes leem o HTML que sai:
papel, `aria-*`, ids e para quem apontam, texto visivel e texto so de leitor,
ordem no documento, atributos de campo. O A1t remove do HTML renderizado a
classe, o estilo e os icones antes de comparar os quatro estados.

O CSS e lido como o navegador o le (A3t, A9t, A10, A11, A15): os dois arquivos,
na ordem do `main.jsx`, `@media` respeitado, a ultima declaracao vencendo, `var()`
resolvido contra os tokens reais.

Leituras de codigo-fonte que restam, marcadas como complemento: a ordem de
importacao do CSS no `main.jsx`, e a busca de `dangerouslySetInnerHTML` e
`innerHTML` no A17. Nenhuma assercao de comportamento e feita sobre o fonte.

O que os testes NAO provam: que a experiencia com leitor de tela e boa. Eles
provam que a informacao esta exposta.

## A1 - A1t a A17, R1 a R7

Presentes e verdes, sem banco e contra PostgreSQL real:

```text
A1t  sem cor, os quatro estados do veredito continuam distinguiveis por texto       1.4.1
A2t  cada alergenico do veredito vem com o seu estado escrito                       1.4.1, 1.3.1
A3t  contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3   1.4.3, 1.4.11
A4t  o bloco de veredito e um grupo com nome: o estado, e o produto quando ha       4.1.2, 1.3.1
A5t  a regiao de anuncio e polite, existe antes do veredito e recebe o estado        4.1.3
     primeiro
A6t  no assistente, na tela do produto e na comparacao, o veredito vem antes        1.3.2
A7t  na comparacao, coluna, veredito e cabecalho de tabela dizem o nome do produto  1.3.1, 4.1.2
A8t  todo controle do caminho do alerta e nativo, alcancavel e sem armadilha        2.1.1, 2.1.2, 2.4.3
A9t  o anel de foco existe, tem 2px e nenhum campo do caminho o perde               2.4.7, 1.4.11
A10  a folga de rolagem cobre a barra de cima e as abas, no celular e no computador 2.4.11
A11  os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais                2.5.8
A12  os campos do caminho do alerta tem <label> visivel associado                   1.3.1, 3.3.2, 2.5.3
A13  cada motivo de recusa e distinto, ligado ao campo e anunciado uma vez          3.3.1, 3.3.3, 4.1.3
A14  cada alergia e cada nivel de alerta tem nome e estado acessiveis               4.1.2
A15  com movimento reduzido, nada anima; a camera nao depende de animacao           2.3.3
A16  lang pt-BR, cabecalhos sem pular nivel e landmarks                             3.1.1, 1.3.1
A17  nome de produto vindo da Open Food Facts chega como texto, nunca como HTML      seguranca
```

O A10 usa duas alturas MEDIDAS no navegador - a barra de cima tem altura de
conteudo, que o CSS sozinho nao da: 145px no celular, 93px no computador.

R1 a R7 executam de novo, pelo codigo real, no mesmo arquivo; as suites completas
de cada um continuam no gate e estao verdes:

```text
R1  exploit C1: o modelo negando o conflito nao entrega falso seguro   suite: allergyVerdict T1-T8
R2  matriz de severidade nos quatro casos                              alertLevel S1-S18, offline O5
R3  comparacao sem contaminacao, explicacao amarrada pelo codigo       comparison C1t-C16
R4  o cache offline nao guarda veredito e o logout o limpa             offline O1-O16
R5  sem sessao, exportar, excluir e ler colecoes respondem 401         account E6-E8; com banco
                                                                       accountIntegration E1-E8,
                                                                       isolamento I1-I4
R6  digito verificador, UPC-A canonicalizado e tetos da comparacao     barcode M1-M12, N1, C15
R7  JSON malformado e 400 sem detalhe; rota desconhecida e 404 de API  bodyParseError O2a-O2e,
                                                                       productionHardening P5, P9
```

## A2 - validacao por mutacao

Rodada completa, com banco, sobre o codigo entregue:

```text
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<PostgreSQL LOCAL> DATABASE_SSL=false \
  node scripts/mutation-check.js --com-banco
```

```text
mortas 138 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde

REPROVADO: ha teste que nao detecta o defeito que deveria detectar.
=== EXIT: 1 ===
```

**139 mutantes: 138 mortos, 1 sobrevivente (W1, o equivalente da v0.8.0), 0 nao
executados.** A linha de base - as 18 suites sem mutacao, incluida a nova
(`tests/accessibility.test.js`) - estava verde antes e depois. **Os 15 mutantes
novos morreram todos.** O script sai com codigo 1 por causa do W1, e isso fica
registrado como esta - nao foi mexido para passar.

### Os mutantes pedidos pelo prompt (A1t, A3t, A5t, A6t, A11)

```text
pedido pelo prompt                                    mutante  teste que o pegou  resultado
o estado passa a ser comunicado so por classe de cor  AC1      A1t                MORTA
um par de cores cai abaixo do minimo de contraste     AC3      A3t                MORTA
                                                      AC4      A3t                MORTA
a regiao de anuncio perde o aria-live                 AC5      A5t                MORTA
                                                      AC6      A5t                MORTA
o veredito e renderizado depois do texto do modelo    AC7      A6t                MORTA
um alvo de toque cai abaixo de 24px                   AC9      A11                MORTA
                                                      AC10     A11                MORTA
```

O que cada um injeta:

- **AC1** - `AllergyVerdict.jsx`: o titulo vira "Verificação do app" nos quatro
  estados; so a classe de cor (`danger`, `warning`, `safe`, `neutral`) os
  distingue.
- **AC3** - `styles-v070.css`: a linha de origem volta a opacidade 0.85 - o tom
  de tracos cai para 3.89:1.
- **AC4** - a dica da busca do topo volta ao creme a 72% - 4.40:1.
- **AC5** - `AnuncioDoVeredito.jsx`: a regiao perde `aria-live="polite"`.
- **AC6** - `App.jsx`: a regiao deixa de ser montada no app; nasceria junto com
  o texto, e nada a anuncia.
- **AC7** - `AssistantPage.jsx`: o bloco de veredito passa para depois da
  resposta do modelo.
- **AC9** - `styles.css`: o botao de remover alergia (×) cai de 32 para 20 px.
  A mutacao e temporaria; o arquivo de design voltou intacto.
- **AC10** - o "Abrir este produto" da comparacao cai para 20 px de altura.

### Os outros sete mutantes novos

```text
AC2   A2t  a etiqueta de risco volta a ser so o nome do alergenico          MORTA
AC8   A7t  a coluna da comparacao perde o nome do produto                   MORTA
AC11  A9t  o campo de codigo perde o anel de foco devolvido                 MORTA
AC12  A10  a folga de rolagem sob a barra de cima some                      MORTA
AC13  A13  a recusa do codigo na busca deixa de ser anunciada               MORTA
AC14  A17  o nome do produto entra como HTML no rotulo do veredito          MORTA
AC15  A8t  o campo do assistente volta a usar disabled enquanto espera      MORTA
```

(AC1 a AC15: 15 mutantes.) Antes da rodada oficial, os 15 foram rodados sozinhos
contra a suite nova: 15 mortos.

### O sobrevivente: W1, o mesmo da v0.8.0

O W1 faz o repositorio da exportacao devolver a linha inteira de `users`, mas o
servico monta o arquivo campo a campo - a exportacao nao muda, e o teste esta
certo em passar. E equivalente, foi descrito na v0.8.0 com a demonstracao de que
a suite estatica (`nunca usa SELECT *`) o pega, e esta versao nao mexeu nele nem
no `mutation-check.js` por causa dele.

### A troca do zod nao deixou ancora quebrada

Antes da rodada, cada um dos 139 mutantes foi conferido: a ancora de cada um
aparece exatamente uma vez no arquivo de destino. Nenhum mutante antigo mirava
as linhas que o zod 4 obrigou a mudar.

### A rodada inteira

Linha de base:

```text
[linha de base - antes] 18 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
  VERDE    tests/comparison.test.js
  VERDE    tests/comparisonIntegration.test.js
  VERDE    tests/offline.test.js
  VERDE    tests/accessibility.test.js
```

```text
T1  P2   MORTA                  "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta" falhou, como deveria
T1b  P2   MORTA                  "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost" falhou, como deveria
T2  P5   MORTA                  "P5 erro do driver do banco nao chega ao cliente" falhou, como deveria
T2b  P5   MORTA                  "P5 o detalhe do erro vai para o log do servidor" falhou, como deveria
T3  P9   MORTA                  "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual" falhou, como deveria
T3b  P9   MORTA                  "P9 valor booleano nao reconhecido nao cai em default silencioso" falhou, como deveria
T4  P12  MORTA                  "P12 versao no ar diferente da do repositorio reprova o D1" falhou, como deveria
T5  P13  MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
T5b  P13  MORTA                  "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada" falhou, como deveria
T6  P3   MORTA                  "P3 CORS devolve a origem configurada, nunca a do request" falhou, como deveria
T7  P4   MORTA                  "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha" falhou, como deveria
T8  P11  MORTA                  "P11 NOT_EXECUTED nao conta como PASS no agregado" falhou, como deveria
T9  P11  MORTA                  "P11 o comando de verdade sai com codigo 1 quando um subgate falha" falhou, como deveria
V1  S1/S4 MORTA                  "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO" falhou, como deveria
V1b  S2   MORTA                  "S2 render.yaml nao declara variavel que o codigo nao le" falhou, como deveria
V1c  S3   MORTA                  "S3 nenhuma credencial com valor literal no render.yaml" falhou, como deveria
V2  O2a  MORTA                  "O2a JSON malformado responde 400, nao 500 - a medicao do auditor" falhou, como deveria
V3  O2d  MORTA                  "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status" falhou, como deveria
V3b  O2d  MORTA                  "O2d copiar o type do body-parser nao basta para ganhar 400" falhou, como deveria
V4  R7   MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
U1  C2   MORTA                  "C2 a camera nunca transforma um codigo em outro" falhou, como deveria
U2  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U3  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U4  O2e  MORTA                  "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor" falhou, como deveria
U4b  O2e  MORTA                  "O2e copiar name, type e status do corpo grande nao basta para ganhar 413" falhou, como deveria
U5  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U5b  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U6  MIG  MORTA                  "MIG migration que nao alcanca o banco falha dizendo por que" falhou, como deveria
U7  MIG  MORTA                  "o doctor conta as mesmas migrations que o runner aplica, .sql e .js" falhou, como deveria
U8  ORC  MORTA                  "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP" falhou, como deveria
W1  E2   MUTACAO SOBREVIVEU     a suite passou com o defeito aplicado
W1b  E2   MORTA                  "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor" falhou, como deveria
W2  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W2b  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W3  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W3b  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W4  D2   MORTA                  "D2 exclusao com senha errada nao remove nada" falhou, como deveria
W5  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W5b  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W6  D8   MORTA                  "D8 falha simulada no meio da exclusao deixa o estado anterior intacto" falhou, como deveria
W7  E8   MORTA                  "E8 a rota real recusa a exportacao acima do teto do usuario" falhou, como deveria
W8  D9   MORTA                  "D9 a tentativa com senha errada gasta o mesmo balde do login" falhou, como deveria
W9  D1   MORTA                  "D1 exclusao com a senha correta remove a conta e limpa o cookie" falhou, como deveria
W10  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W10b  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W11  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
S1  N1a  MORTA                  "N1 o schema canonicaliza UPC-A para EAN-13" falhou, como deveria
S1b  N1a  MORTA                  "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" falhou, como deveria
S1c  N1c  MORTA                  "N1c requisicao DIRETA ao backend grava a forma canonica" falhou, como deveria
S2  N1e  MORTA                  "N1e o schema nao altera EAN-13 nem EAN-8" falhou, como deveria
S2b  N1d  MORTA                  "N1d codigo nao-EAN passa intacto pela canonicalizacao" falhou, como deveria
S3  N1g  MORTA                  "N1g a migration funde as duas formas pela regra declarada" falhou, como deveria
S4  N1g  MORTA                  "N1g a migration e idempotente e nao toca codigo nao-EAN" falhou, como deveria
S5  R2   MORTA                  "N1 a canonicalizacao nao afrouxa a conferencia do digito" falhou, como deveria
S6  N1   MORTA                  "N1 a canonicalizacao usa shared/barcode.js, sem copia local" falhou, como deveria
P1  M1   MORTA                  "M1 codigos com digito verificador errado sao recusados pelo motivo certo" falhou, como deveria
P1b  M1   MORTA                  "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos" falhou, como deveria
P2  M3   MORTA                  "M3 o backend recusa productCode com digito verificador invalido" falhou, como deveria
P2b  M3   MORTA                  "M3 a regra do backend e estreita e nao quebra cadastro legitimo" falhou, como deveria
P3  M4   MORTA                  "o caminho manual nao monta o resultado por conta propria" falhou, como deveria
P3b  M4   MORTA                  "M2 codigo invalido nao chega a rede" falhou, como deveria
P4  M5   MORTA                  "M5 o piso de risco vale no caminho manual" falhou, como deveria
P5  M9   MORTA                  "M9 nao existe segunda implementacao do digito verificador" falhou, como deveria
P5b  M9   MORTA                  "M9 backend e frontend usam a MESMA implementacao de shared/" falhou, como deveria
P6  M7   MORTA                  "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo" falhou, como deveria
P7  M6   MORTA                  "M6 cada motivo de recusa tem mensagem propria" falhou, como deveria
P8  M8   MORTA                  "M8 nenhum outro caractere e removido em silencio" falhou, como deveria
P9  M10  MORTA                  "M10 o backend recusa gravar codigo com digito verificador invalido" falhou, como deveria
N1  R1/R3 MORTA                  "R1 usuario dentro do teto mas IP estourado recebe 429" falhou, como deveria
N1b  R3   MORTA                  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP" falhou, como deveria
N2  R2   MORTA                  "R2 IP dentro do teto mas usuario estourado recebe 429" falhou, como deveria
N2b  R4   MORTA                  "R4 dois usuarios atras do MESMO IP mantem cotas separadas" falhou, como deveria
N3  R4   MORTA                  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP" falhou, como deveria
N4  R5   MORTA                  "R5 dados forjados no request nao conseguem balde de IP novo" falhou, como deveria
N5  R5   MORTA                  "R5 um bloco IPv6 /64 nao vira infinitos baldes" falhou, como deveria
M1  R6   MORTA                  "R6 os tres tetos por rota seguem nos valores declarados" falhou, como deveria
M2  R7   MORTA                  "R7 o teto por IP esta no valor medido" falhou, como deveria
M3  Q3   MORTA                  "Q3 nenhuma variavel de ambiente desliga os limitadores" falhou, como deveria
M3b  Q4   MORTA                  "Q4 nenhum dos limitadores tem opcao de pular requisicao" falhou, como deveria
M4  Q2   MORTA                  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto" falhou, como deveria
M6  R9   MORTA                  "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7  R9   MORTA                  "I2 usuario B nao remove item de A" falhou, como deveria
X1  S2   MORTA                  "S2 alerta maximo + conflito declarado: piso urgent" falhou, como deveria
X2  S3   MORTA                  "S3 alerta maximo + traco: conflito no veredito, piso caution" falhou, como deveria
X3  S5   MORTA                  "S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos" falhou, como deveria
X4  S6   MORTA                  "S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta" falhou, como deveria
X5  S12  MORTA                  "S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations" falhou, como deveria
X6  S13  MORTA                  "S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations" falhou, como deveria
X6b  S13  MORTA                  "S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo" falhou, como deveria
X7  S17  MORTA                  "S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo" falhou, como deveria
X8  S18  MORTA                  "S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot" falhou, como deveria
X9  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
X10  S9   MORTA                  "S9 nivel para alergia ausente do perfil e recusado pela validacao" falhou, como deveria
X11  S1   MORTA                  "S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0" falhou, como deveria
X12  S8   MORTA                  "S8 nivel desconhecido e recusado pela validacao" falhou, como deveria
X13  S16  MORTA                  "S16 o nivel de A nao e visivel nem alteravel por B" falhou, como deveria
Y1  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y2  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y3  C5t  MORTA                  "C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo" falhou, como deveria
Y4  C7t  MORTA                  "C7t o modelo nao escreve, nao altera e nao reordena veredito" falhou, como deveria
Y5  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5b  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5c  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y6  C6t  MORTA                  "C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois" falhou, como deveria
Y7  C9t  MORTA                  "C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca" falhou, como deveria
Y8  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y8b  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y9  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
Y10  C13  MORTA                  "C13 a sessao de B com o id de A no corpo compara com o perfil de B" falhou, como deveria
Y11  C15  MORTA                  "C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente" falhou, como deveria
Z1  O3   MORTA                  "O3 o cache NAO contem allergyVerdict nem resultado do motor em nenhuma chave" falhou, como deveria
Z2  O4   MORTA                  "O4 perfil alterado DEPOIS do cache: a leitura offline reflete o perfil NOVO" falhou, como deveria
Z3  O9   MORTA                  "O9 LOGOUT limpa o cache: nenhuma chave e nenhum VALOR com o id de alergia ou o historico da conta" falhou, como deveria
Z4  O11  MORTA                  "O11 o cache nunca contem senha, hash, salt, token, cookie, chave de API nem e-mail" falhou, como deveria
Z5  O14  MORTA                  "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram" falhou, como deveria
Z5b  O14  MORTA                  "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram" falhou, como deveria
Z6  O2   MORTA                  "O2 produto NAO guardado + sem rede: 'nao disponivel offline', explicito - nunca resultado vazio nem aproximado" falhou, como deveria
Z7  O7   MORTA                  "O7 codigo invalido offline e recusado pela mesma funcao, ANTES de consultar o cache" falhou, como deveria
Z8  O8   MORTA                  "O8 UPC-A offline acha o produto guardado como EAN-13 - e o contrario" falhou, como deveria
Z9  O10  MORTA                  "O10 exclusao de conta limpa o cache no aparelho - so depois de o servidor confirmar" falhou, como deveria
Z10  O12  MORTA                  "O12 o cache de A nao e legivel por B no mesmo aparelho" falhou, como deveria
Z11  O16  MORTA                  "O16 dado expirado nao e servido como valido: depois de 30 dias, e tratado como ausente, com o motivo" falhou, como deveria
Z12  O15  MORTA                  "O15 a sessao 'sem resposta' usa o perfil do aparelho, marcado; 401 tira o cache" falhou, como deveria
Z13  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
AC1  A1t  MORTA                  "A1t sem cor, os quatro estados do veredito continuam distinguiveis por texto" falhou, como deveria
AC2  A2t  MORTA                  "A2t cada alergenico do veredito vem com o seu estado escrito" falhou, como deveria
AC3  A3t  MORTA                  "A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3" falhou, como deveria
AC4  A3t  MORTA                  "A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3" falhou, como deveria
AC5  A5t  MORTA                  "A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro" falhou, como deveria
AC6  A5t  MORTA                  "A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro" falhou, como deveria
AC7  A6t  MORTA                  "A6t no assistente, na tela do produto e na comparacao, o veredito vem antes" falhou, como deveria
AC8  A7t  MORTA                  "A7t na comparacao, coluna, veredito e cabecalho de tabela dizem o nome do produto" falhou, como deveria
AC9  A11  MORTA                  "A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais" falhou, como deveria
AC10  A11  MORTA                  "A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais" falhou, como deveria
AC11  A9t  MORTA                  "A9t o anel de foco existe, tem 2px e nenhum campo do caminho o perde" falhou, como deveria
AC12  A10  MORTA                  "A10 a folga de rolagem cobre a barra de cima e as abas, no celular e no computador" falhou, como deveria
AC13  A13  MORTA                  "A13 cada motivo de recusa e distinto, ligado ao campo e anunciado uma vez" falhou, como deveria
AC14  A17  MORTA                  "A17 nome de produto vindo da Open Food Facts chega como texto, nunca como HTML" falhou, como deveria
AC15  A8t  MORTA                  "A8t todo controle do caminho do alerta e nativo, alcancavel e sem armadilha" falhou, como deveria
mortas 138 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
```

```text
[linha de base - depois] 18 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
  VERDE    tests/comparison.test.js
  VERDE    tests/comparisonIntegration.test.js
  VERDE    tests/offline.test.js
  VERDE    tests/accessibility.test.js
```

## A3 e A4 - tabela de contraste e decisoes

A tabela de contraste esta em 6.2. As decisoes de politeness (6.3) e de destino
do foco (6.4) estao acima, com o motivo.

## A5 - subgate E2E

Nao cabe, e esta justificado acima. Os 23 requisitos continuam exigidos (A12).

## Verificacao no navegador

Build real (`npm run build`), servido pelo backend local na porta 3200 contra
o PostgreSQL LOCAL, sem chave de IA, no navegador embutido do ambiente
(Chromium), em tamanho de celular emulado. Codigos reais da Open Food Facts.

**Uma ressalva de metodo, dita antes:** o painel do navegador do ambiente nao
desenha quadros (`requestAnimationFrame` parado), e a rolagem suave do design
(`html { scroll-behavior: smooth }`) nao anda sem quadro. Para medir o foco por
Tab real, a rolagem suave foi trocada por `auto` SO NA PAGINA INSPECIONADA, por
estilo inline no console - nenhum arquivo do app mudou. O controle negativo da
folga tambem foi feito assim (folga zerada so na pagina).

```text
o que                                         medido
barras                                        topo 145 px (320 a 959 px), 93 px (>= 960 px);
                                              abas 76 px
folga aplicada                                topo 152 px / 112 px; base 92 px / 16 px
foco ao trocar de tela                        h2 [data-titulo-da-tela] em Buscar, Alergias,
                                              Comparar, Camera, Assistente; 1a carga: <body>
foco depois da acao                           marcar alergia: na caixa; comparar: no campo;
                                              recusa do codigo: no campo
2.4.11, comparacao 375x812                    Tab x7 + Shift+Tab x4: 11 de 11 visiveis
controle negativo (folga zerada na pagina)    "Explicar as diferenças" 764-812 sob as abas (736);
                                              campo de cima em 0, sob a barra (145)
com a folga                                   672-720 e 152
anuncio - Nutella aberta, sem alergia         "Nutella. Não avaliado. Você não marcou alergias.
                                              O app não conferiu conflito."
anuncio - marcar Leite/lactose                "Nutella. Conflito com o seu perfil: Contém
                                              Leite/lactose."
anuncio - comparar Nutella x Coca-Cola        "Comparação pronta. Primeiro produto, Nutella.
                                              Conflito com o seu perfil: Contém Leite/lactose.
                                              Segundo produto, Coca-Cola Original. Sem conflito
                                              com o seu perfil."
comparacao - colunas                          "Primeiro produto: Nutella" / "Segundo produto:
                                              Coca-Cola Original"
comparacao - grupos                           "Nutella: Conflito com o seu perfil" / "Coca-Cola
                                              Original: Sem conflito com o seu perfil"
comparacao - cabecalhos                       "Primeiro: Nutella", "Segundo: Coca-Cola Original"
recusa na camera - vazio                      "Digite um alimento ou código de barras."
recusa na camera - letra (12a45678)           "O código de barras tem só números. Confira o que
                                              você digitou."
recusa na camera - tamanho (20 digitos)       "Esse código tem 20 números. Um código de barras
                                              tem 8, 12 ou 13. Confira na embalagem."
recusa na camera - digito (3017624010702)     "Esse código não existe. Confira número por número
                                              na embalagem."
  as quatro                                   role="alert", ligadas ao campo com a dica,
                                              aria-invalid="true", status em aria-live="off"
recusa na busca (3017624010702)               o mesmo, ligada ao campo da busca
estrutura                                     lang pt-BR; h1 por tela; Assistente h1>h2>h3;
                                              Alergias h1>h2>h3; produto h3 > h4
landmarks                                     header, nav (2, com nome), main, footer
alvos                                         ver 6.5; nenhum abaixo de 40 px; sem rolagem
                                              lateral a 320 px
```

Fora de escopo, observado: na camera, "12345" (menos de 6 digitos) vira busca por
nome, e nao recusa por tamanho - comportamento anterior, descrito em Observacoes.

## Dependencias corrigidas para o A9

Duas semanas depois da v0.11.0, o `npm audit` passou a acusar quatro avisos. O A9
exige zero no nivel moderate, entao foram corrigidos - com a versao corrigida
mais antiga que existia:

```text
frontend  vite         6.4.3  -> 6.4.5   GHSA-698v, GHSA-r825, GHSA-587h (launch-editor),
                                         GHSA-9jrq, GHSA-rq7h (alta) e GHSA-8g5g (moderada)
                                         6.4.4 corrigia os cinco primeiros; o sexto so na 6.4.5
backend   body-parser  1.20.8 -> 1.20.9  GHSA-27r3 (alta) - a unica versao corrigida, de 22/10
backend   qs           6.16.0 -> 6.16.2  GHSA-6pq8 (moderada) - escolha do npm audit fix
backend   zod          3.25.76 -> 4.6.7  GHSA-mrhx (alta) - a linha 3 nao tem correcao
```

**A troca do zod 3 pelo 4 mexeu no backend, e foi conferida.** O zod 4 removeu
tres formas usadas aqui (`required_error`, `invalid_type_error` e o `z.record` de
um argumento); as mensagens em portugues foram mantidas uma a uma. E o
`z.record` do zod 4 passou a DESCARTAR em silencio a chave `__proto__`, em vez de
recusa-la: o S9 (nivel de alerta com chave fora do catalogo) quebrou com isso, e
quebrou certo. O servidor nunca ficou exposto - a chave some -, mas o contrato e
recusar. As chaves cruas agora sao conferidas contra o catalogo antes do zod, com
a mensagem de sempre; o S9 voltou a verde sem ser alterado. O SDK da Anthropic
aceita `zod` 3 ou 4. O gate E2E foi executado de novo depois da troca (A11).

## A6 a A10

```text
A6  npm run build                          sucesso (vite 6.4.5)
A7  npm --prefix backend test              458 testes, 383 pass, 0 fail, 75 skipped
                                           (os pulados exigem PostgreSQL, IA real ou
                                           Open Food Facts real - todos declarados
                                           NAO EXECUTADO, nenhum PASS)
A8  suite contra PostgreSQL real (local)   458 testes, 455 pass, 0 fail, 3 skipped
                                           (1 IA real, 2 Open Food Facts real)
A9  npm audit --audit-level=moderate       frontend: found 0 vulnerabilities
    npm --prefix backend audit (moderate)  backend:  found 0 vulnerabilities
A10 npm run verify:release                 exit 0, na primeira execucao - doctor, build, testes
                                           (458 / 383 pass / 0 fail / 75 skipped),
                                           os dois audits com 0 e "secret scan - 0
                                           real secrets"
```

O A8 rodou com `RUN_DB_INTEGRATION_TESTS=true` contra o PostgreSQL LOCAL (porta
5433), com `DATABASE_URL` definida no comando - nunca contra o banco de producao.

## A11 - `verify:e2e`

**PASS, exit code 0**, com PostgreSQL real e Claude real - 2 chamadas pagas. Os
23 requisitos em `PASSED`, `ok: true`. **Duas execucoes:** a primeira, com o
codigo de acessibilidade pronto, passou; depois dela vieram as correcoes de
dependencia (o zod mexe na validacao do backend), e o gate rodou de novo sobre o
codigo entregue - essa e a oficial, tambem PASS. A saida literal, a tabela de
subgates, a contagem por balde, o `E2E_LAST_RUN.json` integral e o motivo das
duas execucoes estao no `E2E_REPORT.md`. Nao ha migration nova: o doctor leu
"4/4 applied". Nenhum subgate novo (decisao acima); o gate tem diff vazio.

## A12 - os 23 requisitos antigos continuam exigidos, um a um

Prova por execucao, sobre o `E2E_LAST_RUN.json` da execucao oficial: cada
requisito, sozinho em `NOT_EXECUTED`, reprova o modo strict - e so ele.

```text
requisitos no modo strict (flag da IA ligada): 23
faltando no E2E_LAST_RUN.json desta versao: []

requisito                valor no relatorio   NOT_EXECUTED sozinho reprova
backendProcess           STARTED_BY_RUNNER    sim, e so ele
database                 EXECUTED             sim, e so ele
migrations               EXECUTED_IDEMPOTENT  sim, e so ele
auth                     PASSED               sim, e so ele
sessionSchema            PASSED               sim, e so ele
multiDevice              PASSED               sim, e so ele
isolation                PASSED               sim, e so ele
logout                   PASSED               sim, e so ele
assistantAuthority       PASSED               sim, e so ele
deterministicEngine      PASSED               sim, e so ele
fallback                 PASSED               sim, e so ele
privacy                  PASSED               sim, e so ele
historySync              PASSED               sim, e so ele
favoritesSync            PASSED               sim, e so ele
verdictFreshness         PASSED               sim, e so ele
manualCodeLookup         PASSED               sim, e so ele
accountExport            PASSED               sim, e so ele
accountDeletion          PASSED               sim, e so ele
severityVerdict          PASSED               sim, e so ele
anthropicReal            EXECUTED_GENERIC_AND_PRODUCT sim, e so ele
assistantAuthenticated   PASSED               sim, e so ele
productComparison        PASSED               sim, e so ele
offlineCache             PASSED               sim, e so ele

os 23 da v0.11.0 presentes: 23 de 23
requisitos alem dos 23: []
falhas: 0
```

A v0.12.0 nao acrescenta nem remove requisito: `scripts/lib/e2eGate.js` tem diff
vazio, e os testes que travam o total ("exatamente 23") e cada requisito antigo
continuam verdes na suite.

## Limpeza do banco depois do gate

Residuo **0** em todos os padroes de teste, e nenhuma linha orfa, conferido
depois da execucao oficial. Saida completa no `E2E_REPORT.md`.

## A13 - `verify:deploy` inalterado e somente leitura

`git diff` do `scripts/verify-deploy.js` contra a v0.11.0: vazio. A v0.12.0 nao
tem rota nova; o P13 continua verde.

```text
verify:deploy simulado (local, http)   FAIL, exit 1 - 7 PASS, D2 FAIL (sem TLS local)
verify:deploy REAL (somente leitura)   1a execucao: FAIL, exit 1 - 7 PASS, D1 FAIL
                                       "nao foi possivel consultar: This operation was
                                       aborted" (servico do Render dormindo)
                                       2a execucao: FAIL, exit 1 - 7 PASS, D1 FAIL
                                       "repositorio declara 0.12.0 e o deploy anuncia 0.7.0"
```

Os FAIL sao os esperados. Os sete PASS do real medem a 0.7.0. No simulado, o D8
inspecionou os bundles desta versao: nenhum segredo. Saidas literais no
`E2E_REPORT.md`.

## A14 - varredura do nome antigo

```text
=== varredura de 'nutriva' (sem diferenciar maiuscula), fora de node_modules, dist, .git e releases
./AUDIT_REPORT.md
./backend/tests/productName.test.js
./CHANGELOG.md
=== ocorrencias por arquivo
./AUDIT_REPORT.md:20
./backend/tests/productName.test.js:3
./CHANGELOG.md:24
```

O nome antigo aparece so em `backend/tests/productName.test.js`, o teste que o
procura, e nas secoes historicas do `AUDIT_REPORT.md` e do `CHANGELOG.md` - como
na v0.11.0.

## A15 - versao nos sete pontos

```text
package.json                                       0.12.0
backend/package.json                               0.12.0
package-lock.json (raiz e packages[""])            0.12.0 / 0.12.0
backend/package-lock.json (raiz e packages[""])    0.12.0 / 0.12.0
GET /api/health (app real, em memoria)             0.12.0
README.md (titulo)                                 # NutriScan v0.12.0
CHANGELOG.md (entrada mais recente)                ## NutriScan v0.12.0 - 2026-10-30
```

O `/api/health` foi lido de verdade, numa instancia do app em memoria; a versao
dele vem do `package.json` (fonte unica, P8).

## Observacoes descritas e NAO corrigidas - para decisao

Fora da secao 6, ou dentro dela mas fora do que a versao pode mudar. Descritas,
como manda a secao 16.

1. **Codigo com menos de 6 digitos digitado na camera vira busca por nome**, e
   nao recusa por tamanho: "12345" procura um alimento chamado "12345". Com 6 ou
   mais digitos, a recusa por tamanho funciona. Era assim antes; mudar e regra
   de consulta, nao de apresentacao.
2. **Anuncio em dobro possivel.** Ao abrir um produto, a linha de status
   ("Nutella carregado.") e a regiao do veredito falam em seguida - duas
   mensagens `polite`, a segunda com o estado. Ao marcar uma alergia com produto
   aberto, a lista de alergias escolhidas (`aria-live` desde antes) e o veredito
   mudam juntos. So o leitor de tela real dira se isso incomoda; calar a linha
   de status ao abrir produto seria a correcao, se incomodar.
3. **O chat ainda diz "sem conflito" para produto sem dado de alergenico**
   (v0.10.0): o veredito do assistente e o do backend, que nao recebe
   `allergenDataAvailable`. Mudar isso e mudar o veredito, que esta versao nao
   pode.
4. **Telas fora do escopo** - conta, exportacao, exclusao, historico, favoritos,
   entrar, cadastrar - nao foram auditadas. Herdado: a tela Conta rola de lado em
   320 px.
5. **Ampliacao de texto e reflow (1.4.4, 1.4.10)** nao estavam na lista e nao
   foram testados.
6. **A prop `alertLevels` da tela do produto ficou sem uso**: o nivel de alerta
   agora chega pelo veredito. Mantida para nao mudar a interface do componente.

## O que esta versao NAO prova

- **Leitor de tela real: NAO VERIFICADO.** Nenhum teste ouviu NVDA, JAWS,
  VoiceOver ou TalkBack. A informacao esta exposta - papel, nome, regiao viva,
  ordem -, mas se o alerta e bem recebido e verificacao humana, aberta. O roteiro
  esta em `docs/ACESSIBILIDADE.md`.
- **Toque em aparelho real: NAO VERIFICADO.** Alvos medidos no navegador do
  ambiente, em tamanho de celular emulado.
- **A camera em hardware real: NAO EXECUTADO.**
- **O deploy real da 0.12.0: NAO EXECUTADO.** Nada foi publicado; no ar esta a
  0.7.0.
- **Outros navegadores:** so o Chromium do painel do ambiente foi aberto.
- **Conformidade WCAG: nao declarada.** Adequacao clinica e conformidade
  juridica tambem nao.

## Auditoria da v0.11.0 - 2026-10-16

## Escopo

Entrada 0.10.0, saida 0.11.0. Leitura sem rede: rever, sem internet, o que ja
passou por este aparelho. Minor: capacidade nova de produto. Nao ha migration,
rota nova nem variavel nova.

**Isto nao e orientacao de saude nem de nutricao.** O relatorio descreve o que o
software faz. Ele nao declara o NutriScan clinicamente adequado nem em
conformidade juridica.

Preservado sem refatoracao, como a secao 3 mandou. O `git diff` contra a v0.10.0
(commit `0374bb3`) e VAZIO em todo o `backend/src/`, em todo o `shared/`, em
`scripts/verify-deploy.js`, em `src/services/productLookup.js`,
`src/services/openFoodFactsService.js` e `src/services/compareService.js`. A
comparacao, `amarrarExplicacoes`, os tres estados de alergenico, a matriz de
severidade, C1, digito verificador, canonicalizacao, tetos, isolamento,
exportacao, exclusao, handler de erro e fail-closed nao mudaram uma linha.

Codigo de producao da entrega (secao 6), todo no cliente:

```text
NOVO  src/services/offlineCache.js        o cache: IndexedDB, lista fechada, por dono
NOVO  src/services/offlineLookup.js       ler o aparelho e refazer o veredito
NOVO  src/services/offlineSession.js      sessao sem rede, sair, excluir, 401, e a
                                          porta unica de escrita
NOVO  src/components/common/OfflineNotice.jsx   o aviso "do aparelho"
      src/App.jsx                         a ligacao: busca, sessao, colecoes, escritas,
                                          assistente e comparacao sem rede
      src/components/food/ProductAnalysis.jsx   a marca de origem e o veredito do aparelho
      src/pages/Compare/ComparePage.jsx   a data na coluna; "nao guardado neste aparelho"
      src/services/storageService.js      limparAlergiasDeVisitante (cadastro aceito)
      src/styles-v070.css                 so acrescimo; styles.css intocado
```

Gate e testes: `scripts/e2e-real.js` (subgate `offlineCache`),
`scripts/lib/e2eGate.js` (requisito novo), `scripts/mutation-check.js` (14
mutantes novos; W11, X9 e Y9 apontam para o teste do total renomeado),
`backend/tests/offline.test.js` (novo) e `backend/tests/e2eGate.test.js` (23
requisitos). `fake-indexeddb` 6.2.5 entrou como dependencia de desenvolvimento,
com versao fixa: a 6.2.6 tinha sido publicada no mesmo dia, depois de quase um
ano sem versao nova, e por cautela ficou a anterior.

## Mecanismo de armazenamento: IndexedDB, e por que (6.3)

Um banco IndexedDB proprio, `nutriscan-offline`, versao 1, com quatro lojas.

- **Nao `localStorage`:** e sincrono e pequeno. 300 produtos com ingredientes e
  tabela nutricional, lidos e reescritos inteiros a cada abertura, travariam a
  tela de um celular simples - e o limite dele fica perto do volume.
- **Nao cookie:** iria ao servidor em toda requisicao. A secao 6.3 proibe.
- **IndexedDB:** assincrono, guarda objeto estruturado, indexa por dono, e tem
  cota grande (medida abaixo).
- **Verificavel por teste:** nos testes e no gate, o IndexedDB e o do
  `fake-indexeddb` - uma implementacao completa da API, nao um objeto que finge
  sucesso -, e a conferencia NAO usa o leitor do proprio modulo: abre cada banco
  que existir (`indexedDB.databases()`) e le cada chave e cada valor, cru. No
  navegador de verdade, a mesma leitura crua foi feita no IndexedDB do Chromium
  (ver "A verificacao no navegador").

Se o navegador nao oferece IndexedDB ou ele falha (modo privado, cota), o app
segue funcionando com rede; so nao havera copia para usar sem ela.

## O que entra no cache, e o que NUNCA entra - item a item

```text
loja       chave              o que guarda
produtos   [dono, codigo]     os campos de CAMPOS_DO_PRODUTO (abaixo) e guardadoEm -
                              a data em que o dado veio da internet
perfis     dono               id e nome da conta, alergias, nivel de alerta, guardadoEm
colecoes   dono               historico e favoritos: id, productCode, productName,
                              productBrand, imageUrl (so https), viewedAt/createdAt
sessao     "atual"            qual conta (dono) esta aberta neste aparelho
```

`CAMPOS_DO_PRODUTO` - os campos que o motor de alergia e a tela leem, os mesmos
que o app pede a Open Food Facts: `code`, `product_name`, `product_name_pt`,
`product_name_en`, `brands`, `quantity`, `image_front_url` (so https),
`ingredients_text`, `ingredients_text_pt`, `ingredients_text_en`, `ingredients`,
`allergens`, `allergens_tags`, `traces`, `traces_tags`, `labels_tags`,
`categories_tags`, `nutriments` (so numero ou texto curto), `nutriscore_grade`,
`nutrition_grades`, `nutrition_data_per`, `serving_size`. Texto ate 10 000
caracteres; lista ate 200 itens.

O que NUNCA entra:

```text
allergyVerdict - nem nenhum resultado do motor (verdict, safety, minimumSafety,
                 conflicts, profileRisks, allRisks, hasData)
senha, hash, salt, token de sessao, hash de sessao, cookie, chave de API
e-mail - nao e preciso para ler um rotulo sem rede
qualquer campo fora das listas acima
```

**A lista fechada vale na escrita E na leitura** (`reduzirProduto`): dado da Open
Food Facts continua nao confiavel por estar no aparelho. Um registro alterado no
banco - com `allergyVerdict`, imagem `javascript:` ou texto de 50 000 caracteres -
sai da leitura sem o campo, sem a imagem e cortado (teste "dado da Open Food
Facts continua nao confiavel no cache").

**"salt", na varredura do navegador real:** a unica chave que casou com "salt"
foi `salt_100g` - o nutriente sal, dentro de `nutriments`. Os testes tratam isso
de proposito: o produto de teste tem sal, e o O11 exige que "salt" so apareca
como nutriente, com valor de nutriente.

## O veredito: recalculado, nunca lido de cache - e onde

```text
src/services/offlineLookup.js
  avaliarNoAparelho(produto, { profileAllergies, alertLevels })
    analyzeProductAllergens   (shared/allergenEngine.js)
    buildAllergyVerdict       (shared/allergyVerdict.js), allergenDataAvailable
    applyAllergyAuthority     (shared/allergyVerdict.js) - o piso

src/App.jsx
  vereditoDoAparelho = useMemo(() => avaliarNoAparelho(product, {
    profileAllergies: selectedAllergies, alertLevels }), [... selectedAllergies, alertLevels ...])
```

O produto lido do aparelho vem sem veredito - o cache nao o tem. O veredito e
refeito a cada render, com o perfil que o app tem NAQUELE momento: muda o perfil,
muda o veredito. O perfil do aparelho e sempre o ultimo que o servidor confirmou
(`aoConfirmarConta` roda no login, no cadastro, no `me` e a cada alergia salva).
A severidade da v0.9.0 vale igual: alerta maximo + declarado da `urgent`, alerta
maximo + traco da conflito com `caution` (O5). Sem segunda implementacao: o O6
compara a saida com a do motor, produto a produto, e confere que o modulo nao
tem dicionario de alergenico.

## Como o logout e a exclusao limpam o cache

```text
src/services/offlineSession.js
  aoSairDaConta({ sair })       sair() no servidor (responda ou nao) -> apagarContas()
  aoExcluirConta(senha, ...)    excluir() no servidor; SO com sucesso -> apagarContas()
  recuperarSessao({ getMe })    401 -> apagarContas()
src/App.jsx
  restoreGuestSession           toda volta a visitante -> aoPerderSessao()
  cadastro aceito               limparAlergiasDeVisitante()
src/services/offlineCache.js
  apagarContas()                apaga perfil, listas, produtos e a marca de sessao de
                                TODA conta; o do visitante fica. Se a limpeza fina
                                falhar, apaga o banco inteiro.
  guardarPerfil()               confirmar uma conta apaga o cache de qualquer outra
```

- **Logout:** o cache da conta sai SEMPRE, mesmo sem resposta do servidor.
- **Exclusao:** so depois de o servidor confirmar. Exclusao recusada (senha
  errada, sem rede) nao faz o aparelho esquecer uma conta que existe - o O10
  confere os dois lados, e o navegador tambem.
- **Sessao recusada (401):** expirou, saiu em outro aparelho, conta excluida em
  outro aparelho - o cache sai na proxima vez que este aparelho falar com o
  servidor.
- **Cadastro:** as alergias marcadas como visitante vao para a conta nova e saem
  da chave de visitante. Sem isso, depois de sair, o perfil de alergias de quem
  saiu continuaria no navegador como "de visitante".
- **O do visitante fica:** e dele, e nunca veio de uma conta.

## 6.1 - o que fica disponivel sem rede, e a comparacao

Sem rede: o perfil de alergias e o nivel de alerta da conta aberta no aparelho;
os produtos ABERTOS com internet neste aparelho; a consulta por codigo, so desses
produtos; o veredito refeito; as listas de historico e favoritos como estavam na
ultima conexao. Fora: busca de produto novo (por codigo ou por nome), o
assistente, comparacao com produto nao guardado, exportacao, exclusao, login.

So o que foi ABERTO entra no cache - "com os dados que o app ja tinha". Um item do
historico aberto em OUTRO aparelho aparece na lista, mas abrir diz que nao esta
disponivel offline: o app nao busca 300 produtos na Open Food Facts para encher o
cache sem a pessoa pedir.

**A comparacao funciona sem rede quando os DOIS estao guardados.** Ela e a
mesma: `consultarDoisProdutos` - com a conferencia de codigo e a recusa de
codigos iguais - com a busca trocada pela leitura do aparelho, e
`compararNoAparelho`, o modulo compartilhado. Justificativa: a pessoa com as duas
embalagens que ja viu, no corredor sem sinal, e exatamente o caso da v0.10.0, e o
motor nao precisa de rede. Cada coluna diz de quando e o dado; se um nao esta
guardado, a coluna diz "nao esta guardado neste aparelho", como a 6.5 da v0.10.0
manda. A comparacao sem rede vale com o navegador sem rede; com internet
instavel, a comparacao segue o comportamento da v0.10.0 (o que veio aparece, o
que faltou e dito).

## 6.2 - tamanho e expiracao

**Tamanho.** O cache acompanha os limites que ja existiam: 100 no historico, 200
nos favoritos - no maximo 300 produtos por conta, com corte pelo mais antigo, e a
poda tira o que saiu das duas listas.

Estimativa, com medicao (A4):

```text
amostra: os 100 produtos brasileiros mais escaneados da Open Food Facts,
         passados pela MESMA lista fechada e medidos como o registro guardado

por produto     media 3 029 B   mediana 2 944 B   p90 4 068 B   maior 7 434 B
no navegador    Leite Moca 2 406 B, Coca-Cola 2 491 B (registros reais no IndexedDB)

300 produtos    pela media      ~0,9 MB
                pelo maior      ~2,2 MB
listas          300 referencias, ~250 B cada         ~75 KB
perfil e sessao                                      < 1 KB

teto teorico    a conta pelos limites da lista fechada: 13 textos de 10 000
                caracteres, allergens e traces e as 4 listas de etiquetas de 200
                itens de 200 caracteres, 300 nutrientes - ~416 mil caracteres
                por produto, ~125 milhoes para 300. Nunca observado: o maior
                produto da amostra tem 7 434 B
cota medida     Chromium desta maquina: 3,28 GB (navigator.storage.estimate)
```

Cabe com folga onde foi medido. A cota num celular varia com o navegador e o
espaco livre do aparelho e **nao foi medida**. Se o navegador recusar a gravacao
(cota cheia), o app segue funcionando com rede - so nao havera copia para usar
sem ela.

**Expiracao: 30 dias, e dado vencido e tratado como AUSENTE.** O produto guardado
vale 30 dias a contar de quando veio da internet. Passado isso, ele nao e servido:
"Sem internet. O dado do produto 5449000000996 neste aparelho e de 15/09/2026,
antigo demais para usar. Confira o rotulo."

- Por que expirar: rotulo muda - reformulacao de receita e real, e para alergia
  importa. Servir para sempre seria assumir que o rotulo de seis meses atras
  ainda e o da prateleira.
- Por que 30 dias: cobre a compra da semana e a do mes, que e o uso real; um mes
  e curto perto do ritmo de reformulacao, e longo o bastante para o aparelho ser
  util.
- Por que ausente, e nao "com aviso de idade": um aviso de idade no topo de um
  veredito "sem conflito" ainda e lido como "sem conflito". Num app de alergia,
  dado velho demais nao deve chegar a virar veredito.
- Abrir o produto com internet renova a copia e a data. O perfil nao vence: e da
  propria pessoa e so muda por acao dela; aparece com a data de quando o servidor
  o confirmou.

## 6.4 - deteccao de rede, e "online mas sem resposta"

```text
navegador diz offline              nem tenta a rede: o aparelho, marcado "Sem internet"
online, Open Food Facts nao        com o produto guardado: 6 s sem resposta -> o do
responde                           aparelho, marcado "A internet esta demorando"; a
                                   resposta que chegar depois troca a tela, e "nao
                                   encontrado" fresco derruba a copia. A internet
                                   desistindo -> fica o do aparelho, "A internet nao
                                   respondeu". Sem o produto guardado: a espera de
                                   sempre, e no fim "nao disponivel offline"
online, servidor NutriScan nao     a sessao do aparelho, com aviso "Sem conexao com o
responde                           servidor. Perfil guardado neste aparelho em ..."; o
                                   evento online faz o app pedir ao servidor de novo
com rede de verdade                a rede manda; o produto aberto atualiza a copia
```

Justificativa: o navegador dizendo offline e confiavel o bastante para nao
esperar nada. "Online" nao e: a consulta por codigo da Open Food Facts insiste
tres vezes, ate 8 s cada - mais de 20 s de tela parada no corredor. Com o produto
guardado, 6 s e o teto de espera; e a resposta da rede, quando chega, continua
mandando, porque ela e a fonte de verdade.

## Nenhuma escrita sem rede (5.5)

Com conta, toda escrita passa por `escreverComInternet`: sem rede, a acao nao e
feita e nada e guardado - nem para depois. Favoritar, apagar item do historico,
limpar o historico, desfavoritar; marcar alergia e mudar o nivel de alerta sao
barrados antes de mudar a tela. O produto lido do aparelho nao grava historico
nem renova o cache.

Visitante: o que ele marca continua indo so para o proprio navegador, como sempre
foi - sem servidor, sem fila e sem sincronizacao. Nao e escrita nova desta
versao.

Fila de sincronizacao NAO foi implementada, como a 5.5 mandou.

## A1 - O1 a O16, R1 a R7

Todos presentes e verdes na suite completa contra PostgreSQL real (A7). Os O sao
testes de CLIENTE e nao dependem de banco: verdes tambem sem ele.

```text
tests/offline.test.js
O1   O1 produto no aparelho + sem rede: os dados do cache, marcados, com a data do dado
     O1 a tela do produto vindo do aparelho diz de onde veio e de quando
O2   O2 produto NAO guardado + sem rede: 'nao disponivel offline', explicito - nunca resultado vazio nem aproximado
O3   O3 o cache NAO contem allergyVerdict nem resultado do motor em nenhuma chave
O4   O4 perfil alterado DEPOIS do cache: a leitura offline reflete o perfil NOVO
O5   O5 severidade offline: estrito+declarado urgent; estrito+traco conflito caution; padrao como sempre
O6   O6 o motor offline e o de shared/, sem segunda implementacao
O7   O7 codigo invalido offline e recusado pela mesma funcao, ANTES de consultar o cache
O8   O8 UPC-A offline acha o produto guardado como EAN-13 - e o contrario
O9   O9 LOGOUT limpa o cache: nenhuma chave e nenhum VALOR com o id de alergia ou o historico da conta
     O9 cadastro: as alergias de visitante vao para a conta e saem do armazenamento local
     O9 o App limpa o cache ao sair - e em toda volta a visitante
O10  O10 exclusao de conta limpa o cache no aparelho - so depois de o servidor confirmar
O11  O11 o cache nunca contem senha, hash, salt, token, cookie, chave de API nem e-mail
O12  O12 o cache de A nao e legivel por B no mesmo aparelho
O13  O13 com rede, o app usa a rede: o cache nao impede consulta fresca
     O13 produto reaberto com rede substitui a copia antiga do aparelho, com data nova
O14  O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram
O15  O15 'online mas sem resposta': passado o prazo, o aparelho; a resposta da rede ainda manda
     O15 a sessao 'sem resposta' usa o perfil do aparelho, marcado; 401 tira o cache
O16  O16 dado expirado nao e servido como valido: depois de 30 dias, e tratado como ausente, com o motivo
     o cache nunca passa de 300 produtos por dono, e a poda segue historico e favoritos
     dado da Open Food Facts continua nao confiavel no cache: a lista fechada vale na leitura tambem
```

**O armazenamento destes testes, dito como e.** O IndexedDB e o do
`fake-indexeddb` (implementacao completa da API, inspecionada crua); o
`localStorage` dos testes e uma implementacao em memoria da Web Storage API,
inspecionada do mesmo jeito. Nenhum teste passa sem ler o que foi guardado. O que
eles NAO provam - o IndexedDB e o `localStorage` do navegador de verdade - foi
conferido no Chromium, com a mesma leitura crua (abaixo). Por isso O3, O9, O11 e
O12 nao ficam NAO COMPROVADOS: tem prova em Node e prova no navegador.

**O13 e O15 tem parte estatica.** A decisao de "rede primeiro" e do prazo de 6 s
mora no `App.jsx`, ao lado da linha
`const resultado = await consultarProdutoPorCodigo(nextQuery, { origem });`, que e
ancora do mutante P3 e e exigida pelo teste "o caminho manual nao monta o
resultado por conta propria" - nao foi movida. Os testes conferem a ligacao no
fonte, o prazo com relogio simulado, e o navegador conferiu o comportamento: com
a API fora e a Open Food Facts de pe, o produto veio da rede, sem marca de
aparelho.

R1 a R7 - regressao, verdes na mesma execucao (118 testes):

```text
R1  C1              T1 exploit C1: modelo negando conflito nao entrega falso seguro
R2  severidade      S1, S2, S3, S4 - a matriz - e S5 (unitario e com o banco) (6)
R3  comparacao      C1t, C2t, C3t, C4t (unitarios e com o banco) (6)
R4  amarracao       C5t (2), C7t (2)
R5  isolamento      I1, I2, I3, I4 e V1, S16, C13 (13); exportacao E1 a E8 (14);
                    exclusao D1 a D9 (13)
R6  digito          M1 (5), M3 (3), M9 (2); canonicalizacao N1 a N1g (14);
                    tetos R1, R2, R5, R6, R7, R11 (10; 403 de 3000 por IP); C15 (1)
R7  handler         O2a a O2e (11), P5 (4); fail-closed P9 (6) e MODO (2);
                    verify:deploy somente leitura P13 (3)
```

## A2 - validacao por mutacao

Rodada completa, com banco, sobre o codigo entregue:

```text
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<PostgreSQL LOCAL> DATABASE_SSL=false \
  node scripts/mutation-check.js --com-banco
```

```text
mortas 123 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
REPROVADO: ha teste que nao detecta o defeito que deveria detectar.
=== EXIT: 1 ===
```

**124 mutantes: 123 mortos, 1 sobrevivente (W1, o equivalente da v0.8.0), 0 nao
executados, 0 inaplicaveis.** A linha de base - as 17 suites sem mutacao,
incluida a nova (`tests/offline.test.js`) - estava verde antes e depois. **Os 14
mutantes novos morreram todos.** O script sai com codigo 1 por causa do W1, e
isso fica registrado como esta.

### Os mutantes pedidos pelo prompt (O3, O4, O9, O11, O14)

```text
pedido pelo prompt                                  mutante  teste que o pegou  resultado
o cache passa a guardar o allergyVerdict            Z1       O3                 MORTA
a leitura offline passa a usar o perfil do cache    Z2       O4                 MORTA
o logout deixa de limpar o cache                    Z3       O9                 MORTA
o cache passa a guardar o token de sessao           Z4       O11                MORTA
favoritar offline passa a enfileirar escrita        Z5       O14                MORTA
                                                    Z5b      O14                MORTA
```

O que cada um injeta:

- **Z1** - `offlineCache.js`: o registro do produto ganha `allergyVerdict` ao
  lado do produto reduzido - fora da lista fechada, onde ela nao alcanca.
- **Z2** - `offlineCache.js`: o perfil so e gravado se ainda nao existe. O
  aparelho fica com o perfil do momento em que o cache foi populado, e a leitura
  sem rede passa a usa-lo.
- **Z3** - `offlineSession.js`: `aoSairDaConta` deixa de chamar `apagarContas`.
- **Z4** - `offlineCache.js`: o perfil guardado ganha `token`.
- **Z5** - `offlineSession.js`: sem rede, a escrita e posta numa fila no
  `localStorage` (`nutriscan:fila-offline`) para depois.
- **Z5b** - a outra metade: sem rede, a escrita e feita mesmo assim.

### Os outros oito mutantes novos

```text
Z6   O2   produto ausente volta como resultado vazio que parece resposta    MORTA
Z7   O7   codigo invalido passa a consultar o cache                         MORTA
Z8   O8   a chave do produto deixa de ser a forma canonica                  MORTA
Z9   O10  a exclusao da conta deixa de limpar o cache                       MORTA
Z10  O12  uma conta nova deixa de apagar o cache da anterior                MORTA
Z11  O16  dado expirado passa a ser servido como valido                     MORTA
Z12  O15  sessao recusada (401) deixa de tirar o cache                      MORTA
Z13  A11  o gate perde o requisito offlineCache                             MORTA
```

(Z1 a Z13, mais o Z5b: 14 mutantes.)

### Tres mutantes antigos ajustados - sem mudar o defeito

**W11** (v0.8.0), **X9** (v0.9.0) e **Y9** (v0.10.0) - o gate perde um
requisito - sao os mesmos mutantes; o teste que os pega foi renomeado de
"exatamente 22 requisitos" para "exatamente 23". MORTAS.

### O sobrevivente: W1, o mesmo da v0.8.0

O W1 faz o repositorio da exportacao devolver a linha inteira de `users`, mas o
servico monta o arquivo campo a campo - a exportacao nao muda, e o teste esta
certo em passar. E equivalente, foi descrito na v0.8.0 com a demonstracao de que
a suite estatica (`nunca usa SELECT *`) o pega, e esta versao nao mexeu nele nem
no `mutation-check.js` por causa dele.

### A rodada inteira

Linha de base:

```text
[linha de base - antes] 17 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
  VERDE    tests/comparison.test.js
  VERDE    tests/comparisonIntegration.test.js
  VERDE    tests/offline.test.js
```

```text
T1  P2   MORTA                  "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta" falhou, como deveria
T1b  P2   MORTA                  "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost" falhou, como deveria
T2  P5   MORTA                  "P5 erro do driver do banco nao chega ao cliente" falhou, como deveria
T2b  P5   MORTA                  "P5 o detalhe do erro vai para o log do servidor" falhou, como deveria
T3  P9   MORTA                  "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual" falhou, como deveria
T3b  P9   MORTA                  "P9 valor booleano nao reconhecido nao cai em default silencioso" falhou, como deveria
T4  P12  MORTA                  "P12 versao no ar diferente da do repositorio reprova o D1" falhou, como deveria
T5  P13  MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
T5b  P13  MORTA                  "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada" falhou, como deveria
T6  P3   MORTA                  "P3 CORS devolve a origem configurada, nunca a do request" falhou, como deveria
T7  P4   MORTA                  "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha" falhou, como deveria
T8  P11  MORTA                  "P11 NOT_EXECUTED nao conta como PASS no agregado" falhou, como deveria
T9  P11  MORTA                  "P11 o comando de verdade sai com codigo 1 quando um subgate falha" falhou, como deveria
V1  S1/S4 MORTA                  "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO" falhou, como deveria
V1b  S2   MORTA                  "S2 render.yaml nao declara variavel que o codigo nao le" falhou, como deveria
V1c  S3   MORTA                  "S3 nenhuma credencial com valor literal no render.yaml" falhou, como deveria
V2  O2a  MORTA                  "O2a JSON malformado responde 400, nao 500 - a medicao do auditor" falhou, como deveria
V3  O2d  MORTA                  "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status" falhou, como deveria
V3b  O2d  MORTA                  "O2d copiar o type do body-parser nao basta para ganhar 400" falhou, como deveria
V4  R7   MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
U1  C2   MORTA                  "C2 a camera nunca transforma um codigo em outro" falhou, como deveria
U2  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U3  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U4  O2e  MORTA                  "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor" falhou, como deveria
U4b  O2e  MORTA                  "O2e copiar name, type e status do corpo grande nao basta para ganhar 413" falhou, como deveria
U5  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U5b  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U6  MIG  MORTA                  "MIG migration que nao alcanca o banco falha dizendo por que" falhou, como deveria
U7  MIG  MORTA                  "o doctor conta as mesmas migrations que o runner aplica, .sql e .js" falhou, como deveria
U8  ORC  MORTA                  "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP" falhou, como deveria
W1  E2   MUTACAO SOBREVIVEU     a suite passou com o defeito aplicado
W1b  E2   MORTA                  "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor" falhou, como deveria
W2  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W2b  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W3  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W3b  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W4  D2   MORTA                  "D2 exclusao com senha errada nao remove nada" falhou, como deveria
W5  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W5b  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W6  D8   MORTA                  "D8 falha simulada no meio da exclusao deixa o estado anterior intacto" falhou, como deveria
W7  E8   MORTA                  "E8 a rota real recusa a exportacao acima do teto do usuario" falhou, como deveria
W8  D9   MORTA                  "D9 a tentativa com senha errada gasta o mesmo balde do login" falhou, como deveria
W9  D1   MORTA                  "D1 exclusao com a senha correta remove a conta e limpa o cookie" falhou, como deveria
W10  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W10b  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W11  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
S1  N1a  MORTA                  "N1 o schema canonicaliza UPC-A para EAN-13" falhou, como deveria
S1b  N1a  MORTA                  "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" falhou, como deveria
S1c  N1c  MORTA                  "N1c requisicao DIRETA ao backend grava a forma canonica" falhou, como deveria
S2  N1e  MORTA                  "N1e o schema nao altera EAN-13 nem EAN-8" falhou, como deveria
S2b  N1d  MORTA                  "N1d codigo nao-EAN passa intacto pela canonicalizacao" falhou, como deveria
S3  N1g  MORTA                  "N1g a migration funde as duas formas pela regra declarada" falhou, como deveria
S4  N1g  MORTA                  "N1g a migration e idempotente e nao toca codigo nao-EAN" falhou, como deveria
S5  R2   MORTA                  "N1 a canonicalizacao nao afrouxa a conferencia do digito" falhou, como deveria
S6  N1   MORTA                  "N1 a canonicalizacao usa shared/barcode.js, sem copia local" falhou, como deveria
P1  M1   MORTA                  "M1 codigos com digito verificador errado sao recusados pelo motivo certo" falhou, como deveria
P1b  M1   MORTA                  "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos" falhou, como deveria
P2  M3   MORTA                  "M3 o backend recusa productCode com digito verificador invalido" falhou, como deveria
P2b  M3   MORTA                  "M3 a regra do backend e estreita e nao quebra cadastro legitimo" falhou, como deveria
P3  M4   MORTA                  "o caminho manual nao monta o resultado por conta propria" falhou, como deveria
P3b  M4   MORTA                  "M2 codigo invalido nao chega a rede" falhou, como deveria
P4  M5   MORTA                  "M5 o piso de risco vale no caminho manual" falhou, como deveria
P5  M9   MORTA                  "M9 nao existe segunda implementacao do digito verificador" falhou, como deveria
P5b  M9   MORTA                  "M9 backend e frontend usam a MESMA implementacao de shared/" falhou, como deveria
P6  M7   MORTA                  "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo" falhou, como deveria
P7  M6   MORTA                  "M6 cada motivo de recusa tem mensagem propria" falhou, como deveria
P8  M8   MORTA                  "M8 nenhum outro caractere e removido em silencio" falhou, como deveria
P9  M10  MORTA                  "M10 o backend recusa gravar codigo com digito verificador invalido" falhou, como deveria
N1  R1/R3 MORTA                  "R1 usuario dentro do teto mas IP estourado recebe 429" falhou, como deveria
N1b  R3   MORTA                  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP" falhou, como deveria
N2  R2   MORTA                  "R2 IP dentro do teto mas usuario estourado recebe 429" falhou, como deveria
N2b  R4   MORTA                  "R4 dois usuarios atras do MESMO IP mantem cotas separadas" falhou, como deveria
N3  R4   MORTA                  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP" falhou, como deveria
N4  R5   MORTA                  "R5 dados forjados no request nao conseguem balde de IP novo" falhou, como deveria
N5  R5   MORTA                  "R5 um bloco IPv6 /64 nao vira infinitos baldes" falhou, como deveria
M1  R6   MORTA                  "R6 os tres tetos por rota seguem nos valores declarados" falhou, como deveria
M2  R7   MORTA                  "R7 o teto por IP esta no valor medido" falhou, como deveria
M3  Q3   MORTA                  "Q3 nenhuma variavel de ambiente desliga os limitadores" falhou, como deveria
M3b  Q4   MORTA                  "Q4 nenhum dos limitadores tem opcao de pular requisicao" falhou, como deveria
M4  Q2   MORTA                  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto" falhou, como deveria
M6  R9   MORTA                  "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7  R9   MORTA                  "I2 usuario B nao remove item de A" falhou, como deveria
X1  S2   MORTA                  "S2 alerta maximo + conflito declarado: piso urgent" falhou, como deveria
X2  S3   MORTA                  "S3 alerta maximo + traco: conflito no veredito, piso caution" falhou, como deveria
X3  S5   MORTA                  "S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos" falhou, como deveria
X4  S6   MORTA                  "S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta" falhou, como deveria
X5  S12  MORTA                  "S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations" falhou, como deveria
X6  S13  MORTA                  "S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations" falhou, como deveria
X6b  S13  MORTA                  "S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo" falhou, como deveria
X7  S17  MORTA                  "S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo" falhou, como deveria
X8  S18  MORTA                  "S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot" falhou, como deveria
X9  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
X10  S9   MORTA                  "S9 nivel para alergia ausente do perfil e recusado pela validacao" falhou, como deveria
X11  S1   MORTA                  "S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0" falhou, como deveria
X12  S8   MORTA                  "S8 nivel desconhecido e recusado pela validacao" falhou, como deveria
X13  S16  MORTA                  "S16 o nivel de A nao e visivel nem alteravel por B" falhou, como deveria
Y1  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y2  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y3  C5t  MORTA                  "C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo" falhou, como deveria
Y4  C7t  MORTA                  "C7t o modelo nao escreve, nao altera e nao reordena veredito" falhou, como deveria
Y5  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5b  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5c  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y6  C6t  MORTA                  "C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois" falhou, como deveria
Y7  C9t  MORTA                  "C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca" falhou, como deveria
Y8  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y8b  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y9  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
Y10  C13  MORTA                  "C13 a sessao de B com o id de A no corpo compara com o perfil de B" falhou, como deveria
Y11  C15  MORTA                  "C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente" falhou, como deveria
Z1  O3   MORTA                  "O3 o cache NAO contem allergyVerdict nem resultado do motor em nenhuma chave" falhou, como deveria
Z2  O4   MORTA                  "O4 perfil alterado DEPOIS do cache: a leitura offline reflete o perfil NOVO" falhou, como deveria
Z3  O9   MORTA                  "O9 LOGOUT limpa o cache: nenhuma chave e nenhum VALOR com o id de alergia ou o historico da conta" falhou, como deveria
Z4  O11  MORTA                  "O11 o cache nunca contem senha, hash, salt, token, cookie, chave de API nem e-mail" falhou, como deveria
Z5  O14  MORTA                  "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram" falhou, como deveria
Z5b  O14  MORTA                  "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram" falhou, como deveria
Z6  O2   MORTA                  "O2 produto NAO guardado + sem rede: 'nao disponivel offline', explicito - nunca resultado vazio nem aproximado" falhou, como deveria
Z7  O7   MORTA                  "O7 codigo invalido offline e recusado pela mesma funcao, ANTES de consultar o cache" falhou, como deveria
Z8  O8   MORTA                  "O8 UPC-A offline acha o produto guardado como EAN-13 - e o contrario" falhou, como deveria
Z9  O10  MORTA                  "O10 exclusao de conta limpa o cache no aparelho - so depois de o servidor confirmar" falhou, como deveria
Z10  O12  MORTA                  "O12 o cache de A nao e legivel por B no mesmo aparelho" falhou, como deveria
Z11  O16  MORTA                  "O16 dado expirado nao e servido como valido: depois de 30 dias, e tratado como ausente, com o motivo" falhou, como deveria
Z12  O15  MORTA                  "O15 a sessao 'sem resposta' usa o perfil do aparelho, marcado; 401 tira o cache" falhou, como deveria
Z13  A11  MORTA                  "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache" falhou, como deveria
mortas 123 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
```

## A3 e A4 - decisoes e estimativa de tamanho

As decisoes de 6.1 a 6.4 estao nas secoes acima. A estimativa de tamanho esta em
6.2.

## A5 a A9

```text
A5  npm run build                          sucesso
A6  npm --prefix backend test              434 testes, 359 pass, 0 fail, 75 skipped
                                           (72 exigem PostgreSQL, 1 a IA real,
                                           2 a Open Food Facts real - todos
                                           declarados NAO EXECUTADO, nenhum PASS)
A7  suite contra PostgreSQL real (local)   434 testes, 431 pass, 0 fail, 3 skipped
                                           (1 IA real, 2 Open Food Facts real)
A8  npm audit --audit-level=moderate       frontend: found 0 vulnerabilities
    npm --prefix backend audit (moderate)  backend:  found 0 vulnerabilities
A9  npm run verify:release                 exit 0 - build, testes, os dois audits e
                                           "secret scan - 0 real secrets" (na
                                           execucao final; ver abaixo)
```

O A7 rodou com `RUN_DB_INTEGRATION_TESTS=true` contra o PostgreSQL LOCAL (17,
porta 5433), com `DATABASE_URL` definida no comando - nunca contra o banco de
producao. Gastos da suite contra os tetos por IP, medidos na propria execucao:
`[R11] 403 de 3000` e `[exportacao] 17 de 20`.

**O `verify:release` nao passou de primeira - e o registro fica aqui:**

```text
verify:release 1  FAIL  build OK; testes 434 / 359 / 0 fail / 75 skipped; os dois
                        audits 0; secret scan: "1 suspicious file(s) -
                        backend/tests/offline.test.js". O O11 escrevia no fonte
                        duas iscas com o FORMATO de chave da Anthropic, para provar
                        que o cache nao guarda chave. O scan estava certo em barrar
                        o formato; o scan nao foi tocado. As iscas passaram a ser
                        montadas em tempo de execucao, como o verifyDeploy.test.js
                        ja fazia. Depois disso: a suite offline 23/23 e o mutante
                        do O11 (Z4) MORTO de novo.
verify:release 2  PASS  exit 0 - a arvore exata que foi para o ZIP, com este registro
```

## A10 - `verify:e2e`

**PASS, exit code 0, na primeira execucao**, com PostgreSQL real e Claude real -
2 chamadas pagas. Os 23 requisitos em `PASSED`, `ok: true`. A saida literal, a
tabela de subgates, a contagem por balde e o `E2E_LAST_RUN.json` integral estao
no `E2E_REPORT.md`. Nao ha migration nova: o doctor leu "4/4 applied".

```text
[OK] offline cache - perfil do banco e produto guardados, sem veredito nem credencial; perfil novo refeito sem rede; logout real limpa
```

**O subgate prova o que pode provar contra o backend real, e diz o que nao
prova.** A secao 8 pediu para dizer se o subgate nao pudesse ser provado contra o
backend real por ser comportamento de cliente. Parte pode: os modulos do cliente
(`offlineCache`, `offlineSession`, `offlineLookup`) foram alimentados pelas
respostas do backend real - perfil do PostgreSQL, cookie de sessao de verdade,
logout da API -, e o cache foi inspecionado cru contra o cookie real e contra
`password_hash`, `password_salt` e `token_hash` lidos do banco. Parte nao pode: o
IndexedDB do subgate e o do `fake-indexeddb`, e a ligacao com a tela nao passa
por ele. **Proposta, nao implementada:** um subgate que abra um navegador de
verdade (por exemplo, com Playwright), popule o cache pela tela, corte a rede e
inspecione o IndexedDB real - e o lugar certo para provar o comportamento do
cliente de ponta a ponta. Ate la, essa parte e a verificacao no navegador
descrita abaixo.

Contagem por balde:

```text
balde        usado   teto/usuario     teto/IP
assistente      2             20           -
auth            8             40           -
colecoes       20            300        3000
comparacao      4             30         300
exportacao      1              5          20
```

O subgate novo gastou 1 de auth (o cadastro da conta E) e 3 de colecoes.

## A11 - os 22 requisitos antigos continuam exigidos; agora sao 23

Prova por execucao, sobre o `E2E_LAST_RUN.json` desta versao: para cada
requisito do modo strict, um relatorio com SO aquele requisito em
`NOT_EXECUTED` tem de reprovar, e reprovar so por ele.

```text
requisitos no modo strict (flag da IA ligada): 23
faltando no E2E_LAST_RUN.json desta versao: []

requisito                origem   presente   NOT_EXECUTED sozinho reprova
backendProcess           v0.10.0  sim        sim, e so ele
database                 v0.10.0  sim        sim, e so ele
migrations               v0.10.0  sim        sim, e so ele
auth                     v0.10.0  sim        sim, e so ele
sessionSchema            v0.10.0  sim        sim, e so ele
multiDevice              v0.10.0  sim        sim, e so ele
isolation                v0.10.0  sim        sim, e so ele
logout                   v0.10.0  sim        sim, e so ele
assistantAuthority       v0.10.0  sim        sim, e so ele
deterministicEngine      v0.10.0  sim        sim, e so ele
fallback                 v0.10.0  sim        sim, e so ele
privacy                  v0.10.0  sim        sim, e so ele
historySync              v0.10.0  sim        sim, e so ele
favoritesSync            v0.10.0  sim        sim, e so ele
verdictFreshness         v0.10.0  sim        sim, e so ele
manualCodeLookup         v0.10.0  sim        sim, e so ele
accountExport            v0.10.0  sim        sim, e so ele
accountDeletion          v0.10.0  sim        sim, e so ele
severityVerdict          v0.10.0  sim        sim, e so ele
productComparison        v0.10.0  sim        sim, e so ele
offlineCache             v0.11.0  sim        sim, e so ele
anthropicReal            v0.10.0  sim        sim, e so ele
assistantAuthenticated   v0.10.0  sim        sim, e so ele

os 22 da v0.10.0 presentes: 22 de 22
novos: ["offlineCache"]
sem a flag da IA: 21 requisitos; offlineCache entre eles: sim
```

Os testes que travam isso na suite, verdes:

```text
A11: os 22 requisitos da v0.10.0 continuam exigidos, um a um
A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache
A11: offlineCache e requisito BASE e reprova sozinho          (inclusive "SKIPPED")
A11: os 21 requisitos da v0.9.0 continuam exigidos, um a um
A11: os 20 requisitos da v0.8.0 continuam exigidos, um a um
A11: os 18 requisitos da v0.7.6 continuam exigidos, um a um
A10: desde a v0.7.2 entraram so manualCodeLookup, os dois da v0.8.0, o da v0.9.0, o da v0.10.0 e o da v0.11.0, nomeados
D2: o conjunto de requisitos do modo strict e exatamente este
```

O teste da v0.10.0 que travava o total em "exatamente 22" foi substituido pelo de
"exatamente 23", que nomeia o unico requisito novo - nao removido sem troca. O
mutante Z13 (o gate perde `offlineCache`), o Y9, o X9 e o W11 provam que ele
pega a perda. `offlineCache` e BASE: depende do PostgreSQL e dos modulos do
cliente, nao chama IA - sem a flag da IA, o modo strict exige 21 (os 20 da v0.10.0
sem IA e ele); com a flag, os 23.

## A12 - limpeza do banco depois do gate

Residuo **0** em todos os padroes de teste, e nenhuma linha orfa. A conta E do
subgate novo cai no padrao `nutriscan-e2e-%`. Saida completa no `E2E_REPORT.md`.

## A13 - `verify:deploy` inalterado e somente leitura

`git diff` do `scripts/verify-deploy.js` contra a v0.10.0: vazio. A v0.11.0 nao
tem rota nova; o P13 continua verde.

```text
verify:deploy simulado (local, http)   FAIL, exit 1 - 7 PASS, D2 FAIL (sem TLS local)
verify:deploy REAL (somente leitura)   FAIL, exit 1 - 7 PASS, D1 FAIL
                                       "repositorio declara 0.11.0 e o deploy anuncia 0.7.0"
```

Os dois FAIL sao os esperados. Os sete PASS do real medem a 0.7.0. No simulado, o
D8 inspecionou os bundles novos: nenhum segredo - o cache nao tem chave, e o
bundle tambem nao.

## A14 - varredura do nome antigo

Fora de `node_modules`, `dist`, `.git` e `releases`, o nome antigo aparece so em
`backend/tests/productName.test.js`, o teste que o procura, e nas secoes
historicas do `AUDIT_REPORT.md` e do `CHANGELOG.md`.

## A15 - versao nos sete pontos

```text
package.json                             0.11.0
backend/package.json                     0.11.0
package-lock.json (raiz e "")            0.11.0 / 0.11.0
backend/package-lock.json (raiz e "")    0.11.0 / 0.11.0
/api/health de um processo real          D1 do alvo simulado: "ambos declaram 0.11.0"; E2E_LAST_RUN.json: 0.11.0
README                                   # NutriScan v0.11.0
CHANGELOG                                ## NutriScan v0.11.0 - 2026-10-16

dependencia @zxing/text-encoding         0.9.0 - intocada, como deve
```

## A verificacao no navegador - o armazenamento REAL

No navegador embutido do ambiente de desenvolvimento (Chromium), com o `dist/`
compilado servido na porta 3300 e a API local na 3200 (PostgreSQL local, sem
chave de IA), Open Food Facts REAL. O que se inspecionou foi o IndexedDB e o
`localStorage` do proprio Chromium, por `indexedDB.databases()` e leitura crua
de toda loja.

**Como o "sem internet" foi feito:** no JavaScript da pagina,
`navigator.onLine` passou a responder `false`, toda requisicao passou a falhar
e o evento `offline` foi disparado. Isso simula a falta de rede para o app; o
armazenamento continua sendo o real. O caso "online mas o servidor nao responde"
foi REAL: a API da porta 3200 foi derrubada, e a pagina recarregada.

```text
visitante marca Leite; cria conta pela tela   guest-allergies: ["milk"] -> null (foi para a conta)
liga o alerta maximo                          servidor { milk: "strict" }
abre Leite Moca e Coca-Cola com internet      IndexedDB nutriscan-offline: colecoes 1, perfis 1,
                                              produtos 2, sessao 1; localStorage vazio
varredura do conteudo inteiro                 nenhuma chave de veredito, senha, token, cookie,
                                              e-mail; nem o valor do e-mail nem o da senha.
                                              "salt" so como nutriente (salt_100g, o sal)
tamanho real                                  2406 e 2491 bytes por produto; cota do Chromium
                                              nesta maquina: 3,28 GB
muda o perfil COM internet (alerta padrao)    aparelho acompanha: { milk: "standard" }
sem internet: abre Leite Moca                 "Do aparelho · guardado em 16/10/2026"; veredito
                                              refeito: "Conflito com o seu perfil" (padrao, nao
                                              mais alerta maximo); 0 requisicoes
produto nunca aberto, sem internet            "Sem internet. O produto 7894900011517 nao esta
                                              disponivel offline..."; nenhum produto na tela
favoritar e mudar alergia, sem internet       0 requisicoes; armazenamento identico antes e depois
API derrubada de verdade, pagina recarregada  "Sem conexao com o servidor. Perfil guardado neste
                                              aparelho em 16/10/2026"; Leite segue marcado
mesma situacao, abre Leite Moca               consultou a Open Food Facts; sem marca de aparelho
API de volta, recarrega                       sessao confirmada; aviso some
assistente sem internet                       "Sem internet, o assistente nao responde"; 0 requisicoes
comparacao sem internet, os dois guardados    cada coluna "Do aparelho · guardado em 16/10/2026",
                                              Leite em conflito, Coca sem conflito
comparacao sem internet, um nao guardado      "Sem internet. O produto 7894900011517 nao esta
                                              guardado neste aparelho."
"Explicar as diferencas" sem internet         "Sem internet, o assistente nao responde..."
registro da Coca envelhecido para 31 dias     "... e de 15/09/2026, antigo demais para usar.
                                              Confira o rotulo."; nenhum produto na tela
SAIR DA CONTA, com internet                   IndexedDB: 0 registros; localStorage e
                                              sessionStorage vazios; nenhum "milk", "strict",
                                              id da conta, nome ou codigo de produto
EXCLUIR A CONTA pela tela (outra conta)       antes: perfil com "peanut" e 1 produto; depois:
                                              0 registros, nenhum "peanut"; /api/auth/me 401
exclusao NAO concluida (confirmacao sem a     cache intacto - correto: a conta continua existindo
caixa marcada)
320 px, sem internet, produto do aparelho     sem rolagem lateral; menor fonte dos avisos 17 px
```

As contas de teste foram apagadas do banco local no fim.

## Observacoes descritas e NAO corrigidas - para decisao

Fora da secao 6. Descritas, como manda a secao 15.

1. **Abrir o app ja sem sinal nao funciona.** O que funciona e o app aberto que
   perde o sinal. Abrir do zero sem rede exige um service worker que guarde o
   proprio app (HTML, JS, CSS); ele nao foi feito - mexe em como cada deploy
   chega ao aparelho e pede decisao. E o passo que falta para o cenario "leu
   ontem, reve hoje sem sinal" valer tambem com o app fechado.
2. **Sair sem resposta do servidor.** O cache da conta sai do aparelho, mas o
   cookie de sessao e HttpOnly e a sessao continua aberta no servidor: quando a
   internet voltar, o app pode entrar sozinho na conta e guardar o perfil de
   novo. A tela avisa: "Voce saiu neste aparelho, mas o servidor nao respondeu.
   Se a conta voltar sozinha com a internet, toque em Sair de novo." Era assim
   antes desta versao. Alternativas: recusar o logout sem rede, ou repetir o
   logout quando a rede voltar - que ja seria uma fila.
3. **Contas locais antigas guardam hash de senha.** A chave `nutriscan:users`,
   das contas que existiam no navegador antes do backend, guarda hash e salt de
   senha nos aparelhos que as usaram. O app so a le, para migrar a conta para o
   servidor; nada a grava (conferido no fonte), e ela nao faz parte do cache
   novo. Apaga-la depois da migracao e uma correcao possivel, fora da secao 6.
4. **O convite do alerta maximo** (v0.9.0) guarda no `localStorage` a marca
   "visto" com o id da conta - nao alergia, nao historico. Fica depois do logout,
   como a v0.9.0 decidiu.
5. **Imagem do produto sem rede:** nao e guardada; pode nao aparecer.
6. **Herdados, ainda abertos:** o chat diz "sem conflito" para produto sem dado
   de alergenico (v0.10.0); a explicacao da comparacao nunca rodou contra o
   modelo real (v0.10.0); os textos de conduta do assistente (v0.9.0); a tela
   Conta rola de lado em 320 px; o log de erro interno grava o objeto inteiro.

## O que esta versao NAO prova

- **A camera em hardware real: NAO EXECUTADO.**
- **O deploy real da 0.11.0: NAO EXECUTADO.** Nada foi publicado; no ar esta a
  0.7.0. Nada mudou no banco de producao alem das contas descartaveis que o gate
  cria e apaga.
- **O modo sem rede num celular de verdade: NAO EXECUTADO.** A verificacao foi no
  navegador embutido do ambiente de desenvolvimento, com o "sem internet" feito
  no JavaScript da pagina; o "servidor fora" foi real.
- **A cota de armazenamento num celular: NAO MEDIDA** - so a do Chromium desta
  maquina.
- **HTTPS da 0.11.0: NAO COMPROVADO** - o alvo simulado nao tem TLS.
- **Adequacao clinica e conformidade juridica: nao declaradas**, e nao sao algo
  que teste prove.

## Auditoria da v0.10.0 - 2026-10-16

## Escopo

Entrada 0.9.0, saida 0.10.0. Comparacao de dois produtos, lado a lado. Minor:
capacidade nova de produto. Nao ha migration nem variavel nova.

**Isto nao e orientacao de saude nem de nutricao.** O relatorio descreve o que o
software faz. Ele nao declara o NutriScan clinicamente adequado nem em
conformidade juridica.

Preservado sem refatoracao, como a secao 3 mandou. O `git diff` contra a v0.9.0
(commit `cc9af41`) e VAZIO em `shared/allergenEngine.js`,
`backend/src/ai/assistantPrompt.js` (o schema fechado da resposta do chat),
`scripts/verify-deploy.js`, `backend/migrations/`, `backend/src/repositories/`
e `src/services/openFoodFactsService.js`. Em `shared/allergyVerdict.js`,
`applyAllergyAuthority`, o piso (`raiseSafety`, `minimumSafetyFor`) e a logica de
`alertLevel` nao mudaram; a unica mudanca e um parametro opcional novo, descrito
abaixo, que so a comparacao passa.

Codigo de producao da entrega (secoes 6, 7 e 8):

```text
NOVO  shared/productComparison.js                  um veredito por produto + diferencas
      shared/allergyVerdict.js                     parametro opcional allergenDataAvailable
NOVO  backend/src/services/comparisonService.js    perfil da sessao, piso por produto, amarracao
NOVO  backend/src/ai/comparisonPrompt.js           system prompt e schema fechado da explicacao
NOVO  backend/src/controllers/compareController.js
NOVO  backend/src/routes/compareRoutes.js          POST /api/compare e /api/compare/explain
      backend/src/app.js                           monta /api/compare
      backend/src/middleware/rateLimit.js          teto da comparacao (so acrescimo)
      backend/src/utils/validation.js              validateComparison (so acrescimo)
      backend/src/ai/assistantService.js           parseStructuredResponse aceita o schema
NOVO  src/pages/Compare/ComparePage.jsx            a tela
NOVO  src/services/compareService.js               chamadas a API e a comparacao no aparelho
      src/services/productLookup.js                consultarDoisProdutos sobre o caminho de um
      src/App.jsx                                  estado, scanner para comparar, rota da tela
      src/components/food/ProductAnalysis.jsx      "Comparar com outro produto"
      src/components/assistant/AllergyVerdict.jsx  texto de origem opcional
      src/styles-v070.css                          so acrescimo; styles.css intocado
```

Gate e testes: `scripts/e2e-real.js` (subgate `productComparison`, balde
`comparacao`), `scripts/lib/e2eGate.js` (requisito novo),
`scripts/mutation-check.js` (14 mutantes novos; U8, W11 e X9 ajustados - ver
A2), `backend/tests/comparison.test.js` e
`backend/tests/comparisonIntegration.test.js` (novos),
`backend/tests/e2eGate.test.js` (22 requisitos). Nenhuma assercao de teste
existente mudou, fora as do gate que nomeiam o total.

## Como a independencia dos vereditos e garantida, em codigo

Nao existe veredito "da comparacao". Existe um por produto, e o codigo nao tem
caminho para um tocar o outro.

```text
shared/productComparison.js
  compareProducts([entradaA, entradaB], perfil)
    const ladoA = analyzeComparedProduct(entradaA.product, perfil);
    const ladoB = analyzeComparedProduct(entradaB.product, perfil);
      -> cada um chama analyzeProductAllergens + buildAllergyVerdict sozinho

backend/src/services/comparisonService.js
  aplicarPisoPorProduto(comparacao, respostaPara, finalizar)
    for (const produto of comparacao.products) {
      const final = finalizar(respostaPara(produto), produto.allergyVerdict);
      ...
```

- **O calculo:** duas chamadas a `analyzeComparedProduct`, cada uma recebendo SO
  o seu produto e o perfil. Nenhuma recebe o resultado da outra.
- **O piso:** `aplicarPisoPorProduto` chama a barreira uma vez POR PRODUTO, com o
  veredito DAQUELE produto - `applyAllergyAuthority` sem modelo,
  `finalizeAssistantResponse` com modelo (as duas da v0.9.0, sem alteracao). Nao
  ha maximo, uniao nem mescla de pisos.
- **A prova:** C1t, em cinco pares - leite e arroz nas duas ordens, pacoca,
  produto sem dado e traco -, exige que o veredito de cada produto seja igual ao
  do produto calculado sozinho e nao seja o mesmo objeto do outro; C2t poe
  conflito ao lado de limpo nas duas ordens, com e sem modelo; C3t poe o
  `urgent` ao lado de um `caution`; C4t, traco ao lado de declarado. O subgate do E2E faz o mesmo contra a API real com o perfil do
  PostgreSQL. Os mutantes Y1 (B reaproveita o veredito de A) e Y2 (piso calculado
  uma vez para os dois) morrem no C2t.

## Como a amarracao explicacao-produto e verificada sem confiar no modelo

O modelo devolve `{ explanations: [{ productCode, text, safety }] x2, category,
usedProductContext }`, e o servidor nunca usa a POSICAO de uma explicacao.

```text
amarrarExplicacoes(explicacoes, produtos)
  Map por productCode
  codigo repetido                  -> AI_SCHEMA_INVALID (502), resposta inteira recusada
  codigo faltando / codigo estranho -> AI_SCHEMA_INVALID (502)
aplicarPisoPorProduto: explicacao = porCodigo.get(produto.code)
```

- O schema Zod e `.strict()` em todos os niveis e exige exatamente dois itens:
  qualquer chave fora do contrato, no topo ou dentro de uma explicacao, derruba a
  resposta. O C7t tenta `allergyVerdict` dentro de uma explicacao e no topo, e
  `winner`, `recommended` e `ranking` no topo. O modelo nao tem onde escrever
  veredito, e o veredito devolvido e sempre o do motor.
- O `safety` de cada explicacao passa pelo piso do veredito do produto daquele
  CODIGO. O modelo dizendo `normal` nos dois nao derruba o `caution` de nenhum
  (C6t).
- **C5t, como o auditor vai fazer:** o modelo devolve as explicacoes em ordem
  trocada - e, num segundo teste, com o texto de um escrito como se fosse do
  outro. Cada texto cai no produto do seu codigo; a tela, renderizada de
  verdade, mostra em cada coluna o veredito do motor para aquele produto. O
  mutante Y3 (amarracao pela posicao) morre no C5t; o Y4 (schema aceita campo
  extra na explicacao) morre no C7t; o Y6 (piso nao imposto na explicacao) morre
  no C6t.
- Dado da Open Food Facts dos DOIS produtos fica fora do `system`: nome, marca e
  ingredientes vao no bloco de dados da mensagem do usuario (C7t confere os
  dois). O nivel de alerta nao vai ao modelo.

## 6.1 - dois

Implementado com exatamente dois, como o prompt mandou. A API recusa um, tres e
nenhum. Nenhum terceiro foi implementado.

## 6.2 - de onde vem os codigos: tres entradas, um caminho

A tela tem dois campos e tres jeitos de preenche-los: digitando; "Escanear" (a
leitura da camera vai para o primeiro campo vazio, e com os dois cheios a
comparacao roda sozinha); e "Meus produtos", com o historico e os favoritos da
pessoa como botoes. Da tela de um produto, "Comparar com outro produto" abre a
comparacao com ele no primeiro campo.

Justificativa: sao as tres situacoes reais - a embalagem na mao (camera), o
codigo lido no papel (digitacao) e o produto que a pessoa ja consultou e quer pôr
ao lado de outro (historico e favoritos). Nenhuma delas pede um caminho novo.

**Um caminho so.** As tres terminam em `consultarDoisProdutos`, que e
`prepararCodigo` + a busca de `consultarProdutoPorCodigo`, duas vezes - a mesma
conferencia de digito de `shared/barcode.js`, a mesma canonicalizacao UPC-A ->
EAN-13, codigo nao-EAN intacto, a mesma busca de `openFoodFactsService` com a
retentativa que ja estava la. `consultarProdutoPorCodigo` foi reescrito sobre
essas duas partes sem mudar de comportamento: os 18 testes da v0.7.3 continuam
verdes, e a ancora do mutante P3b continua no mesmo lugar. O backend confere os
dois codigos de novo, pelo mesmo `productCodeSchema` do historico. O C16 varre
`src/`, `backend/src/` e `shared/` e prova que so
`src/services/openFoodFactsService.js` cita a Open Food Facts e faz requisicao,
e que as duas buscas chamam a busca injetada exatamente duas vezes, uma por
codigo.

## 6.4 - codigos iguais: recusados

"Esses dois códigos são do mesmo produto. Escolha outro para comparar." - no
aparelho, antes de qualquer busca, e na API (`400`). A identidade e a forma
canonica: UPC-A e EAN-13 do mesmo produto sao iguais, e a leitura da camera
tambem (C11).

Justificativa: nao e defeito de seguranca, mas a resposta seriam duas colunas
identicas, e quase sempre e a mesma embalagem lida duas vezes. Dizer isso ajuda
mais do que mostrar a repeticao, e nao custa busca nenhuma.

## 6.5 - produto nao encontrado: o que veio aparece, e o que faltou e dito

Se um dos dois nao for encontrado - ou a busca falhar por rede -, a tela mostra
o encontrado na sua coluna, com o seu veredito, e diz na outra o que faltou ("Não
encontrei o produto X na Open Food Facts." / "Não consegui buscar o produto X
agora. Verifique sua internet."). Nao ha tabela de diferencas. A API so compara
par completo: produto faltando e `400`.

Justificativa: falhar inteira jogaria fora o produto que veio - justamente o que
a pessoa tem na mao -, e mostrar "diferencas" contra nada inventaria ausencia,
que e o defeito que a 6.3 proibe. O C12 cobre produto nao encontrado e falha de
rede, a recusa da API ao par incompleto, e renderiza a tela parcial: o produto
encontrado aparece, o que faltou e dito, e nao ha "Diferenças".

O veredito do produto que veio, nessa tela, e calculado no aparelho, pelo mesmo
modulo compartilhado e com o perfil do aparelho - a API nao aceita par
incompleto. Descrito em "Observacoes".

## 7 - custo e limites

**O que cobria a busca de produto: nada do backend.** A busca por codigo roda no
navegador, direto na Open Food Facts, e nenhum limitador deste servidor a ve -
antes desta versao e agora. A comparacao nao muda isso: as duas buscas continuam
no navegador, pelo mesmo caminho e com a mesma retentativa; o que chega ao
servidor e o par ja encontrado. Escrito no `rateLimit.js`.

A rota de comparacao ganhou teto proprio, composto usuario E IP pela mesma
fabrica da v0.7.2 (usuario primeiro; sem sessao, o balde de usuario usa o IP):

```text
POST /api/compare           30 / 10 min por usuario   e   300 / 10 min por IP
POST /api/compare/explain   os mesmos dois, e o balde do assistente (20 / 10 min por IP)
```

O raciocinio, declarado no codigo:

- **30 por usuario:** na gondola, dois ou tres pares por item da lista, com
  alguma indecisao e um codigo errado no meio - uns 10 pares em 10 minutos, com
  folga para refazer cada um duas vezes. Ninguem compara 30 pares olhando a
  prateleira.
- **300 por IP:** dez pessoas atras do mesmo endereco (familia, rede do mercado,
  CGNAT de celular) no limite da propria cota; contem script que troca de conta.
  A mesma razao 1:10 das colecoes.
- **A explicacao divide o balde com o chat.** Um balde proprio deixaria somar 20
  perguntas e mais N explicacoes na mesma janela, dobrando o gasto com IA. Com o
  balde dividido, o teto de custo continua onde estava. O limitador do assistente
  vem por ultimo, para que uma requisicao recusada pelo teto da comparacao nao
  gaste a cota de IA.

Nenhum limitador existente foi tocado - o `git diff` do `rateLimit.js` e so
acrescimo -, e nao ha bypass: as constantes nao tem variavel de ambiente, e o C15
prova as duas rotas montadas, o 31o pedido recusado com 429 e os cabecalhos 300 e
20.

## 8 - persistencia

- Nenhuma tabela, nenhuma migration, nenhum historico de comparacoes.
- **Comparar NAO grava os dois produtos no historico.** O historico registra o
  que a pessoa abriu. Um par comparado de passagem - muitas vezes descartado na
  hora, ou com um dos dois lido por engano - ocuparia o limite do historico com
  produtos que ela nao escolheu ver, e empurraria para fora os que escolheu. Quem
  quer guardar toca em "Abrir este produto", e o produto entra pelo caminho que
  ja existe, com deduplicacao, limite e canonicalizacao.
- Visitante nao grava nada; usuario tambem nao: a comparacao so le o perfil. O
  C14 intercepta o pool do PostgreSQL e prova zero consultas para visitante, e
  com o banco real prova que nenhuma linha muda, com ou sem sessao.
- Nenhum veredito e congelado: cada comparacao recalcula os dois com o perfil
  daquele momento.

## Tratamento de dado ausente

"Nao informado" e diferente de "nao contem", e o codigo carrega os dois estados
separados ate a tela.

```text
produto sem texto de ingredientes, alergenicos ou tracos
  allergenData             "not_informed"
  allergens                []
  allergyVerdict           status "not_evaluated", reason "no_allergen_data", sem piso
  differences.allergens    o lado dele: "not_informed"
  tela                     "Sem dados de alergênicos. Confira o rótulo físico."
                           e "Não informado" na tabela

nutriente que a base nao traz
  value / a / b            null - informedNumber nunca devolve 0 para ausente
  tela                     "Não informado"

alergenico que um rotulo declara e o outro nao menciona
  o outro lado             "not_detected" -> "Não aparece no rótulo"
```

Onde a ausencia NUNCA vira "nao contem": no veredito (nunca `clear` sem dado), na
lista de alergenicos (vazia E marcada `not_informed`, para nao confundir "nada
achado" com "nada informado"), nas diferencas, nos nutrientes, na tela e no que
vai ao modelo - o system prompt diz que dado ausente e "nao informado". O zero
DECLARADO continua 0. O C8t confere tudo isso na resposta do servico - a mesma
que a rota devolve - e na tela renderizada ("Leite/lactose Tem Não informado",
nunca "Não aparece no rótulo"); os mutantes Y5 (ausencia vira `not_detected`),
Y5b (`null` vira 0) e Y5c (o veredito deixa de saber que nao ha dado) morrem
nele. A comparacao no aparelho usa o mesmo modulo compartilhado
(`shared/productComparison.js`), mas nao tem teste proprio de dado ausente.

Para isso, `buildAllergyVerdict` ganhou um parametro opcional,
`allergenDataAvailable`. So quem passa `false` explicitamente - a comparacao -
entra no ramo novo. Sem o parametro, o veredito e o de antes, byte a byte: o
gabarito de 20 combinacoes da v0.9.0 (S1) e os testes do veredito continuam
verdes. O chat NAO passa o parametro - ver "Observacoes".

## A1 - C1t a C16, R1 a R6

Todos presentes e verdes na suite completa contra PostgreSQL real (A7). Nenhum
em SKIP nessa execucao. Sem banco (A6), os 4 de integracao da comparacao saem
como NAO EXECUTADO, e nao como PASS.

```text
unitarios (tests/comparison.test.js)
C1t  C1t cada produto recebe veredito proprio, calculado independentemente
C2t  C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado
C3t  C3t alerta maximo: o piso urgent vai ao produto certo, e so a ele
C4t  C4t traco em um, declarado no outro: cada veredito com a sua origem
C5t  C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo
     C5t texto trocado pelo modelo nao troca o veredito que a tela mostra
C6t  C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois
C7t  C7t o modelo nao escreve, nao altera e nao reordena veredito
     C7t os dados dos dois produtos ficam fora do system e nenhum campo elege vencedor
C8t  C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum
C9t  C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca
C10  C10 UPC-A em um e EAN-13 no outro: os dois canonicalizados
C11  C11 codigos iguais: recusados com mensagem clara, sem busca
C12  C12 um produto nao encontrado: o que veio aparece, o que faltou e dito, e a API recusa par incompleto
C13  C13 nenhum campo da requisicao escolhe de quem e o perfil
C14  C14 visitante usa o perfil do request e nao toca o banco
C15  C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente
C16  C16 as duas buscas usam o openFoodFactsService, sem segundo cliente
A4   A4 nenhuma comparacao de versao do projeto depende de ordem, so de igualdade
     a tela mostra os dois sem eleger vencedor e sem orientacao

com PostgreSQL real (tests/comparisonIntegration.test.js)
C1t  C1t e C2t com o perfil do PostgreSQL: um veredito por produto, o limpo nao herda
C3t  C3t com o nivel do PostgreSQL: urgent so no produto declarado de alergia em alerta maximo
C13  C13 a sessao de B com o id de A no corpo compara com o perfil de B
C14  C14 comparar nao grava nada - nem visitante, nem com sessao
```

Como os delicados provam o que dizem:

- **C5t** monta o modelo devolvendo `[explicacao de B, explicacao de A]` e
  confere cada texto no produto do seu codigo; o segundo C5t faz o modelo
  escrever, no texto do produto limpo, "este tem leite", e renderiza a tela: a
  coluna do limpo continua mostrando o veredito limpo do motor, e a do leite, o
  conflito.
- **C7t** tenta, uma de cada vez: `allergyVerdict` dentro de uma explicacao;
  `allergyVerdict`, `winner`, `recommended` e `ranking` no topo; codigo
  repetido; codigo de produto que nao esta na comparacao; e uma explicacao so -
  todas `AI_SCHEMA_INVALID`. E confere que a ordem de `products` e a do pedido,
  mesmo com o modelo devolvendo outra.
- **C8t** compara um produto sem dado com um que tem e exige, no lado sem dado:
  `not_informed`, lista vazia, `not_evaluated`/`no_allergen_data` e nenhum
  alerta; `not_informed` - nunca `not_detected` - em toda linha das diferencas;
  `null` em todo nutriente; e, na tela, "Sem dados de alergênicos" sem "Sem
  conflito". O zero declarado de outro produto continua 0.
- **C13** de integracao: a sessao de B, com `userId`, `user_id`, `user.id` de A e
  `guestAllergies` no corpo, compara com o perfil de B.
- **C14** sem banco intercepta `pg.Pool.prototype.query` e `connect` e exige zero
  chamadas para visitante; com banco, conta as linhas de cinco tabelas antes e
  depois, com e sem sessao.

R1 a R6 - regressao, verdes na mesma execucao (107 testes):

```text
R1  C1            T1 exploit C1: modelo negando conflito nao entrega falso seguro
R2  severidade    S1, S2, S3, S4 - os quatro casos da matriz - e S5 (unitario e com
                  o banco): o modelo respondendo normal nao derruba o piso (6)
R3  isolamento    I1, I2, I3, I4 e V1 (estaticos e contra o banco), S16 (11)
R4  digito        M1 (5), M3 (3), M9 (2); canonicalizacao N1 a N1g (14);
                  tetos R1, R2, R5, R6, R7 e R11 (10; 403 de 3000 por IP)
R5  exportacao    E1 a E8 (14), exclusao D1 a D9 (13), nivel na exportacao e na
                  exclusao S14 e S15 (2)
R6  handler       O2a a O2e (11), P5 (4); fail-closed P9 (6) e MODO (2);
                  verify:deploy somente leitura P13 (3)
```

## A2 - validacao por mutacao

Rodada completa, com banco, sobre o codigo entregue:

```text
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<PostgreSQL LOCAL> DATABASE_SSL=false \
  node scripts/mutation-check.js --com-banco
```

```text
mortas 109 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
REPROVADO: ha teste que nao detecta o defeito que deveria detectar.
=== EXIT: 1 ===
```

**110 mutantes: 109 mortos, 1 sobrevivente (W1, o equivalente da v0.8.0), 0 nao
executados, 0 inaplicaveis.** A linha de base - as 16 suites sem mutacao,
incluidas as duas novas da comparacao - estava verde antes e depois. **Os 14
mutantes novos morreram todos.** O script sai com codigo 1 por causa do W1, e
isso fica registrado como esta.

### Os mutantes pedidos pelo prompt (C2t, C5t, C6t, C7t, C8t)

```text
pedido pelo prompt                                   mutante  teste que o pegou   resultado
o veredito de A passa a ser reaproveitado para B     Y1       C2t                 MORTA
o piso passa a ser calculado uma vez para os dois    Y2       C2t                 MORTA
a amarracao passa a confiar na ordem do modelo       Y3       C5t                 MORTA
campo de veredito vindo do modelo passa a ser aceito Y4       C7t                 MORTA
ausencia vira "nao contem"                           Y5       C8t                 MORTA
ausencia vira zero                                   Y5b      C8t                 MORTA
o veredito deixa de saber que nao ha dado            Y5c      C8t                 MORTA
o piso deixa de ser imposto na explicacao (C6t)      Y6       C6t                 MORTA
```

O que cada um injeta:

- **Y1** - `shared/productComparison.js`: o lado B recebe
  `allergyVerdict: ladoA.allergyVerdict`.
- **Y2** - `comparisonService.js`: `aplicarPisoPorProduto` passa a usar, para os
  dois, o primeiro veredito com piso da comparacao - o "piso da comparacao".
- **Y3** - `comparisonService.js`: a explicacao de cada produto passa a ser
  `resposta.explanations[indice do produto]`, a posicao na lista do modelo.
- **Y4** - `comparisonPrompt.js`: o item de explicacao troca `.strict()` por
  `.passthrough()` e aceita `allergyVerdict`. Mesmo aceito, o campo nao chegaria
  ao cliente - a amarracao so le `text` e `safety` -, mas o contrato manda
  recusar, e o C7t exige a recusa.
- **Y5** - `productComparison.js`: o lado sem dado deixa de ser `not_informed` e
  vira `not_detected` ("nao aparece no rotulo").
- **Y5b** - `informedNumber` devolve 0 para valor ausente.
- **Y5c** - a comparacao passa `allergenDataAvailable: true` sempre: o produto sem
  dado volta a sair `clear`.
- **Y6** - `comparisonService.js`: a explicacao deixa de passar por
  `finalizeAssistantResponse`, e o `safety` do modelo vale.

### Os outros seis mutantes novos

```text
Y7   C9t  codigo invalido em um dos dois deixa de barrar a busca          MORTA
Y8   C11  codigos iguais deixam de ser recusados no aparelho             MORTA
Y8b  C11  codigos iguais deixam de ser recusados pela API                MORTA
Y9   A11  o gate perde o requisito productComparison                     MORTA
Y10  C13  a rota da comparacao passa a aceitar userId do corpo           MORTA   (com banco)
Y11  C15  a rota da comparacao perde o limitador                         MORTA
```

(Y1 a Y11, mais Y5b, Y5c e Y8b: 14 mutantes.)

### Tres mutantes antigos ajustados - sem mudar o defeito

- **U8** (v0.8.0, "o orcamento do gate deixa de mostrar o teto por IP") mirava a
  linha `const TETOS_POR_IP = { colecoes: 3000, exportacao: 20 };`, que ganhou o
  balde da comparacao. A ancora foi refeita para a linha nova; o defeito injetado
  e o mesmo (`const TETOS_POR_IP = {};`), e o teste que o pega e o mesmo. MORTA.
- **W11** (v0.8.0, "o gate perde accountDeletion") e **X9** (v0.9.0, "o gate
  perde severityVerdict") sao os mesmos mutantes; o teste que os pega foi
  renomeado de "exatamente 21 requisitos" para "exatamente 22". MORTAS.

### O sobrevivente: W1, o mesmo da v0.8.0 e da v0.9.0

O W1 faz o repositorio da exportacao devolver a linha inteira de `users`, mas o
servico monta o arquivo campo a campo - a exportacao nao muda, e o teste esta
certo em passar. E equivalente, foi descrito na v0.8.0 com a demonstracao de que
a suite estatica (`nunca usa SELECT *`) o pega, e esta versao nao mexeu nele nem
no `mutation-check.js` por causa dele.

### A rodada inteira

Linha de base:

```text
[linha de base - antes] 16 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
  VERDE    tests/comparison.test.js
  VERDE    tests/comparisonIntegration.test.js
```

```text
T1  P2   MORTA                  "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta" falhou, como deveria
T1b  P2   MORTA                  "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost" falhou, como deveria
T2  P5   MORTA                  "P5 erro do driver do banco nao chega ao cliente" falhou, como deveria
T2b  P5   MORTA                  "P5 o detalhe do erro vai para o log do servidor" falhou, como deveria
T3  P9   MORTA                  "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual" falhou, como deveria
T3b  P9   MORTA                  "P9 valor booleano nao reconhecido nao cai em default silencioso" falhou, como deveria
T4  P12  MORTA                  "P12 versao no ar diferente da do repositorio reprova o D1" falhou, como deveria
T5  P13  MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
T5b  P13  MORTA                  "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada" falhou, como deveria
T6  P3   MORTA                  "P3 CORS devolve a origem configurada, nunca a do request" falhou, como deveria
T7  P4   MORTA                  "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha" falhou, como deveria
T8  P11  MORTA                  "P11 NOT_EXECUTED nao conta como PASS no agregado" falhou, como deveria
T9  P11  MORTA                  "P11 o comando de verdade sai com codigo 1 quando um subgate falha" falhou, como deveria
V1  S1/S4 MORTA                  "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO" falhou, como deveria
V1b  S2   MORTA                  "S2 render.yaml nao declara variavel que o codigo nao le" falhou, como deveria
V1c  S3   MORTA                  "S3 nenhuma credencial com valor literal no render.yaml" falhou, como deveria
V2  O2a  MORTA                  "O2a JSON malformado responde 400, nao 500 - a medicao do auditor" falhou, como deveria
V3  O2d  MORTA                  "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status" falhou, como deveria
V3b  O2d  MORTA                  "O2d copiar o type do body-parser nao basta para ganhar 400" falhou, como deveria
V4  R7   MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
U1  C2   MORTA                  "C2 a camera nunca transforma um codigo em outro" falhou, como deveria
U2  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U3  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U4  O2e  MORTA                  "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor" falhou, como deveria
U4b  O2e  MORTA                  "O2e copiar name, type e status do corpo grande nao basta para ganhar 413" falhou, como deveria
U5  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U5b  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U6  MIG  MORTA                  "MIG migration que nao alcanca o banco falha dizendo por que" falhou, como deveria
U7  MIG  MORTA                  "o doctor conta as mesmas migrations que o runner aplica, .sql e .js" falhou, como deveria
U8  ORC  MORTA                  "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP" falhou, como deveria
W1  E2   MUTACAO SOBREVIVEU     a suite passou com o defeito aplicado
W1b  E2   MORTA                  "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor" falhou, como deveria
W2  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W2b  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W3  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W3b  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W4  D2   MORTA                  "D2 exclusao com senha errada nao remove nada" falhou, como deveria
W5  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W5b  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W6  D8   MORTA                  "D8 falha simulada no meio da exclusao deixa o estado anterior intacto" falhou, como deveria
W7  E8   MORTA                  "E8 a rota real recusa a exportacao acima do teto do usuario" falhou, como deveria
W8  D9   MORTA                  "D9 a tentativa com senha errada gasta o mesmo balde do login" falhou, como deveria
W9  D1   MORTA                  "D1 exclusao com a senha correta remove a conta e limpa o cookie" falhou, como deveria
W10  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W10b  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W11  A11  MORTA                  "A11: o modo strict tem exatamente 22 requisitos, os 21 da v0.9.0 mais productComparison" falhou, como deveria
S1  N1a  MORTA                  "N1 o schema canonicaliza UPC-A para EAN-13" falhou, como deveria
S1b  N1a  MORTA                  "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" falhou, como deveria
S1c  N1c  MORTA                  "N1c requisicao DIRETA ao backend grava a forma canonica" falhou, como deveria
S2  N1e  MORTA                  "N1e o schema nao altera EAN-13 nem EAN-8" falhou, como deveria
S2b  N1d  MORTA                  "N1d codigo nao-EAN passa intacto pela canonicalizacao" falhou, como deveria
S3  N1g  MORTA                  "N1g a migration funde as duas formas pela regra declarada" falhou, como deveria
S4  N1g  MORTA                  "N1g a migration e idempotente e nao toca codigo nao-EAN" falhou, como deveria
S5  R2   MORTA                  "N1 a canonicalizacao nao afrouxa a conferencia do digito" falhou, como deveria
S6  N1   MORTA                  "N1 a canonicalizacao usa shared/barcode.js, sem copia local" falhou, como deveria
P1  M1   MORTA                  "M1 codigos com digito verificador errado sao recusados pelo motivo certo" falhou, como deveria
P1b  M1   MORTA                  "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos" falhou, como deveria
P2  M3   MORTA                  "M3 o backend recusa productCode com digito verificador invalido" falhou, como deveria
P2b  M3   MORTA                  "M3 a regra do backend e estreita e nao quebra cadastro legitimo" falhou, como deveria
P3  M4   MORTA                  "o caminho manual nao monta o resultado por conta propria" falhou, como deveria
P3b  M4   MORTA                  "M2 codigo invalido nao chega a rede" falhou, como deveria
P4  M5   MORTA                  "M5 o piso de risco vale no caminho manual" falhou, como deveria
P5  M9   MORTA                  "M9 nao existe segunda implementacao do digito verificador" falhou, como deveria
P5b  M9   MORTA                  "M9 backend e frontend usam a MESMA implementacao de shared/" falhou, como deveria
P6  M7   MORTA                  "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo" falhou, como deveria
P7  M6   MORTA                  "M6 cada motivo de recusa tem mensagem propria" falhou, como deveria
P8  M8   MORTA                  "M8 nenhum outro caractere e removido em silencio" falhou, como deveria
P9  M10  MORTA                  "M10 o backend recusa gravar codigo com digito verificador invalido" falhou, como deveria
N1  R1/R3 MORTA                  "R1 usuario dentro do teto mas IP estourado recebe 429" falhou, como deveria
N1b  R3   MORTA                  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP" falhou, como deveria
N2  R2   MORTA                  "R2 IP dentro do teto mas usuario estourado recebe 429" falhou, como deveria
N2b  R4   MORTA                  "R4 dois usuarios atras do MESMO IP mantem cotas separadas" falhou, como deveria
N3  R4   MORTA                  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP" falhou, como deveria
N4  R5   MORTA                  "R5 dados forjados no request nao conseguem balde de IP novo" falhou, como deveria
N5  R5   MORTA                  "R5 um bloco IPv6 /64 nao vira infinitos baldes" falhou, como deveria
M1  R6   MORTA                  "R6 os tres tetos por rota seguem nos valores declarados" falhou, como deveria
M2  R7   MORTA                  "R7 o teto por IP esta no valor medido" falhou, como deveria
M3  Q3   MORTA                  "Q3 nenhuma variavel de ambiente desliga os limitadores" falhou, como deveria
M3b  Q4   MORTA                  "Q4 nenhum dos limitadores tem opcao de pular requisicao" falhou, como deveria
M4  Q2   MORTA                  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto" falhou, como deveria
M6  R9   MORTA                  "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7  R9   MORTA                  "I2 usuario B nao remove item de A" falhou, como deveria
X1  S2   MORTA                  "S2 alerta maximo + conflito declarado: piso urgent" falhou, como deveria
X2  S3   MORTA                  "S3 alerta maximo + traco: conflito no veredito, piso caution" falhou, como deveria
X3  S5   MORTA                  "S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos" falhou, como deveria
X4  S6   MORTA                  "S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta" falhou, como deveria
X5  S12  MORTA                  "S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations" falhou, como deveria
X6  S13  MORTA                  "S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations" falhou, como deveria
X6b  S13  MORTA                  "S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo" falhou, como deveria
X7  S17  MORTA                  "S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo" falhou, como deveria
X8  S18  MORTA                  "S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot" falhou, como deveria
X9  A11  MORTA                  "A11: o modo strict tem exatamente 22 requisitos, os 21 da v0.9.0 mais productComparison" falhou, como deveria
X10  S9   MORTA                  "S9 nivel para alergia ausente do perfil e recusado pela validacao" falhou, como deveria
X11  S1   MORTA                  "S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0" falhou, como deveria
X12  S8   MORTA                  "S8 nivel desconhecido e recusado pela validacao" falhou, como deveria
X13  S16  MORTA                  "S16 o nivel de A nao e visivel nem alteravel por B" falhou, como deveria
Y1  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y2  C2t  MORTA                  "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado" falhou, como deveria
Y3  C5t  MORTA                  "C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo" falhou, como deveria
Y4  C7t  MORTA                  "C7t o modelo nao escreve, nao altera e nao reordena veredito" falhou, como deveria
Y5  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5b  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y5c  C8t  MORTA                  "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum" falhou, como deveria
Y6  C6t  MORTA                  "C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois" falhou, como deveria
Y7  C9t  MORTA                  "C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca" falhou, como deveria
Y8  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y8b  C11  MORTA                  "C11 codigos iguais: recusados com mensagem clara, sem busca" falhou, como deveria
Y9  A11  MORTA                  "A11: o modo strict tem exatamente 22 requisitos, os 21 da v0.9.0 mais productComparison" falhou, como deveria
Y10  C13  MORTA                  "C13 a sessao de B com o id de A no corpo compara com o perfil de B" falhou, como deveria
Y11  C15  MORTA                  "C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente" falhou, como deveria
mortas 109 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
```

## A4 - a ordem semver de 0.10.0

Em texto, `"0.10.0" < "0.9.0"` e verdadeiro; em semver, 0.10.0 vem depois. O
projeto nao ordena versao em lugar nenhum:

- A unica comparacao de versao e `compararVersoes` (`scripts/version-check.js`),
  usada pelo D1 do `verify:deploy`: ela compara por IGUALDADE (`local !==
  remota`). 0.10.0 contra 0.9.0 reprova, 0.10.0 contra 0.10.0 passa - em qualquer
  ordem.
- Varredura recursiva de `scripts/`, `backend/`, `src/` e `shared/` (fora
  `node_modules`) por `version <`, `> version`, `.version` comparado,
  `localeCompare` de versao, `semver` e `sort` de versao: nenhuma ocorrencia alem
  do `compararVersoes`. Os `sort()` que existem ordenam nomes de variavel e nomes
  de migration (`001_` a `004_`, com zeros a esquerda), nao versoes.
- O teste A4 trava as duas coisas: a igualdade e a ausencia de ordenacao nos
  arquivos do primeiro nivel dessas pastas.
- `/api/health` le a versao do `package.json` e a devolve como texto; o E2E e o
  `verify:deploy` simulado leram "0.10.0" de um processo real.

**Uma armadilha que existe, achada no bump:** a dependencia
`@zxing/text-encoding` do frontend esta na versao `0.9.0`. Trocar as cegas, no
`package-lock.json`, todo campo de versao com o valor 0.9.0 teria mudado a
versao de uma dependencia. O bump desta versao foi ancorado no nome do pacote; a dependencia
continua `0.9.0` (conferido na A15).

## A5 a A9

```text
A5  npm run build                          sucesso
A6  npm --prefix backend test              409 testes, 334 pass, 0 fail, 75 skipped
                                           (72 exigem PostgreSQL, 1 a IA real,
                                           2 a Open Food Facts real - todos
                                           declarados NAO EXECUTADO, nenhum PASS)
A7  suite contra PostgreSQL real (local)   409 testes, 406 pass, 0 fail, 3 skipped
                                           (1 IA real, 2 Open Food Facts real)
A8  npm audit --audit-level=moderate       frontend: found 0 vulnerabilities
    npm --prefix backend audit (moderate)  backend:  found 0 vulnerabilities
A9  npm run verify:release                 exit 0 - build, testes, os dois audits e
                                           "secret scan - 0 real secrets" (na
                                           execucao final; ver abaixo)
```

O A7 rodou com `RUN_DB_INTEGRATION_TESTS=true` contra o PostgreSQL LOCAL (17,
porta 5433), com `DATABASE_URL` definida no comando - nunca contra o banco de
producao. Gastos da suite contra os tetos por IP, medidos na propria execucao:
`[R11] 403 de 3000` e `[exportacao] 17 de 20`.

**O `verify:release` nao passou de primeira - e o registro fica aqui:**

```text
antes             T9c  FAIL  ao montar este relatorio, o A4 citava o campo de versao com
                             0.9.0 em forma de JSON, dentro do bloco desta versao. Pego
                             pelas suites de documento ANTES do verify:release; reescrito
                             em texto. O teste nao foi tocado.
verify:release 1  FAIL  build OK; testes 409 / 334 / 0 fail / 75 skipped; o npm audit nao
                        resolveu registry.npmjs.org (getaddrinfo ENOENT). A suite levou
                        30 min - nenhum teste passou de 7 s; o tempo ficou fora dos
                        testes, e a causa NAO foi comprovada.
verify:release 2  PASS  exit 0, a mesma arvore; a suite em 98 s
verify:release 3  PASS  exit 0 - a arvore exata que foi para o ZIP, com este registro
```

A falha 1 e de ambiente, conferida antes de repetir: logo depois, os nomes
resolviam e o `npm audit` sozinho respondia "found 0 vulnerabilities". E a mesma
familia das falhas de rede da v0.9.0.

## A10 - `verify:e2e`

**PASS, exit code 0, na primeira execucao**, com PostgreSQL real e Claude real -
2 chamadas pagas. Os 22 requisitos em `PASSED`, `ok: true`. A saida literal, a
tabela de subgates, a contagem por balde e o `E2E_LAST_RUN.json` integral estao
no `E2E_REPORT.md`.

Nao ha migration nova: o doctor leu "4/4 applied", e o schema do banco do gate
nao mudou nesta versao.

O subgate novo:

```text
[OK] product comparison - um veredito por produto, perfil do banco; o limpo nao herda; explicacao amarrada pelo codigo
```

Ele faz as duas buscas pelo caminho de sempre (com a busca externa injetada),
compara pela API REAL com o perfil do PostgreSQL - leite padrao e amendoim em
alerta maximo -, exige que o veredito de cada produto seja igual ao do produto
calculado sozinho, que o `urgent` va so a pacoca, que codigo invalido e codigos
iguais deem 400, e que um modelo SIMULADO que troca as explicacoes e diz
`normal` nao mude nada do que cada produto recebe.

Contagem por balde:

```text
balde        usado   teto/usuario     teto/IP
assistente      2             20           -
auth            7             40           -
colecoes       17            300        3000
comparacao      4             30         300
exportacao      1              5          20
```

## A11 - os 21 requisitos antigos continuam exigidos; agora sao 22

Prova por execucao, sobre o `E2E_LAST_RUN.json` desta versao: para cada
requisito do modo strict, um relatorio com SO aquele requisito em
`NOT_EXECUTED` tem de reprovar, e reprovar so por ele.

```text
requisitos no modo strict (flag da IA ligada): 22
faltando no E2E_LAST_RUN.json desta versao: []

requisito                origem   presente   NOT_EXECUTED sozinho reprova
backendProcess           v0.9.0   sim        sim, e so ele
database                 v0.9.0   sim        sim, e so ele
migrations               v0.9.0   sim        sim, e so ele
auth                     v0.9.0   sim        sim, e so ele
sessionSchema            v0.9.0   sim        sim, e so ele
multiDevice              v0.9.0   sim        sim, e so ele
isolation                v0.9.0   sim        sim, e so ele
logout                   v0.9.0   sim        sim, e so ele
assistantAuthority       v0.9.0   sim        sim, e so ele
deterministicEngine      v0.9.0   sim        sim, e so ele
fallback                 v0.9.0   sim        sim, e so ele
privacy                  v0.9.0   sim        sim, e so ele
historySync              v0.9.0   sim        sim, e so ele
favoritesSync            v0.9.0   sim        sim, e so ele
verdictFreshness         v0.9.0   sim        sim, e so ele
manualCodeLookup         v0.9.0   sim        sim, e so ele
accountExport            v0.9.0   sim        sim, e so ele
accountDeletion          v0.9.0   sim        sim, e so ele
severityVerdict          v0.9.0   sim        sim, e so ele
productComparison        v0.10.0  sim        sim, e so ele
anthropicReal            v0.9.0   sim        sim, e so ele
assistantAuthenticated   v0.9.0   sim        sim, e so ele

os 21 da v0.9.0 presentes: 21 de 21
novos: ["productComparison"]
sem a flag da IA: 20 requisitos; productComparison entre eles: sim
```

Os testes que travam isso na suite, verdes:

```text
A11: os 21 requisitos da v0.9.0 continuam exigidos, um a um
A11: o modo strict tem exatamente 22 requisitos, os 21 da v0.9.0 mais productComparison
A11: productComparison e requisito BASE e reprova sozinho          (inclusive "SKIPPED")
A11: os 20 requisitos da v0.8.0 continuam exigidos, um a um
A11: os 18 requisitos da v0.7.6 continuam exigidos, um a um
A10: desde a v0.7.2 entraram so manualCodeLookup, os dois da v0.8.0, o da v0.9.0 e o da v0.10.0, nomeados
D2: o conjunto de requisitos do modo strict e exatamente este
```

O teste da v0.9.0 que travava o total em "exatamente 21" foi substituido pelo de
"exatamente 22", que nomeia o unico requisito novo - nao removido sem troca. O
mutante Y9 (o gate perde `productComparison`), o X9 e o W11 provam que ele pega
a perda. `productComparison` e BASE: depende de PostgreSQL e do motor, e o
modelo do subgate e simulado - sem a flag da IA, o modo strict exige 20 (os 19 da
v0.9.0 sem IA e ele); com a flag, os 22.

## A12 - limpeza do banco depois do gate

Residuo **0** em todos os padroes de teste - inclusive o novo,
`comparacao-test-%` - e nenhuma linha orfa. Saida completa no `E2E_REPORT.md`.

## A13 - `verify:deploy` inalterado e somente leitura

`git diff` do `scripts/verify-deploy.js` contra a v0.9.0: vazio. As rotas novas
sao `POST`, e o `verify:deploy` nao as toca; o P13 continua verde.

```text
verify:deploy simulado (local, http)   FAIL, exit 1 - 7 PASS, D2 FAIL (sem TLS local)
verify:deploy REAL (somente leitura)   FAIL, exit 1 - 7 PASS, D1 FAIL
                                       "repositorio declara 0.10.0 e o deploy anuncia 0.7.0"
```

Os dois FAIL sao os esperados. Os sete PASS do real medem a 0.7.0. No simulado, o
D8 inspecionou os bundles novos, com a tela de comparacao: nenhum segredo.

## A14 - varredura do nome antigo

Fora de `node_modules`, `dist`, `.git` e `releases`, o nome antigo aparece so em
`backend/tests/productName.test.js`, o teste que o procura, e nas secoes
historicas do `AUDIT_REPORT.md` e do `CHANGELOG.md`. Os testes P1t estao verdes.

## A15 - versao nos sete pontos

```text
package.json                             0.10.0
backend/package.json                     0.10.0
package-lock.json (raiz e "")            0.10.0 / 0.10.0
backend/package-lock.json (raiz e "")    0.10.0 / 0.10.0
/api/health de um processo real          D1 do alvo simulado: "ambos declaram 0.10.0"; E2E_LAST_RUN.json: 0.10.0
README                                   # NutriScan v0.10.0
CHANGELOG                                ## NutriScan v0.10.0 - 2026-10-16

dependencia @zxing/text-encoding         0.9.0 - intocada, como deve
```

## A interface, verificada no navegador

No navegador embutido do ambiente de desenvolvimento, como visitante, com a Open
Food Facts REAL, contra o backend local - antes do trabalho do gate e do bump; o
codigo da interface nao mudou depois disso:

- Leite Moça (7891000100103) x Coca-Cola (5449000000996), com Leite/lactose no
  perfil: a coluna do primeiro mostrou o conflito; a do segundo, nao. As
  diferencas apareceram, e "Fibras" saiu como "Não informado".
- Digito errado: a mensagem de recusa, sem busca.
- O mesmo produto em UPC-A e EAN-13: "Esses dois códigos são do mesmo produto."
- O produto 2000000001234, que existe na base sem nenhum dado: "Sem dados de
  alergênicos. Confira o rótulo físico."
- Um codigo valido que a base nao tem (7899999999012): a tela parcial - o
  encontrado na sua coluna, o outro com "Não encontrei o produto".
- "Explicar as diferenças" sem chave de IA: "O assistente não está disponível
  agora. Os fatos acima continuam valendo."
- Em 320 px: sem rolagem lateral; a menor fonte, 14 px, so no rotulo
  "Primeiro"/"Segundo" (`.eyebrow`, o token do design).
- No console, so status de rede esperados.

## Observacoes descritas e NAO corrigidas - para decisao

Fora das secoes 6, 7 e 8. Descritas, como manda a secao 17.

1. **A explicacao contra o modelo REAL nao foi exercitada.** O JSON Schema da
   comparacao foi conferido contra a documentacao de Structured Outputs
   (platform.claude.com/docs/en/build-with-claude/structured-outputs, acessada
   em 2026-10-16): objetos com `additionalProperties: false` (obrigatorio la),
   array de objetos (os exemplos da pagina usam), `enum` de texto e `required`
   sao suportados; `minItems` so aceita 0 ou 1, e `maxItems`, `minLength` e
   `maxLength` nao sao - o schema nao usa nenhum deles, e quem exige dois itens
   e o Zod, depois. A pagina avisa que `enum` pode voltar com outra
   capitalizacao; o Zod recusaria com `AI_SCHEMA_INVALID`, como no chat. Mas
   nenhuma chamada paga foi feita com este schema: o gate a exercita com modelo
   simulado, e o prompt nao pediu uma chamada real a mais. Se a API recusar o schema, o botao "Explicar as
   diferenças" responde "Não consegui a explicação agora" e a comparacao
   continua valendo. Proposta, nao implementada: uma chamada real unica, ou um
   terceiro passo pago no gate.
2. **O chat diz "sem conflito" para produto sem dado de alergenico.** Conferido
   por execucao nesta versao: `answerAssistantChat` com um produto sem
   ingrediente, sem alergenico e sem traco, e Leite no perfil, devolve
   `allergyVerdict.status: "clear"`. E anterior a v0.10.0. A comparacao nao
   herdou isso (usa `no_allergen_data`); o chat nao foi mudado, porque mexer no
   veredito do chat esta fora das secoes 6 a 8. Correcao possivel: o chat passar
   `allergenDataAvailable` como a comparacao.
3. **Orientacao de conduta que JA EXISTIA no produto e na documentacao**,
   anterior a esta versao e ja descrita na v0.9.0:

   ```text
   backend/src/ai/assistantService.js:219     resposta local de urgencia: "...procure
                                              atendimento de emergencia agora."
   backend/src/ai/assistantPrompt.js:48-49    system prompt: "oriente busca imediata de
                                              atendimento de emergencia"
   src/pages/Assistant/AssistantPage.jsx:35   aviso da tela: "Em caso de reacao
                                              alergica, procure atendimento."
   src/services/assistantService.js:321       fallback local: "...procure emergencia agora."
   src/services/assistantService.js:457       fallback local, texto de alergia
   docs/AI_ASSISTANT.md, "Limites Medicos"    "deve orientar atendimento imediato"
   ```

   Nenhum texto NOVO desta versao orienta conduta: o system prompt da comparacao
   proibe orientacao medica e nutricional, e um teste renderiza a tela e reprova
   vocabulario de escolha e de conduta.
4. **A tela parcial calcula no aparelho.** Com um produto faltando, a API recusa
   o par, entao o veredito do produto encontrado sai do mesmo modulo
   compartilhado, no aparelho, com o perfil que o aparelho tem - para quem tem
   conta, o perfil carregado do servidor no login. Uma alergia mudada em outro
   aparelho depois disso so chega a essa tela no proximo carregamento do perfil.
   O mesmo vale para a comparacao no aparelho quando o servidor esta fora do ar,
   que a tela anuncia.
5. **Ordenacao neutra:** nao implementada, como a 5.1 mandou. Nao a julgo
   necessaria - a ordem da pessoa ja e neutra.
6. **Herdado, ainda aberto:** o visitante nao tem nivel de alerta (v0.9.0); a
   tela Conta rola de lado em 320 px (a grade do `styles.css` de design); e o log
   de erro interno grava o objeto de erro inteiro.

## O que esta versao NAO prova

- **A camera em hardware real: NAO EXECUTADO.**
- **O deploy real da 0.10.0: NAO EXECUTADO.** Nada foi publicado; no ar esta a
  0.7.0. Nada mudou no banco de producao alem das contas descartaveis que o gate
  cria e apaga.
- **HTTPS da 0.10.0: NAO COMPROVADO** - o alvo simulado nao tem TLS.
- **A explicacao da comparacao contra o modelo real: NAO EXECUTADO** - ver
  "Observacoes", item 1.
- **A tela em aparelho real: NAO EXECUTADO.** A verificacao foi no navegador
  embutido; a largura de 320 px foi emulada.
- **Adequacao clinica e conformidade juridica: nao declaradas**, e nao sao algo
  que teste prove.

## Auditoria da v0.9.0 - 2026-10-16

## Escopo

Entrada 0.8.0, saida 0.9.0. Nivel de alerta por alergia - o que o prompt chama
de "severidade". Minor: capacidade nova de produto, e o modelo de dados de
alergias ganha uma coluna.

**Isto nao e orientacao de saude nem parecer.** O relatorio descreve o que o
software faz. Ele nao declara o NutriScan clinicamente adequado nem em
conformidade juridica.

Preservado sem refatoracao, como a secao 3 mandou: exportacao, exclusao, C1, o
piso de risco e as duas barreiras do `allergyVerdict` (o schema fechado da
resposta do modelo e `applyAllergyAuthority`, que nao mudou uma linha), digito
verificador, canonicalizacao, tetos 300/3000, IPv6 /64, isolamento, handler de
erro, fail-closed e a sincronia com o `render.yaml`. `verify:deploy` sem nenhuma
linha alterada.

Codigo de producao da entrega (secoes 6, 7 e 8):

```text
NOVO  backend/migrations/004_nivel_de_alerta.sql   coluna, CHECK, regra do dado existente
      shared/allergyVerdict.js                     a resposta do motor ao nivel
      backend/src/ai/assistantService.js           le o nivel do banco; log sem nivel
      backend/src/repositories/userRepository.js   grava e le o nivel
      backend/src/services/profileService.js       aceita alertLevels
      backend/src/services/authService.js          perfil publico com alertLevels
      backend/src/utils/validation.js              recusas de nivel
      backend/src/utils/normalize.js               alertLevels no usuario publico
      backend/src/repositories/accountRepository.js  exportacao: alert_level
      backend/src/services/accountService.js       exportacao: alertaMaximo
NOVO  src/components/allergies/AlertLevelPicker.jsx  a caixa por alergia
      src/App.jsx                                  estado, gravacao e o convite
      src/pages/Allergies/AllergiesPage.jsx, src/pages/Account/AccountPage.jsx
      src/pages/Home/HomePage.jsx                  o convite
      src/components/food/ProductAnalysis.jsx      "· alerta maximo" na etiqueta
      src/components/assistant/AllergyVerdict.jsx  titulo e etiquetas do veredito
      src/services/profileService.js, src/services/storageService.js
      src/styles-v070.css                          so acrescimo; styles.css intocado
```

Gate e testes: `scripts/e2e-real.js` (subgate `severityVerdict`),
`scripts/lib/e2eGate.js` (requisito novo), `scripts/mutation-check.js` (14
mutantes novos; P4 e W11 ajustados - ver A2), `backend/tests/alertLevel.test.js`
e `backend/tests/alertLevelIntegration.test.js` (novos),
`backend/tests/e2eGate.test.js` (21 requisitos), e tres pontos de teste que
injetam o carregador de alergias (`allergyVerdict.test.js`, `fallback.test.js`)
ganharam o carregador de nivel ao lado - nenhuma assercao mudou.

## A4 - o rotulo: "alerta maximo", e por que

```text
prompt          codigo        tela
PADRAO          standard      (sem marca: e o normal)
GRAVE           strict        "Alerta maximo"
severidade      alertLevel    "nivel de alerta"
```

- **"Alerta maximo" descreve o que a pessoa quer do APP**, como a secao 5.1
  pede, e nao uma condicao dela. "Alergia grave" seria a pessoa declarar ao app
  uma classificacao clinica, e o app nao diagnostica nem classifica ninguem.
  Quem quer o aviso mais forte por qualquer motivo usa o mesmo nivel sem afirmar
  nada sobre si.
- **O campo e `alertLevel`, e nao `severity`.** No motor, `risk.severity` JA e
  a classificacao do rotulo (`contains` / `traces`). Reusar a palavra faria o
  mesmo objeto ter duas "severidades" com sentidos diferentes - receita para o
  proximo defeito.
- Na tela: "Marque onde voce quer o aviso mais forte. O app passa a avisar
  tambem quando o rotulo diz 'pode conter'." - o que o app faz, nunca o que a
  pessoa deve fazer. Um teste renderiza o texto novo e reprova vocabulario de
  diagnostico ou de conduta.

## 6.1 - dois niveis

Implementado com dois, como o prompt mandou. Concordo com o motivo: o nivel do
meio nao mudaria nada do que a pessoa faz diante do produto. Nenhum terceiro
nivel foi implementado.

## A3 - DDL da migration e a regra do dado existente

`backend/migrations/004_nivel_de_alerta.sql`:

```sql
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
```

**Regra de 6.2, declarada no cabecalho da propria migration:** toda alergia ja
cadastrada recebe `standard`; ninguem e elevado para `strict`. O `DEFAULT
'standard'` do `ADD COLUMN` preenche as linhas existentes, e vale tambem para
toda alergia nova gravada sem nivel. Conferido em dado real: no banco de
producao, as 7 alergias que ja existiam ficaram `standard` (ver A10).

**CHECK, e nao ENUM:** mudar a lista depois e trocar uma restricao numa migration
comum e transacional - um ENUM nao perde valor sem recriar o tipo; a coluna
continua `text`, sem tipo novo para o driver, o schema temporario dos testes e o
`pg_dump`; e a regra fica escrita na tabela.

**Idempotente:** `IF NOT EXISTS` na coluna; a restricao so e criada se nao
existir nesta tabela. O S11 roda a 004 tres vezes num schema montado pelas
migrations e exige o mesmo dado e uma restricao so.

**Coluna, e nao tabela:** severidade e atributo da alergia da pessoa (6.4). Nao
ha como gravar nivel de alergia que a pessoa nao tem, e a cascata
`user_allergies.user_id -> users(id) ON DELETE CASCADE`, da migration 001, leva o
nivel junto na exclusao da conta - confirmado no catalogo dos dois bancos e pelo
S15.

## 6.2 - o padrao preserva o comportamento atual, e o convite

- Toda alergia sem nivel declarado e `standard`, identica a v0.8.0.
- **O convite:** quem tem conta, tem alergia e ainda nao usou o alerta maximo ve
  na tela inicial um cartao - "Novidade / Alerta maximo / Agora voce escolhe, em
  cada alergia, se quer o aviso mais forte. Quer revisar as suas?" - com
  "Revisar minhas alergias" e "Agora nao". E cartao, nao janela: o resto da tela
  continua usavel (teste e conferido no navegador). Qualquer um dos dois botoes
  o tira de vez.
- **"Uma vez" e por conta, neste aparelho.** A marca de "visto" fica no
  navegador, com o id da conta e nada do perfil. Num aparelho novo o convite pode
  voltar. Escolhido para nao criar dado novo no banco so por isso; descrito para
  decisao.
- O convite fica na tela ate a pessoa responder: so nao aparece mais depois de um
  dos dois botoes.

## O que muda no veredito, caso a caso

O que muda e a RESPOSTA a classificacao, nao a classificacao.
`analyzeProductAllergens` nao foi tocado: o `git diff` de `shared/allergenEngine.js`
contra a v0.8.0 e vazio - e o do `backend/src/ai/assistantPrompt.js`, onde mora o
schema fechado da resposta do modelo, tambem.

```text
                       standard (padrao)                     strict (alerta maximo)
declarado no rotulo    conflito {id,label}, piso caution     conflito, piso URGENT
                       (identico a v0.8.0)                   origin "declared", alertLevel "strict"
"pode conter"          traces, sem piso                      CONFLITO, piso caution
                       (identico a v0.8.0)                   origin "traces", alertLevel "strict"
```

- `urgent` so existe no caso declarado + alerta maximo (6.4).
- **Byte a byte:** o S1 compara 20 combinacoes de produto e perfil com a saida
  literal do `buildAllergyVerdict` da v0.8.0, gravada no teste - sem mapa de
  nivel e com o mapa explicito em `standard`. As 20 sao identicas.
- O texto de `alert` do alerta maximo: "Este produto tem Amendoim, que esta no
  seu perfil de alergias. Voce pediu alerta maximo para Amendoim. Confira a
  embalagem fisica antes de consumir." / "Pode conter tracos de Amendoim. Voce
  pediu alerta maximo para Amendoim. Confira a embalagem fisica antes de
  consumir." O fecho e o mesmo do texto de sempre.

## Como o veredito distingue os casos para a interface

- Cada conflito de alergia `strict` traz `origin` (`declared` ou `traces`) e
  `alertLevel: "strict"`. Conflito de alergia `standard` continua `{ id, label }`;
  ausentes, os campos valem `declared` e `standard` - e o que preserva o byte a
  byte. `conflictOrigin()` em `shared/allergyVerdict.js` faz essa leitura.
- `minimumSafety: "urgent"` marca o caso declarado + alerta maximo.
- A tela usa isso: no assistente, o titulo vira "Alerta maximo: conflito com o
  seu perfil" quando o piso e `urgent`, e a etiqueta diz "Pode conter Amendoim ·
  alerta maximo" no traco; na tela do produto, "Amendoim · alerta maximo".

## A IA e o nivel (5.1, 5.3, S5, S6, S18)

- O veredito e montado ANTES da chamada de IA, com o nivel lido do PostgreSQL;
  o piso e imposto DEPOIS, por `applyAllergyAuthority`, sem alteracao.
- Uma chave de nivel na resposta do modelo (`alertLevel`, `alertLevels`,
  `severity`) derruba a resposta inteira com `AI_SCHEMA_INVALID` - o schema
  `.strict()` que ja existia. E `applyAllergyAuthority` descarta qualquer
  `allergyVerdict` vindo do modelo (S6).
- **O nivel NAO vai para a Anthropic, nem dentro do `allergySnapshot`.** A 5.2
  permitia; a decisao foi nao usar a permissao. O modelo nao precisa dele (o
  veredito e o piso sao do servidor), e um modelo que nao recebe o nivel nao
  consegue comenta-lo, questiona-lo ou "corrigi-lo" - a garantia e estrutural,
  e nao uma instrucao no prompt. O S18 exige que o payload ao modelo seja
  identico com alerta padrao ou maximo, e que o snapshot tenha exatamente as
  chaves da v0.8.0.

## O log (5.2, S17)

O registro `assistant.allergy_minimization_attempt` levava `enforcedSafety`.
Com o alerta maximo, esse campo diria "urgent" justamente quando a alergia e
`strict` - o log contaria qual alergia a pessoa marcou. **O campo saiu**, e
`conflicts` passou a listar so o conflito declarado, que existe com qualquer
nivel; a regra de quando registrar continua a da v0.8.0 (conflito declarado +
modelo dizendo "normal"). Para o mesmo produto e as mesmas alergias, o registro e
identico com alerta padrao ou maximo (S17, unitario). E o S17 de integracao
captura o console de todos os fluxos reais - gravar o nivel, nivel recusado,
perfil, `me`, exportacao e o assistente lendo o banco - e nao encontra
`strict`, `alertLevel`, `alert_level`, `alertaMaximo` nem `urgent`.

## API (secao 8)

`PUT /api/profile/allergies` aceita `alertLevels: { allergyId: "standard" |
"strict" }`, opcional. Corpo sem ele continua valido e significa `standard`
(S10). Recusas, todas `400 VALIDATION_ERROR` e sem gravar nada: nivel
desconhecido (S8), nivel para alergia fora de `allergies` (S9), chave fora do
catalogo - inclusive `__proto__` e `constructor`. `userId`/`user_id` no corpo sao
descartados (S16). O perfil publico ganhou `alertLevels`, com uma entrada por
alergia. Documentado em `docs/API.md`.

## A1 - S1 a S18, R1 a R6

Todos presentes e verdes na suite completa contra PostgreSQL real (A7). Nenhum
em SKIP nessa execucao. Sem banco (A6), os de integracao saem como NAO EXECUTADO,
e nao como PASS.

```text
unitarios (tests/alertLevel.test.js)
S1  S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0
S2  S2 alerta maximo + conflito declarado: piso urgent
S3  S3 alerta maximo + traco: conflito no veredito, piso caution
S4  S4 nivel padrao + traco: nenhum conflito, igual a v0.8.0
S5  S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos
S6  S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta
S7  S7 o veredito distingue declarado de traco, e alerta maximo de padrao
    S7 a tela diz coisas diferentes para alerta maximo e para traco
S8  S8 nivel desconhecido e recusado pela validacao
S9  S9 nivel para alergia ausente do perfil e recusado pela validacao
S10 S10 corpo sem nivel continua valido e significa padrao
S17 S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo
S18 S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot
    o convite para revisar o nivel e dispensavel e nao bloqueia a tela
    o texto novo descreve o que o app faz, sem diagnostico nem orientacao medica

com PostgreSQL real (tests/alertLevelIntegration.test.js)
S8  S8 a API recusa nivel desconhecido, e nada muda no banco
S9  S9 a API recusa nivel para alergia ausente do perfil, e nada muda
S10 S10 corpo sem nivel continua funcionando e grava padrao
S11 S11 migration 004: alergias existentes recebem padrao, e rodar de novo nao muda nada
S12 S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations
S13 S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo
    S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations
S14 S14 o nivel de alerta entra na exportacao da conta
S15 S15 o nivel sai na exclusao da conta - varredura das tabelas
S16 S16 o nivel de A nao e visivel nem alteravel por B
S17 S17 o nivel nunca aparece no log - API real e assistente com o perfil do banco
S5  S5 com o perfil do banco, o modelo negando nao derruba o piso do alerta maximo
```

Como os delicados provam o que dizem:

- **S11 e S12** montam um schema temporario rodando SO os arquivos de
  `migrations/`. Mudar uma migration nao muda o banco de teste ja migrado - e o
  mesmo truque do D4 da v0.8.0. O S11 grava um perfil ANTES da 004, aplica a 004
  e exige `standard`; aplica de novo duas vezes e exige o mesmo dado. O S12
  tenta `INSERT` e `UPDATE` com `grave`, `STRICT` e `urgent` direto em SQL, no
  banco em uso e no schema das migrations, e exige o erro `23514`.
- **S13** grava historico e favorito, troca o nivel e le de novo: os itens sao
  identicos byte a byte, nao carregam campo de nivel nem de veredito, e o
  veredito calculado com o perfil lido vai de `caution` para `urgent` e volta. O
  segundo S13 confere, no banco e no schema das migrations, que nenhuma coluna
  das colecoes tem nome de nivel, veredito, safety ou risco.
- **S16**: B tenta gravar no perfil de A com `userId` e `user_id` de A no corpo; a
  resposta e de B, e o nivel de A continua o mesmo no banco.

R1 a R6 - regressao, verdes na mesma execucao (74 testes):

```text
R1  C1            T1 exploit C1: modelo negando conflito nao entrega falso seguro
R2  isolamento    I1, I2, I3 (estaticos e contra o banco)
R3  digito        M1 (5), M3 (3), M9 (2); canonicalizacao N1 a N1g (14);
                  tetos R1, R2, R5 (5), R6, R7 e R11 (403 de 3000 por IP)
R4  exportacao    E2 (hash e salt pelo valor), E4 (nada do vizinho)
R5  exclusao      D4 (varredura de toda coluna de toda tabela; cascata no banco e
                  no schema das migrations)
R6  handler       O2a a O2e (11), P5 (4); fail-closed P9 (6) e MODO (2);
                  verify:deploy somente leitura P13 (3)
```

## A2 - validacao por mutacao

Rodada completa, com banco, sobre o codigo entregue:

```text
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<PostgreSQL LOCAL> DATABASE_SSL=false \
  node scripts/mutation-check.js --com-banco
```

```text
mortas 95 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
REPROVADO: ha teste que nao detecta o defeito que deveria detectar.
=== EXIT: 1 ===
```

**96 mutantes: 95 mortos, 1 sobrevivente (W1, da v0.8.0), 0 nao executados, 0
inaplicaveis.** A linha de base - as 14 suites sem mutacao, incluidas as duas
novas - estava verde antes e depois. **Os 14 mutantes novos morreram todos.** O
script sai com codigo 1 por causa do W1, e isso fica registrado como esta.

### Os seis mutantes pedidos pelo prompt

```text
pedido pelo prompt                                mutante  teste que o pegou                                   resultado
piso de grave volta a ser caution (S2)            X1       S2 alerta maximo + conflito declarado               MORTA
traco de grave volta a nao produzir conflito (S3) X2       S3 alerta maximo + traco                            MORTA
piso deixa de ser imposto apos o modelo (S5)      X3       S5 o modelo respondendo normal                      MORTA
campo de severidade do modelo aceito (S6)         X4       S6 o modelo nao escreve nem influencia o nivel      MORTA
restricao do banco removida (S12)                 X5       S12 ... no banco e no schema das migrations         MORTA
severidade gravada junto com o historico (S13)    X6       S13 nenhuma tabela de colecao tem onde guardar      MORTA
                                                  X6b      S13 nivel nao congelado: o item salvo nao muda      MORTA
```

O sexto nao cabe num mutante de um arquivo so: gravar o nivel junto do item
exige um lugar para guardar E a escrita. Virou duas metades, cada uma pega por um
S13 - X6 cria a coluna em `product_history` pela migration (o schema), X6b faz o
item do historico sair com o nivel do perfil (a leitura).

O X5 e o X6 mexem na migration, e o banco de teste ja esta migrado: so morrem
porque o S12 e o S13 tambem conferem um schema montado SO pelas migrations, como
o D4 da v0.8.0.

### Os outros sete mutantes novos

```text
X7   S17  o registro de minimizacao volta a levar o piso aplicado       MORTA
X8   S18  o nivel passa a ir ao modelo dentro do allergySnapshot       MORTA
X9   A11  o gate perde o requisito severityVerdict                     MORTA
X10  S9   a validacao aceita nivel para alergia fora do perfil          MORTA
X11  S1   o conflito de alergia padrao ganha campos novos               MORTA
X12  S8   a validacao aceita qualquer texto como nivel                  MORTA
X13  S16  a rota do perfil aceita userId do corpo                       MORTA
```

(X1 a X13, mais o X6b: 14 mutantes.)

### Dois mutantes antigos ajustados - sem mudar o defeito

- **P4** (v0.7.3, "remove o piso de risco do veredito") mirava a linha
  `minimumSafety: status === VERDICT_STATUS.conflict ? CONFLICT_MINIMUM_SAFETY : null,`,
  que mudou de forma: o piso agora sai de `minimumSafetyFor(status, conflicts)`.
  A ancora foi refeita para a linha nova; o defeito injetado e o mesmo
  (`minimumSafety: null`), e o teste que o pega e o mesmo (M5). MORTA.
- **W11** (v0.8.0, "o gate perde accountDeletion") e o mesmo mutante; o teste que
  o pega foi renomeado de "exatamente 20 requisitos" para "exatamente 21". MORTA.

### O sobrevivente: W1, o mesmo da v0.8.0

O W1 faz o repositorio da exportacao devolver a linha inteira de `users`, mas o
servico monta o arquivo campo a campo - a exportacao nao muda, e o E2E esta certo
em passar. E equivalente, foi descrito na v0.8.0 com a demonstracao de que a
suite estatica (`nunca usa SELECT *`) o pega, e esta versao nao mexeu nele nem no
`mutation-check.js` por causa dele.

### A rodada inteira

Linha de base:

```text
[linha de base - antes] 14 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
  VERDE    tests/alertLevel.test.js
  VERDE    tests/alertLevelIntegration.test.js
```

```text
T1  P2   MORTA                  "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta" falhou, como deveria
T1b  P2   MORTA                  "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost" falhou, como deveria
T2  P5   MORTA                  "P5 erro do driver do banco nao chega ao cliente" falhou, como deveria
T2b  P5   MORTA                  "P5 o detalhe do erro vai para o log do servidor" falhou, como deveria
T3  P9   MORTA                  "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual" falhou, como deveria
T3b  P9   MORTA                  "P9 valor booleano nao reconhecido nao cai em default silencioso" falhou, como deveria
T4  P12  MORTA                  "P12 versao no ar diferente da do repositorio reprova o D1" falhou, como deveria
T5  P13  MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
T5b  P13  MORTA                  "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada" falhou, como deveria
T6  P3   MORTA                  "P3 CORS devolve a origem configurada, nunca a do request" falhou, como deveria
T7  P4   MORTA                  "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha" falhou, como deveria
T8  P11  MORTA                  "P11 NOT_EXECUTED nao conta como PASS no agregado" falhou, como deveria
T9  P11  MORTA                  "P11 o comando de verdade sai com codigo 1 quando um subgate falha" falhou, como deveria
V1  S1/S4 MORTA                  "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO" falhou, como deveria
V1b  S2   MORTA                  "S2 render.yaml nao declara variavel que o codigo nao le" falhou, como deveria
V1c  S3   MORTA                  "S3 nenhuma credencial com valor literal no render.yaml" falhou, como deveria
V2  O2a  MORTA                  "O2a JSON malformado responde 400, nao 500 - a medicao do auditor" falhou, como deveria
V3  O2d  MORTA                  "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status" falhou, como deveria
V3b  O2d  MORTA                  "O2d copiar o type do body-parser nao basta para ganhar 400" falhou, como deveria
V4  R7   MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
U1  C2   MORTA                  "C2 a camera nunca transforma um codigo em outro" falhou, como deveria
U2  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U3  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U4  O2e  MORTA                  "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor" falhou, como deveria
U4b  O2e  MORTA                  "O2e copiar name, type e status do corpo grande nao basta para ganhar 413" falhou, como deveria
U5  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U5b  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U6  MIG  MORTA                  "MIG migration que nao alcanca o banco falha dizendo por que" falhou, como deveria
U7  MIG  MORTA                  "o doctor conta as mesmas migrations que o runner aplica, .sql e .js" falhou, como deveria
U8  ORC  MORTA                  "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP" falhou, como deveria
W1  E2   MUTACAO SOBREVIVEU     a suite passou com o defeito aplicado
W1b  E2   MORTA                  "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor" falhou, como deveria
W2  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W2b  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W3  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W3b  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W4  D2   MORTA                  "D2 exclusao com senha errada nao remove nada" falhou, como deveria
W5  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W5b  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W6  D8   MORTA                  "D8 falha simulada no meio da exclusao deixa o estado anterior intacto" falhou, como deveria
W7  E8   MORTA                  "E8 a rota real recusa a exportacao acima do teto do usuario" falhou, como deveria
W8  D9   MORTA                  "D9 a tentativa com senha errada gasta o mesmo balde do login" falhou, como deveria
W9  D1   MORTA                  "D1 exclusao com a senha correta remove a conta e limpa o cookie" falhou, como deveria
W10  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W10b  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W11  A11  MORTA                  "A11: o modo strict tem exatamente 21 requisitos, os 20 da v0.8.0 mais severityVerdict" falhou, como deveria
S1  N1a  MORTA                  "N1 o schema canonicaliza UPC-A para EAN-13" falhou, como deveria
S1b  N1a  MORTA                  "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" falhou, como deveria
S1c  N1c  MORTA                  "N1c requisicao DIRETA ao backend grava a forma canonica" falhou, como deveria
S2  N1e  MORTA                  "N1e o schema nao altera EAN-13 nem EAN-8" falhou, como deveria
S2b  N1d  MORTA                  "N1d codigo nao-EAN passa intacto pela canonicalizacao" falhou, como deveria
S3  N1g  MORTA                  "N1g a migration funde as duas formas pela regra declarada" falhou, como deveria
S4  N1g  MORTA                  "N1g a migration e idempotente e nao toca codigo nao-EAN" falhou, como deveria
S5  R2   MORTA                  "N1 a canonicalizacao nao afrouxa a conferencia do digito" falhou, como deveria
S6  N1   MORTA                  "N1 a canonicalizacao usa shared/barcode.js, sem copia local" falhou, como deveria
P1  M1   MORTA                  "M1 codigos com digito verificador errado sao recusados pelo motivo certo" falhou, como deveria
P1b  M1   MORTA                  "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos" falhou, como deveria
P2  M3   MORTA                  "M3 o backend recusa productCode com digito verificador invalido" falhou, como deveria
P2b  M3   MORTA                  "M3 a regra do backend e estreita e nao quebra cadastro legitimo" falhou, como deveria
P3  M4   MORTA                  "o caminho manual nao monta o resultado por conta propria" falhou, como deveria
P3b  M4   MORTA                  "M2 codigo invalido nao chega a rede" falhou, como deveria
P4  M5   MORTA                  "M5 o piso de risco vale no caminho manual" falhou, como deveria
P5  M9   MORTA                  "M9 nao existe segunda implementacao do digito verificador" falhou, como deveria
P5b  M9   MORTA                  "M9 backend e frontend usam a MESMA implementacao de shared/" falhou, como deveria
P6  M7   MORTA                  "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo" falhou, como deveria
P7  M6   MORTA                  "M6 cada motivo de recusa tem mensagem propria" falhou, como deveria
P8  M8   MORTA                  "M8 nenhum outro caractere e removido em silencio" falhou, como deveria
P9  M10  MORTA                  "M10 o backend recusa gravar codigo com digito verificador invalido" falhou, como deveria
N1  R1/R3 MORTA                  "R1 usuario dentro do teto mas IP estourado recebe 429" falhou, como deveria
N1b  R3   MORTA                  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP" falhou, como deveria
N2  R2   MORTA                  "R2 IP dentro do teto mas usuario estourado recebe 429" falhou, como deveria
N2b  R4   MORTA                  "R4 dois usuarios atras do MESMO IP mantem cotas separadas" falhou, como deveria
N3  R4   MORTA                  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP" falhou, como deveria
N4  R5   MORTA                  "R5 dados forjados no request nao conseguem balde de IP novo" falhou, como deveria
N5  R5   MORTA                  "R5 um bloco IPv6 /64 nao vira infinitos baldes" falhou, como deveria
M1  R6   MORTA                  "R6 os tres tetos por rota seguem nos valores declarados" falhou, como deveria
M2  R7   MORTA                  "R7 o teto por IP esta no valor medido" falhou, como deveria
M3  Q3   MORTA                  "Q3 nenhuma variavel de ambiente desliga os limitadores" falhou, como deveria
M3b  Q4   MORTA                  "Q4 nenhum dos limitadores tem opcao de pular requisicao" falhou, como deveria
M4  Q2   MORTA                  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto" falhou, como deveria
M6  R9   MORTA                  "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7  R9   MORTA                  "I2 usuario B nao remove item de A" falhou, como deveria
X1  S2   MORTA                  "S2 alerta maximo + conflito declarado: piso urgent" falhou, como deveria
X2  S3   MORTA                  "S3 alerta maximo + traco: conflito no veredito, piso caution" falhou, como deveria
X3  S5   MORTA                  "S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos" falhou, como deveria
X4  S6   MORTA                  "S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta" falhou, como deveria
X5  S12  MORTA                  "S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations" falhou, como deveria
X6  S13  MORTA                  "S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations" falhou, como deveria
X6b  S13  MORTA                  "S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo" falhou, como deveria
X7  S17  MORTA                  "S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo" falhou, como deveria
X8  S18  MORTA                  "S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot" falhou, como deveria
X9  A11  MORTA                  "A11: o modo strict tem exatamente 21 requisitos, os 20 da v0.8.0 mais severityVerdict" falhou, como deveria
X10  S9   MORTA                  "S9 nivel para alergia ausente do perfil e recusado pela validacao" falhou, como deveria
X11  S1   MORTA                  "S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0" falhou, como deveria
X12  S8   MORTA                  "S8 nivel desconhecido e recusado pela validacao" falhou, como deveria
X13  S16  MORTA                  "S16 o nivel de A nao e visivel nem alteravel por B" falhou, como deveria
mortas 95 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
```

## A5 a A9

```text
A5  npm run build                          sucesso
A6  npm --prefix backend test              383 testes, 312 pass, 0 fail, 71 skipped
                                           (68 exigem PostgreSQL, 1 a IA real,
                                           2 a Open Food Facts real - todos
                                           declarados NAO EXECUTADO, nenhum PASS)
A7  suite contra PostgreSQL real (local)   383 testes, 380 pass, 0 fail, 3 skipped
                                           (1 IA real, 2 Open Food Facts real)
A8  npm audit --audit-level=moderate       frontend: found 0 vulnerabilities
    npm --prefix backend audit (moderate)  backend:  found 0 vulnerabilities
A9  npm run verify:release                 exit 0 - build, testes, os dois
                                           audits e "secret scan - 0 real secrets"
```

O A7 rodou com `RUN_DB_INTEGRATION_TESTS=true` contra o PostgreSQL LOCAL (17,
porta 5433), com `DATABASE_URL` definida no comando - nunca contra o banco de
producao. Gastos da suite contra os tetos por IP, medidos na propria execucao:
`[R11] 403 de 3000` e `[exportacao] 17 de 20`.

**A rodada final, sobre a arvore entregue, nao passou de primeira - e o registro
fica aqui:**

```text
verify:release 1  FAIL  T9c: o E2E_REPORT colava o /api/health de producao em
                        JSON, com o campo de versao em 0.7.0, dentro do bloco da 0.9.0.
                        Reescrito em texto; o teste nao foi tocado.
                        (A suite com banco, no mesmo momento, falhou inteira:
                        o PostgreSQL LOCAL estava parado - a maquina reiniciou.)
verify:release 2  FAIL  2 testes de http.test.js: getaddrinfo ENOTFOUND do banco
                        configurado - o DNS da maquina falhou naquele instante
verify:release 3  FAIL  testes 0 fail; o npm audit nao resolveu registry.npmjs.org
verify:release 4  PASS  exit 0 - nenhuma linha de codigo mudou desde a tentativa 1
                        (ao escrever este registro, o T9c pegou o mesmo padrao
                        de novo, neste texto; reescrito)
verify:release 5  PASS  exit 0 - a arvore exata que foi para o ZIP
suite com banco   PASS  383 / 380 / 0 / 3, depois de subir o PostgreSQL local
```

As falhas 2 e 3 sao de ambiente, conferidas antes de repetir: o banco respondia
`SELECT 1` e os nomes resolviam. Sao a mesma familia da segunda execucao do E2E.

## A10 - `verify:e2e`, e a migration no banco de producao

**PASS, exit code 0, na terceira execucao**, com PostgreSQL real e Claude real -
2 chamadas pagas nela. Os 21 requisitos em `PASSED`, `ok: true`. A saida literal,
a tabela de subgates, a contagem por balde e o `E2E_LAST_RUN.json` integral
estao no `E2E_REPORT.md`, com as tres execucoes:

```text
1a  FAIL  doctor strict: migration 004 pendente no banco do gate
2a  FAIL  API temporaria com database=error e chamada real do visitante falhando;
          causa NAO COMPROVADA - logo depois o banco e a Anthropic respondiam
3a  PASS  mesmo codigo, mesmo comando, nenhuma mudanca no gate
```

**A 004 foi aplicada no banco de producao**, que e o banco do gate - por
decisao do dono do projeto, perguntado antes. A 0.7.0 no ar usa o mesmo banco.
O que sustentou a decisao: a 004 e aditiva; o codigo da 0.7.0 (commit
`694c6c2`) so faz `SELECT allergy_id`, `DELETE` e `INSERT (user_id, allergy_id)`
em `user_allergies`, entao o padrao preenche `standard` e a restricao aceita; e
e reversivel com `DROP COLUMN`. Depois dela, o servico no ar respondeu
status `ok`, database `connected`, versao 0.7.0, e as 7 alergias
que ja existiam la ficaram `standard`.

O subgate novo:

```text
[OK] severity verdict - alerta maximo: urgent no declarado, caution no traco; padrao igual a v0.8.0; modelo negando nao derruba o piso
```

Ele grava o nivel pela API real, le por OUTRO aparelho da conta e consulta o
assistente com o codigo do backend lendo o perfil do PostgreSQL. O modelo e
simulado de proposito e nega o conflito nos quatro casos - e a unica forma de
forcar a negacao, que e o que o auditor faz, e nao custa chamada paga. Nao gasta
requisicao de balde limitado: a contagem por balde e a da v0.8.0 (assistente 2,
auth 7, colecoes 17, exportacao 1).

## A11 - os 20 requisitos antigos continuam exigidos; agora sao 21

Prova por execucao, sobre o `E2E_LAST_RUN.json` desta versao: para cada
requisito do modo strict, um relatorio com SO aquele requisito em
`NOT_EXECUTED` tem de reprovar, e reprovar so por ele.

```text
requisitos no modo strict (flag da IA ligada): 21
faltando no E2E_LAST_RUN.json desta versao: []

requisito                origem   presente   NOT_EXECUTED sozinho reprova
backendProcess           v0.8.0   sim        sim, e so ele
database                 v0.8.0   sim        sim, e so ele
migrations               v0.8.0   sim        sim, e so ele
auth                     v0.8.0   sim        sim, e so ele
sessionSchema            v0.8.0   sim        sim, e so ele
multiDevice              v0.8.0   sim        sim, e so ele
isolation                v0.8.0   sim        sim, e so ele
logout                   v0.8.0   sim        sim, e so ele
assistantAuthority       v0.8.0   sim        sim, e so ele
deterministicEngine      v0.8.0   sim        sim, e so ele
fallback                 v0.8.0   sim        sim, e so ele
privacy                  v0.8.0   sim        sim, e so ele
historySync              v0.8.0   sim        sim, e so ele
favoritesSync            v0.8.0   sim        sim, e so ele
verdictFreshness         v0.8.0   sim        sim, e so ele
manualCodeLookup         v0.8.0   sim        sim, e so ele
accountExport            v0.8.0   sim        sim, e so ele
accountDeletion          v0.8.0   sim        sim, e so ele
severityVerdict          v0.9.0   sim        sim, e so ele
anthropicReal            v0.8.0   sim        sim, e so ele
assistantAuthenticated   v0.8.0   sim        sim, e so ele

os 20 da v0.8.0 presentes: 20 de 20
novos: ["severityVerdict"]
```

Os testes que travam isso na suite, verdes:

```text
A11: os 20 requisitos da v0.8.0 continuam exigidos, um a um
A11: o modo strict tem exatamente 21 requisitos, os 20 da v0.8.0 mais severityVerdict
A11: severityVerdict e requisito BASE e reprova sozinho          (inclusive "SKIPPED")
A11: os 18 requisitos da v0.7.6 continuam exigidos, um a um
A10: desde a v0.7.2 entraram so manualCodeLookup, os dois da v0.8.0 e o da v0.9.0, nomeados
D2: o conjunto de requisitos do modo strict e exatamente este
```

O teste da v0.8.0 que travava o total em "exatamente 20" foi substituido pelo de
"exatamente 21", que nomeia o unico requisito novo - nao removido sem troca. O
mutante X9 (o gate perde `severityVerdict`) e o W11 provam que ele pega a
perda. `severityVerdict` e BASE: depende so de PostgreSQL e do motor, nao da
flag da IA - sem a flag, o modo strict exige 19 (os 16 base antigos, os 2 da
v0.8.0 e ele); com a flag, os 21.

## A12 - limpeza do banco depois do gate

Residuo **0** em todos os padroes de teste, e nenhuma linha orfa. Saida completa
no `E2E_REPORT.md`.

## A13 - `verify:deploy` inalterado e somente leitura

`git diff` do `scripts/verify-deploy.js` contra a v0.8.0: vazio. Nenhuma rota
nova foi acrescentada a ele, e o P13 continua verde.

```text
verify:deploy simulado (local, http)   FAIL, exit 1 - 7 PASS, D2 FAIL (sem TLS local)
verify:deploy REAL (somente leitura)   FAIL, exit 1 - 7 PASS, D1 FAIL
                                       "repositorio declara 0.9.0 e o deploy anuncia 0.7.0"
```

Os dois FAIL sao os esperados. Os sete PASS do real medem a 0.7.0.

## A14 - varredura do nome antigo

Fora de `node_modules`, `dist`, `.git`, `releases` e dos tres relatorios
historicos, o nome antigo aparece so em `backend/tests/productName.test.js`, o
teste que o procura. Os testes P1t estao verdes.

## A15 - versao nos sete pontos

```text
package.json                             0.9.0
backend/package.json                     0.9.0
package-lock.json (raiz e "")            0.9.0 / 0.9.0
backend/package-lock.json (raiz e "")    0.9.0 / 0.9.0
/api/health de um processo real          D1 do alvo simulado: "ambos declaram 0.9.0"; E2E_LAST_RUN.json: 0.9.0
README                                   # NutriScan v0.9.0
CHANGELOG                                ## NutriScan v0.9.0 - 2026-10-16
```

## A interface, verificada no navegador

Contra o backend local (porta 3200, PostgreSQL local, sem chave de IA), servindo
o `dist/` compilado, com uma conta de teste com Leite e Amendoim:

- A tela inicial mostrou o convite. "Revisar minhas alergias" abriu Alergias e
  marcou o convite como visto; "Agora nao", testado depois, tirou o convite, e
  ele nao voltou ao recarregar.
- Em Alergias, a secao "Alerta maximo" listou as duas alergias desmarcadas.
  Marcar Amendoim gravou no servidor `{ milk: "standard", peanut: "strict" }`, e
  a linha ganhou o tom de alerta.
- Com Leite tambem em alerta maximo, o produto "leite" mostrou a etiqueta
  "Leite/lactose · alerta maximo".
- No assistente, sem chave de IA, o veredito local mostrou "Alerta maximo:
  conflito com o seu perfil", a etiqueta "Leite/lactose · alerta maximo" e o
  texto do alerta.
- Em Conta, os chips sairam como "Leite/lactose · alerta maximo".
- Sem conta, a opcao nao aparece; a tela diz "Com conta, voce pode pedir alerta
  maximo em cada alergia."
- Em 320 px: Alergias e o convite sem rolagem lateral; menor fonte 17 px na
  secao e 18 px no convite; linhas de 52 px e botoes de 48 e 56 px.
- No console, so status de rede esperados (401 antes do login, 503 do
  assistente sem chave).

A conta de teste foi apagada do banco local depois.

## Observacoes descritas e NAO corrigidas - para decisao

Fora das secoes 6, 7 e 8. Descritas, como manda a secao 17.

1. **Orientacao de conduta que JA EXISTIA no produto.** A secao 5.1 proibe
   orientacao medica "em nenhum lugar do produto ou da documentacao", e a secao
   14 lista isso como bloqueio. Estes textos sao anteriores a v0.9.0 e nao foram
   tocados:

   ```text
   backend/src/ai/assistantService.js:219     resposta local de urgencia: "...procure
                                              atendimento de emergencia agora."
   backend/src/ai/assistantPrompt.js:48-49    system prompt: "oriente busca imediata de
                                              atendimento de emergencia"
   src/pages/Assistant/AssistantPage.jsx:35   aviso da tela: "Em caso de reacao
                                              alergica, procure atendimento."
   src/services/assistantService.js:321       fallback local: "...procure emergencia agora."
   src/services/assistantService.js:457       fallback local, texto de alergia
   ```

   Sao o caminho de urgencia do assistente, e remove-los e decisao de produto e
   de seguranca do usuario, nao detalhe desta versao. Nenhum texto NOVO desta
   versao orienta conduta - um teste confere o texto novo.
2. **App antigo aberto em outro aparelho.** A rota SUBSTITUI o perfil, e corpo
   sem `alertLevels` significa `standard`, como a secao 8 manda. Uma aba com o
   app de antes da v0.9.0, ainda aberta, que salve as alergias volta todas para
   `standard`. Alternativa possivel, nao implementada: corpo sem `alertLevels`
   preservar o nivel das alergias que continuam no perfil.
3. **Visitante nao tem nivel de alerta.** O nivel vive no perfil, no banco. Dar
   nivel ao visitante pediria um campo novo na requisicao do assistente.
4. **O convite e por aparelho**, como descrito em 6.2.
5. **Herdado da v0.8.0, ainda aberto:** a tela Conta rola de lado em 320 px (a
   grade do `styles.css` de design), e o log de erro interno grava o objeto de
   erro inteiro.

## O que esta versao NAO prova

- **A camera em hardware real: NAO EXECUTADO.**
- **O deploy real da 0.9.0: NAO EXECUTADO.** Nada foi publicado; no ar esta a
  0.7.0. O que mudou no banco de producao foi so a migration 004, por decisao do
  dono.
- **HTTPS da 0.9.0: NAO COMPROVADO** - o alvo simulado nao tem TLS.
- **A tela em aparelho real: NAO EXECUTADO.** A verificacao foi no navegador
  embutido do ambiente de desenvolvimento; a largura de 320 px foi emulada.
- **A causa da segunda execucao do E2E: NAO COMPROVADA.**
- **Adequacao clinica e conformidade juridica: nao declaradas**, e nao sao algo
  que teste prove.

## Auditoria da v0.8.0 - 2026-10-12

## Escopo

Entrada 0.7.6, saida 0.8.0. Direitos do titular: exportar os proprios dados
(`GET /api/account/export`) e excluir a propria conta (`DELETE /api/account`),
com a tela correspondente. Minor, e nao patch: capacidade nova de produto.

**Isto nao e parecer juridico.** O relatorio descreve o que o software faz. Ele
nao declara o NutriScan em conformidade com a LGPD: conformidade envolve base
legal, politica de privacidade e encarregado, que estao fora do codigo e fora
desta versao.

Preservado sem refatoracao, como a secao 3 do prompt mandou: o handler de erro
(400 `INVALID_JSON` e as tentativas de sequestro negadas), a sincronia com o
`render.yaml`, o fail-closed por variavel obrigatoria, o CORS, o `verify:deploy`
(nenhuma linha de comportamento; ver A13), o C1, o digito verificador, a
canonicalizacao UPC-A, os tetos 300/3000, o IPv6 /64, o isolamento entre contas
e a cascata. Nenhuma migration nova.

Codigo de producao da entrega (secoes 6 e 7):

```text
NOVO  backend/src/routes/accountRoutes.js           as duas rotas e seus limitadores
NOVO  backend/src/controllers/accountController.js  cabecalhos, cookie
NOVO  backend/src/services/accountService.js        arquivo, senha, transacao
NOVO  backend/src/repositories/accountRepository.js consultas coluna a coluna
NOVO  src/services/accountService.js                download e exclusao no navegador
      backend/src/app.js                            monta /api/account
      backend/src/middleware/rateLimit.js           tetos da exportacao (so acrescimo)
      backend/src/utils/validation.js               esquema da senha da exclusao
      src/App.jsx                                   estado e chamadas da tela
      src/pages/Account/AccountPage.jsx             cartao "Seus dados"
      src/styles-v070.css                           estilos do cartao (so acrescimo)
```

Gate e testes: `scripts/e2e-real.js` e `scripts/lib/e2eGate.js` (dois subgates),
`scripts/mutation-check.js` (16 mutantes novos), `backend/tests/account.test.js`
e `backend/tests/accountIntegration.test.js` (novos), `backend/tests/e2eGate.test.js`
e `backend/tests/verifyDeploy.test.js` (acrescimos).

O resto do diff e a secao "Correcoes autorizadas pelo dono" (abaixo), a
documentacao e a versao.

## A premissa do prompt, corrigida em dois pontos

**Ha deploy.** O servico `nutriscan` responde em
`https://nutriscan-h1wp.onrender.com` e roda a **0.7.0**. Nunca foram publicadas
as versoes 0.7.1 a 0.8.0. Por isso o `verify:deploy` foi executado contra a URL
real, somente leitura (A13).

**A cascata e mais antiga do que o prompt diz.** O prompt fala em cascata
"desde a v0.7.0". Para historico e favoritos, sim (migration 002, commit
`694c6c2`, 2026-09-18). Para sessoes e alergias, a cascata e da **v0.6.6**
(migration 001, commit `1664159`, 2026-08-15). Em nenhuma das duas havia rota ou
tela que apagasse um usuario.

## Correcoes autorizadas pelo dono, fora das secoes 6 e 7

A secao 17 do prompt fecha o escopo nas secoes 6 e 7 e manda descrever, nao
entregar, o que estiver fora. Estas correcoes estao fora - e entraram assim
mesmo, **por decisao explicita do dono do projeto**, que mandou incluir na
proxima versao "a correcao da camera" e "as outras correcoes do stash". Elas
foram feitas entre a v0.7.5 e a v0.7.6, guardadas em `stash@{0}` porque batiam
nas regras da v0.7.6 (o AUDIT_REPORT da v0.7.6 as lista, na secao historica), e
aplicadas agora.

```text
correcao                                      onde                                    prova
leitura da camera nunca vira OUTRO codigo     src/utils/text.js, productLookup.js,    C2 + mutantes U1-U3
                                              src/App.jsx
NODE_ENV desconhecido recusa subir            backend/src/config/env.js, server.js    MODO + mutantes U5, U5b
migration que falha diz por que               backend/scripts/migrate.js              MIG + mutante U6
corpo grande demais: 413, nao 500             backend/src/middleware/errorMiddleware  O2e + mutantes U4, U4b
doctor conta migrations .js                   scripts/lib/doctorChecks.js, doctor.js  doctor + mutante U7
orcamento do gate mostra o teto por IP        scripts/e2e-real.js                     orcamento + mutante U8
env.test.js nao escreve no backend/.env real  so teste                                -
teste opcional contra a Open Food Facts real  so teste, desligado por padrao          -
comentario corrigido no verify-deploy.js      scripts/verify-deploy.js (comentario)   -
```

Duas delas tocam pontos que a secao 3 manda nao refatorar, e por isso merecem
nota:

- **O 413 nao e generalizacao.** A versao guardada respondia o status de
  qualquer erro com `expose: true` - exatamente o que a v0.7.6 proibiu. Foi
  refeita no molde do 400: reconhece UM caso, pela classe `PayloadTooLargeError`
  E pelo `type: "entity.too.large"`, com status e mensagem fixos. Os testes O2e
  provam que copiar `name`, `type` e `status` nao basta; as tentativas de
  sequestro da v0.7.6 continuam negadas (O2d, verdes).
- **O `NODE_ENV` reforca o fail-closed**, nao o afrouxa: um valor desconhecido
  passa a impedir a subida, em vez de virar desenvolvimento em silencio.

A camera continua **NAO ATESTADA em hardware real**: a correcao e provada por
teste e mutacao sobre a funcao, nao por leitura de um aparelho.

## A1 - E1 a E8, D1 a D9, R1 a R6

Todos presentes e verdes na suite completa contra PostgreSQL real (A7).

```text
E1  E1 a exportacao traz conta, alergias, historico e favoritos do titular
E2  E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor
E3  E3 a exportacao nao contem token de sessao, cookie, credencial nem id interno
E4  E4 a exportacao de A nao contem nada de B, com B populado
E5  E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado
E6  E6 sem sessao, exportar e excluir respondem 401
    E6 cookie inventado nao vira sessao
E7  E7 o nome do arquivo e so produto e dia - sem e-mail, sem nome
    E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache
E8  E8 os tetos da exportacao estao nos valores declarados
    E8 o limitador de PRODUCAO recusa a sexta exportacao do mesmo usuario no dia
    E8 usuario dentro da cota mas IP esgotado recebe 429 - o mais restritivo vence
    E8 as rotas estao ligadas aos limitadores certos
    E8 a rota real recusa a exportacao acima do teto do usuario
D1  D1 exclusao com a senha correta remove a conta e limpa o cookie
D2  D2 exclusao com senha errada nao remove nada
D3  D3 exclusao sem senha, com corpo vazio ou com JSON quebrado nao remove nada
D4  D4 apos a exclusao, nenhuma linha em nenhuma tabela referencia o usuario
    D4 no banco real, toda tabela que referencia users tem ON DELETE CASCADE
    D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users
D5  D5 apos a exclusao, todas as sessoes do usuario deixam de autenticar - 401, nao 500
D6  D6 a exclusao de A deixa B intacto: historico, favoritos, alergias e login
D7  D7 e-mail e nome voltam a ficar disponiveis para novo cadastro
D8  D8 falha simulada no meio da exclusao deixa o estado anterior intacto
D9  D9 a tentativa com senha errada gasta o mesmo balde do login
```

Mais quatro, sem rotulo do prompt: `DELETE com corpo quebrado responde 400
INVALID_JSON, antes de qualquer rota` (secao 9), `as rotas de conta nao importam
nada da Anthropic` (7.5), `a exportacao lista as colunas da conta e nunca usa
SELECT *` e `exclusao e fisica: nada de deleted_at, nada de copia` (7.5).

Como os mais delicados provam o que dizem:

- **E2** cria a conta, LE do banco o `password_hash` e o `password_salt` reais e
  procura os dois VALORES dentro do JSON serializado. O E3 faz o mesmo com o
  `token_hash` e o cookie.
- **E4** popula B com alergia, historico e favorito e procura, na exportacao de
  A, cada valor de B: e-mail, nome, id, token, hash, salt, codigos e nomes de
  produto. E confere que A traz exatamente o seu historico, o seu favorito e a
  sua alergia.
- **E5** pede a exportacao de A tres vezes: com o id e o e-mail de B no corpo
  (`userId`, `user_id`, `email`), na query (`userId`, `user_id`) e em dois
  cabecalhos (`X-User-Id`, `User-Id`). Nas tres, o arquivo e de A e nao tem o
  e-mail de B.
- **D4** varre TODA coluna uuid e de texto de TODA tabela do schema `public`
  atras do id e do e-mail apagados - nao so as tabelas conhecidas. Depois confere
  a cascata no catalogo do banco em uso e num schema temporario montado SO pelas
  migrations: assim um banco consertado a mao nao esconde migration sem cascata.
- **D8** instala um gatilho `BEFORE DELETE` em `product_favorites` que lanca
  excecao: a falha acontece DENTRO da cascata, depois que as sessoes ja foram
  apagadas. Confere que a resposta e 500 sem limpar o cookie, que a sessao volta
  com o ROLLBACK e autentica, e que as contagens de usuario, sessoes, alergias,
  historico e favoritos sao as mesmas de antes. Nenhum gancho no codigo de
  producao.
- **D9** confere que a exclusao com senha errada responde com
  `ratelimit-limit: 40` - o limitador do login - e que o login seguinte ve o
  `ratelimit-remaining` um a menos: e o mesmo balde.

R1 a R6 sao a regressao, verdes na mesma execucao:

```text
R1  isolamento      I1 usuario A nao le historico nem favorito de B
                    I2 usuario B nao remove item de A
                    I3 userId no corpo da requisicao e ignorado; vale a sessao
                    (e os I1/I2/I3 estaticos: todo SQL filtra por usuario)
R2  C1              T1 exploit C1: modelo negando conflito nao entrega falso seguro
R3  digito          M1 (5 testes), M3 (3), M9 (2)
    canonicalizacao N1 a N1g (14 testes, schema e banco)
    tetos           R1, R2, R5 (5), R6 e R7 do limitador; R11 (403 de 3000 por IP)
R4  handler         O2a a O2e (11 testes): 400 no parse, 413 no corpo grande,
                    500 no interno, nenhum sequestro de status; P5 (4)
R5  fail-closed     P9 (6 testes), MODO (2)
R6  verify:deploy   P13 o registro de requisicoes do verify:deploy nao tem escrita
                    P13 contra o roteador REAL, nenhuma rota de escrita e alcancada
                    P13 a sonda do D6 nao corresponde a nenhuma rota registrada
```

O P13 ganhou `DELETE /api/account` na lista de rotas de escrita proibidas: se o
`verify:deploy` um dia chamar a exclusao, ele reprova.

## A2 - validacao por mutacao

Rodada completa, com banco, sobre o codigo entregue:

```text
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<PostgreSQL LOCAL> DATABASE_SSL=false   node scripts/mutation-check.js --com-banco
```

```text
mortas 81 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
REPROVADO: ha teste que nao detecta o defeito que deveria detectar.
=== EXIT: 1 ===
```

**82 mutantes: 81 mortos, 1 sobrevivente (W1), 0 nao executados, 0
inaplicaveis.** A linha de base - as 12 suites sem mutacao - estava verde antes
e depois. O script sai com codigo 1 por causa do W1, e isso fica registrado
como esta: o W1 e reportado e justificado abaixo, e o script nao foi alterado
depois do resultado.

### Os seis mutantes pedidos pelo prompt

```text
pedido pelo prompt                                  mutante  teste que o pegou                         resultado
exportacao inclui o registro bruto, com hash  (E2)  W1       - (repositorio; ver abaixo)               SOBREVIVEU
                                                    W1b      E2 ... pelo valor                          MORTA
consulta da exportacao perde o filtro (E4)          W2       E4 (historico sem filtro)                  MORTA
                                                    W2b      E4 (favoritos sem filtro)                  MORTA
exportacao le req.body.userId (E5)                  W3       E5 (corpo)                                 MORTA
                                                    W3b      E5 (query)                                 MORTA
exclusao deixa de revalidar a senha (D2)            W4       D2                                         MORTA
cascata removida de uma tabela (D4)                 W5       D4 schema das migrations (favoritos, 002)  MORTA
                                                    W5b      D4 schema das migrations (sessions, 001)   MORTA
exclusao deixa de ser transacional (D8)             W6       D8                                         MORTA
```

Alem desses: W7 (rota sem o limitador proprio, E8), W8 (exclusao fora do
limitador de autenticacao, D9), W9 (exclusao sem limpar o cookie, D1), W10 e
W10b (nome do arquivo com e-mail; resposta cacheavel, E7) e W11 (o gate perde
`accountDeletion`, A11) - todos mortos.

### O sobrevivente: W1, e por que ele e equivalente

O W1 troca a consulta do REPOSITORIO por `SELECT * FROM users` e espalha a
linha inteira - com `password_hash` e `password_salt` - no objeto que ele
devolve. Mas o SERVICO monta o arquivo campo a campo:

```js
conta: { nome: conta.nome, email: conta.email, criadaEm: data(conta.criadaEm) },
```

Os campos a mais nunca chegam ao JSON. Com o W1 aplicado, a exportacao e a
mesma, byte a byte - e o E2, que confere o ARQUIVO, esta certo em passar. E um
mutante equivalente para o comportamento: as duas camadas filtram, e ele so
derruba uma.

O mutante que de fato poe o registro bruto no arquivo e o **W1b**: o servico
passa a espalhar `findUserById` - a linha com hash - dentro de `conta`. O E2 o
mata.

A mudanca no repositorio nao fica sem teste. Ela e pega pela suite ESTATICA
`account.test.js`, que nao e a suite que o W1 roda. Demonstracao, feita a
parte - o mesmo `de`/`para` do W1, lido do proprio `mutation-check.js`, com o
arquivo restaurado no fim:

```text
W1: a exportacao passa a incluir o registro bruto do usuario, com hash
arquivo backend/src/repositories/accountRepository.js, sha256 antes 085a4fd00b83d4b5

[com o W1 aplicado] tests/accountIntegration.test.js (a suite do mutante)
  exit 0 | ℹ tests 19 | ℹ pass 19 | ℹ fail 0

[com o W1 aplicado] tests/account.test.js (a suite estatica)
  exit 1 | ℹ tests 11 | ℹ pass 10 | ℹ fail 1
  ✖ a exportacao lista as colunas da conta e nunca usa SELECT *
  ✖ failing tests:
  ✖ a exportacao lista as colunas da conta e nunca usa SELECT *

restaurado: sha256 depois 085a4fd00b83d4b5 (identico)
```

**O `mutation-check.js` nao foi alterado** para apontar o W1 para a suite
estatica: mudar a ferramenta de prova depois de ver o resultado e exatamente o
que a secao 17 proibe. Fica descrito para decisao - apontar o W1 para
`tests/account.test.js` o mataria pelo motivo certo.

### Nao ha mutante para "deixar de apagar as sessoes"

A cascata de `sessions` apagaria as sessoes do mesmo jeito, entao esse mutante
nao mudaria comportamento nenhum e sobreviveria sem dizer nada sobre os testes.
O D5 e o W5b (cascata de `sessions` removida da migration 001) cobrem o que
importa. A nota esta no proprio `mutation-check.js`.

### A rodada inteira

Linha de base:

```text
[linha de base - antes] 12 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/renderSync.test.js
  VERDE    tests/bodyParseError.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/migrate.test.js
  VERDE    tests/doctor.test.js
  VERDE    tests/e2eGate.test.js
  VERDE    tests/accountIntegration.test.js
  VERDE    tests/barcode.test.js
  VERDE    tests/collectionsIntegration.test.js
  VERDE    tests/rateLimit.test.js
```

```text
T1  P2   MORTA                  "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta" falhou, como deveria
T1b  P2   MORTA                  "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost" falhou, como deveria
T2  P5   MORTA                  "P5 erro do driver do banco nao chega ao cliente" falhou, como deveria
T2b  P5   MORTA                  "P5 o detalhe do erro vai para o log do servidor" falhou, como deveria
T3  P9   MORTA                  "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual" falhou, como deveria
T3b  P9   MORTA                  "P9 valor booleano nao reconhecido nao cai em default silencioso" falhou, como deveria
T4  P12  MORTA                  "P12 versao no ar diferente da do repositorio reprova o D1" falhou, como deveria
T5  P13  MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
T5b  P13  MORTA                  "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada" falhou, como deveria
T6  P3   MORTA                  "P3 CORS devolve a origem configurada, nunca a do request" falhou, como deveria
T7  P4   MORTA                  "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha" falhou, como deveria
T8  P11  MORTA                  "P11 NOT_EXECUTED nao conta como PASS no agregado" falhou, como deveria
T9  P11  MORTA                  "P11 o comando de verdade sai com codigo 1 quando um subgate falha" falhou, como deveria
V1  S1/S4 MORTA                  "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO" falhou, como deveria
V1b  S2   MORTA                  "S2 render.yaml nao declara variavel que o codigo nao le" falhou, como deveria
V1c  S3   MORTA                  "S3 nenhuma credencial com valor literal no render.yaml" falhou, como deveria
V2  O2a  MORTA                  "O2a JSON malformado responde 400, nao 500 - a medicao do auditor" falhou, como deveria
V3  O2d  MORTA                  "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status" falhou, como deveria
V3b  O2d  MORTA                  "O2d copiar o type do body-parser nao basta para ganhar 400" falhou, como deveria
V4  R7   MORTA                  "P13 o registro de requisicoes do verify:deploy nao tem escrita" falhou, como deveria
U1  C2   MORTA                  "C2 a camera nunca transforma um codigo em outro" falhou, como deveria
U2  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U3  C2   MORTA                  "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome" falhou, como deveria
U4  O2e  MORTA                  "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor" falhou, como deveria
U4b  O2e  MORTA                  "O2e copiar name, type e status do corpo grande nao basta para ganhar 413" falhou, como deveria
U5  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U5b  MODO MORTA                  "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel" falhou, como deveria
U6  MIG  MORTA                  "MIG migration que nao alcanca o banco falha dizendo por que" falhou, como deveria
U7  MIG  MORTA                  "o doctor conta as mesmas migrations que o runner aplica, .sql e .js" falhou, como deveria
U8  ORC  MORTA                  "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP" falhou, como deveria
W1  E2   MUTACAO SOBREVIVEU     a suite passou com o defeito aplicado
W1b  E2   MORTA                  "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor" falhou, como deveria
W2  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W2b  E4   MORTA                  "E4 a exportacao de A nao contem nada de B, com B populado" falhou, como deveria
W3  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W3b  E5   MORTA                  "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado" falhou, como deveria
W4  D2   MORTA                  "D2 exclusao com senha errada nao remove nada" falhou, como deveria
W5  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W5b  D4   MORTA                  "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users" falhou, como deveria
W6  D8   MORTA                  "D8 falha simulada no meio da exclusao deixa o estado anterior intacto" falhou, como deveria
W7  E8   MORTA                  "E8 a rota real recusa a exportacao acima do teto do usuario" falhou, como deveria
W8  D9   MORTA                  "D9 a tentativa com senha errada gasta o mesmo balde do login" falhou, como deveria
W9  D1   MORTA                  "D1 exclusao com a senha correta remove a conta e limpa o cookie" falhou, como deveria
W10  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W10b  E7   MORTA                  "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache" falhou, como deveria
W11  A11  MORTA                  "A11: o modo strict tem exatamente 20 requisitos, 18 antigos mais os dois novos" falhou, como deveria
S1  N1a  MORTA                  "N1 o schema canonicaliza UPC-A para EAN-13" falhou, como deveria
S1b  N1a  MORTA                  "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" falhou, como deveria
S1c  N1c  MORTA                  "N1c requisicao DIRETA ao backend grava a forma canonica" falhou, como deveria
S2  N1e  MORTA                  "N1e o schema nao altera EAN-13 nem EAN-8" falhou, como deveria
S2b  N1d  MORTA                  "N1d codigo nao-EAN passa intacto pela canonicalizacao" falhou, como deveria
S3  N1g  MORTA                  "N1g a migration funde as duas formas pela regra declarada" falhou, como deveria
S4  N1g  MORTA                  "N1g a migration e idempotente e nao toca codigo nao-EAN" falhou, como deveria
S5  R2   MORTA                  "N1 a canonicalizacao nao afrouxa a conferencia do digito" falhou, como deveria
S6  N1   MORTA                  "N1 a canonicalizacao usa shared/barcode.js, sem copia local" falhou, como deveria
P1  M1   MORTA                  "M1 codigos com digito verificador errado sao recusados pelo motivo certo" falhou, como deveria
P1b  M1   MORTA                  "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos" falhou, como deveria
P2  M3   MORTA                  "M3 o backend recusa productCode com digito verificador invalido" falhou, como deveria
P2b  M3   MORTA                  "M3 a regra do backend e estreita e nao quebra cadastro legitimo" falhou, como deveria
P3  M4   MORTA                  "o caminho manual nao monta o resultado por conta propria" falhou, como deveria
P3b  M4   MORTA                  "M2 codigo invalido nao chega a rede" falhou, como deveria
P4  M5   MORTA                  "M5 o piso de risco vale no caminho manual" falhou, como deveria
P5  M9   MORTA                  "M9 nao existe segunda implementacao do digito verificador" falhou, como deveria
P5b  M9   MORTA                  "M9 backend e frontend usam a MESMA implementacao de shared/" falhou, como deveria
P6  M7   MORTA                  "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo" falhou, como deveria
P7  M6   MORTA                  "M6 cada motivo de recusa tem mensagem propria" falhou, como deveria
P8  M8   MORTA                  "M8 nenhum outro caractere e removido em silencio" falhou, como deveria
P9  M10  MORTA                  "M10 o backend recusa gravar codigo com digito verificador invalido" falhou, como deveria
N1  R1/R3 MORTA                  "R1 usuario dentro do teto mas IP estourado recebe 429" falhou, como deveria
N1b  R3   MORTA                  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP" falhou, como deveria
N2  R2   MORTA                  "R2 IP dentro do teto mas usuario estourado recebe 429" falhou, como deveria
N2b  R4   MORTA                  "R4 dois usuarios atras do MESMO IP mantem cotas separadas" falhou, como deveria
N3  R4   MORTA                  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP" falhou, como deveria
N4  R5   MORTA                  "R5 dados forjados no request nao conseguem balde de IP novo" falhou, como deveria
N5  R5   MORTA                  "R5 um bloco IPv6 /64 nao vira infinitos baldes" falhou, como deveria
M1  R6   MORTA                  "R6 os tres tetos por rota seguem nos valores declarados" falhou, como deveria
M2  R7   MORTA                  "R7 o teto por IP esta no valor medido" falhou, como deveria
M3  Q3   MORTA                  "Q3 nenhuma variavel de ambiente desliga os limitadores" falhou, como deveria
M3b  Q4   MORTA                  "Q4 nenhum dos limitadores tem opcao de pular requisicao" falhou, como deveria
M4  Q2   MORTA                  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto" falhou, como deveria
M6  R9   MORTA                  "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7  R9   MORTA                  "I2 usuario B nao remove item de A" falhou, como deveria
mortas 81 | nao executadas 0 | problemas 1 | linha de base: antes verde, depois verde
```

## A3 - tabelas que referenciam `users`, e a cascata em cada uma

Lido do catalogo (`pg_constraint`), nos dois bancos, nesta data:

```text
### banco de PRODUCAO (somente leitura do catalogo)
product_favorites    user_id    ON DELETE CASCADE   (product_favorites_user_id_fkey)
product_history      user_id    ON DELETE CASCADE   (product_history_user_id_fkey)
sessions             user_id    ON DELETE CASCADE   (sessions_user_id_fkey)
user_allergies       user_id    ON DELETE CASCADE   (user_allergies_user_id_fkey)
total: 4 chave(s) estrangeira(s) para users

### banco LOCAL (PostgreSQL 17, porta 5433)
product_favorites    user_id    ON DELETE CASCADE   (product_favorites_user_id_fkey)
product_history      user_id    ON DELETE CASCADE   (product_history_user_id_fkey)
sessions             user_id    ON DELETE CASCADE   (sessions_user_id_fkey)
user_allergies       user_id    ON DELETE CASCADE   (user_allergies_user_id_fkey)
total: 4 chave(s) estrangeira(s) para users
```

E todas as tabelas do schema `public`, para mostrar que nao ha outra:

```text
product_favorites    referencia users
product_history      referencia users
schema_migrations    nao referencia users
sessions             referencia users
user_allergies       referencia users
users                nao referencia users
```

Igual nos dois bancos. **Nenhuma tabela sem cascata** - nenhuma migration foi
necessaria. O D4 refaz essa conferencia a cada execucao da suite, no banco e no
schema montado pelas migrations, e o subgate `accountDeletion` a refaz no banco
do gate.

## Exportacao: o que entra e o que nao entra, campo a campo

```text
ENTRA                         origem
formato                       constante "nutriscan-dados-do-titular"
versaoDoFormato               constante 1
geradoEm                      relogio do servidor, ISO 8601 UTC
conta.nome                    users.name
conta.email                   users.email
conta.criadaEm                users.created_at
alergias[].id                 user_allergies.allergy_id (codigo do catalogo)
alergias[].nome               rotulo do catalogo
alergias[].marcadaEm          user_allergies.created_at
historico[].codigo            product_history.product_code
historico[].nome              product_history.product_name
historico[].marca             product_history.product_brand
historico[].imagem            product_history.image_url
historico[].consultadoEm      product_history.viewed_at
favoritos[].codigo            product_favorites.product_code
favoritos[].nome              product_favorites.product_name
favoritos[].marca             product_favorites.product_brand
favoritos[].imagem            product_favorites.image_url
favoritos[].favoritadoEm      product_favorites.created_at

NAO ENTRA                     por que
users.password_hash           material de senha
users.password_salt           material de senha
users.id                      id interno; nao ajuda o titular
users.name_key                chave de unicidade derivada do nome; so serve ao banco
sessions (tabela inteira)     token_hash, id e validade de sessao
cookie de sessao              credencial
id das linhas filhas          id interno
user_id das linhas filhas     id interno
dado de outro usuario         toda consulta filtra pelo user_id da sessao
chave de API, DATABASE_URL    nao sao lidas por estas rotas
```

As quatro consultas nomeiam coluna por coluna (`accountRepository.js`); um teste
reprova `SELECT *` e qualquer citacao de `password` ou `token_hash` no
repositorio. **As sessoes ficam de fora de proposito**: o que o banco guarda
delas - hash do token, id, validade - nao ajuda o titular a saber o que o app
sabe dele, e o hash e exatamente o que o arquivo nao pode levar.

## Formato e cabecalhos - a decisao

**JSON**, com `formato`, `versaoDoFormato` e `geradoEm`. A versao do formato
anuncia mudanca de estrutura no proprio arquivo.

**Download direto**, com `Content-Disposition: attachment`, e nao "JSON comum que
o frontend transforma em arquivo". A rota se comporta igual para o app, para um
link e para a linha de comando, e o nome do arquivo tem UMA regra, no backend,
coberta por teste. O app le esse nome do cabecalho. O corpo continua JSON,
legivel por maquina.

**Nome:** `nutriscan-meus-dados-AAAA-MM-DD.json`. Sem e-mail e sem nome: o nome do
arquivo aparece em listagem de pasta e no historico de downloads.

**Cabecalhos:**

```text
Cache-Control: no-store   o unico valor que proibe QUALQUER cache de guardar a
                          resposta - proxy, CDN, cache do navegador. `no-cache`
                          e `private` ainda permitem guardar.
Pragma: no-cache          intermediario antigo, HTTP/1.0
```

A exclusao tambem responde `Cache-Control: no-store`.

## A4 - limitador da exportacao: 5 por usuario e 20 por IP, por 24 horas

Quantas vezes por dia uma pessoa exporta os proprios dados? Quase sempre uma. O
que justifica mais e o imprevisto: download interrompido, arquivo salvo no
aparelho errado, exportar de novo depois de mudar algo para comparar.

```text
por usuario   5 / 24 h    a exportacao de verdade + quatro imprevistos
por IP       20 / 24 h    quatro pessoas atras do mesmo endereco (casa,
                          escritorio, CGNAT de celular) esgotando a cota no
                          mesmo dia - ja improvavel; contem quem cria contas
                          para exportar em serie
```

Mais restritivo que o de colecoes (300 e 3000 por 10 minutos). Composicao da
v0.7.2 - usuario E IP, o mais restritivo vence, usuario conferido primeiro -
pela MESMA fabrica (`criarLimitadoresDeColecoes`), com baldes proprios. Nenhum
limitador existente mudou; nao ha bypass. A exclusao usa o limitador de
autenticacao (40 por 15 minutos por IP), o do login, montado ANTES do
`requireAuth`.

## Atomicidade da exclusao

```text
1  valida o corpo (senha presente)          falha: 400, nada tocado
2  le o usuario da sessao                   sumiu: 401
3  confere a senha contra o hash            errada: 403, nada tocado
4  BEGIN
5    DELETE FROM sessions WHERE user_id     todas as sessoes, todos os aparelhos
6    DELETE FROM users WHERE id RETURNING   cascata: alergias, historico, favoritos
7    se nao removeu exatamente 1 linha      erro -> ROLLBACK
8  COMMIT                                   qualquer erro antes -> ROLLBACK de tudo
9  limpa o cookie, responde 200
```

`withTransaction` pega UM cliente do pool: BEGIN, as duas remocoes e o COMMIT
acontecem na mesma conexao, e qualquer excecao - inclusive dentro da cascata -
faz ROLLBACK. O D8 prova isso com uma falha real no meio da cascata, e o mutante
W6 (a exclusao deixa de ser transacional) prova que o D8 enxerga a diferenca.

Exclusao FISICA: sem `deleted_at`, sem copia, sem conteudo no log. O log diz so
`[conta] uma conta foi excluida pelo titular`.

## A5 a A9

```text
A5  npm run build                          sucesso
A6  npm --prefix backend test              354 testes, 295 pass, 0 fail, 59 skipped
                                           (56 exigem PostgreSQL, 1 a IA real,
                                           2 a Open Food Facts real - todos
                                           declarados NAO EXECUTADO, nenhum PASS)
A7  suite contra PostgreSQL real (local)   354 testes, 351 pass, 0 fail, 3 skipped
                                           (1 IA real, 2 Open Food Facts real)
A8  npm audit --audit-level=moderate       frontend: found 0 vulnerabilities
    npm --prefix backend audit (moderate)  backend:  found 0 vulnerabilities
A9  npm run verify:release                 exit 0 - build, testes, os dois
                                           audits e "secret scan - 0 real secrets"
```

O A7 rodou com `RUN_DB_INTEGRATION_TESTS=true` contra o PostgreSQL LOCAL (17,
porta 5433), com `DATABASE_URL` definida no comando - nunca contra o banco de
producao.

Gastos da suite contra os tetos por IP, medidos na propria execucao:

```text
[R11] gasto de colecoes desta suite: 403 de 3000 (folga 7.44x)
[exportacao] desta suite: 17 de 20 por IP
```

O segundo e uma contagem conservadora: inclui pedidos que terminaram em 401 e
nunca chegaram ao limitador. Um teste reprova se passar de 20.

## A10 - `verify:e2e`

**PASS, exit code 0**, com PostgreSQL real e Claude real - 2 chamadas pagas. Os
20 requisitos em `PASSED`, `ok: true`. A saida literal, a tabela de subgates, a
contagem por balde e o `E2E_LAST_RUN.json` integral estao no `E2E_REPORT.md`.

```text
[OK] account export - tudo de A, nada do vizinho, nada de senha nem de sessao
[OK] account deletion - senha errada nao apaga; senha certa apaga tudo; sessoes caem; vizinha intacta
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

## A11 - os 18 requisitos antigos continuam exigidos; agora sao 20

Prova por execucao, sobre o `E2E_LAST_RUN.json` desta versao: para cada
requisito do modo strict, um relatorio com SO aquele requisito em
`NOT_EXECUTED` tem de reprovar, e reprovar so por ele.

```text
requisitos no modo strict (flag da IA ligada): 20
faltando no E2E_LAST_RUN.json desta versao: []

requisito                origem   presente   NOT_EXECUTED sozinho reprova
backendProcess           v0.7.6   sim        sim, e so ele
database                 v0.7.6   sim        sim, e so ele
migrations               v0.7.6   sim        sim, e so ele
auth                     v0.7.6   sim        sim, e so ele
sessionSchema            v0.7.6   sim        sim, e so ele
multiDevice              v0.7.6   sim        sim, e so ele
isolation                v0.7.6   sim        sim, e so ele
logout                   v0.7.6   sim        sim, e so ele
assistantAuthority       v0.7.6   sim        sim, e so ele
deterministicEngine      v0.7.6   sim        sim, e so ele
fallback                 v0.7.6   sim        sim, e so ele
privacy                  v0.7.6   sim        sim, e so ele
historySync              v0.7.6   sim        sim, e so ele
favoritesSync            v0.7.6   sim        sim, e so ele
verdictFreshness         v0.7.6   sim        sim, e so ele
manualCodeLookup         v0.7.6   sim        sim, e so ele
accountExport            v0.8.0   sim        sim, e so ele
accountDeletion          v0.8.0   sim        sim, e so ele
anthropicReal            v0.7.6   sim        sim, e so ele
assistantAuthenticated   v0.7.6   sim        sim, e so ele

os 18 da v0.7.6 presentes: 18 de 18
novos: ["accountExport","accountDeletion"]
```

Os testes que travam isso na suite, verdes:

```text
A11: os 18 requisitos da v0.7.6 continuam exigidos, um a um
A11: o modo strict tem exatamente 20 requisitos, 18 antigos mais os dois novos
A11: accountExport e accountDeletion sao requisitos BASE e reprovam sozinhos
A10: os 17 requisitos da v0.7.2 continuam exigidos, um a um
A10: desde a v0.7.2 entraram so manualCodeLookup e os dois da v0.8.0, nomeados
D2: o conjunto de requisitos do modo strict e exatamente este
```

O teste da v0.7.6 que travava o total em "exatamente 18" foi substituido pelo de
"exatamente 20" - nao removido sem troca. O mutante W11 (o gate perde
`accountDeletion`) prova que o teste novo pega a perda.

`accountExport` e `accountDeletion` sao BASE: dependem so de PostgreSQL real,
e nao da flag da IA. Sem a flag, o modo strict exige 18 (os 16 base antigos e os
2 novos); com a flag, os 20.

## A12 - limpeza do banco depois do gate

Residuo **0** em todos os padroes de teste, inclusive o da conta D
(`nutriscan-e2e-d-*`, coberta por `nutriscan-e2e-%` e `%@example.test`), e
nenhuma linha orfa. Saida completa no `E2E_REPORT.md`.

## A13 - `verify:deploy` inalterado e somente leitura

Nenhuma linha de comportamento mudou. O diff do arquivo e um comentario - a
correcao autorizada pelo dono, que atualiza o texto sobre o D6 (que desde a
v0.7.6 mede 400, e nao 500):

```text
-// qualquer rota - e nao ha rota ali para chegar. E a forma de provocar um erro
-// interno sem tocar em nada que persista.
+// qualquer rota - e nao ha rota ali para chegar. E a forma de provocar um erro,
+// e conferir que a resposta dele nao vaza nada, sem tocar em nada que persista.
+// Ate a v0.7.5 esse erro saia como 500; desde a v0.7.6, ele e 400
+// `INVALID_JSON`. O D6 aceita os dois, porque o que ele vigia e o vazamento.
```

As rotas novas NAO foram acrescentadas a ele. O P13 continua verde, agora com
`DELETE /api/account` entre as rotas de escrita proibidas.

```text
verify:deploy simulado (local, http)   FAIL, exit 1 - 7 PASS, D2 FAIL (sem TLS local)
verify:deploy REAL (somente leitura)   FAIL, exit 1 - 7 PASS, D1 FAIL
                                       "repositorio declara 0.8.0 e o deploy anuncia 0.7.0"
```

Os dois FAIL sao os esperados. Os sete PASS do real medem a 0.7.0 e nao provam
nada sobre a 0.8.0.

## A14 - varredura do nome antigo

Fora de `node_modules`, `dist`, `.git`, `releases` e dos tres relatorios
historicos, o nome antigo aparece em um arquivo so:
`backend/tests/productName.test.js`, que e o teste que o procura. Os testes P1t
estao verdes.

## A15 - versao nos sete pontos

```text
package.json                             0.8.0
backend/package.json                     0.8.0
package-lock.json (raiz e "")            0.8.0 / 0.8.0
backend/package-lock.json (raiz e "")    0.8.0 / 0.8.0
/api/health de um processo real          0.8.0   D1 do alvo simulado: "ambos declaram 0.8.0";
                                                 E2E_LAST_RUN.json: "version": "0.8.0"
README                                   # NutriScan v0.8.0
CHANGELOG                                ## NutriScan v0.8.0 - 2026-10-12
```

## Pacote: validacao e varredura de segredo

O ZIP (`nutriscan-v0.8.0-auditoria.zip`, gerado por `scripts/pack-release.ps1`)
passou pelo validador de regras - nada de `node_modules`, `dist`, `.git`,
`.env`, `releases`, `E2E_LAST_RUN.json`; os documentos exigidos presentes; CRC
integro - e, nesta versao, por duas regras novas: nenhum arquivo
`nutriscan-meus-dados*` e nenhum `.json` com o formato
`nutriscan-dados-do-titular`. **Nenhuma exportacao de teste esta no pacote**: os
testes leem a exportacao na memoria, e nenhum arquivo de exportacao foi gravado
em disco no projeto.

A varredura de segredo do projeto (`verify:release`) deu "0 real secrets" do
comeco ao fim. A varredura ESTRITA, que roda sobre o conteudo do ZIP e classifica
toda string de conexao com senha por valor exato, **reprovou na primeira
execucao**, com 2 achados:

```text
usuario_falso:<senha de 19>@[host-quebrado   NAO RECONHECIDA      backend/tests/migrate.test.js
usuario_falso:<senha de 19>@localhost        NAO RECONHECIDA      backend/tests/migrate.test.js
```

Sao iscas do teste novo da migration (correcao autorizada pelo dono): a senha e
uma isca que o teste procura no log, para provar que ela NUNCA aparece; o host e
`localhost:1` (recusa imediata) ou propositalmente quebrado. Foram acrescentadas
a lista de ficticias da varredura estrita pelo valor exato - nao por padrao - e a
segunda execucao deu 0 achados. A lista ja tinha casos assim (o mutante V1c, as
fixtures do doctor e dos testes de producao).

## A interface, verificada no navegador

Contra o backend local (porta 3200, PostgreSQL local, sem chave de IA), servindo
o `dist/` compilado:

- "Baixar meus dados" devolveu o arquivo `nutriscan-meus-dados-2026-10-12.json`,
  com as sete chaves de topo, `conta` com `nome`, `email` e `criadaEm`, e
  `Cache-Control: no-store`.
- "Excluir minha conta" so abre a confirmacao. "Excluir para sempre" ficou
  desabilitado sem nada, desabilitado so com a senha, e habilitado com a senha E
  a caixa marcada.
- Senha errada: "Senha incorreta. Nada foi apagado.", a pessoa continua logada,
  e o campo de senha volta vazio.
- Senha certa: volta a tela de entrada com "Sua conta foi excluida.", `/me`
  responde 401, e a conta nao existe mais no banco local.
- No console, so os status de rede esperados (401, 403, 401).
- Em 320 px, o cartao "Seus dados", com a confirmacao aberta, cabe na coluna;
  menor fonte 17 px; botoes de 48 a 56 px de altura.

As contas criadas para essa verificacao foram apagadas do banco local.

## Observacoes descritas e NAO corrigidas

Fora das secoes 6 e 7. Descritas para decisao, como manda a secao 17.

1. **Rolagem lateral em 320 px na tela Conta - anterior a esta versao.** Em
   320 px a pagina rola de lado (largura de 403 px). A causa e a grade
   `.account-grid` do `src/styles.css`, que abaixo de 900 px nao define colunas:
   a coluna implicita assume a largura minima do cartao de ALERGIAS (387 px).
   Medido: escondendo so o cartao de alergias, a coluna cai para 288 px; o cartao
   novo, sozinho e com a confirmacao aberta, cabe em 288 px. O `styles.css` e o
   arquivo de design copiado e nao foi tocado. Correcao provavel, para decisao:
   `grid-template-columns: minmax(0, 1fr)` abaixo de 900 px.
2. **O log de erro interno leva o objeto de erro inteiro.**
   `console.error("[erro interno]", error)` no `errorMiddleware.js`. Para erro do
   `pg`, o objeto inclui o campo `detail`, que numa violacao de unicidade cita o
   valor - por exemplo o e-mail. O cadastro confere a duplicidade antes de
   inserir, entao isso so aconteceria numa corrida. Nao afeta as rotas novas: a
   exclusao so registra a frase fixa.
3. **Copias de seguranca do provedor do banco.** A exclusao remove as linhas do
   banco em uso. O historico de restauracao que o provedor mantenha nao e
   alcancado pelo codigo; o prazo depende do plano e **nao foi verificado**.
   Descrito em `docs/DADOS_DO_TITULAR.md`.
4. **Dados do modo visitante** ficam no navegador, nunca foram para o servidor e
   nao sao apagados pela exclusao da conta. Descrito no mesmo documento.

Nenhuma delas pede exclusao logica, e nenhuma foi implementada.

## O que esta versao NAO prova

- **A camera em hardware real: NAO EXECUTADO.** A correcao da leitura e provada
  por teste e mutacao, nao por aparelho.
- **O deploy real da 0.8.0: NAO EXECUTADO.** Nada foi publicado; no ar esta a
  0.7.0.
- **HTTPS da 0.8.0: NAO COMPROVADO** - o alvo simulado nao tem TLS.
- **A tela em aparelho real: NAO EXECUTADO.** A verificacao da interface foi no
  navegador embutido do ambiente de desenvolvimento; a largura de 320 px foi
  emulada.
- **Conformidade juridica: nao declarada**, e nao e algo que teste prove.

## Auditoria da v0.7.6 - 2026-10-12

## Escopo

Entrada 0.7.5, saida 0.7.6. Prontidao de publicacao: Entrega A (sincronia entre
o codigo e o `render.yaml`), Entrega B (O1 e O2) e Entrega C (checklist de
publicacao em `docs/DEPLOY.md`).

Preservado sem alteracao, como o prompt mandou: o fail-closed por variavel, o
CORS, as sondas de vazamento, o 404 de API e o fallback de SPA, o
`/api/health`, o `verify:deploy` (nenhuma linha alterada), o gate E2E,
`buildStrictRequirements`, `shared/`, `backend/src/ai/`, sessoes, scrypt,
limitadores, canonicalizacao, historico, favoritos, assistente e scanner.
Nenhuma migration nova. Nenhuma feature de produto. Nada publicado.

Arquivos de codigo de producao alterados: **dois**.

```text
backend/src/middleware/errorMiddleware.js   O2
render.yaml                                 um comentario (5.3)
```

O resto sao testes, documentacao e a versao.

## A premissa do prompt, de novo corrigida

O prompt diz que o NutriScan "nunca foi" publicado e que, contra deploy real, o
`verify:deploy` deve dar NAO EXECUTADO "porque nao ha deploy". Ha deploy: o
servico `nutriscan` responde em `https://nutriscan-h1wp.onrender.com` e roda a
**0.7.0**. O que nunca foi publicado sao as versoes 0.7.1 a 0.7.6.

Por isso o `verify:deploy` foi executado contra a URL real, somente leitura, e o
resultado esta em A12. Reportar NAO EXECUTADO havendo URL seria inventar a
ausencia de um resultado.

## Trabalho guardado FORA desta versao - para decisao

Entre a v0.7.5 e este prompt, o dono do projeto autorizou um conjunto de
correcoes, feitas e testadas na arvore de trabalho, sem commit. Varias delas
batem nas regras desta versao:

```text
leitura da camera nunca vira OUTRO codigo       toca o scanner       (secao 4 proibe)
doctor conta migrations .js                     toca o gate E2E      (secao 13 bloqueia)
orcamento do gate mostra o teto por IP          toca o gate E2E      (secao 13 bloqueia)
400/413 para qualquer erro com expose: true     o que 6.2 PROIBE
NODE_ENV desconhecido recusa subir              fora das secoes 5-7
migration que falha diz por que                 fora das secoes 5-7
env.test.js nao escreve no backend/.env real    fora das secoes 5-7
teste opcional contra a Open Food Facts real    fora das secoes 5-7
```

**Nada disso esta na v0.7.6.** Foi guardado intacto em `git stash` -
`stash@{0}`, "correcoes pos-0.7.5 autorizadas pelo dono" -, e a versao foi feita
sobre o commit da v0.7.5. Nao se perdeu nada, e nada entrou sem passar pelo
auditor.

Uma delas merece prioridade na proxima decisao, porque e de **seguranca do
usuario**: a camera le CODE_128, que aceita letra, e `cleanBarcode` apaga tudo
que nao e digito. Uma leitura como `AB7891000100103` vira `7891000100103` - o
EAN valido de OUTRO produto, com outros alergenicos. Leitura curta com letras
cai ainda na busca por NOME. Num app de alergia, o produto errado e pior que
"nao encontrado". A correcao guardada impede as duas coisas, e foi provada por
teste e mutacao antes de ser guardada.

## A1 - inventario de variaveis (5.4)

```text
variavel                     obrigatoria  onde e lida              se faltar em producao                  no render.yaml
---------------------------  -----------  -----------------------  -------------------------------------  ----------------
DATABASE_URL                 SIM          env.js -> pool, migrate  NAO SOBE; o build falha na migration   sim, sync: false
DATABASE_SSL                 SIM          env.js -> pool, migrate  NAO SOBE                               sim, "true"
FRONTEND_ORIGIN              SIM          env.js -> app.js (CORS)  NAO SOBE; http:// tambem nao sobe      sim, sync: false
TRUST_PROXY                  SIM          env.js -> app.js         NAO SOBE                               sim, "true"
ANTHROPIC_API_KEY            nao          env.js -> ai/            sobe; assistente local; ai=not_conf.   sim, sync: false
NODE_ENV                     nao          env.js                   vira development (ver nota)            sim, production
NODE_VERSION                 nao          o proprio Render         o Render usa a versao padrao dele      sim, "22"
ANTHROPIC_MODEL              nao          env.js -> ai/            claude-sonnet-5                        sim
SESSION_TTL_DAYS             nao          env.js -> sessao         30                                     sim, "30"
PORT                         nao          env.js                   3000; o Render injeta a dele           nao (injetada)
SESSION_COOKIE_NAME          nao          env.js -> sessao         nutriscan_session                      nao
ANTHROPIC_TIMEOUT_MS         nao          env.js -> ai/            20000                                  nao
ANTHROPIC_MAX_OUTPUT_TOKENS  nao          env.js -> ai/            1200                                   nao
```

Todas as variaveis do codigo sao lidas num lugar so, `backend/src/config/env.js`.
As quatro obrigatorias sao exatamente `VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO`.

**Nota sobre NODE_ENV:** ausente ou digitada errado, vira `development` sem
aviso. No Render o `render.yaml` a fixa em `production`. A correcao - recusar
subir com valor desconhecido - existe e esta no stash; fica para decisao.

## A2 - Entrega A, sincronia codigo e render.yaml

`backend/tests/renderSync.test.js`, 9 testes.

### Como o render.yaml e lido

O projeto nao tem biblioteca de YAML, e nao valia uma dependencia nova para um
bloco so. O teste tem um leitor ESTREITO: entende apenas `- key:` seguido de
`value`, `sync` ou `generateValue`, e **lanca erro** diante de qualquer outra
forma (`fromDatabase`, aninhamento, um segundo bloco `envVars`). A escolha e
deliberada: um leitor tolerante que pulasse a linha desconhecida poderia deixar
passar justamente a variavel que importa. Um teste proprio prova que ele falha.

"O que o codigo le" e calculado, nao listado: todo `process.env.X` em
`backend/src` e `backend/scripts` - o que roda no Render (servidor e migration
do build).

### Os casos conhecidos, declarados

```text
ANTHROPIC_API_KEY   opcional para subir, mas OBRIGATORIA no render.yaml: sem a
                    entrada, o painel nao a oferece e producao fica sem IA por
                    esquecimento. Teste proprio.
NODE_VERSION        lida pelo Render, nao pelo codigo. Nao e configuracao morta.
                    Teste proprio exige que a excecao continue em uso.
```

### O que o teste encontrou

Na primeira execucao, o teste 5.3 **reprovou**: o comentario da `FRONTEND_ORIGIN`
no `render.yaml` citava `http://localhost:5173`, o default antigo, como
historia. Era o exemplo mais proximo da variavel - quem o copiasse levaria
`http://` para o painel, e o processo nao subiria. O comentario foi reescrito
sem nenhum endereco `http://`; o teste passou a reprovar qualquer um.

### 5.2 e 5.3

```text
5.2  DATABASE_URL e ANTHROPIC_API_KEY: sync: false, sem value.          ok
     Toda entrada com nome de credencial (SECRET, TOKEN, PASSWORD,
     _KEY, _URL) tambem e conferida.
5.3  FRONTEND_ORIGIN e sync: false; a v0.7.5 ja recusa http:// no boot;  ok
     o render.yaml nao mostra endereco http:// em lugar nenhum.
```

## A3 - O1: SESSION_SECRET

**Decisao: a arquitetura esta correta e foi mantida.** Nada introduzido, nada
trocado no mecanismo de sessao.

Documentado em:

```text
README.md        secao Deploy, "Nao existe SESSION_SECRET - de proposito"
docs/DEPLOY.md   Parte 1, passo 2 (aviso) e Parte 2, "Por que nao ha segredo
                 de sessao (O1)"
```

O motivo, conferido no codigo antes de escrever: `sessionToken.js` gera
`randomBytes(32)` e guarda `sha256` do token; `sessionRepository.js` procura
pelo hash e o logout faz `DELETE FROM sessions WHERE token_hash = $1`. O cliente
carrega um numero opaco, a revogacao e um `DELETE`, e nao ha conteudo a assinar.

Dois testes travam a decisao: a documentacao existe nos dois lugares, e
`SESSION_SECRET` nao e lida pelo codigo nem declarada no `render.yaml`.

## A4 - O2: JSON malformado

### Antes - reproduzido em producao

```text
POST /api/auth/login  corpo "{nao-e-json"  ->  500  {"error":{"code":"INTERNAL_ERROR","message":"Erro interno do servidor."}}
POST /api/auth/login  corpo de 70 kB      ->  500  {"error":{"code":"INTERNAL_ERROR","message":"Erro interno do servidor."}}
linhas "[erro interno]" no log do servidor: 2
```

### Depois

```text
POST /api/auth/login  corpo "{nao-e-json"  ->  400  {"error":{"code":"INVALID_JSON","message":"O corpo da requisição não é JSON válido."}}
```

### A restricao, e por que

O handler reconhece UM caso: `error instanceof SyntaxError &&
error.type === "entity.parse.failed"`. Os dois sinais juntos.

- **Nao** usa `expose: true` como autorizacao: qualquer biblioteca pode lancar
  um erro com esse campo.
- **Nao** le o status do erro: o 400 e escrito no nosso codigo.
- **Nao** repassa a mensagem: o texto e fixo.
- Exige o `SyntaxError` porque e o que o parse de JSON lanca de fato. Um erro
  que apenas copie o `type` do body-parser continua 500 - ha teste para isso.

O comentario no codigo explica a restricao e o atalho que ela evita.

### O que ficou de fora, de proposito: corpo grande demais

A medicao acima mostra que o corpo de 70 kB TAMBEM responde 500 - o mesmo tipo de
defeito, erro do cliente como erro do servidor (deveria ser 413). **Nao foi
corrigido**, porque o prompt restringe a correcao ao caso de parse e manda que
"nenhum outro erro" mude de status. Fica descrito para decisao. A correcao
seria um segundo caso explicito, `type: "entity.too.large"` -> 413 fixo, nos
mesmos moldes.

## A5 - S1 a S4, O2a a O2d, R1 a R7

```text
S1   render.yaml contem as obrigatorias do codigo; ANTHROPIC_API_KEY presente   2 testes
S2   nenhuma variavel morta; NODE_VERSION como caso declarado e em uso          2 testes
S3   credencial sem valor literal e sync: false; sync false nunca com value     2 testes
5.3  nenhum http:// no render.yaml                                              1 teste
S4   obrigatoria nova sem render.yaml e apontada pelo nome; leitor falha        2 testes
     diante de formato desconhecido - mais o mutante V1
O2a  a medicao do auditor responde 400; em qualquer rota; fora do log interno   3 testes
O2b  o 400 sem stack, caminho nem mensagem do parser; mensagem fixa exata       1 teste
O2c  erro interno forjado continua 500; falha real do banco continua 500        2 testes
O2d  418, 401, 404, 400 de biblioteca continuam 500; type copiado nao basta;    3 testes
     o mesmo app ainda da 400 para o parse real (o par negativo)
```

`backend/tests/renderSync.test.js` (9), `backend/tests/bodyParseError.test.js`
(9), `backend/tests/deployDoc.test.js` (7, Entrega C e O1).

O2c e O2d rodam em `NODE_ENV=production`, num processo filho com o
`errorHandler` REAL e uma rota por erro forjado. Cada erro carrega uma isca de
texto; o teste reprova se ela aparecer na resposta.

Regressoes, nas suites que ja as provavam, inteiras e verdes:

```text
R1  fail-closed por variavel     productionHardening.test.js  P2 e P9
R2  CORS nao reflete origem      productionHardening.test.js  P3
R3  404 de API; SPA              productionHardening.test.js  P6 e P7; productionServing.test.js
R4  health sem segredo           productionHardening.test.js  P8
R5  exploit C1                   allergyVerdict.test.js       T1 a T3
R6  digito, canonicalizacao,     barcode.test.js, collectionsIntegration.test.js (N1a-N1g),
    tetos                        rateLimit.test.js (R6, R7)
R7  verify:deploy sem escrita    verifyDeploy.test.js         P13 (tres testes)
```

## A6 - validacao por mutacao

```text
V1   S1/S4  obrigatoria nova no codigo, sem entrada no render.yaml          MORTA
V1b  S2     o render.yaml ganha uma variavel que o codigo nao le            MORTA
V1c  S3     a DATABASE_URL ganha valor literal no render.yaml               MORTA
V2   O2a    o handler volta a devolver 500 para JSON malformado             MORTA
V3   O2d    o handler passa a confiar no statusCode de qualquer erro        MORTA
V3b  O2d    basta copiar o type do body-parser para ganhar 400              MORTA
V4   R7     o verify:deploy passa a chamar POST /api/history                MORTA

mortas 56 | nao executadas 0 | problemas 0 | linha de base: antes verde, depois verde
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

**Nenhum sobrevivente.** Os quatro mutantes sugeridos pelo prompt estao entre os
sete novos: obrigatoria sem `render.yaml` (V1), 500 para parse (V2), confiar em
`statusCode` de qualquer erro (V3) e `POST /api/history` no `verify:deploy`
(V4). V1b, V1c e V3b vao alem do pedido e cobrem S2, S3 e a exigencia do
`SyntaxError`.

Os quarenta e nove herdados - T1 a T9, S1 a S6, P1 a P9, N1 a N5, M1 a M7 -
continuam mortos. A linha de base, criada na v0.7.5 depois de tres rodadas terem
aprovado com o banco parado, saiu verde antes da primeira mutacao e depois da
ultima: o PostgreSQL local esteve de pe a rodada inteira.

V3 e o mutante que materializa a condicao de bloqueio "handler de erro confiando
em `statusCode` de erro arbitrario": ele faz exatamente isso, e o O2d o pega
(418 de biblioteca sai como 418).

## A7 a A11

```text
A6   npm run build                        OK, exit 0
A7   npm --prefix backend test            301 testes, 300 pass, 0 fail, 1 SKIP, exit 0
A8   suite contra PostgreSQL 17.10 local  incluida no A7, RUN_DB_INTEGRATION_TESTS=true;
                                          R11 mede 403 de 3000
A9   npm audit --audit-level=moderate     0 vulnerabilidades, frontend e backend - DEPOIS
                                          da correcao abaixo
A10  node scripts/verify-release.js       exit 0; secret scan 0 segredos reais
A11  npm run verify:e2e                   PASS, exit 0, 18 requisitos - ver A13
```

### A9: dois alertas novos, corrigidos

A primeira execucao do `verify:release` desta versao **reprovou** no audit. Dois
alertas publicados depois da v0.7.5, um em cada pacote:

```text
frontend  source-map-js 1.0.0 - 1.2.1   high      GHSA-68fv-2mgg-jv7q
          via vite -> postcss            negacao de servico por offsets de source map
backend   proxy-addr 1.1.0 - 2.0.7      critical  GHSA-jqcg-44mw-7w3h
          via express                    IP spoofing via IPv4-mapped IPv6 trust subnet
```

O segundo importa para este projeto: `proxy-addr` e o que o Express usa para
calcular `req.ip` com `trust proxy` - e o `req.ip` decide o balde do teto de
3000 por IP. A configuracao do NutriScan e `trust proxy: 1` (contagem de saltos,
nao lista de sub-redes); se ela era alcancada pelo alerta, nao foi analisado. A
versao corrigida foi aplicada de qualquer forma, porque o prompt bloqueia
vulnerabilidade moderate ou acima sem correcao.

As duas correcoes cabem nas faixas que os pacotes ja declaravam, entao mudou
SO o lockfile:

```text
proxy-addr     2.0.7 -> 2.0.8    express 4.22.3 pede ~2.0.7
source-map-js  1.2.1 -> 1.2.2    postcss 8.5.26 pede ^1.2.1
```

`npm audit fix`, sem `--force`. Nenhuma dependencia direta mudou;
`package.json` e `backend/package.json` mudaram so o numero da versao.

Como o `proxy-addr` mexe no calculo do IP, **tudo foi refeito sobre o codigo
final**: build, suite completa (P4 e R5, os testes de `trust proxy` e de balde
por IP, verdes), `verify:e2e`, alvo simulado e a rodada de mutacao. Os numeros
deste relatorio sao dessa segunda rodada.

## A12 - `verify:deploy`

```text
alvo LOCAL simulado     D1 PASS  D2 FAIL  D3-D8 PASS   exit 1   (D6 mede HTTP 400)
deploy REAL             D1 FAIL  D2-D8 PASS            exit 1   (D6 mede HTTP 500)
```

**Simulado:** o backend real em `NODE_ENV=production`, servindo o `dist/`, com
as 12 variaveis explicitas e sem chave de IA. O D2 reprova porque nao ha TLS
local. O D6 mede 400: o O2 de ponta a ponta, no processo de producao.

**Real:** o prompt pede NAO EXECUTADO "porque nao ha deploy". Ha deploy - a
0.7.0, em `https://nutriscan-h1wp.onrender.com`. O comando e somente leitura,
entao foi executado, em 2026-10-12 00:57 (-03:00). O D1 reprova: repositorio
0.7.6, deploy 0.7.0. O D6 no ar ainda mede 500 - codigo antigo.

Os sete PASS do deploy real medem a 0.7.0 e **nao provam nada sobre a 0.7.6**.

A execucao real usou a forma documentada no `docs/DEPLOY.md`, sem `--`
(`npm run verify:deploy https://...`): o npm repassou a URL, e o comando do
checklist funciona como escrito. Saida literal das duas no E2E_REPORT.

## A13 - os 18 requisitos strict

`scripts/lib/e2eGate.js`, `scripts/e2e-real.js`, `scripts/verify-e2e.js`,
`scripts/doctor.js` e `scripts/lib/doctorChecks.js`: `git diff` vazio.
`buildStrictRequirements` nao foi tocado.

```text
 1 backendProcess       7 isolation            13 historySync
 2 database             8 logout               14 favoritesSync
 3 migrations           9 assistantAuthority   15 verdictFreshness
 4 auth                10 deterministicEngine  16 manualCodeLookup
 5 sessionSchema       11 fallback             17 anthropicReal
 6 multiDevice         12 privacy              18 assistantAuthenticated
```

Conferido de duas formas: os testes `D2`, `A10` e `A12` de `e2eGate.test.js`
passaram na suite; e, contra o `E2E_LAST_RUN.json` desta execucao,
`findMissingRequirements` devolve `[]` e, pondo CADA um dos 18 sozinho em
`NOT_EXECUTED`, o gate reprova exatamente aquele - 18 de 18.

### O E2E reprovou uma vez, por ambiente

A primeira execucao do `verify:e2e` reprovou: a checagem de saude recebeu 404 por
30 s. A porta 3000 estava ocupada por outro projeto do dono, em execucao nesta
maquina (um app Next.js, `127.0.0.1:3000`), que responde 404 em `/api/health`.
O gate nao aprovou nada: subgates de fluxo em `NOT_EXECUTED`, `ok: false`.

O outro processo nao foi tocado. As execucoes seguintes usaram `PORT=3100`, so
no comando - o gate le a porta de `env.port`, entao e configuracao, nao
alteracao do gate. A segunda passou com `proxy-addr` 2.0.7; depois da correcao
do A9, a terceira passou sobre o codigo final, com as mesmas 41 linhas de status.
As tres estao no E2E_REPORT.

## A14, A15

```text
A14  residuo NutriVa     0 em codigo, interface e manifestos. As mencoes restantes
                         estao na secao historica do CHANGELOG, no historico deste
                         relatorio e no teste que proibe o nome
A15  versao 0.7.6        package.json                          0.7.6
                         backend/package.json                  0.7.6
                         package-lock.json (raiz e "")         0.7.6
                         backend/package-lock.json (raiz e "") 0.7.6
                         /api/health de um processo real       0.7.6
                         README                                # NutriScan v0.7.6
                         CHANGELOG                             ## NutriScan v0.7.6 - 2026-10-12
```

O `/api/health` do processo real devolve exatamente as chaves `ai`, `database`,
`status` e `version` (R4).

## Observacoes descritas e NAO corrigidas

```text
corpo grande demais = 500       ver A4. Proposta: caso explicito 413.
NODE_ENV desconhecido = dev     correcao pronta no stash@{0}.
camera apaga letras do CODE_128 SEGURANCA. Correcao pronta no stash@{0}.
docs/API.md, secao de colecoes  ainda diz "300 requisicoes por 10 minutos por
                                IP". Desde a v0.7.2 sao 300 por USUARIO e 3000
                                por IP. Documentacao desatualizada; nao
                                corrigida por estar fora do escopo.
credenciais expostas na v0.7.2  rotacao ainda PENDENTE, por decisao do dono.
```

## O que esta versao NAO prova

```text
v0.7.6 no ar                  NAO PUBLICADA - o deploy real roda a v0.7.0
endurecimento no deploy real  NAO COMPROVADO - so depois de publicar
HTTPS da v0.7.6               NAO COMPROVADO - o alvo simulado nao tem TLS
camera em hardware real       NAO EXECUTADO - exige aparelho com camera
decodificacao optica          NAO EXECUTADO
Open Food Facts real          NAO EXECUTADO nesta versao - a busca do gate e injetada
suite de colecoes no Neon     NAO EXECUTADO - por decisao de risco
carga simultanea real         NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA. Nenhum deploy desta versao
foi feito.**

## Auditoria da v0.7.5 - 2026-10-02

## Escopo

Entrada 0.7.4, saida 0.7.5. Prontidao de producao (Entrega A, itens 6.1 a 6.9) e
o comando `npm run verify:deploy` (Entrega B, subgates D1 a D8).

Preservado sem alteracao: `shared/`, todo o `backend/src/ai/`, scrypt, sessoes,
schema do banco, `backend/src/middleware/rateLimit.js` (tetos 300 por usuario e
3000 por IP, sem bypass), a canonicalizacao da v0.7.4 e `scripts/lib/e2eGate.js`
com os 18 requisitos strict. Nenhuma migration nova. Nenhuma feature de produto.

## A premissa do prompt, corrigida

O prompt afirma que o NutriScan "nunca foi publicado". Medido nesta versao:

```text
publicado    SIM - https://nutriscan-h1wp.onrender.com responde
verificado   NUNCA, ate esta versao
no ar        0.7.0 - origin/main em 641aa5f
local        seis commits a frente, v0.7.1 a v0.7.4, nunca enviados
```

A parte que importa da premissa continua verdadeira: **nada do que foi auditado
da v0.7.1 em diante esta no ar**, e nenhuma ferramenta tinha conferido isso. O
primeiro `verify:deploy` contra a URL real reprovou no D1 por exatamente esse
motivo. E o achado R3 da v0.6.9 se repetindo - desta vez detectado por gate.

## A camera continua NAO ATESTADA

Esta versao nao toca o scanner e nao fecha a lacuna de atestacao em hardware
real. Nenhum aparelho com camera participou de nenhuma execucao.

## A1 - 6.1 a 6.9, item a item

Cada item: estado encontrado, o que mudou, decisao, teste. Todos os testes P
rodam com `NODE_ENV=production` sem deploy - processos filhos com ambiente
montado do zero, para que o `backend/.env` real nao preencha nenhuma lacuna.

### 6.1 - cookie de sessao

```text
estado      httpOnly true, sameSite lax, secure = isProduction(), path /,
            maxAge = SESSION_TTL_DAYS - ja correto, sem teste em producao
mudou       nada no codigo
teste       P1 (2 testes)
```

`P1` sobe o app em producao, faz logout e le o `Set-Cookie` real: `HttpOnly`,
`Secure`, `SameSite=Lax`, `Path=/`. O segundo teste mede `maxAge` do cookie e a
expiracao gravada no banco por uma sonda, e exige que venham da mesma fonte.

**Decisao: `SameSite=Lax`.** Frontend e API estao na mesma origem, entao `lax`
manda o cookie em toda chamada do app e recusa subrequisicao de outro site.
`none` so seria preciso com frontend e API em sites diferentes, e reabriria
CSRF. Armadilha documentada em `docs/DEPLOY.md`: `onrender.com` esta na Public
Suffix List, e dois servicos do Render sao sites diferentes.

### 6.2 - CORS e `FRONTEND_ORIGIN`

```text
estado      FRONTEND_ORIGIN ausente -> "http://localhost:5173", TAMBEM em
            producao. O backend anunciava confianca, com credenciais, numa
            origem local.
mudou       default de localhost so fora de producao; em producao a variavel
            e obrigatoria, https e so a origem; origem vazia vira `false`
teste       P2 (3 testes), P3 (2 testes)
```

O CORS **nunca refletiu a origem do request**. Medido mandando `Origin` de
atacante contra o pacote `cors` com origem fixa: o cabecalho volta com a origem
configurada. Uma suspeita minha durante o trabalho - que origem vazia viraria
`*` - foi testada e era FALSA: vazio produz "sem cabecalho". O `false` explicito
ficou assim mesmo, para nao depender de detalhe de implementacao da biblioteca,
e o comentario no codigo registra o que foi medido.

### 6.3 - `trust proxy`

```text
estado      TRUST_PROXY com default true em producao
mudou       obrigatoria e explicita em producao; valor nao reconhecido recusa
teste       P4 (2 testes)
```

`P4` sobe o app em producao e bate em `/api/auth/login` com `X-Forwarded-For`
diferentes, lendo `RateLimit-Remaining`: cada IP tem o seu balde. O contraste,
sem `trust proxy`, mostra todos no mesmo balde - o teto por IP virando global.

O default `true` era correto para o Render. Virou obrigatorio porque errar para
qualquer lado e silencioso, e o default esconde a decisao de quem configura.

### 6.4 - vazamento em resposta de erro

```text
estado      500 em producao ja omitia o detalhe. Mas o erro era DESCARTADO:
            nem cliente nem log. Um 500 em producao sumia sem rastro.
mudou       console.error do erro no servidor; resposta inalterada
teste       P5 (3 testes)
```

`P5` derruba o banco de verdade - `DATABASE_URL` apontando para porta fechada -,
manda um cookie para forcar a consulta de sessao, e confere que nem
`ECONNREFUSED`, nem host, nem porta, nem stack chegam ao corpo. O mesmo para
JSON quebrado no corpo. O terceiro teste exige que o detalhe apareca no stderr
do servidor.

### 6.5 - HTTPS

```text
estado      HSTS do helmet ligado; nenhum redirect no backend
mudou       nada no codigo; decisao documentada
teste       6.5 (1 teste) e verify:deploy D2 + D3
```

**Decisao: redirect no proxy do Render, HSTS no backend.** Um redirect no
backend, baseado em `req.secure`, derrubaria o health check interno do Render e
poderia entrar em laco com `trust proxy` errado. O teste exige HSTS com
`max-age` de pelo menos 180 dias e `/api/health` respondendo 200 sem
redirecionar. Contra o deploy real, D2 mediu `301` de http para https e D3 mediu
`max-age=31536000`.

### 6.6 - arquivos estaticos e fallback de SPA

```text
estado      JA CORRETO. /api/* inexistente -> 404 JSON; rota de frontend ->
            index.html; guarda insensivel a maiusculas desde a v0.6.7
mudou       nada
teste       P6, P7 - em NODE_ENV=production
```

O `productionServing.test.js` existente ja cobria os dois pontos que o prompt
pede: o fallback de SPA (`/alergias` recebe o HTML) e o 404 de API em JSON para
`/api/naoexiste`, `/API/naoexiste`, `/Api/naoexiste`, `/api` e `/API`. O que
faltava era o modo: ele roda no ambiente do processo de teste, nao em producao.
`P6` e `P7` repetem a prova num processo com `NODE_ENV=production`.

### 6.7 - `/api/health`

```text
estado      versao em literal no env.js, repetida a mao; campo
            aiProvider: "anthropic" exposto
mudou       versao lida de backend/package.json; aiProvider removido
teste       P8 (2 testes)
```

`P8` exige exatamente as chaves `ai`, `database`, `status` e `version`, e que
nenhum valor pareca credencial, host ou caminho. O segundo teste exige que
`env.js` nao tenha literal de versao.

O `aiProvider` saiu pela regra do `CLAUDE.md`: o frontend nunca sabe qual
provedor respondeu. O health e API publica. Nenhum consumidor usava o campo.

O campo `database` (connected, error, not_configured) **foi mantido**: o gate
E2E e o `verify:deploy` dependem dele, e ele nao revela host, porta nem nome.

### 6.8 - migrations no deploy

```text
estado      buildCommand termina em `npm run db:migrate`; o start nao migra
mudou       nada no codigo; documentado
teste       nenhum novo - o runner e a idempotencia ja tem teste desde a v0.7.4
```

**Decisao: migration no build.** Falhou, o build falha e o Render mantem a
versao anterior. Registrado como risco: entre o fim do build e a troca de
versao, o codigo antigo serve contra o schema novo. Para a `003`, que e de
dados, isso pode produzir uma linha UPC-A nao canonica nessa janela.

### 6.9 - variaveis de ambiente

```text
estado      nenhuma variavel era obrigatoria em producao; todas tinham default
mudou       quatro recusam subir; booleano nao reconhecido recusa
teste       P9 (6 testes)
```

Detalhe na secao A2.

## A2 - inventario completo de variaveis

Todas as variaveis que o backend le, levantadas de `backend/src/config/env.js`:

```text
variavel                     producao      default             falta em producao
NODE_ENV                     define modo   development         roda como dev (*)
DATABASE_URL                 OBRIGATORIA   -                   NAO SOBE
DATABASE_SSL                 OBRIGATORIA   false (dev)         NAO SOBE
FRONTEND_ORIGIN              OBRIGATORIA   localhost (dev)     NAO SOBE
TRUST_PROXY                  OBRIGATORIA   true em prod        NAO SOBE
PORT                         opcional      3000                o Render injeta
SESSION_TTL_DAYS             opcional      30                  30
SESSION_COOKIE_NAME          opcional      nutriscan_session   nome padrao
ANTHROPIC_API_KEY            opcional      vazia               assistente local
ANTHROPIC_MODEL              opcional      claude-sonnet-5     padrao
ANTHROPIC_TIMEOUT_MS         opcional      20000               padrao
ANTHROPIC_MAX_OUTPUT_TOKENS  opcional      1200                padrao
```

A mensagem de recusa, real, de um processo em producao sem `FRONTEND_ORIGIN`:

```text
NutriScan NAO subiu: configuracao de producao incompleta.
  - FRONTEND_ORIGIN: ausente ou vazia
Defina as variaveis no painel da hospedagem. Nenhum valor e impresso aqui.
```

`P9 a mensagem de falha cita nomes, nunca valores` monta um ambiente com
valores-isca e exige que nenhum apareca no stderr.

**`SESSION_SECRET`**, citado no prompt, **nao existe** neste projeto: a sessao e
token aleatorio com hash no banco, sem cookie assinado.

**`ANTHROPIC_API_KEY` continua opcional** por decisao de produto documentada: sem
ela o assistente responde localmente, e o health mostra `ai: not_configured`.

(*) `NODE_ENV` com erro de digitacao vira `development` em silencio - ver
"Observacoes NAO corrigidas".

Para confirmar presenca das credenciais, so `configured` / `not_configured` foi
consultado. Nenhum valor de credencial foi lido, impresso ou manipulado nesta
versao.

## A3 - `verify:deploy`, D1 a D8

`scripts/verify-deploy.js`, `npm run verify:deploy -- <url>` ou `DEPLOY_URL`.

```text
D1  GET /api/health; version IGUAL a do package.json, por `compararVersoes`
    de version-check.js - igualdade estrita, nunca includes nem prefixo
D2  o alvo e https://; e GET http://<host>/api/health com redirect manual
    precisa devolver 3xx com Location https://
D3  Strict-Transport-Security com max-age >= 15552000, CSP presente,
    X-Content-Type-Options nosniff
D4  GET /api/__verify_deploy_inexistente -> 404, application/json, sem
    <!doctype html
D5  GET /api/auth/me, /api/history, /api/favorites, /api/profile sem cookie
    -> 401 em todas
D6  POST de JSON quebrado na sonda inexistente -> >= 400, corpo sem stack,
    caminho, node_modules, SQL, mensagem do PostgreSQL, nome de tabela ou
    codigo de driver
D7  GET / -> 200 text/html, com pelo menos um <script src> da propria origem;
    cada script e estilo referenciado -> 200
D8  o HTML e os assets baixados no D7, varridos por chave Anthropic, chave
    estilo OpenAI, o nome ANTHROPIC_API_KEY, string de conexao com senha,
    senha e host do Neon. Sem o que o D7 baixou -> NOT_EXECUTED, nunca PASS
```

Regras do agregado: exit 0 so com os oito em PASS. `NOT_EXECUTED` e qualquer
estado desconhecido reprovam. Excecao dentro de um subgate vira FAIL com o
motivo. Sem URL, exit 1 com instrucao, sem nenhuma consulta. Tempo limite de
60 s por requisicao, por causa do sono do plano free do Render.

**Somente leitura.** Toda requisicao e GET, salvo o POST do D6 para um caminho
que nao e rota. O teste `P13` registra cada requisicao do comando, e um segundo
`P13` poe um espiao na frente do roteador REAL e exige que nada de escrita
chegue.

## A4 - P1 a P13, R1 a R4

`backend/tests/productionHardening.test.js` (23 testes, P1 a P9 e 6.5) e
`backend/tests/verifyDeploy.test.js` (15 testes, P10 a P13):

```text
P1   cookie em producao: HttpOnly, Secure, SameSite=Lax, Path    2 testes  verde
P2   sem FRONTEND_ORIGIN nao sobe; https e so origem; createApp  3 testes  verde
P3   CORS nunca reflete a origem; preflight estranho sem permissao 2 testes verde
P4   trust proxy: req.ip segue o XFF e o balde acompanha         2 testes  verde
P5   erro de driver e JSON quebrado nao vazam; detalhe vai ao log 3 testes verde
P6   /api inexistente da 404 JSON, nunca index.html              1 teste   verde
P7   rota de frontend recebe o app                               1 teste   verde
P8   health: quatro chaves, nada de segredo; versao de fonte unica 2 testes verde
P9   cada obrigatoria ausente recusa; booleano invalido recusa;
     nomes sem valores; completo sobe; dev nao exige; inventario  6 testes  verde
6.5  HSTS em producao, health sem redirect                       1 teste   verde
P10  sem URL e com URL em branco: falha com instrucao            2 testes  verde
P11  deploy perfeito; cada defeito; http; rede fora;
     NOT_EXECUTED isolado; NOT_EXECUTED no fluxo; exit code real  7 testes  verde
P12  sete versoes vizinhas reprovam; identica aprova             2 testes  verde
P13  registro sem escrita; roteador real com espiao; sonda nao e rota 3 testes verde
     mais: os oito subgates D1 a D8 existem                      1 teste   verde
```

As regressoes ficam nas suites que ja as provavam, e rodaram inteiras:

```text
R1  canonicalizacao da v0.7.4    barcode.test.js (N1) e collectionsIntegration
                                 (N1a a N1g), contra PostgreSQL real
R2  exploit C1                   allergyVerdict.test.js, T1 a T3
R3  tetos de limitador           rateLimit.test.js, R6 e R7 - 40, 20, 300, 3000
R4  isolamento entre contas      collectionsIntegration.test.js, I1 a I3
```

Nenhuma dessas suites foi alterada nesta versao.

## A5 - validacao por mutacao

### Resultado da rodada que vale

```text
T1   P2   FRONTEND_ORIGIN deixa de ser obrigatoria em producao          MORTA
T1b  P2   FRONTEND_ORIGIN volta a ter default de localhost em producao  MORTA
T2   P5   o handler de erro inclui err.stack na resposta                MORTA
T2b  P5   o handler de erro para de registrar o detalhe no log          MORTA
T3   P9   DATABASE_SSL ausente passa a usar o default false             MORTA
T3b  P9   booleano nao reconhecido volta a cair no default              MORTA
T4   P12  verify:deploy compara versao com includes                     MORTA
T5   P13  o POST do D6 vai para uma rota de escrita                     MORTA
T5b  P13  o D5 passa a sondar com POST de logout                        MORTA
T6   P3   o CORS passa a refletir a origem do request                   MORTA
T7   P4   o app deixa de confiar no proxy                               MORTA
T8   P11  NOT_EXECUTED passa a contar como aprovacao                    MORTA
T9   P11  o comando sai com 0 mesmo com subgate reprovado               MORTA

mortas 49 | nao executadas 0 | problemas 0 | linha de base: antes verde, depois verde
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Treze novos, trinta e seis herdados (S1 a S6, P1 a P9, N1 a N5, M1 a M7), todos
mortos. Os cinco mutantes sugeridos pelo prompt estao entre os treze:

```text
FRONTEND_ORIGIN volta a ter default em producao     T1b (e T1)
handler de erro inclui err.stack                    T2
variavel obrigatoria ausente usa default            T3 (e T3b)
verify:deploy compara com includes                  T4
verify:deploy chama rota de escrita                 T5 (e T5b)
```

`T6`, `T7`, `T8` e `T9` vao alem do pedido: cobrem P3, P4 e P11.

### Um mutante sobreviveu, e o teste foi corrigido

Na primeira rodada, **`T8` SOBREVIVEU**. O teste do agregado so exercitava o
fluxo real, em que o D8 fica `NOT_EXECUTED` apenas quando o D7 ja falhou - e o
FAIL do D7 reprovava o agregado de qualquer jeito, escondendo uma regra frouxa
(`!== FAIL` em vez de `=== PASS`).

A regra foi separada numa funcao, `agregar`, e testada sozinha: sete PASS e um
NOT_EXECUTED, mais um estado desconhecido, um subgate faltando e a lista vazia.
O mutante foi reancorado na funcao e morreu.

Revisando o P11 por causa disso, faltava tambem o **codigo de saida** do
processo: todos os testes olhavam o agregado em memoria. Acrescentado um teste
que roda o comando contra o roteador real e exige exit 1, e o mutante `T9`.

### O achado mais serio: tres rodadas validaram com o banco parado

**Tres rodadas de mutacao desta versao rodaram com o PostgreSQL local fora do
ar.** O ultimo registro do log do banco e de 2026-09-20 21:14; as rodadas sao de
2026-10-02. Todo mutante de banco "morreu" porque os testes nomeados falhavam por
conexao recusada, nao pelo defeito. O script imprimiu:

```text
1a  mortas 47 | nao executadas 0 | problemas 1   REPROVADO - pelo T8, unico achado real
2a  mortas 48 | nao executadas 0 | problemas 0   APROVADO
3a  mortas 49 | nao executadas 0 | problemas 0   APROVADO
```

Para os mutantes de banco, esses numeros nao provavam nada. O que denunciou foi
a suite completa logo depois: 40 falhas de banco com o codigo SEM mutacao.

A causa esta no proprio `scripts/mutation-check.js`: ele aceitava qualquer falha
do teste nomeado como prova, e nunca conferia que esse teste passava sem a
mutacao.

**Alteracao no script, declarada para decisao do auditor:** uma linha de base.
Antes da primeira mutacao e depois da ultima, cada suite roda sem defeito; a
suite tem de sair verde e cada teste nomeado em `deveQuebrar` tem de ter PASSADO
- nao pulado, nao ausente. Base inicial vermelha: nenhuma mutacao e aplicada.
Base final vermelha: a rodada inteira e reprovada, porque o ambiente mudou no
meio. A alteracao so torna o script mais exigente; nenhum criterio de morte foi
afrouxado.

A guarda foi provada reproduzindo o defeito - banco parado de proposito:

```text
[linha de base - antes] 6 suite(s), sem mutacao
  VERDE    tests/productionHardening.test.js
  VERDE    tests/verifyDeploy.test.js
  VERDE    tests/barcode.test.js
  VERMELHA tests/collectionsIntegration.test.js
  VERDE    tests/productLookup.test.js
  VERDE    tests/rateLimit.test.js
  - tests/collectionsIntegration.test.js SEM mutacao saiu com codigo 1 (...)
  - ... "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica" nao passou SEM mutacao
  - ... (mais sete testes nomeados)

REPROVADO ANTES DE MUTAR: a linha de base esta vermelha.
=== EXIT CODE: 1 ===
```

Com o banco religado, a rodada passou com as duas bases verdes. Ela foi refeita
uma ultima vez sobre o codigo final, depois da correcao da isca de chave
descrita em A10, com o mesmo resultado: 49 mortas, bases verdes antes e depois.

Os mutantes `T` nao dependem de banco - a suite de producao ficou verde com o
banco parado -, entao as mortes deles nas rodadas anteriores eram legitimas.
As rodadas das versoes anteriores tambem nao sao afetadas: o log mostra o banco
ativo em 2026-09-20, durante elas.

## A6 a A10

```text
A6   npm run build                        OK, exit 0
A7   npm --prefix backend test            276 testes, 275 pass, 0 fail, 1 SKIP, exit 0
A8   suite contra PostgreSQL 17.10 local  incluida no A7, RUN_DB_INTEGRATION_TESTS=true;
                                          32/32 na suite de colecoes; R11 mede 403 de 3000
A9   npm audit --audit-level=moderate     0 vulnerabilidades, frontend e backend
A10  node scripts/verify-release.js       exit 0; secret scan 0 segredos reais
```

A suite cresceu de 238 para 276: 23 testes em `productionHardening.test.js` e 15
em `verifyDeploy.test.js`. O unico SKIP e a chamada paga da Anthropic num
`npm test` comum, que se declara `NAO EXECUTADO`; **nao conta como PASS**, e a
propriedade que ele cobriria foi provada no gate.

Dentro do `verify:release` a mesma suite conta `238 pass, 38 skipped`: ali a flag
de banco fica desligada e os testes de integracao se declaram NAO EXECUTADOS.
Comportamento ja registrado na v0.7.2; nenhum desses SKIP conta como PASS.

### O secret scan pegou uma isca minha

A primeira execucao do `verify:release` desta versao **reprovou**:

```text
[FAIL] secret scan - 1 suspicious file(s)
- backend/tests/verifyDeploy.test.js
```

O arquivo tinha, como literal, uma chave falsa com a forma de chave Anthropic -
a isca que prova que o D8 pega chave num bundle. O scan estava certo: ele nao
tem como saber que a chave e falsa, e um literal desses no codigo-fonte e
exatamente o que ele existe para barrar.

**O gate nao foi tocado.** A isca passou a ser montada por partes em tempo de
execucao, de modo que a forma de chave existe no bundle servido pelo deploy
simulado, mas nao no fonte. O teste do D8 continua reprovando o deploy com
chave. Como o arquivo de teste mudou, a validacao por mutacao foi refeita sobre
o codigo final.

## A11 - `verify:e2e`

**PASS, exit code 0.**

```text
mode                    strict
manualCodeLookup        PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
ok                      true
residuo no Neon         0
```

Saida literal, tabela de subgates e `E2E_LAST_RUN.json` integral estao no
E2E_REPORT desta versao. Nenhum subgate em SKIP ou NOT_EXECUTED.

## A12 - `verify:deploy` executado

```text
alvo LOCAL simulado     D1 PASS  D2 FAIL  D3-D8 PASS   exit 1
deploy REAL             D1 FAIL  D2-D8 PASS            exit 1
```

**Simulado:** o backend real em `NODE_ENV=production`, servindo o `dist/`, com as
12 variaveis definidas explicitamente e sem chave de IA. O D2 reprova porque o
alvo e `http://127.0.0.1` - nao ha TLS local, e o D2 existe para nao aceitar
isso.

**Real:** `https://nutriscan-h1wp.onrender.com`, medido em 2026-10-02 20:53
(-03:00). O D1 reprova: o repositorio declara 0.7.5 e o deploy anuncia 0.7.0.

Os sete PASS do deploy real medem a v0.7.0. **Nao provam nada sobre a v0.7.5**,
que nao esta publicada. Saida literal das duas execucoes no E2E_REPORT.

Nenhum dos dois FAIL foi contornado, e nenhum subgate foi alterado depois de
ver o resultado.

## A13 - os 18 requisitos strict

`scripts/lib/e2eGate.js`, `scripts/e2e-real.js` e `scripts/verify-e2e.js`:
`git diff` vazio. `buildStrictRequirements` nao foi tocado.

```text
 1 backendProcess       7 isolation            13 historySync
 2 database             8 logout               14 favoritesSync
 3 migrations           9 assistantAuthority   15 verdictFreshness
 4 auth                10 deterministicEngine  16 manualCodeLookup
 5 sessionSchema       11 fallback             17 anthropicReal
 6 multiDevice         12 privacy              18 assistantAuthenticated
```

Conferido de duas formas. Os testes existentes (`D2`, `A10` e `A12` de
`e2eGate.test.js`) passaram na suite. E, a parte, contra o `E2E_LAST_RUN.json`
desta execucao: `findMissingRequirements` devolve `[]`, e pondo CADA um dos 18
sozinho em `NOT_EXECUTED`, o gate reprova exatamente aquele.

## A14, A15

```text
A14  residuo NutriVa     0 em codigo, interface e manifestos. Restam so: a secao
                         historica do CHANGELOG, a secao da v0.7.4 no historico
                         deste relatorio e o teste que proibe o nome
A15  versao 0.7.5        package.json                         0.7.5
                         backend/package.json                 0.7.5
                         package-lock.json (raiz e "")        0.7.5
                         backend/package-lock.json (raiz e "") 0.7.5
                         /api/health de um processo real      0.7.5
                         README                               # NutriScan v0.7.5
                         CHANGELOG                            ## NutriScan v0.7.5 - 2026-10-02
```

Desde esta versao, o `/api/health` le de `backend/package.json`: incrementar a
versao em mais um lugar a mao deixou de ser possivel.

## Observacoes descritas e NAO corrigidas

Fora do escopo das secoes 6 e 7. Descritas para decisao, como manda a secao 16.

```text
NODE_ENV com erro de digitacao   "prod" ou "producao" viram development, sem
                                 aviso: Secure, boot check e omissao de
                                 detalhe se desligam juntos. O teste existente
                                 "valores invalidos de ambiente caem em
                                 defaults seguros" trava isso de proposito.
                                 Proposta: recusar subir com NODE_ENV fora de
                                 development/test/production.

JSON malformado devolve 500      o body-parser marca o erro com status 400, e
                                 o handler ignora. Nao vaza nada - P5 e D6
                                 provam -, mas o codigo HTTP esta errado.
                                 Proposta: respeitar error.status 4xx com
                                 `expose: true`.

env.test.js troca o .env real    withTemporaryEnv sobrescreve backend/.env e
                                 restaura no finally. Um processo morto no
                                 meio deixa o arquivo temporario no lugar, e a
                                 configuracao real se perde. Proposta: apontar
                                 o loader para um caminho de teste.

janela de migration              ver 6.8.

migration que falha sem dizer    `backend/scripts/migrate.js` imprime so
por que                          `error.message`. Uma conexao recusada a um host
                                 com IPv4 e IPv6 vira AggregateError, cuja
                                 message e VAZIA - medido nesta versao. Um build
                                 do Render que nao alcance o banco falharia
                                 com o log em branco. Proposta: imprimir
                                 `error.code` e as mensagens de `error.errors`.

credenciais expostas             a DATABASE_URL de producao e a
                                 ANTHROPIC_API_KEY foram expostas no contexto
                                 de uma sessao anterior (v0.7.2). O dono
                                 decidiu rotacionar ao final do projeto. A
                                 rotacao continua PENDENTE.
```

## O que esta versao NAO prova

```text
v0.7.5 no ar                       NAO PUBLICADA - o deploy real roda a v0.7.0
endurecimento no deploy real       NAO COMPROVADO - so pode ser medido depois de
                                   publicar, com o mesmo verify:deploy
HTTPS da v0.7.5                    NAO COMPROVADO - o alvo simulado nao tem TLS
camera em hardware real            NAO EXECUTADO - exige aparelho com camera
decodificacao optica               NAO EXECUTADO
Open Food Facts real               NAO EXECUTADO - a busca do gate e injetada
suite de colecoes no Neon          NAO EXECUTADO - por decisao de risco
carga simultanea real              NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA e esta versao nao a fecha.**

### Antes de publicar

**`FRONTEND_ORIGIN=https://nutriscan-h1wp.onrender.com` precisa estar definida
no painel do Render antes do push.** Sem ela, a v0.7.5 nao sobe - por desenho.
O Render manteria a versao anterior no ar, e o `verify:deploy` continuaria
reprovando no D1.

Publicar nao foi feito: a secao 17 manda parar depois do ZIP.

## Auditoria da v0.7.4 - 2026-09-20

## Escopo

Correcao do defeito N1 e documentacao da observacao N2, da auditoria externa da
v0.7.3.

Preservado sem alteracao: a matematica do digito verificador em
`shared/barcode.js`, a isencao para codigos nao-EAN, `shared/allergenEngine.js`,
`shared/allergyVerdict.js`, todo o `backend/src/ai/`, scrypt, sessoes,
`backend/src/middleware/rateLimit.js` e as restricoes de unicidade do banco.
Nenhum teto de limitador alterado. Nenhum bypass.

O comportamento de unicidade de nome (N2) **nao foi alterado**, conforme o
prompt pediu: foi documentado e avaliado.

## A camera continua NAO ATESTADA

Esta versao **nao fecha** a lacuna de atestacao da camera em hardware real, e
nao afirma ter fechado. Nenhum aparelho com camera participou de nenhuma
execucao.

## N1 - a normalizacao que o codigo documentava e nao aplicava

### A1 - reproducao ANTES da correcao

App real contra PostgreSQL 17.10 real:

```text
modulo shared diz canonico de 036000291452 -> 0036000291452

grava via camera (EAN-13)    code=0036000291452  -> 201
grava via digitado (UPC-A)   code=036000291452   -> 201

HISTORICO -> 2 linha(s):
    036000291452  | Duracell AA
    0036000291452 | Duracell AA

favoritos: ["0036000291452"]
UPC-A digitado aparece como favoritado? NAO

N1 PRESENTE: o mesmo produto virou 2 linhas de historico.
O backend gravou o codigo como veio, sem canonicalizar.
```

Resultado identico ao que o auditor mediu.

### A2 - DEPOIS da correcao

```text
grava via camera (EAN-13)    code=0036000291452  -> 201
grava via digitado (UPC-A)   code=036000291452   -> 201

HISTORICO -> 1 linha(s):
    0036000291452 | Duracell AA

N1 CORRIGIDO: uma linha so, na forma canonica EAN-13.
```

### Causa raiz

`productCodeSchema` importava `exigeDigitoVerificador` e
`digitoVerificadorConfere`, e nunca `validarCodigoDeBarras` - que e a funcao que
devolve a forma canonica. O schema CONFERIA o digito e gravava o codigo como
veio na requisicao.

O frontend normalizava, mas apenas no ramo `origem === "manual"` de
`productLookup.js`. Um UPC-A lido pela camera, ou qualquer requisicao direta a
API, gravava a forma de 12 digitos.

**E a mesma classe do defeito E1 da v0.7.1**: um comentario afirmando uma
propriedade que o codigo nao garantia. Na v0.7.1 a frase era falsa; aqui a frase
estava certa e o codigo e que nao a cumpria. A segunda variante e mais dificil
de ver, porque a leitura do comentario nao levanta suspeita.

## Onde a canonicalizacao ficou, e por que nesse ponto

No `.transform()` do `productCodeSchema`, em `backend/src/utils/validation.js`.

```js
function canonicalizarCodigo(valor) {
  if (!exigeDigitoVerificador(valor)) return valor;
  const resultado = validarCodigoDeBarras(valor);
  return resultado.valido ? resultado.codigo : valor;
}
```

O ponto e esse por tres motivos:

```text
passagem unica   todo caminho de entrada - manual, camera, requisicao direta -
                 atravessa `productRefSchema` antes de tocar o banco
ja validava      a conferencia do digito ja morava ali; canonicalizar em outro
                 lugar criaria dois pontos de verdade sobre o mesmo campo
ordem correta    o `.refine` roda ANTES do `.transform`, entao um digito errado
                 e recusado sem nunca ser canonicalizado - canonicalizar antes
                 transformaria "12 digitos errados" em "13 digitos errados"
```

A forma canonica vem de `validarCodigoDeBarras`, em `shared/barcode.js`. Um
teste procura por `` `0${ ``, `"0" +` e `padStart(13` no arquivo do backend, para
que escrever "prefixa um zero" a mao fique vermelho.

### O frontend continua normalizando, e por que nao foi removido

O prompt deixou a decisao em aberto. A normalizacao do cliente foi MANTIDA, como
conveniencia de exibicao: a tela mostra "Vou buscar 0036000291452" antes do
envio, e o codigo canonico e o que vai para a consulta a Open Food Facts - que
nao passa pelo nosso backend e portanto nao teria outra chance de normalizar.

Ela deixou de ser a que decide o que vai ao banco. A hierarquia esta escrita nos
dois lugares: a do cliente e conveniencia, a do servidor e a que vale.

## A3 - decisao sobre dados existentes: 4.2(a), migration

### Medicao antes de decidir

```text
PRODUCAO (Neon)
product_history      total 0 | de 12 digitos 0 | nao canonicos 0 | com colisao 0
product_favorites    total 0 | de 12 digitos 0 | nao canonicos 0 | com colisao 0
```

Producao nao tem nada a migrar hoje. Ainda assim a escolha foi (a).

O motivo: o banco do proprio auditor TEM as duplicatas - ele as produziu -, e
qualquer instalacao que usou da v0.7.0 a v0.7.3 pode ter. Sem migrar, o usuario
veria o mesmo produto duas vezes no historico para sempre, sem nenhuma pista do
porque. "Producao esta vazia hoje" e argumento sobre esta instalacao, nao sobre
o defeito.

### A regra de sobrevivencia

Escrita na propria migration, como o prompt exige:

```text
A LINHA CANONICA SOBREVIVE.
A nao canonica e removida, depois de doar o que tem de mais recente.
```

O motivo: a canonica e a que vai continuar recebendo escrita daqui em diante.
Manter a outra significaria apagar justamente a linha que o app vai usar.

```text
product_history    `viewed_at` mais recente das duas; nome, marca e imagem vem
                   da linha mais recente. E a MESMA regra do
                   `ON CONFLICT DO UPDATE` em escrita normal: vence a ultima
                   escrita, medida pelo relogio do servidor.

product_favorites  `created_at` mais ANTIGO das duas. Favoritar e ato
                   intencional; a data que interessa e desde quando o produto e
                   favorito, nao a da duplicata acidental.
```

### O que a migration NAO toca

```text
codigo de 12 digitos com digito verificador invalido   nao e UPC-A
codigo de 13, 8 ou 14 digitos                          fora do caso
codigo alfanumerico                                    fora do caso
```

Um numero de 12 digitos com digito errado pode ter entrado antes de a v0.7.3
conferir o digito. Inventar canonico para ele seria pior que deixa-lo como esta.

### Idempotencia

Pelo mesmo mecanismo das outras: registro em `schema_migrations`. Aplicada duas
vezes pelo runner:

```text
=== primeira aplicacao ===
003 historico: 0 renomeada(s), 0 fundida(s) | favoritos: 0 renomeada(s), 0 fundida(s)
applied 003_canonicaliza_upca.js

=== segunda aplicacao ===
skip 003_canonicaliza_upca.js
```

E o teste `N1g` chama a funcao diretamente duas vezes, com dados, e exige
resultado identico - porque pular por registro nao prova que a logica e
idempotente.

### Uma mudanca de infraestrutura, declarada

`backend/scripts/migrate.js` passou a aplicar migrations `.js` alem de `.sql`.

Era necessario: decidir se um codigo de 12 digitos e um UPC-A de verdade depende
do digito verificador, e escrever esse calculo em SQL seria a segunda
implementacao que a secao 4.3 do prompt proibe. Uma migration em JavaScript
importa a MESMA funcao compartilhada.

Os dois tipos sao ordenados juntos pelo nome e registrados do mesmo jeito. Fica
declarado aqui por ser mudanca em infraestrutura de banco, ainda que pequena.

## N2 - unicidade de nome de usuario

### O comportamento, documentado

```text
POST /api/auth/register com nome ja existente e e-mail novo
  -> 409 ACCOUNT_EXISTS
  -> "Já existe uma conta com esse e-mail ou usuário."
```

A comparacao usa `name_key`, que e o nome normalizado. "Joao Silva" e
"joao silva" sao o mesmo nome. **Consequencia pratica: duas pessoas com o mesmo
nome nao conseguem ter conta.**

Agora documentado em `docs/API.md`, no README e em comentario no proprio
`backend/src/services/authService.js`. **O comportamento nao foi alterado**,
conforme o prompt pediu.

### A avaliacao pedida: a regra NAO e arbitraria

Fui ler o codigo antes de opinar, e a leitura mudou a resposta.

`loginUser` aceita e-mail **ou** nome como identificador:

```js
const user = await findUserByEmailOrNameKey(identifier, data.identifierKey);
// SELECT * FROM users WHERE email = $1 OR name_key = $2 LIMIT 1
```

Com nomes repetidos, entrar por nome escolheria **uma conta qualquer** entre as
homonimas - a que o `LIMIT 1` pegasse. Isso nao e inconveniencia: e defeito de
autenticacao. A senha de uma pessoa poderia abrir a conta de outra, se as duas
tivessem o mesmo nome e a mesma senha.

Ou seja: **a unicidade de nome sustenta o login por nome.** As duas andam
juntas, e retirar uma exige retirar a outra.

### A alternativa, descrita e NAO implementada

Se o projeto quiser permitir nomes repetidos:

```text
1. login passa a aceitar SOMENTE e-mail
2. `name` vira apelido de exibicao, sem unicidade
3. `name_key` deixa de ter indice unico
4. migration para remover o indice
5. a mensagem de 409 passa a falar so de e-mail
```

E mudanca de contrato de autenticacao, fora do escopo desta versao. Fica para
decisao.

Observacao de produto, sem peso tecnico: um app de consumo com publico de mais
idade tende a ter gente entrando por nome, porque e mais facil de lembrar que o
e-mail. Retirar o login por nome tem custo de usabilidade para esse publico, e
nao so de codigo.

### A mensagem nao diz qual campo colidiu

O efeito e real: quem recebe `409` sabe que um dos dois ja existe, mas nao qual.
Dizer "esse e-mail ja tem conta" permitiria testar uma lista de e-mails e
descobrir quem usa o app.

**Nao ha registro de que isso tenha sido a intencao original** - nem em
comentario, nem em CHANGELOG, nem em mensagem de commit. O comentario
acrescentado documenta o motivo de MANTER, e diz explicitamente que nao
comprova intencao. Inventar uma justificativa retroativa seria pior que a
ausencia dela.

Limite honesto dessa protecao: o `409` ainda revela que **um dos dois** existe.
Quem testar um e-mail com um nome aleatorio improvavel sabe que a colisao foi do
e-mail. A protecao reduz o custo do ataque, nao o elimina. Nao foi alterada
nesta versao.

## A4 - N1a a N1g, R1 a R5

```text
N1a  UPC-A e EAN-13 viram UMA linha canonica          verde (PostgreSQL real)
N1b  favoritar por um formato vale pelo outro         verde (PostgreSQL real)
N1c  requisicao DIRETA grava forma canonica           verde (conferido no banco)
N1d  codigo nao-EAN passa intacto                     verde (schema + banco)
N1e  EAN-13 e EAN-8 inalterados                       verde (schema + banco)
N1f  deduplicacao continua funcionando                verde (PostgreSQL real)
N1g  migration: canonicaliza, funde e e idempotente   verde, 3 testes
R1   as 117 mutacoes de um digito continuam rejeitadas  verde
R2   backend recusa digito errado sem o frontend      verde
R3   regressao C1                                     verde, 12 testes
R4   limitadores da v0.7.2 nos valores declarados     verde
R5   isolamento entre contas (I1, I2, I3)             verde
```

`N1c` confere **no banco**, com `SELECT`, e nao pela resposta da API: a resposta
poderia ecoar o que foi enviado sem que o valor gravado fosse esse.

## A5 - validacao por mutacao

Nove mutantes novos, vinte e sete herdados.

```text
S1   N1a  remove o .transform() do productCodeSchema (o defeito N1)   MORTA
S1b  N1a  canonicaliza so no frontend, atravessando o banco           MORTA
S1c  N1c  sem transform, requisicao direta grava 12 digitos           MORTA
S2   N1e  prefixa zero tambem no EAN-8, nao so no UPC-A               MORTA
S2b  N1d  remove a isencao: todo codigo passa pela canonicalizacao    MORTA
S3   N1g  a migration deixa sobreviver a linha NAO canonica           MORTA
S4   N1g  a migration para de conferir o digito antes de canonicalizar MORTA
S5   R2   o digito verificador do backend passa a aceitar tudo        MORTA
S6   N1   o schema monta a forma canonica por conta propria           MORTA
```

Os quatro mutantes sugeridos pelo prompt estao cobertos: remover o
`.transform()` (S1, S1b, S1c), canonicalizar so no frontend (S1b - ele mede a
diferenca ATRAVESSANDO o banco), canonicalizar tambem nao-EAN (S2b) e
`digitoVerificadorConfere` sempre true (S5, alem do P1 herdado).

### Tres mutantes meus estavam errados, e o que isso revelou

**S2, na primeira versao, mutava codigo inalcancavel.** Ele trocava o ramo
`: valor` de `canonicalizarCodigo` - o fallback que so roda se o `.refine`
deixar passar um codigo invalido, o que nao acontece. Resultado: o mutante foi
pego apenas pela leitura de codigo-fonte, nao pelo teste de comportamento.

Isso e informacao util sobre o codigo: aquele ramo e defensivo e inalcancavel
hoje. Fica declarado. O mutante foi substituido por um alcancavel - prefixar
zero tambem no EAN-8 -, que morre pelo comportamento.

**S3 ficou INAPLICAVEL por indentacao errada na ancora** (seis espacos contra
quatro no arquivo).

**P5b ficou INAPLICAVEL porque esta versao mudou o import que ele ancora**: a
lista ganhou `validarCodigoDeBarras`. A ancora nomeia a lista inteira, entao
precisou ser atualizada.

Nos tres casos o script disse **INAPLICAVEL** ou apontou o teste errado, em vez
de declarar sucesso. E o modo de falhar certo: ele reporta que nao conseguiu
testar, em vez de reportar que testou.

### Um defeito estrutural no proprio arquivo de teste, encontrado e corrigido

Ao conferir a contagem de testes com e sem a flag de banco, os numeros nao
bateram:

```text
COM  RUN_DB_INTEGRATION_TESTS=true   32 testes
SEM  a flag                          23 testes
```

Testes pulados continuam sendo CONTADOS pelo runner, entao uma diferenca de
total significa que nove testes nao estavam sequer sendo registrados.

A causa: ao inserir os testes `N1a` a `N1g` no arquivo, um `});` foi consumido,
e os nove ficaram **aninhados dentro do teste `M11`** em vez de no topo do
arquivo. Com a flag ligada, `M11` executava e os nove se registravam como
subtestes - por isso passavam e por isso a mutacao os matava. Com a flag
desligada, `M11` era pulado, seu callback nunca rodava, e os nove sumiam sem
deixar rastro.

O efeito pratico era grave para auditoria: **um pai pulado escondia nove testes
em silencio**, e a unica pista era a diferenca de total entre duas execucoes.

Corrigido: os nove voltaram ao topo do arquivo. Agora sao 32 testes registrados
nos dois casos - 32 verdes com banco, 32 pulados sem ele. A validacao por
mutacao foi REEXECUTADA depois da correcao, porque o arquivo mudou de estrutura.

## A12 - o gate E2E real

**PASS, exit code 0.**

```text
mode                    strict
manualCodeLookup        PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
ok                      true
```

Saida literal, tabela de subgates e `E2E_LAST_RUN.json` integral estao no
E2E_REPORT desta versao. Nenhum subgate em SKIP ou NOT_EXECUTED.

A migration `003` rodou em producao e reportou `0 renomeada(s), 0 fundida(s)` -
as tabelas estavam vazias. Os zeros sao o resultado correto, e estao registrados
porque silencio nao e prova de que ela rodou.

Residuo no banco apos a execucao: **0** nos seis padroes conferidos, e nenhuma
linha orfa.

## A13 - os 18 requisitos do modo strict

```text
modo strict, com a flag da IA:  18 requisitos
os 17 anteriores a v0.7.3:      todos presentes
manualCodeLookup:               presente, requisito BASE
```

O teste poe cada um em `NOT_EXECUTED` e exige que `findMissingRequirements`
devolva exatamente aquele. Nenhum requisito foi acrescentado nem perdido nesta
versao.

## A7 a A11, A14 a A16

```text
A7   npm run build                     OK
A8   npm --prefix backend test         238 testes, 237 pass, 0 fail, 1 SKIP
A9   suite contra PostgreSQL real      32/32 na suite de colecoes, 0 fail
A10  npm audit --audit-level=moderate  0 vulnerabilidades nos dois pacotes
A11  node scripts/verify-release.js    exit code 0
A14  gasto do gate por balde           colecoes 12, auth 3, assistente 2
A15  residuo NutriVa                   0 em codigo, interface e manifestos
A16  versao 0.7.4 nos 7 pontos         consistente
```

O unico SKIP e a chamada paga da Anthropic num `npm test` comum, que se declara
`NAO EXECUTADO`. **Nao conta como PASS**, e a propriedade que ele cobriria foi
provada no gate.

## O que esta versao NAO prova

```text
camera em hardware real           NAO EXECUTADO - exige aparelho com camera
decodificacao optica              NAO EXECUTADO
Open Food Facts real              NAO EXECUTADO - a busca do gate e injetada
migration 003 com dados reais     NAO EXECUTADO EM PRODUCAO - tabelas vazias
suite de colecoes no Neon         NAO EXECUTADO - por decisao de risco
carga simultanea real             NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA e esta versao nao a fecha.**

Sobre a migration: a logica foi exercitada contra PostgreSQL local, com as duas
formas do mesmo produto presentes na mesma conta - o caso que produz colisao de
unicidade. Em producao ela rodou contra tabelas vazias. Ou seja: a regra de
fusao esta provada por teste, **nao por execucao sobre dado real**. Se o banco
do auditor tiver as duplicatas, essa sera a primeira execucao com dado de
verdade.

### Um ramo inalcancavel, declarado

`canonicalizarCodigo` termina em `resultado.valido ? resultado.codigo : valor`.
O ramo `: valor` **nunca executa hoje**: o `.refine` recusa antes qualquer
codigo de tamanho EAN/UPC com digito invalido. Ele existe como defesa contra uma
reordenacao futura das regras do schema, e esta comentado como tal.

A consequencia para a auditoria: um mutante que ataque esse ramo so e detectavel
por leitura de codigo-fonte, nao por comportamento. Foi exatamente o que
aconteceu com a primeira versao do mutante `S2`, e por isso ele foi
substituido. Fica declarado para que nao pareca cobertura que nao existe.

### Uma observacao herdada, ainda aberta

`cleanBarcode`, usado no caminho da camera, remove caracteres nao numericos.
Um CODE_128 alfanumerico e portanto mutilado antes da busca. E anterior a esta
versao, fora do escopo dela, e continua registrado para decisao.

## Auditoria da v0.7.3 - 2026-09-20

## Escopo

Entrada manual de codigo de barras, com conferencia de digito verificador.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, todo o `backend/src/ai/`, autenticacao,
scrypt, sessoes, schema do banco e `backend/src/middleware/rateLimit.js`.
Nenhuma migration nova. Nenhum teto de limitador alterado. Nenhum bypass.

`shared/allergyVerdict.js` nao foi alterado; ele aparece na validacao por
mutacao apenas como ALVO de mutante, e e restaurado depois.

## A camera continua NAO ATESTADA

Esta versao **nao fecha** a lacuna de atestacao da camera em hardware real, e
nao afirma ter fechado. Nenhum aparelho com camera participou de nenhuma
execucao. A logica do scanner entregue na v0.6.9 continua DECLARADA e NAO
PROVADA.

O que esta versao fez a respeito foi indireto: ao tornar o caminho de consulta
executavel fora do navegador, ela permitiu que o fluxo produto -> motor ->
veredito fosse exercitado pela primeira vez. A decodificacao optica, nao.

## Decisao sobre UPC-A

**UPC-A de 12 digitos e normalizado para EAN-13 com zero a esquerda.**

O digito verificador nao muda: o zero a esquerda nao altera a soma ponderada, e
o teste M7 confere isso em vez de assumir.

A justificativa NAO e a Open Food Facts - e a deduplicacao do nosso proprio
banco. Historico e favoritos usam a restricao de unicidade
`(user_id, product_code)`. Sem normalizar:

```text
produto escaneado como EAN-13   0036000291452  -> linha 1
o mesmo produto digitado UPC-A    036000291452  -> linha 2
```

Duas linhas de historico para o mesmo produto, e favoritar por um caminho nao
apareceria como favoritado pelo outro. M10 prova que hoje viram uma linha so.

A forma digitada e preservada no resultado (`codigoDigitado`), para a interface
poder mostrar o que a pessoa escreveu.

## Onde a funcao de validacao ficou

`shared/barcode.js`, junto do motor deterministico.

```text
frontend   src/App.jsx                    import "../shared/barcode.js"
           src/services/productLookup.js  import "../../shared/barcode.js"
           src/pages/Scanner/ScannerPage.jsx
backend    backend/src/utils/validation.js  import "../../../shared/barcode.js"
```

Os dois lados importam por caminho relativo, do mesmo jeito que
`allergenEngine.js` ja era compartilhado. Nao ha build step nem copia.

M9 prova que a implementacao e unica de duas formas: os imports existem, e
nenhum outro arquivo reimplementa o calculo. A segunda parte procura tanto o
nome da funcao quanto a assinatura do algoritmo (`% 10) % 10`), porque copiar
com outro nome seria a forma mais provavel de a divergencia entrar.

Dois mutantes atacam exatamente isso: `P5` da ao frontend uma copia propria, e
`P5b` faz o backend parar de importar a compartilhada. Os dois morrem.

## 6.5 - cobertura de rate limit da rota de produto

**NAO EXISTE rota de consulta de produto no backend.**

Isto nao e uma lacuna de configuracao: e a arquitetura atual. A consulta sai do
navegador direto para a Open Food Facts, em
`src/services/openFoodFactsService.js`. O backend expoe seis grupos de rotas, e
nenhum deles e de produto:

```text
/api/health          sem limitador
/api/assistant/chat  assistantRateLimit   20 / 10 min por IP
/api/auth/register   authRateLimit        40 / 15 min por IP
/api/auth/login      authRateLimit        40 / 15 min por IP
/api/profile         sem limitador proprio, exige sessao
/api/history         collectionsRateLimit 300 por usuario + 3000 por IP
/api/favorites       collectionsRateLimit 300 por usuario + 3000 por IP
```

Portanto: **nenhum limitador cobre a consulta de produto, porque ela nao passa
por nos.** Quem sofre a repeticao e a Open Food Facts, nao o NutriScan.

O que ESTA coberto e o efeito persistente da consulta. Toda consulta que vira
registro passa por `/api/history`, e ali valem os dois tetos da v0.7.2, agora
tambem com a conferencia de digito verificador antes da gravacao.

### Proposta, NAO implementada

Se o projeto quiser cobrir a consulta, o caminho seria um proxy no backend:

```text
GET /api/products/:codigo
  -> valida com shared/barcode.js (fail-closed)
  -> consulta a Open Food Facts do servidor
  -> devolve o produto

limitador composto, no padrao da v0.7.2:
  por usuario   teto a medir
  por IP        teto a medir, obrigatoriamente maior - a rota seria acessivel
                a visitante, e nesse caso o teto por IP e o unico que protege
```

Isso **nao foi implementado**, por tres motivos que valem registro:

```text
escopo      a secao 5 fecha o escopo em "digitar o codigo"; mover a consulta
            para o servidor e outra mudanca, maior que esta versao inteira
efeito      muda CSP, cache, comportamento offline e custo de banda do Render
medicao     o teto teria de vir de medicao, e nao ha trafego real para medir
```

A secao 15 manda descrever em vez de implementar o que estiver fora do escopo.
Fica para decisao do auditor.

## 6.1 - um caminho de consulta so, e onde ele diverge

```text
codigo -> consultarProdutoPorCodigo -> motor deterministico -> allergyVerdict -> UI
```

`src/services/productLookup.js` e esse caminho. `App.jsx`, o gate E2E e os
testes chamam a MESMA funcao.

### A extracao, declarada

Ate a v0.7.2 este passo vivia dentro de um `useCallback` em `App.jsx`. Extrair
para um modulo **nao criou um caminho paralelo**: nomeou o unico caminho, que
antes estava inacessivel a teste porque o projeto nao tem renderizador de React.

Era essa a causa de o caminho principal do produto nunca ter sido exercitado. A
secao 4(b) do prompt aponta exatamente isso como motivo desta versao, entao a
extracao esta dentro do escopo - mas fica declarada aqui, porque e uma mudanca
estrutural em codigo que ja funcionava.

O mutante `P3` ataca isso: faz `App.jsx` montar o resultado por conta propria,
chamando a busca direto. Morre.

### Onde os dois caminhos DIVERGEM, e por que

A conferencia de ENTRADA depende da origem. Isto contraria a leitura literal de
6.1, entao precisa de justificativa explicita.

O scanner aceita seis simbologias:

```text
EAN_13  EAN_8  UPC_A   tem digito verificador de EAN
UPC_E                  tem digito verificador proprio, calculado sobre a forma expandida
ITF                    ITF-14 tem 14 digitos; fora dos tamanhos de EAN
CODE_128               aceita letra
```

Aplicar a conferencia de digitacao a saida da camera recusaria ITF e CODE_128 -
caixa de papelao e etiqueta de balanca, que sao leituras legitimas e ja
funcionavam antes desta versao. Seria uma regressao de funcionalidade vendida
como controle de seguranca.

E nao faria falta: a `@zxing` confere o checksum da simbologia ao decodificar e
lanca `ChecksumException` quando ele nao bate. Esse erro ja estava na lista de
transitorios do `scannerService` desde a v0.6.9. **Uma leitura de EAN que chega
ao nosso codigo ja passou pelo digito verificador.**

Digitar nao tem essa protecao, e e exatamente ali que a conferencia entra.

Depois desse passo, os dois caminhos sao identicos. M4 prova por igualdade
profunda do resultado E do veredito, e um dos casos de M4 prova o contrario
tambem: que a camera continua lendo ITF-14 enquanto o mesmo codigo digitado e
recusado.

## 6.2 - o que a conferencia pega, e o que ela NAO pega

### Pega

Para cada um dos cinco codigos de referencia, M1 percorre **todas** as trocas de
um unico digito - cada posicao, cada valor diferente - e exige que todas sejam
detectadas. Sao 117 mutacoes por EAN-13, e nenhuma passa.

### Nao pega, e isso esta no teste

Trocar o ultimo digito e recalcular produz outro codigo VALIDO:

```text
7891000100103   valido
7891000100111   valido tambem, e e outro produto
```

Dois produtos podem estar a uma tecla de distancia. A validacao reduz a classe
de erro, nao a elimina.

A consequencia de projeto, tambem no teste: **o codigo entregue a busca e
exatamente o que a pessoa digitou**, nunca um corrigido ou aproximado, e a
interface continua mostrando nome e marca para ela conferir. Nao existe "voce
quis dizer" num app de alergia.

### Mensagens distintas

```text
vazio              "Digite o código de barras do produto."
caractere invalido "O código de barras tem só números. Confira o que você digitou."
tamanho errado     "Esse código tem N números. Um código de barras tem 8, 12 ou 13."
digito errado      "Esse código não existe. Confira número por número na embalagem."
fora da base       "Produto <codigo> não está cadastrado na Open Food Facts."
```

M6 exige que os quatro primeiros sejam textos diferentes entre si, e que o de
digito errado NAO contenha "nao encontrado" nem "nao esta cadastrado". O
mutante `P7` colapsa dois deles e morre.

### A limpeza e visivel, e limitada

So espaco e hifen saem, e a quantidade removida volta para quem chamou. A tela
mostra "Vou buscar 7891000100103" antes do envio.

Qualquer outro caractere e RECUSADO, nao removido. O mutante `P8` troca a
expressao de separadores por "tudo que nao e digito" - ou seja, limpeza
silenciosa - e morre em M8.
## A1 - M1 a M14

```text
M1   digito verificador, bateria completa       5 testes, verdes
M2   codigo invalido nao gera requisicao        3 testes, verdes
M3   backend recusa codigo invalido             3 testes, verdes
M4   paridade entre os dois caminhos            4 testes, verdes
M5   conflito com piso de risco, via digitacao  3 testes, verdes
M6   mensagens distintas                        3 testes, verdes
M7   UPC-A normalizado preserva identidade      1 teste, verde
M8   normalizacao visivel e limitada            2 testes, verdes
M9   uma implementacao so, em shared/           2 testes, verdes
M10  historico com deduplicacao e limite        3 testes, verdes (PostgreSQL real)
M11  visitante nao grava no PostgreSQL          1 teste, verde (PostgreSQL real)
M12  acessibilidade do campo                    2 testes, verdes
M13  regressao C1                               12 testes, verdes
M14  regressao de limitadores                   17 testes, verdes
```

Arquivos: `backend/tests/barcode.test.js` (16), `backend/tests/productLookup.test.js`
(13), `backend/tests/collectionsIntegration.test.js` (M10, M11, R11),
`backend/tests/allergyVerdict.test.js` (M13), `backend/tests/rateLimit.test.js`
(M14), `backend/tests/e2eGate.test.js` (A10).

## A2 - validacao por mutacao

```text
mortas 27 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Os cinco mutantes sugeridos pelo prompt estao entre os treze novos:

```text
P1   M1  o digito verificador aceita qualquer codigo                    MORTA
P1b  M1  o calculo usa peso fixo pela esquerda (erra EAN-8 ou EAN-13)   MORTA
P2   M3  tira a validacao do backend e deixa so no frontend             MORTA
P2b  M3  a regra do backend passa a exigir digito de TODO codigo        MORTA
P3   M4  o caminho manual monta o resultado por conta propria           MORTA
P3b  M4  o caminho manual deixa de conferir e vira o da camera          MORTA
P4   M5  remove o piso de risco do veredito                             MORTA
P5   M9  o frontend ganha copia propria da funcao                       MORTA
P5b  M9  o backend para de importar a compartilhada                     MORTA
P6   M7  UPC-A deixa de normalizar para EAN-13                          MORTA
P7   M6  colapsa digito invalido e nao encontrado na mesma mensagem     MORTA
P8   M8  passa a limpar qualquer caractere em silencio                  MORTA
P9  M10  remove a validacao do backend: codigo invalido chega ao banco  MORTA
```

Mais os catorze herdados da v0.7.2 (N1 a N5, M1 a M7), todos MORTOS. Nenhum
sobrevivente.

`P1b` merece nota: ele nao desliga a conferencia, apenas calcula o peso a partir
da esquerda com peso inicial fixo. Isso acerta um dos formatos e erra o outro -
EAN-13 e EAN-8 tem paridade invertida quando contados da esquerda. E o tipo de
defeito que passa se a bateria so testar um formato. A bateria testa os tres.

### O script de mutacao nao conseguia testar tres alvos

Na primeira rodada, `P2`, `P5b` e `P9` sairam como **INAPLICAVEL**: a ancora de
varias linhas nao casava.

A causa era fim de linha. `backend/src/utils/validation.js` esta com CRLF no
disco - o Git converte no checkout do Windows - e as ancoras eram escritas com
`\n`. O script anunciava que nao conseguiu testar, em vez de testar errado, que
e o comportamento menos ruim dos dois; mas o efeito pratico era o mesmo de nao
ter o teste.

A comparacao passou a normalizar o fim de linha. Os bytes originais continuam
guardados para a restauracao, entao o arquivo volta ao disco exatamente como
estava. Com isso os tres rodaram e morreram.

## A9 - o gate E2E real

**PASS, exit code 0, com `manualCodeLookup` em PASSED.**

```text
mode                    strict
manualCodeLookup        PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
ok                      true
```

Saida literal completa, tabela de subgates e `E2E_LAST_RUN.json` integral estao
no E2E_REPORT desta versao.

Residuo no banco apos a execucao: **0** em todos os seis padroes conferidos, e
`product_history` de volta a zero - o subgate grava e a cascata apaga junto com
a conta.

## A10 - os 17 requisitos antigos continuam exigidos

```text
modo strict, com a flag da IA:  18 requisitos
os 17 da v0.7.2:                todos presentes
acrescentado:                   manualCodeLookup, e so ele
```

O teste nao se contenta com presenca na lista: para cada um dos 17, ele poe o
requisito em `NOT_EXECUTED` e exige que `findMissingRequirements` devolva
exatamente aquele. Um requisito que existe mas nunca reprova e decoracao.

`manualCodeLookup` e requisito BASE, nao condicional a flag da Anthropic. Amarra-
lo a IA deixaria o gate aprovar uma execucao sem chave que nunca exercitou a
consulta por codigo - que e justamente o caminho que esta versao existe para
tornar auditavel.

O teste `A12` da v0.7.0 precisou ser ajustado: ele travava o total absoluto em
17. Em vez de trocar o numero - que e o gesto errado, e ensina a "consertar"
testes -, ele passou a afirmar o que de fato guarda: que nenhum dos 14
requisitos anteriores a v0.7.0 sumiu, e que os acrescentados desde entao sao
exatamente `historySync`, `favoritesSync`, `verdictFreshness` e
`manualCodeLookup`. Quem trava o total exato e `A10`.

## A4 a A8, A11, A12, A13

```text
A4   npm run build                    OK
A5   npm --prefix backend test        224 testes, 223 pass, 0 fail, 1 SKIP
A6   suite contra PostgreSQL real     23/23 na suite de colecoes, 0 fail
A7   npm audit --audit-level=moderate 0 vulnerabilidades nos dois pacotes
A8   node scripts/verify-release.js   exit code 0
A11  gasto do gate por balde          colecoes 12, auth 3, assistente 2
A12  residuo NutriVa                  0 em codigo, interface e manifestos
A13  versao 0.7.3 nos 7 pontos        consistente
```

## O que esta versao NAO prova

```text
camera em hardware real        NAO EXECUTADO - exige aparelho com camera
decodificacao optica           NAO EXECUTADO - nenhuma imagem foi decodificada
Open Food Facts real           NAO EXECUTADO - a busca do gate e injetada
suite de colecoes no Neon      NAO EXECUTADO - por decisao de risco
carga simultanea real          NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA e esta versao nao a fecha.**

O que ela fez foi tornar o caminho POSTERIOR a decodificacao executavel e
auditavel. A parte optica - enquadramento, foco, leitura em embalagem amassada,
lanterna, confirmacao por leitura dupla - continua declarada e nao provada,
exatamente como estava na v0.6.9.

A busca a Open Food Facts e injetada no subgate de proposito: o que se prova e o
nosso caminho, nao a disponibilidade de terceiro. O efeito colateral honesto e
que o contrato real da API da Open Food Facts - formato da resposta, campos, 404
- nao e exercitado por nenhum gate.

Uma observacao que nao e defeito desta versao: `cleanBarcode`, usado no caminho
da camera, remove caracteres nao numericos. Um CODE_128 alfanumerico e portanto
mutilado antes da busca. Isso e anterior a esta versao e fora do escopo dela;
fica registrado para decisao.


## Auditoria da v0.7.2 - 2026-09-20

## Escopo

Correcao do defeito E1 e da ressalva E2 da auditoria externa da v0.7.1, mais a
execucao do gate E2E real.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, `shared/allergyVerdict.js`, todo o
`backend/src/ai/`, autenticacao, scrypt, sessoes e o schema do banco. Nenhuma
migration nova. Os limites de `auth` e `assistente` nao foram tocados.

A decisao da v0.7.1 de NAO implementar bypass foi mantida, como o auditor pediu.

## E1 - a chave por usuario tinha eliminado o teto por IP

### A afirmacao falsa

O comentario que a v0.7.1 deixou no codigo dizia:

```text
"Isso conserta o harness sem afrouxar nada"
```

Era falso, e o proprio texto documentava o contrario do que o codigo fazia.
`requireAuth` roda antes do limitador, entao toda requisicao que chega ali ja
tem sessao e o ramo de IP nunca executava. O teto por usuario **substituiu** o
teto por IP em vez de somar a ele.

### A1 - reproducao ANTES da correcao

App real contra PostgreSQL 17.10 real, contas criadas do mesmo endereco:

```text
Endereco de origem de todas as contas: 127.0.0.1
Teto por usuario declarado: 300 por 10 minutos

conta 0: 300 requisicoes aceitas, 429 na requisicao 301
conta 1: 300 requisicoes aceitas, 429 na requisicao 301
conta 2: 300 requisicoes aceitas, 429 na requisicao 301
conta 3: 300 requisicoes aceitas, 429 na requisicao 301

contas criadas do MESMO IP: 4
TOTAL de requisicoes de colecoes aceitas: 1200
teto efetivo por IP observado: 1200
```

Numero identico ao que o auditor mediu. Nao havia teto por IP nenhum: com mais
contas, o total crescia linearmente.

### A2 - DEPOIS da correcao

Mesmo script, 12 contas:

```text
conta 0: 300 requisicoes aceitas, 429 na requisicao 301
conta 1: 300 requisicoes aceitas, 429 na requisicao 301
conta 2: 300 requisicoes aceitas, 429 na requisicao 301
conta 3: 300 requisicoes aceitas, 429 na requisicao 301
conta 4: 300 requisicoes aceitas, 429 na requisicao 301
conta 5: 300 requisicoes aceitas, 429 na requisicao 301
conta 6: 300 requisicoes aceitas, 429 na requisicao 301
conta 7: 300 requisicoes aceitas, 429 na requisicao 301
conta 8: 300 requisicoes aceitas, 429 na requisicao 301
conta 9: 300 requisicoes aceitas, 429 na requisicao 301
conta 10: 0 requisicoes aceitas, 429 na requisicao 1
conta 11: 0 requisicoes aceitas, 429 na requisicao 1

contas criadas do MESMO IP: 12
TOTAL de requisicoes de colecoes aceitas: 3000
```

O total para em exatamente 3000, o teto por IP, e as contas 10 e 11 sao
recusadas na PRIMEIRA requisicao. Criar conta nova deixou de ser um caminho para
mais cota.

Nota de honestidade sobre essa saida: o script de reproducao imprime, ao final,
a frase "E1 REPRODUZIDO" sempre que o total passa do teto por usuario. Na
execucao pos-correcao essa frase aparece e esta ERRADA - o rotulo compara com o
teto por usuario, nao com o de IP. Os numeros acima e que valem, e eles mostram
o teto por IP funcionando. O rotulo foi corrigido depois da captura.

### A composicao escolhida

```js
export function criarLimitadoresDeColecoes({ tetoPorUsuario, tetoPorIp, janelaMs }) {
  const porUsuario = rateLimit({ ..., keyGenerator: collectionsRateLimitKey });
  const porIp      = rateLimit({ ..., keyGenerator: collectionsIpRateLimitKey });
  return [porUsuario, porIp];
}
```

Os dois rodam em sequencia. Passar exige caber nos dois; qualquer um recusando
termina em 429, fail-closed.

**A ordem nao e estilo.** O teto por usuario e conferido primeiro. Com o de IP
na frente, a requisicao 301 de um usuario abusivo passaria pelo contador de IP -
incrementando-o - para so entao ser recusada pelo contador de usuario. O abusivo
gastaria orcamento compartilhado com requisicoes que nem foram atendidas,
punindo os vizinhos de NAT. Com o usuario na frente, a recusa acontece antes de
tocar no contador de IP.

Isso tem teste proprio (`R4 a requisicao recusada pelo teto de usuario nao
consome orcamento do IP`) e mutante proprio (`N3`, que inverte a ordem).

### Alternativas descartadas

```text
so teto por IP                     era D1: quebra a suite de integracao e pune NAT
so teto por usuario                era E1: contas novas contornam o teto
teto por IP baixo, perto de 300    traz D1 de volta (a suite gasta 372)
bypass so para teste               recusado na v0.7.1 e reafirmado pelo auditor
teto global por rota               nao distingue abusivo de usuario legitimo
```

## A3 - a medicao que sustenta o teto por IP

### Requisicao 4.2 (a): a suite de integracao

A suite foi instrumentada - contagem no unico ponto por onde todas as
requisicoes passam - e o numero e reportado a cada execucao:

```text
[R11] gasto de colecoes desta suite: 372 de 3000 (folga 8.06x)
```

**372 requisicoes de colecoes de um unico IP.** Isso explica D1 de forma
definitiva: contra o teto de 300 por IP da v0.7.0, a suite estourava no oitavo
teste. O contador do limitador e de modulo e sobrevive aos servidores que cada
teste sobe e derruba, entao o gasto e a soma de tudo.

### Requisicao 4.2 (b): o gate E2E

`scripts/e2e-real.js` ja media o proprio gasto desde a v0.7.1:

```text
colecoes    9 requisicoes
auth        3 requisicoes
assistente  2 requisicoes
```

### Requisicao 4.2 (c) e (e): o teto escolhido e a folga

```text
teto por IP escolhido        3000 por 10 minutos
maior gasto medido            372 (suite de integracao)
folga                        8,06x
```

### Requisicao 4.2 (d): por que 3000, e nao um numero perto de 300

A restricao que manda **nao e o teste** - e o caso NAT/CGNAT, que foi a
motivacao original do teto por usuario. Atras de NAT corporativo ou de CGNAT de
operadora, comum no celular, varias pessoas legitimas compartilham um endereco.

O modelo declarado: uso intenso de verdade gira em torno de **60 requisicoes de
colecoes por 10 minutos por pessoa** - cada produto aberto grava uma linha de
historico, mais as leituras de lista. 3000 acomoda cerca de **50 pessoas nesse
ritmo** atras do mesmo endereco, ou 10 pessoas gastando a cota individual
inteira.

Do outro lado, ele contem de verdade: antes, um endereco nao tinha teto algum e
crescia com o numero de contas; agora para em 3000 por janela, independentemente
de quantas contas o atacante criar.

A folga de 8x e generosa de proposito. O teto por IP e rede de contencao contra
abuso multiconta, nao o controle primario, e voltar a quebrar a suite de
integracao seria repetir D1 - o defeito cujo custo foi uma versao inteira sem os
testes de isolamento rodarem.

### A folga e conferida sozinha, a cada execucao

`R11` reprova se a folga cair abaixo de 4x, com mensagem que explica o que fazer.
Se um teste novo empurrar o gasto da suite, o aviso chega antes de virar falha
por quota com `Unexpected token 'T', "Too many r"`.

## 4.3 - restricoes de seguranca do mecanismo

### Nenhum bypass

Nenhuma variavel de ambiente, cabecalho, query string ou cookie desliga qualquer
um dos dois limitadores. Provado por `Q3` e `Q4`, e por mutacao (`M3`, `M3b`).

### Nenhum dado do request escolhe balde

`R5` prova por comportamento, com os dois baldes testados separadamente:

```text
R5 dados forjados no request nao conseguem balde de USUARIO novo
R5 dados forjados no request nao conseguem balde de IP novo
```

Quinze tentativas ao todo: `x-usuario`, `x-user-id`, `x-teste-usuario`, cookie,
`x-rate-limit`, query de usuario, query de desligamento, `X-Forwarded-For`,
`X-Real-IP`, `X-Client-IP`, `True-Client-IP`, `CF-Connecting-IP`, `Forwarded`,
`X-Originating-IP` e query de IP. Todas continuam recebendo 429.

### `trust proxy` conferido por medicao

`env.trustProxy` liga `app.set("trust proxy", 1)` em producao. Medido nesta
versao, com um servidor real:

```text
XFF ausente                          -> req.ip = 127.0.0.1
XFF "203.0.113.9"                    -> req.ip = 203.0.113.9
XFF "1.2.3.4, 203.0.113.9"           -> req.ip = 203.0.113.9
XFF "9.9.9.9, 8.8.8.8, 203.0.113.9"  -> req.ip = 203.0.113.9
```

`req.ip` e sempre o ultimo valor, que e o que o proxy do Render acrescenta. O
cliente pode prefixar o que quiser e nao muda a propria identidade. E e por isso
que o teto por IP nao vira teto global: sem `trust proxy`, todos apareceriam com
o endereco do proxy.

### IPv6: o /64 e a unidade

Quem recebe um `/64` da operadora tem 2^64 enderecos. Sem normalizar, trocar de
endereco a cada requisicao daria um balde novo toda vez e o teto por IP seria
enfeite - protegeria nada, que e uma das condicoes de bloqueio da secao 11.

```text
2001:db8:1234:5678::1           -> ip:2001:db8:1234:5678::/64
2001:db8:1234:5678:aaaa:b:c:d   -> ip:2001:db8:1234:5678::/64
2001:db8:1234:9999::1           -> ip:2001:db8:1234:9999::/64   (outro bloco)
::ffff:203.0.113.9              -> ip:203.0.113.9               (IPv4 mapeado)
```

`express-rate-limit` 7.5.1 nao exporta o auxiliar `ipKeyGenerator`, entao a
normalizacao e propria e tem teste (`R5 um bloco IPv6 /64 nao vira infinitos
baldes`) e mutante (`N5`).

## 4.4 - o comentario falso

Removido. O comentario novo descreve a composicao dos dois tetos, cita a medicao
de 1200 requisicoes de 4 contas do mesmo IP como o motivo de o teto por IP
existir, e explica por que a ordem de verificacao importa.

## E2 - disciplina de escopo

Entrada retroativa gravada no CHANGELOG, nomeando os cinco artefatos e por que
entraram:

```text
src/components/allergies/AllergyPicker.jsx   commit 641aa5f
src/styles-v070.css                          commit 641aa5f
public/nutriscan-icon.svg                    commit 641aa5f
public/nutriscan-logo.png                    commit 641aa5f
scripts/pack-release.ps1                     commit 7b19c6e
```

Os quatro primeiros vieram no commit que aplicou o pacote de design enviado pelo
dono do projeto. `pack-release.ps1` entrou no commit da v0.7.1.

### Duas alteracoes desta versao que PRECISAM de decisao do auditor

A secao 5 manda descrever em vez de implementar. Estas duas foram implementadas
porque sao consequencia direta de falhas ocorridas durante o proprio trabalho
desta versao, dentro da maquinaria que a secao 8 exige. Ficam declaradas aqui
para julgamento:

**1. `scripts/mutation-check.js` ganhou um jornal de restauracao em disco.**
A versao anterior confiava em `process.on("exit")`. Uma execucao desta versao foi
interrompida de fora, o manipulador nao rodou, e a arvore de trabalho ficou com a
mutacao aplicada: `TETO_COLECOES_POR_USUARIO = 100000`, ou seja, o limitador de
producao praticamente desligado. Um script que injeta defeitos de proposito nao
pode depender de sair com educacao. Se o auditor preferir reverter, o defeito que
isso evita esta descrito e pode ser reintroduzido.

**2. `backend/tests/rateLimit.test.js` deixou de derivar o teto de producao da
constante que vigia.** Descrito adiante, em "o que a mutacao encontrou".

Fora esses dois e o que as secoes 4 e 6 pedem, nada novo foi entregue.

## A4 - R1 a R11

```text
✔ R1  usuario dentro do teto mas IP estourado recebe 429
✔ R2  IP dentro do teto mas usuario estourado recebe 429
✔ R3  multiplas contas do mesmo IP nao ultrapassam o teto por IP
✔ R4  usuarios de IPs distintos nao consomem cota um do outro
✔ R4  dois usuarios atras do MESMO IP mantem cotas separadas ate o teto do IP
✔ R4  a requisicao recusada pelo teto de usuario nao consome orcamento do IP
✔ R5  dados forjados no request nao conseguem balde de USUARIO novo
✔ R5  dados forjados no request nao conseguem balde de IP novo
✔ R5  com trust proxy o cliente nao escolhe o proprio IP
✔ R5  a chave de usuario vem da sessao, e a de IP vem de req.ip
✔ R5  um bloco IPv6 /64 nao vira infinitos baldes
✔ R6  os tres tetos por rota seguem nos valores declarados
✔ R7  o teto por IP esta no valor medido, e ele cobre as suites com folga
ℹ tests 17, pass 17, fail 0, skipped 0
```

R8, R9 e R11 ficam na suite de integracao, contra PostgreSQL real:

```text
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
✔ R11 o gasto de colecoes desta suite cabe no teto por IP
[R11] gasto de colecoes desta suite: 372 de 3000 (folga 8.06x)
ℹ tests 19, pass 19, fail 0, skipped 0
```

**R8 confirmado: 19/19 com o teto por IP ligado, zero SKIP, zero falha por
quota.** D1 nao voltou.

R10, a regressao C1:

```text
✔ T1 exploit C1: modelo negando conflito nao entrega falso seguro
✔ T2 piso de risco: com conflito declarado o safety final nunca e normal
✔ T3 barreira 1: schema rejeita allergyVerdict vindo do modelo
✔ T3 barreira 2: veredito entregue vem do motor mesmo se o campo chegar montado
ℹ tests 12, pass 12, fail 0
```

## A5 - validacao por mutacao

`scripts/mutation-check.js` injeta o defeito, roda os testes que deveriam
pega-lo e EXIGE que fiquem vermelhos. Os quatro mutantes sugeridos pelo auditor
estao entre os catorze.

```text
N1   R1/R3 MORTA  remove o teto por IP e deixa so o de usuario (o defeito E1)
N1b  R3    MORTA  remove o teto por IP: multiplas contas voltam a passar sem limite
N2   R2    MORTA  remove o teto por usuario e deixa so o de IP (o defeito D1)
N2b  R4    MORTA  remove o teto por usuario: vizinhos de NAT voltam a se derrubar
N3   R4    MORTA  confere o IP antes do usuario: recusas gastam cota do IP
N4   R5    MORTA  le o balde de IP de um cabecalho do request
N5   R5    MORTA  para de normalizar IPv6: um bloco /64 vira 2^64 baldes
M1   R6    MORTA  afrouxa o teto de autenticacao de 40 para 100
M2   R7    MORTA  derruba o teto por IP para 300, valor que quebraria a suite
M3   Q3    MORTA  cria um bypass por variavel de ambiente
M3b  Q4    MORTA  adiciona um skip acionado por cabecalho
M4   Q2    MORTA  eleva o teto por usuario a um valor inalcancavel
M6   R9    MORTA  remove o filtro por dono da leitura de historico
M7   R9    MORTA  remove o filtro por dono da remocao de favorito

mortas 14 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

**Nenhum mutante sobreviveu na rodada final.** Mas dois sobreviveram antes, e os
dois apontavam defeitos reais nos testes.

### O que a mutacao encontrou - 1: um balde escondia o outro

`N4` troca a chave de IP por um cabecalho do request. Na primeira rodada ele
**SOBREVIVEU** ao teste comportamental de `R5` e foi pego apenas pela leitura do
codigo-fonte, que e a rede mais fraca das duas.

A causa: `R5` rodava com os dois tetos em 10. O teto por usuario e conferido
primeiro, entao era sempre ele quem devolvia o 429, e o balde de IP ficava
escondido atras dele. Forjar o cabecalho criava um balde de IP novo, mas a
resposta continuava 429 por outro motivo, e o teste nao via diferenca.

A correcao nao foi alargar a expressao do teste de texto. `R5` virou dois testes,
cada um com o OUTRO teto folgado, de modo que se saiba exatamente qual limitador
produziu a recusa. Com isso `N4` morre por comportamento.

### O que a mutacao encontrou - 2: um teste que lia a constante que vigiava

`M4` infla `TETO_COLECOES_POR_USUARIO` para 100000. `Q2` montava o laco com
`TETO_COLECOES_POR_USUARIO + 1` e, em vez de falhar, saiu fazendo 100001
requisicoes ate estourar o tempo.

Um teste que deriva a expectativa da mesma constante que deveria vigiar nao
vigia nada: se alguem inflar a constante, o teste infla junto e continua verde.
O valor de producao passou a ser escrito a mao no teste, e `R6` e quem confere
que a constante bate com ele. Os dois precisam concordar.

Essa execucao interrompida e a que deixou a mutacao no repositorio, e foi o que
motivou o jornal de restauracao declarado na secao de escopo.

## A14 - os 17 requisitos strict continuam exigidos

`findMissingRequirements({})` com a flag da Anthropic ligada:

```text
 1. backendProcess       7. isolation            13. historySync
 2. database             8. logout               14. favoritesSync
 3. migrations           9. assistantAuthority   15. verdictFreshness
 4. auth                10. deterministicEngine  16. anthropicReal
 5. sessionSchema       11. fallback             17. assistantAuthenticated
 6. multiDevice         12. privacy

TOTAL: 17
```

Sem a flag sao 15; os dois ultimos sao condicionais a ela, por desenho. Nenhum
requisito foi removido nesta versao.

## A15 - residuo do nome antigo

Varredura por `nutriva`, sem distincao de maiuscula:

```text
src/, backend/src/, shared/, public/, index.html    0 ocorrencias
package.json, backend/package.json, os 2 lockfiles  0 ocorrencias
```

Onde ainda aparece, e por que e correto que apareca:

```text
CHANGELOG.md                  secoes historicas: registro do que aconteceu
AUDIT_REPORT.md               secao historica
backend/tests/productName.test.js   guarda o nome antigo como padrao de deteccao
releases/README.md            cita o nome do pacote v0.6.9, com justificativa
releases/SHA256SUMS.txt       nome do arquivo entregue ao auditor na v0.6.9
```

O pacote `nutriva-v0.6.9-auditoria.zip` nao foi renomeado de proposito: foi assim
que saiu e foi assim que o auditor o recebeu. Renomea-lo quebraria a
correspondencia com o `SHA256SUMS.txt`.

## A13 - o gate E2E real, com credenciais reais

**PASS, exit code 0.** Primeira versao do projeto em que o gate completo fecha.

```text
[OK] doctor:e2e
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

```text
mode                    strict
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
ok                      true
```

`anthropicReal` saiu de `NOT_EXECUTED`. Nenhum subgate ficou em SKIP.

Saida literal completa, tabela de subgates e `E2E_LAST_RUN.json` integral estao
no E2E_REPORT desta versao.

### Residuo no banco apos a execucao

```text
users 4 | sessions 5 | product_history 0 | product_favorites 0
residuo de teste: 0 em todos os seis padroes conferidos
linhas orfas: 0
```

Os 4 usuarios sao contas reais, anteriores a execucao.

### Uma decisao de risco, declarada

O gate rodou contra o **Neon de producao**, por escolha explicita do dono do
projeto, depois de eu apresentar por escrito o risco e o precedente da v0.6.6 -
quando um `npm test` com a string de producao deixou linha de teste em producao.

A precaucao tomada: `RUN_DB_INTEGRATION_TESTS` foi mantida DESLIGADA em toda
execucao apontada para o Neon. Essa flag libera a suite de colecoes, que sozinha
grava 201 favoritos e mais de 100 linhas de historico. Ela rodou apenas contra o
PostgreSQL 17.10 local.

### Exposicao de credencial ocorrida durante esta versao

Ao pedir que o dono preenchesse `backend/.env`, eu mesmo criei o arquivo antes.
Como o ambiente passa a rastrear arquivos que eu escrevo, o conteudo salvo
voltou inteiro para o meu contexto - `DATABASE_URL` e `ANTHROPIC_API_KEY`
incluidos. A regra 6.1 do prompt manda parar e avisar nesse caso, e foi o que
aconteceu.

O dono foi avisado, recomendou-se a troca das duas credenciais, e ele decidiu
seguir com a execucao e trocar ao fim do projeto. A decisao e dele e esta
registrada aqui. **A troca continua pendente.**

O procedimento correto, para a proxima vez: nao criar nem ler o arquivo de
credencial: pedir que o dono o crie do zero.

## A8 a A12 - gates de codigo

```text
A8   npm run build                    OK, built in 6.51s
A9   npm --prefix backend test        188 testes, 187 pass, 0 fail, 1 SKIP
A10  suite contra PostgreSQL real     19/19, 0 fail, 0 skip
A11  npm audit --audit-level=moderate found 0 vulnerabilities nos dois pacotes
A12  node scripts/verify-release.js   exit code 0
```

### O unico SKIP da suite, declarado

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental num `npm test` comum. **NAO EXECUTADO
nao conta como PASS.** A propriedade que ele cobriria foi provada de outro jeito
nesta versao: o gate E2E fez as duas chamadas reais a Claude, com
`anthropicReal: EXECUTED_GENERIC_AND_PRODUCT`.

### Uma leitura que pode enganar, declarada

`verify:release` roda sem `RUN_DB_INTEGRATION_TESTS`, e a partir desta versao
existe um `DATABASE_URL` em `backend/.env`. A combinacao faz as suites de banco
se declararem NAO EXECUTADO em vez de ausentes, e a contagem do gate sai assim:

```text
ℹ tests 188
ℹ pass 163
ℹ fail 0
ℹ skipped 25
```

**Os 25 SKIP nao sao regressao e nao sao PASS.** Sao as mesmas suites que rodam
verdes com a flag ligada - 19 de colecoes, 5 de integracao e 1 da chamada paga.
A execucao autoritativa e a de cima, com a flag ligada, contra PostgreSQL local:
187 pass, 1 skip.

A flag ficou desligada de proposito em toda execucao apontada para o Neon de
producao, pelo motivo descrito na secao de risco.

## O que esta versao NAO prova

```text
camera real em aparelho        NAO EXECUTADO - exige hardware
carga simultanea real          NAO EXECUTADO - o limitador foi provado em processo
suite de colecoes no Neon      NAO EXECUTADO - por decisao de risco, descrita acima
```

O teto por IP foi provado contra um servidor Express real, em processo, e contra
o app real com contas criadas de verdade no banco. Ele nao foi exercitado com
usuarios simultaneos atras de um NAT real - o modelo de 50 pessoas a 60
requisicoes e uma estimativa declarada, nao uma medicao de campo. Se a producao
mostrar 429 em usuario legitimo, o numero precisa ser revisto com dado real.

Um aviso de depreciacao do driver `pg` sobre `sslmode=require` aparece em toda
conexao ao Neon. Nao e erro e nao afeta o resultado; ficou sem correcao de
proposito, por estar fora do escopo desta versao.


## Auditoria da v0.7.1 - 2026-09-20

## Escopo

Correcao do defeito D1 da auditoria externa da v0.7.0 e verificacao do defeito
D2 da mesma auditoria.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, `shared/allergyVerdict.js`, todo o
`backend/src/ai/`, autenticacao, scrypt, sessoes e o schema do banco. Nenhuma
migration nova.

## Abordagem escolhida para D1

O prompt de versao oferecia duas saidas. Foi escolhida a **(a): contagem por
usuario da sessao, com reserva por IP**. A opcao (b), um bypass so de teste,
foi recusada.

O motivo e direto: um bypass e uma porta. Mesmo escrito para ser impossivel de
abrir em producao, ele existe no binario que roda em producao, e a garantia de
que nao pode ser aberto passa a depender de uma condicao que alguem precisa
manter correta para sempre. A alternativa nao tem porta nenhuma para guardar.

A escolha tambem resolve um problema real de producao, independente do teste:
atras de NAT corporativo ou CGNAT de operadora - situacao comum no celular, que
e onde este app vive - varios usuarios compartilham um IP, e antes um deles
sozinho podia consumir a cota de todos.

**Consequencia formal: Q3 e Q4 do prompt, que so valem "se escolher a abordagem
de bypass", nao se aplicam.** Nao ha mecanismo de bypass para testar. No lugar
deles foi provada uma propriedade mais forte - que a porta nao existe - e os
testes correspondentes estao registrados abaixo com os nomes Q3 e Q4 para
manter a rastreabilidade com o prompt.

## A correcao

`backend/src/middleware/rateLimit.js`:

```js
export function collectionsRateLimitKey(req) {
  const userId = req?.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req?.ip ?? "desconhecido"}`;
}

export const collectionsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: collectionsRateLimitKey,
});
```

O diff util tem nove linhas. `requireAuth` ja rodava antes deste middleware nas
duas rotas - essa ordem e anterior a esta versao e nao foi alterada -, entao
`req.user` esta disponivel quando a chave e calculada.

A reserva por IP quase nao e usada aqui, porque `requireAuth` devolve 401 sem
sessao valida. Ela existe para que o limitador continue seguro se alguem o
montar numa rota publica no futuro, e para que uma requisicao sem IP conhecido
nao vire chave vazia, que juntaria todos os anonimos num balde so.

## Q1 - a suite de integracao contra PostgreSQL real

PostgreSQL 17.10 real, porta 5433, binarios em
`C:\Users\diego\AppData\Local\nutriscan-pg`.

ANTES da correcao:

```text
ℹ tests 18
ℹ pass 9
ℹ fail 9
```

A primeira falha era F4, e a mensagem era sempre a mesma:

```text
SyntaxError: Unexpected token 'T', "Too many r"... is not valid JSON
```

DEPOIS da correcao:

```text
✔ H1  ✔ F1  ✔ H2  ✔ H3  ✔ H4  ✔ F2  ✔ F3
✔ F4 o limite de favoritos e aplicado e devolve erro, sem podar (3464.6631ms)
✔ S1  ✔ S2  ✔ S3  ✔ I1  ✔ I2  ✔ I3
✔ I4 e V1  ✔ A1  ✔ D1  ✔ a migration aplica e reaplica sem quebrar
ℹ tests 18
ℹ pass 18
ℹ fail 0
ℹ skipped 0
```

**Zero SKIP.** Nenhum teste foi removido, comentado, marcado como `todo` ou
transformado em SKIP permanente. Nenhuma assercao foi enfraquecida.

## Q2 - o limitador recusa em limite+1, em producao, sem bypass

`backend/tests/rateLimit.test.js`. O teste sobe um servidor real com
`NODE_ENV=production`, faz 301 requisicoes autenticadas e conta:

```text
✔ Q2 em producao o limitador recusa na requisicao seguinte ao teto (3388.2326ms)
```

Assercoes: exatamente 300 respostas 200, e a requisicao 301 devolve 429.

## Q3 e Q4 - NAO APLICAVEL como escritos; a porta nao existe

Nao ha mecanismo de bypass, entao nao ha o que ligar ou desligar. O que foi
provado no lugar:

```text
✔ Q4 nenhum dado vindo do request consegue um balde novo (3445.1711ms)
✔ Q4 o limitador nao tem opcao de pular requisicao (3.7896ms)
✔ Q3 nenhuma variavel de ambiente desliga o limitador (1.199ms)
✔ Q3 o limitador esta montado em todas as rotas de colecoes (2.6188ms)
```

O primeiro e prova de comportamento, nao de texto-fonte: a sessao e sempre a
mesma pessoa, a cota e esgotada, e nove tentativas de conseguir um balde novo
continuam recebendo 429 - cabecalho de usuario, cabecalho de id, cabecalho de
autor, `X-Forwarded-For`, `X-Real-IP`, cookie, cabecalho de desligamento, query
de usuario e query de desligamento.

## Q5 - os tres limites de producao seguem nos valores declarados

```text
auth          windowMs: 15 * 60 * 1000    limit: 40
assistente    windowMs: 10 * 60 * 1000    limit: 20
colecoes      windowMs: 10 * 60 * 1000    limit: 300
```

```text
✔ Q5 os tres limitadores mantem janela e teto declarados (6.5745ms)
```

Nenhum dos tres foi afrouxado. O que mudou em colecoes foi a quem o limite se
aplica, nao o valor.

## Q6 - orcamento de requisicoes da suite E2E, com margem

Corrigir colecoes nao resolve auth nem assistente: os dois continuam contando
por IP, e todos os clientes da suite saem do mesmo endereco. A suite passou a
contar o proprio gasto e a reprovar se ultrapassar metade do teto. Medido na
execucao desta versao:

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

As requisicoes de colecoes caem num balde so de proposito. Separar por cliente
pareceria mais preciso e seria errado: `clientB` faz login com o e-mail de A,
entao dois dos tres clientes da suite sao a mesma conta e dividem o balde. Um
orcamento que se engana para menos nao serve para nada.

O limite e fail-closed: estourar a margem lanca antes de `report.ok = true`.

## Q7 - a regressao de isolamento esta verde e detecta quebra real

```text
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
```

Verde nao basta - veja a validacao por mutacao adiante, que prova que estes
testes ficam vermelhos quando o isolamento e quebrado de verdade.

## Q8 - a regressao C1 continua bloqueada

```text
✔ T1 exploit C1: modelo negando conflito nao entrega falso seguro (319.2708ms)
✔ T2 piso de risco: com conflito declarado o safety final nunca e normal
✔ T3 barreira 1: schema rejeita allergyVerdict vindo do modelo
✔ T3 barreira 2: veredito entregue vem do motor mesmo se o campo chegar montado
ℹ tests 12
ℹ pass 12
ℹ fail 0
```

## Q9 - o limiar de auditoria continua moderate

`scripts/verify-release.js:82-83`:

```js
["frontend audit", () => npmCommand(["audit", "--audit-level=moderate"], { inherit: true })],
["backend audit",  () => npmCommand(["--prefix", "backend", "audit", "--audit-level=moderate"], { inherit: true })],
```

Travado por `backend/tests/auditThreshold.test.js`, que reprova se o limiar
subir para `high` ou `critical` ou se qualquer uma das duas etapas sumir.

## Validacao por mutacao

`scripts/mutation-check.js` injeta defeitos reais, roda os testes que deveriam
pega-los e exige que fiquem vermelhos. O codigo original e restaurado sempre,
inclusive se o processo for interrompido.

```text
M1   Q5   MORTA   "Q5 os tres limitadores mantem janela e teto declarados" falhou, como deveria
M2   Q2   MORTA   "Q2 em producao o limitador recusa na requisicao seguinte ao teto" falhou, como deveria
M3   Q3   MORTA   "Q3 nenhuma variavel de ambiente desliga o limitador" falhou, como deveria
M4   Q4   MORTA   "Q4 nenhum dado vindo do request consegue um balde novo" falhou, como deveria
M4b  Q4   MORTA   "Q4 o limitador nao tem opcao de pular requisicao" falhou, como deveria
M5   D1   MORTA   "D1 a cota de um usuario nao consome a cota de outro" falhou, como deveria
M6   Q7   MORTA   "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7   Q7   MORTA   "I2 usuario B nao remove item de A" falhou, como deveria
======
mortas 8 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Os defeitos injetados: afrouxar o teto de auth para 100; elevar o teto de
colecoes a um valor inalcancavel; criar um bypass por variavel de ambiente;
fazer a chave depender de um cabecalho do cliente; adicionar um `skip` acionado
por cabecalho; voltar a contar por IP; remover o filtro `user_id` da leitura de
historico; remover o filtro `user_id` da remocao de favorito.

### A mutacao encontrou um defeito real nesta versao

Na primeira rodada, **M4 sobreviveu**. O teste Q4 original procurava `req.get`
no codigo-fonte, e a mutacao escreveu `req?.get?.(`, com encadeamento opcional.
A expressao nao casava, e o defeito passou despercebido.

Isso nao foi corrigido alargando a expressao e seguindo em frente. Casar texto
e fragil justamente onde a propriedade importa: a proxima forma de escrever a
mesma leitura volta a escapar. O teste foi refeito como prova de comportamento,
e a versao de texto-fonte ficou como reforco, agora cobrindo as duas formas de
escrita. Com o teste novo, M4 morre.

Este e o argumento a favor de exigir mutacao: sem ela, o relatorio teria
declarado Q4 aprovado com um teste que nao protegia nada.

## D2 - verificacao da correcao P2 da v0.6.9

Saida literal das duas execucoes:

```text
$ npm audit --audit-level=moderate
found 0 vulnerabilities
[exit code: 0]

$ npm --prefix backend audit --audit-level=moderate
found 0 vulnerabilities
[exit code: 0]
```

Os tres avisos moderate em `qs` (GHSA-x5fp-wj9c-mxmx e GHSA-4mjr-xmp4-gh2g) que
motivaram P2 nao reaparecem. A correcao esta efetiva.

## A12 - os 17 requisitos strict continuam exigidos

`findMissingRequirements({})` com a flag da Anthropic ligada:

```text
 1. backendProcess      7. isolation          13. historySync
 2. database            8. logout             14. favoritesSync
 3. migrations          9. assistantAuthority 15. verdictFreshness
 4. auth               10. deterministicEngine 16. anthropicReal
 5. sessionSchema      11. fallback           17. assistantAuthenticated
 6. multiDevice        12. privacy

TOTAL: 17
```

Sem a flag, 15 - os dois ultimos sao condicionais a ela, por desenho. Nenhum
requisito foi removido nesta versao.

## A13 - residuo do nome antigo

Varredura por `nutriva`, sem distincao de maiuscula, em todo o repositorio
exceto `node_modules/`, `.git/`, `dist/` e `releases/`:

```text
codigo-fonte (src/, backend/src/, shared/)     0 ocorrencias
interface e assets (public/, index.html)       0 ocorrencias
manifestos e lockfiles                         0 ocorrencias
```

O que resta e registro historico e esta correto que permaneca: as secoes
antigas do CHANGELOG, a secao historica do AUDIT_REPORT, e
`backend/tests/productName.test.js`, que guarda o nome antigo como padrao
justamente para detecta-lo se ele voltar.

### A primeira varredura passou por cima de um residuo real

A varredura acima excluiu `releases/` junto com `node_modules/` e `dist/`, por
serem pastas que nao vao para o repositorio. Ao abrir a pasta para gerar o
pacote desta versao, `releases/README.md` estava assim:

```text
# Pacotes de auditoria do NutriVa
...
$zip = [...]::OpenRead("releases\nutriva-vX.Y.Z-auditoria.zip")
Get-FileHash releases\nutriva-vX.Y.Z-auditoria.zip -Algorithm SHA256
```

Titulo e exemplos com o nome antigo, e a tabela de pacotes parada na v0.6.9.
Corrigido nesta versao.

O nome do arquivo `nutriva-v0.6.9-auditoria.zip` **nao** foi alterado, de
proposito: foi assim que o pacote saiu e foi assim que o auditor o recebeu.
Renomea-lo agora quebraria a correspondencia com o `SHA256SUMS.txt` e com o
registro da auditoria. A justificativa esta escrita no proprio README.

`P1t` nao teria pego isso: ele verifica codigo, manifesto, lockfile e interface,
e `releases/` nao e nenhum dos quatro. O aprendizado e sobre a varredura, nao
sobre o teste - "nao vai para o repositorio" nao e o mesmo que "nao importa".

## Resultado dos gates

```text
npm run build                          OK (built in 15.40s)
npm --prefix backend test              179 testes, 178 pass, 0 fail, 1 SKIP
npm audit --audit-level=moderate       0 vulnerabilidades (frontend e backend)
node scripts/verify-release.js         OK (build, testes, audit, secret scan)
npm run e2e:real                       ok: true (PostgreSQL 17.10 real)
npm run verify:e2e                     FAIL BEFORE CALL (exit 1) - sem chave
```

### O unico SKIP, declarado

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental, e se declara `NAO EXECUTADO`. **Nao
conta como PASS.** Nenhuma chave foi usada e nenhuma chamada paga foi feita.

## O que esta versao nao prova

```text
Claude real                    NAO EXECUTADO - sem ANTHROPIC_API_KEY no ambiente
camera real em aparelho        NAO EXECUTADO - exige hardware
comportamento sob Neon         NAO EXECUTADO - testado contra PostgreSQL 17.10 local
```

O limitador foi provado contra um servidor Express real, em processo, com
`NODE_ENV=production`. Ele nao foi exercitado contra o Render com varios
usuarios simultaneos.

Uma observacao que nao e defeito desta versao mas vale registro: em producao
`trust proxy` esta ligado (`backend/src/app.js:62`), o que faz `req.ip` vir do
`X-Forwarded-For`. A reserva por IP deste limitador seria, portanto, influenciavel
por cabecalho em producao - mas ela e inalcancavel nas rotas de colecoes, porque
`requireAuth` roda antes e devolve 401 sem sessao. Se alguem montar este
limitador numa rota publica no futuro, isso precisa ser reavaliado.


## Auditoria da v0.7.0 - 2026-09-18

## Escopo

Historico de consultas, favoritos e sincronizacao entre dispositivos, mais as
quatro pendencias herdadas da auditoria externa da v0.6.9.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, todo o `backend/src/ai/`, autenticacao,
scrypt, sessoes e o schema existente. `shared/allergyVerdict.js` nao foi tocado.

## Parte zero - as quatro pendencias

### P1 - o produto volta a se chamar NutriScan

O prompt de versao afirmava que a arvore de trabalho ja tinha voltado para
NutriScan e que faltava apenas verificar. **A premissa estava errada.** A
verificacao encontrou:

```text
package.json               name=nutriva
backend/package.json       name=nutriva-backend
package-lock.json          nutriva
backend/package-lock.json  nutriva-backend
87 ocorrencias em 32 arquivos
```

O historico tem um unico commit de renomeacao, `f740658`
("Renomeia o produto de NutriScan para NutriVa"), de 04/09/2026. Nao houve
reversao nenhuma. A divergencia foi levada ao dono do projeto antes de qualquer
alteracao, porque renomear o produto e decisao dele, nao do executor; ele
confirmou NutriScan.

Normalizacao aplicada a todos os 32 arquivos. Excecoes, cada uma justificada:

```text
CHANGELOG.md                 registro do que aconteceu, inclusive a renomeacao
AUDIT_REPORT / E2E_REPORT    apenas a secao historica, que cita o nome vigente
                             na epoca de cada versao
```

Tres identificadores NAO mudaram, e nunca mudaram em nenhuma das trocas:

```text
nutriscan:users             localStorage - trocar faz o app perder contas locais
nutriscan:guest-allergies   localStorage - trocar apaga alergias do visitante
nutriscan_session           cookie - trocar desloga todo mundo em producao
```

`backend/tests/productName.test.js` passa a reprovar se o nome antigo voltar a
codigo, manifesto, lockfile ou interface, e exige que os quatro manifestos
declarem `nutriscan`. A lista de excecoes esta justificada por escrito dentro do
proprio arquivo.

### P2 - o gate ignorava vulnerabilidade moderate

Reproduzido: `npm --prefix backend audit` reportava tres avisos moderate em
`qs`, puxado por `express` e `body-parser` - GHSA-x5fp-wj9c-mxmx (bypass de
array-limit) e GHSA-4mjr-xmp4-gh2g (DoS via isBuffer controlado por atacante).
O gate reportava `[OK]` porque as duas linhas de audit usavam
`--audit-level=high`.

`npm audit fix` resolveu nos dois pacotes, sem breaking change e sem `--force`.
O limiar do gate desceu para `moderate`, e
`backend/tests/auditThreshold.test.js` reprova se alguem subir de volta ou
remover uma das duas etapas de audit.

### P3 - render.yaml sem registro

Entrada retroativa no CHANGELOG e secao de deploy no README, descrevendo o
blueprint, o motivo de `--include=dev` no build e o motivo de o PostgreSQL ficar
no Neon e nao no Render.

### P4 - versao publicada divergindo da versao em execucao

`scripts/version-check.js` compara a versao de `package.json` com a anunciada
por `/api/health` de um deploy. Exit 0 quando batem, exit 1 quando divergem, e
exit 1 tambem quando nao da para consultar - nao conseguir perguntar nao e
aprovacao.

Exercitado nos tres caminhos. Contra producao, ele encontrou a divergencia real
que motivou o item:

```text
[FAIL] version:check - repositorio declara 0.7.0 e o deploy anuncia 0.6.8
```

## Modelo de dados

```sql
CREATE TABLE IF NOT EXISTS product_history (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  product_brand text,
  image_url text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_history_user_product_unique UNIQUE (user_id, product_code)
);

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
```

Nenhuma coluna guarda veredito de alergia, nivel de risco ou alergenico
detectado. O perfil muda com o tempo, e um veredito congelado vira informacao de
seguranca errada - o produto seguro em marco deixa de ser quando a pessoa marca
uma alergia nova em abril.

## Decisoes, e por que

### Limites

```text
historico   100 itens, poda o mais antigo em silencio
favoritos   200 itens, recusa com 409 e nao poda
```

Cem produtos distintos cobrem meses de compra real; acima disso a lista deixa de
ser navegavel. A poda silenciosa e aceitavel ali porque o registro e automatico:
o usuario nunca pediu para guardar o item 101.

Favorito e intencao explicita. Descartar um em silencio para caber outro
apagaria uma escolha que a pessoa fez de proposito. Por isso o limite vira erro,
e quem decide o que sai e ela. O numero existe para limitar abuso, nao uso real.

### Conflito de escrita concorrente

Ultima escrita vence, medida pelo **relogio do servidor** (`now()` no
`ON CONFLICT DO UPDATE`), nunca por horario enviado pelo cliente. Aceitar
horario do cliente permitiria a um relogio adiantado fixar um registro no topo
da lista para sempre.

Nome e marca tambem sao atualizados na revisita: a Open Food Facts corrige
cadastro com o tempo, e o registro mais novo e o mais fiel.

### Deduplicacao no banco, nao na aplicacao

A dedup acontece no `ON CONFLICT` da restricao de unicidade. Um SELECT seguido
de INSERT deixaria duas requisicoes simultaneas do mesmo produto passarem as
duas pelo SELECT que nao encontra nada - a checagem e a insercao nao sao
atomicas entre si, e so o banco resolve isso.

### Isolamento no SQL

Toda consulta filtra por `user_id` dentro do SQL. Filtrar na aplicacao depois de
ler deixaria a linha de outro usuario sair da tabela, chegar ao processo e
depender de um `if` para nao vazar.

Caso que exigiu atencao: a poda apaga por exclusao ("tudo menos os N mais
recentes"). Se a subconsulta que escolhe os N nao filtrasse por usuario, ela
escolheria os mais recentes da tabela inteira, e a poda de um usuario ativo
apagaria o historico de todos os outros. Ha teste especifico para isso.

### Remocao cruzada responde 404, nao 403

Item de outro usuario e item inexistente produzem resposta identica. Se um
devolvesse 403 e o outro 404, a diferenca contaria ao atacante quais ids existem
na conta alheia.

### Visitante

Historico e favoritos de quem nao tem conta vivem apenas no navegador, em
`src/services/guestCollections.js`. A separacao em relacao a
`collectionsService.js` e deliberada: uma funcao unica que decidisse sozinha
entre banco e `localStorage` seria o lugar exato onde um visitante acabaria
gravando no servidor por engano.

Nao foi implementada migracao automatica do dado local para a conta no login,
conforme instruido. Registrando a opiniao, sem agir sobre ela: se um dia for
desejada, precisa de tela de confirmacao - a pessoa pode ter marcado produtos em
um aparelho emprestado.

## Validacao por mutacao

Oito mutantes, cada um reintroduzindo um defeito especifico. Suite inteira
executada com o defeito presente.

```text
M-I1    listar historico sem filtrar por usuario                    MORTO
M-I2    remover item por id sem conferir o dono                     MORTO
M-I2b   poda escolhendo os mais recentes da tabela inteira          MORTO
M-I3    confiar em userId enviado pelo cliente                      MORTO
M-F3    favoritos sem restricao de unicidade no banco               MORTO
M-A1    guardar o veredito de alergia junto com o historico         MORTO
M-A2a   piso de risco removido: a resposta do modelo vence          MORTO
M-A2b   nao descartar o allergyVerdict vindo do modelo         SOBREVIVEU
```

### O sobrevivente, e por que ele sobreviveu

**M-A2b e um mutante equivalente, e isso foi provado, nao suposto.**

A mutacao troca:

```js
const { allergyVerdict: _fromModel, ...rest } = modelResponse || {};
// por
const { ...rest } = modelResponse || {};
```

Executando as duas versoes lado a lado com uma resposta que tenta injetar o
proprio veredito, a saida e identica byte a byte:

```text
ORIGINAL  safety: caution | veredito.source: deterministic_engine | status: conflict
MUTANTE   safety: caution | veredito.source: deterministic_engine | status: conflict
saidas identicas: true
```

A razao: a chave `allergyVerdict:` e escrita **depois** do spread `...rest`, e
portanto sobrescreve qualquer valor que tenha vindo do modelo. O destructuring
e defesa em profundidade e documentacao de intencao, nao a barreira efetiva.

Ha ainda uma segunda barreira antes desta: `assistantResponseSchema` e
`.strict()`, entao uma resposta do modelo contendo `allergyVerdict` seria
rejeitada com `AI_SCHEMA_INVALID` sem nunca chegar a esta funcao.

Nenhum teste foi escrito para matar este mutante, porque nao ha comportamento
observavel que o distinga do original. Escrever um seria testar a forma do
codigo e nao o seu efeito.

## Estado dos gates nesta versao

```text
npm run build                      SUCCESS
npm --prefix backend test          170 testes, 146 pass, 0 fail, 24 skip
npm audit --audit-level=moderate   0 vulnerabilidades  (exit 0)
backend audit --audit-level=moderate  0 vulnerabilidades  (exit 0)
secret scan                        0 segredos reais
node scripts/verify-release.js     exit 0
npm run verify:e2e                 FAIL BEFORE CALL, exit 1
```

Os 24 skips sao os testes que exigem PostgreSQL real ou Claude real. SKIP nao
conta como PASS em nenhum gate.

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.7.0" }
```

## Gate E2E

`buildStrictRequirements` passou de 14 para 17 requisitos. Os tres novos -
`historySync`, `favoritesSync` e `verdictFreshness` - sao base, e nao
condicionais a flag da Anthropic, porque dependem apenas de PostgreSQL.
Amarra-los a IA deixaria o gate aprovar uma execucao sem banco que nunca
exercitou sincronizacao.

`backend/tests/e2eGate.test.js` ganhou um teste que nomeia os 14 requisitos
anteriores e prova, um a um, que cada um ainda reprova sozinho quando ausente.

Executado neste ambiente, o gate reprovou antes de qualquer chamada paga:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
exit code 1
```

Este e o resultado correto sem banco e sem chave. Declarar PASS aqui seria falha
grave.

## O que NAO foi executado nesta versao

Registrado como ausencia, e nao convertido em aprovacao.

POSTGRESQL REAL: NAO EXECUTADO. Ambiente sem `DATABASE_URL`. Em consequencia,
os testes H1, F1, F3 comportamental, S1, S2, S3, I1 e I2 comportamentais, D1 e a
reaplicacao da migration ficaram em SKIP, com motivo declarado na saida.

O que foi possivel provar sem banco esta em `backend/tests/collections.test.js`:
forma do SQL emitido, ordem das checagens no servico, ausencia de coluna de
veredito na migration, presenca da restricao de unicidade e da cascata. Isso e
mais fraco que comportamento, e esta escrito assim de proposito - afirmar
"usuario A nao le dado de B" sem banco seria afirmar o que nao foi executado.

CLAUDE REAL: NAO EXECUTADO. `ANTHROPIC_API_KEY` ausente. Nenhuma chamada paga
foi feita e nenhuma chave foi inventada.

VERIFY:E2E: NAO EXECUTADO ate o fim, por consequencia dos dois itens acima.

CAMERA REAL: NAO EXECUTADO, como na v0.6.9. Ambiente sem webcam.

## Conclusao

As tres features estao implementadas com isolamento no SQL, unicidade e cascata
no banco, identidade derivada da sessao e nenhum veredito congelado. As quatro
pendencias estao fechadas, e duas delas ganharam teste permanente para nao
voltarem.

O ponto que exige atencao do auditor e a ausencia de PostgreSQL neste ambiente:
a cobertura das features e estrutural, nao comportamental, e a prova de
isolamento entre dois usuarios reais depende de uma execucao com banco.


## Auditoria da v0.6.9

Versao de interface. Nenhuma regra de alergia, autenticacao ou IA foi tocada.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, `shared/allergyVerdict.js`, todo o
`backend/src/ai/`, autenticacao, scrypt, sessoes, schema PostgreSQL e o contrato
publico da API. O veredito deterministico continua sendo campo autoral do
servidor, com as duas barreiras da v0.6.8 intactas.

O que mudou: leitura do codigo de barras, resiliencia da busca na Open Food
Facts, identidade visual da DG Nutricao, escala tipografica, contraste de texto
e linguagem da interface. Detalhe por item no CHANGELOG.

## Por que esta versao existe

Os commits `9622ad8` e `168ae69` foram publicados em producao sob o numero
0.6.8. O `/api/health` passou a anunciar uma versao que nao correspondia ao
codigo em execucao, e sem numero novo nao havia pacote de auditoria - a pasta
`releases/` ficou sem registro dessas duas entregas.

Esta versao encerra a divergencia. Ela nao introduz funcionalidade alem do que
ja estava no ar; ela nomeia o que ja estava no ar.

## D1 - a camera se desligava ao mirar um produto real

### Causa raiz

O callback de leitura em `src/App.jsx` tratava qualquer erro diferente de
`NotFoundException` como falha fatal e chamava `stop()`.

A `@zxing/browser` lanca `ChecksumException` e `FormatException` continuamente
enquanto a pessoa enquadra o codigo - borrado, cortado, com reflexo. Verificado
em `node_modules/@zxing/browser/esm/common/BrowserCodeReader.js`: o laco interno
da propria biblioteca segue tentando nesses tres casos.

Consequencia: apontar a camera para um codigo de barras real era exatamente o
que derrubava o scanner. A tela mostrava "A camera foi interrompida".

### Correcao

`isTransientScanError` passou a reconhecer os tres erros de mira como normais.
Falha real de camera continua sendo fatal.

Verificado no navegador com as classes reais da biblioteca, nao com objetos
sinteticos:

```text
NotFoundException          camera continua ligada
ChecksumException          camera continua ligada
FormatException            camera continua ligada
Error("stream perdido")    camera desliga
```

Alem disso: `decodeFromConstraints` no lugar de `decodeFromVideoDevice`, porque
o segundo ignora resolucao e aceita o padrao da camera (~640x480), onde um
EAN-13 quase nao tem pixel por barra. A camera passou a ser pedida com
1920x1080 ideal e foco continuo, e o intervalo entre tentativas caiu de 500ms
(padrao da biblioteca) para 100ms.

### Confirmacao por leitura dupla

`src/utils/barcodeConfirm.js`, novo. Exige a mesma leitura duas vezes seguidas
antes de aceitar o codigo. Custa cerca de 100ms e evita abrir o produto errado,
que num app de alergia e informacao de seguranca errada na tela.

## D2 - busca de produtos falhava sem retentativa

Medicao contra a API publica em 04/09/2026: `/api/v2/search` respondia 503 em
cerca de metade das chamadas. A resposta de erro nao traz cabecalho CORS, entao
no navegador a falha chega como erro de CORS. Sem retentativa, uma falha virava
"nao encontrei" com a base no ar.

Os tempos foram calibrados por medicao no navegador, nao por estimativa:

```text
/api/v2/search   falha em ~7,8s quando esta fora
/cgi/search.pl   responde em ~0,8s
```

Por isso o endpoint principal nao ganha retentativa - o reserva chega antes de
uma segunda tentativa terminar. Tres tentativas no principal deixavam a tela
parada em "Procurando..." por mais de 20s.

Evidencia da correcao agindo, colhida do console do navegador: no termo
"queijo", o endpoint principal E a primeira tentativa do reserva foram
bloqueados, e a retentativa salvou a busca. Nos quatro termos medidos, o codigo
anterior teria falhado.

## D3 - a paleta contradizia a propria logo

`src/styles.css` trazia o comentario "cor tirada da logo" e usava
`--lime: #a8cc3b`. As cores foram medidas nos pixels do arquivo entregue
(`src/assets/dg-nutricao.jpg`, 1254x1254): oliva `#5b6a43` e salvia `#859373`.
Verde-limao nao existe no arquivo.

Restricao que acompanha a paleta, medida antes de aplicar: o salvia marca
3.27:1 sobre branco e reprova para texto. Ele so aparece em borda, fundo e
desenho; texto e icone usam o oliva (5.94:1) ou os tons de tinta.

## D4 - escala tipografica pequena demais para o publico

51 dos 58 tamanhos de fonte estavam abaixo de 16px, tres deles em 11px,
espalhados como valores soltos por 1.662 linhas de CSS. O publico declarado do
produto tem idade avancada e le rotulo para decidir sobre alergia.

```text
menor texto do app   11px -> 15px
texto corrido        15px -> 20px
alvo de toque        36px -> 48px
contraste do texto   12.8:1, 7.2:1, 4.9:1  ->  16.9:1, 11.1:1, 7.6:1
```

Dois defeitos que a fonte maior expos e que foram corrigidos junto: a faixa de
alergia da tela inicial esmagava o icone de 20px para 7px, e em 320px a pagina
passou a rolar lateralmente, porque coluna de grid nao encolhe abaixo do
conteudo minimo e `<input>` e `<video>` tem largura natural propria (256px e
300px).

## Verificacao de interface por medicao

Auditoria automatizada sobre o que esta renderizado - cor computada de cada
elemento contra o fundo real herdado, e comparacao de `scrollWidth` com
`clientWidth` para detectar estouro.

```text
320px    7 telas   0 estouros   0 rolagem lateral
375px    7 telas   0 reprovacoes de contraste   menor fonte 15px
1360px   7 telas   0 reprovacoes de contraste   menor fonte 16px
```

Correcao de um erro de metodo desta auditoria: as primeiras execucoes usaram os
hashes `#inicio` e `#assistente`. Os identificadores reais do app sao `home` e
`chat`, e como ele ignora hash invalido em vez de redirecionar, essas duas
voltas do laco ficavam na tela anterior - a tela do Assistente nunca era
auditada e a de Alergias era contada duas vezes. Refeito com os sete
identificadores corretos; o Assistente passou sem reprovacao.

## Dependencias

`npm audit fix` no frontend resolveu um aviso `high` em `browserslist` e um
`moderate` em `baseline-browser-mapping`, dependencia transitiva de build via
`@vitejs/plugin-react` -> `@babel/core`. O aviso e anterior a esta versao e
travava o `verify-release.js`.

Conferido que a troca nao alterou o produto: o build sai com os mesmos hashes de
asset de antes da correcao.

## Estado dos gates nesta versao

```text
npm run build                      SUCCESS
npm --prefix backend test          124 testes, 118 pass, 0 fail, 6 skip
npm audit --audit-level=high       0 vulnerabilidades  (exit 0)
backend audit --audit-level=high   0 vulnerabilidades  (exit 0)
secret scan                        0 segredos reais
node scripts/verify-release.js     exit 0
verify:e2e                         NAO EXECUTADO
```

Os 6 testes pulados sao os destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o de integracao real da Anthropic. SKIP
nao conta como PASS.

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.7.0" }
```

## O que NAO foi executado nesta versao

Registrado como ausencia, e nao convertido em aprovacao.

CAMERA REAL: NAO EXECUTADO. Esta e a ausencia mais relevante do pacote. O
defeito D1 e sobre leitura de codigo de barras, e o ambiente de trabalho nao tem
webcam. A logica esta coberta por 10 testes e foi verificada no navegador com as
classes reais da `@zxing/library`, mas ninguem apontou um telefone para uma
embalagem. A resolucao pedida, o foco continuo e o ganho de velocidade de
leitura sao, hoje, mudancas fundamentadas e nao mudancas comprovadas em campo.

POSTGRESQL REAL: NAO EXECUTADO. Ambiente sem `DATABASE_URL`.

CLAUDE REAL: NAO EXECUTADO. `ANTHROPIC_API_KEY` ausente e
`RUN_ANTHROPIC_INTEGRATION_TESTS` desabilitado. Nenhuma chamada paga foi feita e
nenhuma chave foi inventada.

VERIFY:E2E: NAO EXECUTADO, por consequencia dos dois itens acima. O PASS
registrado no E2E_REPORT da v0.6.8 pertence aquela versao e aquela execucao; ele
nao foi herdado aqui.

Esta versao nao toca em banco, sessao nem IA, entao a ausencia desses gates nao
esconde risco nas areas alteradas. Ela significa que a cobertura desta entrega e
de interface, e nao de integracao.

## Conclusao

Os quatro defeitos desta versao estao corrigidos e verificados por execucao de
comando e por medicao no navegador. O contrato publico da API nao mudou e o
motor deterministico de alergia sai identico.

O ponto que exige atencao do auditor e a camera: e a correcao central da versao
e a unica sem prova em dispositivo real.

## Auditoria externa independente da v0.6.7 e correcoes da v0.6.8

Um auditor externo instalou PostgreSQL real, rodou a suite inteira contra ele
(84 testes, 83 pass, 1 skip, 0 fail), executou a bateria adversarial do gate
`verify:e2e` e escreveu exploits proprios.

Resultado: **BLOQUEADO** por um defeito CRITICO, mais tres achados menores.

Confirmado como correto e nao alterado nesta versao: ausencia de residuo
executavel de OpenAI, gate `verify:e2e` fail-closed nas quatro variacoes
testadas, guarda `RUN_DB_INTEGRATION_TESTS`, ausencia de `ANTHROPIC_API_KEY` no
bundle de producao, identidade derivada da sessao, payload sem dado sensivel, e
instrucoes privilegiadas isoladas em `system`.

## C1 - CRITICO - resposta do modelo substituia o veredito deterministico

### Causa raiz

A regra do projeto e explicita: o motor deterministico e a autoridade sobre
conflito de alergia, e nenhuma resposta do modelo pode substituir esse
resultado. Ate a v0.6.7, essa autoridade existia **apenas como uma frase no
system prompt**.

`parseStructuredResponse` validava `stop_reason`, JSON e schema Zod e retornava
os campos do modelo com `source: "anthropic"` - texto e nivel de risco vindos da
IA, sem nenhuma reconciliacao com o `allergySnapshot` que
`buildAssistantContext` ja tinha produzido.

Agravante: `src/pages/Assistant/AssistantPage.jsx` nao exibia veredito
deterministico algum. O banner do motor so existia em `ProductAnalysis.jsx`, que
e outra superficie. Na tela do Assistente, o texto do modelo era o unico sinal
de alergenico que o usuario recebia.

### Exploit, reproduzido antes da correcao

```text
produto  Leite em Po Integral, ingredients_text "leite em po integral",
         allergens ["milk"]
perfil   ["milk"]
```

Saida real, com o cliente Anthropic substituido por um mock que devolve schema
valido:

```text
MOTOR DETERMINISTICO
  hasDeclaredConflict : true
  detectedConflicts   : ["milk"]

RESPOSTA ENTREGUE AO USUARIO
{
  "answer": "Este produto NAO contem leite e e totalmente seguro para voce.
             Pode consumir sem preocupacao.",
  "category": "allergy",
  "safety": "normal",
  "usedProductContext": true,
  "source": "anthropic"
}

VEREDITO DETERMINISTICO NA RESPOSTA : NAO
SAFETY ENTREGUE                     : normal
EXPLOIT                             : FUNCIONA - falso seguro entregue
```

### Correcao estrutural

O veredito deixou de ser algo pedido ao modelo e virou campo autoral do
servidor.

```text
shared/allergyVerdict.js                      novo, autoridade do veredito
backend/src/ai/assistantPrompt.js             schema strict, prompt ajustado
backend/src/ai/assistantService.js            ponto unico de saida, piso, log
src/components/assistant/AllergyVerdict.jsx   novo, bloco deterministico na UI
src/pages/Assistant/AssistantPage.jsx         veredito acima do texto do modelo
src/App.jsx                                   veredito tambem no fallback local
src/styles.css                                estilos do bloco
```

Duas barreiras independentes impedem o modelo de escrever o campo:

1. `assistantResponseSchema` passou a ser estrito. Qualquer chave fora do
   contrato - `allergyVerdict` inclusive - rejeita a resposta inteira com
   `AI_SCHEMA_INVALID`. A escolha foi rejeitar, e nao descartar em silencio,
   porque o projeto e fail-closed em checagem de seguranca.
2. `applyAllergyAuthority` desestrutura e descarta qualquer `allergyVerdict` da
   resposta do modelo antes de escrever o do motor.

Piso de risco: com `status: "conflict"`, `safety` nunca sai `normal`. A elevacao
e por codigo e so sobe - `urgent` permanece `urgent`. O alerta em texto e
escrito pelo servidor, separado de `answer`, e nao passa pelo modelo.

`finalizeAssistantResponse` e o ponto unico de saida do endpoint. As respostas
locais de protecao passam por ele tambem, entao a invariante vale para toda
resposta do endpoint, nao apenas para a da IA.

Traco declarado (`status: "traces"`) recebe alerta proprio mas nao altera o
nivel de risco: `traces` significa "pode conter", e trata-lo como evidencia
declarada esvaziaria a distincao que o motor faz.

Tentativa de minimizacao - conflito declarado com o modelo respondendo `normal`
- vira contador e log estruturado, sem mensagem, sem identificador de usuario,
sem e-mail e sem chave.

### Depois da correcao

```text
RESPOSTA ENTREGUE AO USUARIO
{
  "answer": "Este produto NAO contem leite e e totalmente seguro para voce...",
  "category": "allergy",
  "safety": "caution",
  "source": "anthropic",
  "allergyVerdict": {
    "status": "conflict",
    "source": "deterministic_engine",
    "conflicts": [{ "id": "milk", "label": "Leite/lactose" }],
    "profileSource": "request",
    "alert": "Alerta do NutriVa: este produto tem Leite/lactose no seu
              perfil de alergias...",
    "minimumSafety": "caution",
    "safetyFloorApplied": true
  }
}

log: {"event":"assistant.allergy_minimization_attempt","conflicts":["milk"],
      "modelSafety":"normal","enforcedSafety":"caution","total":1}

VEREDITO DETERMINISTICO NA RESPOSTA : sim
SAFETY ENTREGUE                     : caution
EXPLOIT                             : bloqueado
```

O texto do modelo continua sendo entregue. Ele e explicacao, nao veredito - e
agora aparece abaixo de um bloco que o contradiz quando ele erra.

### Validacao por mutacao

Quatro mutantes, todos mortos:

```text
M1  remover o piso de risco em applyAllergyAuthority      4 testes falharam
M2  remover o modo estrito do assistantResponseSchema     1 teste falhou
M3  deixar o allergyVerdict do modelo vencer o do motor   1 teste falhou
M4  remover o bloco AllergyVerdict de AssistantPage       3 testes falharam
```

Nenhum sobrevivente. O teste de interface compila o JSX do componente real com
esbuild e renderiza de verdade, entao ele morre junto com o alerta.

## M1 - E2E_REPORT com numeros da versao anterior

O documento declarava `total 79 | passed 73 | skipped 6` enquanto a medicao real
da v0.6.7 era `84 | 78 | 6`, e trazia data 2026-08-15 contra 2026-08-16 no
CHANGELOG da mesma versao. Era o relatorio da v0.6.6 com o titulo trocado. O
teste de versao que ja existia nao pegou porque so olhava o cabecalho.

Corrigido com regeneracao a partir de execucao real e com
`backend/tests/reportConsistency.test.js`, que compara a data declarada nos
relatorios com a data da entrada do CHANGELOG da versao atual e recusa blocos de
resultado de outra versao no corpo do texto.

A escolha por data e versao, em vez de travar a contagem de testes, esta
justificada no arquivo: um teste que afirma o total da suite da qual ele faz
parte muda o proprio alvo a cada teste novo, ficaria vermelho sozinho e
ensinaria a ignorar a falha.

Quando escrito, este teste falhou contra os relatorios da v0.6.7 - que e a prova
de que ele pega o defeito:

```text
AssertionError: E2E_REPORT.md diz 2026-08-15 e o CHANGELOG da v0.6.7 diz
2026-08-16: o relatorio parece ser o da versao anterior com o titulo trocado
```

## B1 - artefatos declarados ausentes do ZIP

O CHANGELOG da v0.6.4 declarava `.claude/skills/gauntlet-loop/SKILL.md`,
`.claude/workflows/gauntlet-loop.js` e `CLAUDE.md` como padrao permanente, e
nenhum estava no pacote.

Resolvido de forma declarada, e nao por silencio:

- `CLAUDE.md` passa a ser incluido no ZIP. Ele descreve o metodo de trabalho e
  os gates, e o auditor externo precisa dele.
- `.claude/` fica fora do pacote por ser configuracao de ferramenta local, e nao
  artefato do produto. Alem disso, o metodo que ele automatizava saiu de uso: o
  dono do projeto proibiu o gauntlet-loop em 27/08/2026, e o `CLAUDE.md` foi
  atualizado para refletir isso. Nenhuma afirmacao deste relatorio se apoia no
  gauntlet - as evidencias desta versao vem de execucao de comando.

## B2 - primeira falha mascarava os demais subgates

Com banco real e chave falsa, o relatorio trazia `database: NOT_EXECUTED` mesmo
com PostgreSQL acessivel, porque o runner abortava na chamada Anthropic do
visitante antes de exercitar o banco.

As duas etapas dependentes da Anthropic passaram a ser adiaveis: a falha e
guardada, as etapas independentes rodam e reportam, e a falha volta a ser fatal
antes de `report.ok = true` e antes da avaliacao strict.

Prova de que o gate nao afrouxou:

- Execucao no mesmo cenario terminou com `ok: false` e exit diferente de zero,
  agora com `database: EXECUTED`, `auth: PASSED`, `sessionSchema`,
  `multiDevice`, `isolation` e `logout` reportados.
- `backend/tests/e2eGate.test.js` ganhou um teste que trava o conjunto exato de
  requisitos de `buildStrictRequirements` e prova que cada requisito, sozinho,
  ainda reprova a execucao.

## Estado dos gates nesta versao

```text
npm run build                      SUCCESS
npm --prefix backend test          104 testes, 98 pass, 0 fail, 6 skip
npm audit --audit-level=high       0 vulnerabilidades
backend audit --audit-level=high   0 vulnerabilidades
secret scan                        0 segredos reais
npm run verify:release             exit 0
npm run verify:e2e                 PASS com PostgreSQL real e Claude real
```

Os 6 testes pulados sao os destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o de integracao real da Anthropic. SKIP
nao conta como PASS em nenhum gate.

## Auditoria pelo gauntlet-loop

A v0.6.3 foi submetida ao gauntlet-loop: tres frentes de subagentes auditaram a
migracao e um supervisor adversarial verificou cada alegacao por conta propria.

Resultado: **REPROVADO em 2 rodadas**, notas correctness 8, completeness 5,
evidence 9, craft 8, safety 9. O supervisor encontrou dois defeitos que os 64
testes da v0.6.3 nao pegavam:

```text
A1  ramo de timeout inalcancavel em mapProviderError
    as classes de erro do SDK nao definem `name`; toda instancia herda "Error",
    com status e code indefinidos
    timeout real virava AI_UNAVAILABLE 503 em vez de AI_TIMEOUT 504
    o teste que o cobria usava objetos sinteticos que o SDK nunca produz, entao
    ficava verde defendendo codigo morto

A4  guarda de stop_reason fail-open
    resposta sem stop_reason era aceita como conclusao normal
```

Ambos foram reproduzidos de forma independente antes do conserto, com probe real
do SDK, e corrigidos na v0.6.4. O teste de A1 agora usa instancias reais do SDK.

## Auditoria da v0.6.5 pelo gauntlet-loop e endurecimento na v0.6.6

A v0.6.5 foi submetida ao gauntlet-loop. Resultado: **APROVADO em 2 rodadas**,
notas correctness 9, completeness 9, evidence 9, craft 8, safety 9.

O supervisor confirmou que nao existe bypass completo: um PASS de `verify:e2e`
com API forjada exigiria tambem falsificar todo o fluxo de auth, sessao e
multi-dispositivo contra um PostgreSQL real, o que nao foi demonstrado. Mas
apontou dois problemas legitimos, corrigidos na v0.6.6:

```text
vao estrutural  o gate nao tinha barreira contra E2E_BASE_URL; a perna generica
                de Claude aceitava resposta fabricada por um servidor apontado

mutantes vivos  na superficie de decisao PASS/FAIL, sobreviviam: assert de
                source=anthropic neutralizado, checagem de completude strict
                apagada, perna generica promovida a prova completa, etapa
                e2e:strict removida do gate e env sem E2E_REQUIRE_ANTHROPIC
```

Correcoes da v0.6.6:

```text
E2E_BASE_URL recusado no gate (aceito apenas em e2e:strict direto)
backendProcess === STARTED_BY_RUNNER virou requisito do modo strict
requisitos, validacao de forma, identidade das etapas e loop extraidos
  para scripts/lib/e2eGate.js, testaveis sem subir processo
```

Os seis mutantes citados agora morrem. Um setimo — gravar exit code 0 para uma
etapa que falhou — sobreviveu ao primeiro teste escrito, porque ele conferia so
a quantidade de etapas; morreu depois que o teste passou a conferir o codigo
gravado. Esse caso esta registrado aqui de proposito: teste verde nao e prova de
teste eficaz.

## Hotfix do gate E2E (v0.6.5)

O gate `verify:e2e` dependia de `RUN_OPENAI_INTEGRATION_TESTS` para decidir se
Claude real era exigido. Como ninguem mais define essa flag, o gate podia
concluir sem nunca provar a IA — um PASS que nao valia o que prometia.

Comportamento novo, imposto por codigo:

```text
sem RUN_ANTHROPIC_INTEGRATION_TESTS=true
  -> FAIL BEFORE CALL, exit != 0, nenhuma etapa sobe

com a flag habilitada
  -> gate passa E2E_REQUIRE_ANTHROPIC=true ao runner
  -> doctor:e2e exige PostgreSQL, migrations, ANTHROPIC_API_KEY e ANTHROPIC_MODEL
  -> e2e:strict exige PostgreSQL real e Claude real (maximo 2 chamadas)
  -> PASS somente com todas as etapas em exit 0
```

Cenario explicitamente coberto: PostgreSQL OK + chave configurada + flag
desabilitada resulta em **FAIL**, nunca em PASS sem Claude real.

A logica vive em `scripts/lib/e2eGate.js`, sem I/O, e `backend/tests/e2eGate.test.js`
cobre os quatro casos. A eficacia dos testes foi verificada por mutacao:
reintroduzindo os dois residuos, 4 testes ficam vermelhos.

## Escopo

Correcao do gate E2E acima, sobre a migracao da camada de IA para Anthropic
Claude. Nenhuma funcionalidade de produto foi adicionada e a v0.7.0 continua nao
iniciada.

Preservado sem reescrita: frontend, scanner, Open Food Facts,
`shared/allergenEngine.js`, `shared/productAllergenAdapter.js`, autenticacao,
scrypt, sessoes, schema PostgreSQL, contexto de produto, perfil de alergias,
fallback local, Structured Outputs, testes e arquitetura backend-only de secrets.

## Provider

```text
AI Provider: Anthropic
Default model: claude-sonnet-5
SDK: @anthropic-ai/sdk 0.117.1
API: Messages API (client.messages.create)
```

O modelo e configuravel por `ANTHROPIC_MODEL` e vive em um unico lugar
(`backend/src/config/env.js`). Nenhum arquivo espalha o ID do modelo.

## Arquitetura

```text
React
  -> NutriVa Backend
  -> Anthropic Messages API
```

A chave existe exclusivamente no backend. O frontend nao recebe, nao armazena e
nao conhece o provedor; nao existe nenhuma variavel `VITE_*` de IA.

## Remocao da OpenAI

Toda dependencia ativa foi removida:

```text
backend/package.json          openai removido, @anthropic-ai/sdk adicionado
backend/src/ai/openaiClient.js        removido
backend/src/ai/moderationService.js   removido
```

### Correcao de uma afirmacao falsa da v0.6.3

O relatorio da v0.6.3 declarou "zero ocorrencias ativas" apos a varredura. **Essa
afirmacao estava errada.** O grep usado era sensivel a maiusculas (`openai`,
`OpenAI`, `gpt-`) e nao encontrava a forma `OPENAI` em caixa alta. Dois residuos
executaveis sobreviveram e foram corrigidos apenas na v0.6.5:

```text
scripts/verify-e2e.js   RUN_OPENAI_INTEGRATION_TESTS decidindo a mensagem final
scripts/e2e-real.js     mensagem citando OPENAI_API_KEY no fluxo Anthropic
```

A varredura da v0.6.5 e case-insensitive (`grep -rni openai`) sobre `src/`,
`shared/`, `scripts/`, `backend/src/`, `backend/tests/`, `backend/scripts/` e os
`package.json`. Resultado atual: nenhuma ocorrencia ativa.

Permanecem de proposito, e nao sao residuo:

```text
scripts/verify-release.js   padrao de secret scan para chave OpenAI antiga
backend/tests/*.test.js     assert que reprova provedor citado em codigo de erro
CHANGELOG.md                historico legitimo das versoes anteriores
docs/ARCHITECTURE.md        registro de que a migracao aconteceu na v0.6.3
```

Um teste automatizado agora falha se a flag antiga voltar a qualquer script
executavel, e outro falha se os padroes de secret scan forem removidos.

## Structured Outputs

A resposta e restringida por `output_config.format` com `type: "json_schema"`,
usando o schema ja existente do assistente. O modelo nunca e a unica garantia:

```text
Structured Output
  -> blocos type === "text" concatenados
  -> JSON.parse
  -> validacao Zod (assistantResponseSchema)
  -> resposta da API
```

Falha de estrutura vira `AI_SCHEMA_INVALID`.

## Tratamento de resposta

`stop_reason` e avaliado antes do conteudo:

```text
refusal        -> AI_REFUSAL
max_tokens     -> AI_INCOMPLETE
end_turn       -> parse
stop_sequence  -> parse
outros         -> AI_BAD_RESPONSE
```

Um corpo aparentemente valido nao e aceito quando a geracao terminou de forma
anormal; ha teste cobrindo exatamente esse caso.

Content blocks sao lidos por tipo. O backend concatena apenas blocos
`type === "text"` e nunca assume `content[0]`; um bloco nao textual no inicio da
lista nao quebra a leitura.

## Codigos de erro

A API publica permanece neutra de provedor:

```text
AI_NOT_CONFIGURED  AI_TIMEOUT  AI_RATE_LIMITED  AI_UNAVAILABLE
AI_BAD_RESPONSE    AI_SCHEMA_INVALID  AI_REFUSAL  AI_INCOMPLETE
```

Nenhum codigo `OPENAI_*` ou `ANTHROPIC_*` chega ao frontend. Ha teste que falha
se um codigo citar o provedor.

## Moderacao

A moderacao remota `omni-moderation-latest` foi removida junto com a OpenAI.
Nenhum provedor foi mantido apenas para moderar e nenhuma segunda chamada paga
foi criada em troca.

As protecoes deterministicas locais continuam intactas e independem de IA:

```text
emergencia alergica       preservada
prompt injection          preservada
fora de escopo            preservada
limites de entrada        preservados
validacao Zod             preservada
rate limit do endpoint    preservado
```

## Motor deterministico

`shared/allergenEngine.js` e `shared/productAllergenAdapter.js` nao foram
tocados. O fluxo continua:

```text
Produto -> motor deterministico -> allergySnapshot -> Claude explica
```

Claude nao decide alergia. A matriz de 50+ cenarios e o teste de consistencia
frontend/backend continuam passando sem alteracao.

## Autoridade do perfil

Preservada: conta com `["milk"]` e request com `guestAllergies: ["soy"]` produz
`profileAllergies ["milk"]` e `hasDeclaredConflict true`.

## Privacidade

O payload enviado ao provedor foi inspecionado com mock local, sem custo. Sem
e-mail, senha, hash, salt, cookie de sessao, `DATABASE_URL` ou
`ANTHROPIC_API_KEY`, e com o snapshot deterministico presente.

## Health

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.6.7" }
```

Informa apenas se ha chave, nunca o valor.

## Doctor

Normal e strict passaram a checar `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`;
`OPENAI_*` deixou de ser exigido. A saida mostra `configured` ou
`not_configured`, nunca o valor. O modulo obrigatorio do backend passou de
`openai` para `@anthropic-ai/sdk`.

## PostgreSQL

Sem alteracao de schema. A migracao de IA nao encosta no banco.

POSTGRESQL REAL: NAO EXECUTADO - ambiente sem PostgreSQL, Docker ou
`DATABASE_URL`.

## Claude real

CLAUDE REAL: NAO EXECUTADO.

Motivo: `ANTHROPIC_API_KEY` nao configurada e `RUN_ANTHROPIC_INTEGRATION_TESTS`
desabilitado. Nenhuma chamada paga foi feita e nenhuma chave foi inventada.

O teste real opcional foi migrado para `backend/tests/anthropic.integration.test.js`
e valida `HTTP 200`, `source = anthropic`, `answer` nao vazio, `category` e
`safety` validos.

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
total   79
passed  73
failed  0
skipped 6
```

Testes adicionados nesta versao, todos com mock de `client.messages.create`:

```text
resposta estruturada valida -> source anthropic
stop_reason refusal / max_tokens / pause_turn / tool_use
JSON invalido, schema invalido, conteudo vazio
leitura de content blocks por tipo e fora de ordem
mapeamento 429, 408, ETIMEDOUT, 401, 500, 529 e erro de rede
falha do provedor no fluxo completo virando erro neutro
cliente so existe quando a chave esta configurada
```

Os 6 skips continuam honestos: 5 dependem de PostgreSQL e 1 do Claude real.

## Security

```text
npm audit --audit-level=high                  0 vulnerabilidades
npm --prefix backend audit --audit-level=high 0 vulnerabilidades
secret scan                                   0 segredos reais
```

O secret scan ganhou `sk-ant-` e `ANTHROPIC_API_KEY=` e manteve os padroes
genericos anteriores. Nenhum `.env` real existe no projeto nem entrou no pacote.

## ZIP

```text
releases/nutriva-v0.6.6-auditoria.zip
```

O SHA-256 do pacote e publicado em `releases/SHA256SUMS.txt`, fora do ZIP:
registrar o hash dentro do proprio arquivo invalidaria o hash registrado.

Validado programaticamente: 111 entradas com CRC integro, 0 caminhos com barra invertida,
0 `node_modules`, 0 `dist`, 0 `coverage`, 0 `.git`, 0 `.env` real e 0 segredos.

## Conclusao

A migracao esta completa e o contrato publico do NutriVa nao mudou: o frontend
continua chamando `POST /api/assistant/chat` sem saber qual IA respondeu.

O gate de E2E real segue bloqueado por ambiente, agora por dois requisitos:
PostgreSQL e `ANTHROPIC_API_KEY`.
