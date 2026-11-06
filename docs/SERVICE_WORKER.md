# App instalavel e service worker - v0.13.0

## O problema, pelo que era

A v0.11.0 entregou o modo sem rede: o IndexedDB guarda os produtos e o perfil, e
o veredito e refeito no aparelho. Mas o APP em si nao era guardado. Sem rede, o
navegador nao conseguia buscar o HTML, o JavaScript nem o CSS, e a pessoa via
erro de conexao. O modo sem rede existia, funcionava, foi auditado - e nao tinha
como ser alcancado.

A v0.13.0 fecha isso: o app abre sem rede, e pode ser instalado na tela inicial
do celular.

## Dois armazenamentos, que nao se misturam

```text
o que                         onde                    quem cuida
o APP (HTML, JS, CSS, fontes, Cache Storage           o service worker (v0.13.0)
icones, manifesto)
os DADOS (produto, perfil,    IndexedDB               o cache da v0.11.0
listas)
```

Nada passa de um para o outro. O service worker nao le nem escreve o IndexedDB;
o cache da v0.11.0 nao le nem escreve o Cache Storage.

## O que o service worker guarda

So o shell do app, gerado pelo build: a lista e tirada dos arquivos que o `vite
build` produziu, nunca escrita a mao.

```text
pre-carregado na instalacao   22 arquivos, 1.169 KB (build da v0.13.0)
  index.html                   1 KB
  JavaScript do app            3 arquivos, 791 KB (o app e o leitor de codigo de barras)
  CSS                          43 KB
  fontes                       10 WOFF2, latin e latin-ext, 156 KB
  logo e icones                177 KB (a logo da barra, 134 KB, e o maior)
  manifesto                    1 KB
guardado se pedido            o resto do build: as faixas de fonte que o
                              portugues nao usa e o formato WOFF antigo
                              (23 arquivos; o shell inteiro tem 1.560 KB)
```

As fontes pre-carregadas sao so as que um texto em portugues usa. O navegador
nunca pede as outras faixas para este app; se pedir, a faixa e guardada na
primeira vez.

## Estrategia por tipo de recurso

```text
recurso                          estrategia              por que
/api/* (toda a API)              o service worker NAO    dado de saude, sessao e veredito;
                                 TOCA - so rede          sem rede, a chamada falha e o app
                                                         cai no caminho da v0.11.0
/api/health                      o service worker NAO    diz o estado do servidor AGORA;
                                 TOCA - so rede          guardado, mentiria
escrita (POST, PUT, DELETE)      o service worker NAO    escrita nunca e guardada nem
                                 TOCA                    repetida depois
outra origem (Open Food Facts:   o service worker NAO    dado de terceiro, nao confiavel;
imagens e API)                   TOCA                    cada imagem ocupa espaco
a pagina (navegacao)             rede primeiro; sem      online, a pessoa recebe sempre a
                                 rede ou depois de 4 s,  versao publicada; o shell guardado
                                 o index.html guardado   so entra quando a rede nao responde
                                 DESTA versao
arquivo do build (JS, CSS,       cache primeiro          o nome do arquivo muda a cada
fonte, icone)                                            build; o guardado e sempre o certo
qualquer outra coisa da origem   o service worker NAO    nao e do shell
(o proprio sw.js, caminho        TOCA
desconhecido)
```

O HTML guardado nunca e regravado pela rede: ele aponta para os arquivos da
versao dele. Gravar o HTML de um build mais novo num cache mais velho quebraria
o app sem rede.

## O que NUNCA e guardado, e como a regra e imposta

A decisao fica num lugar so, `src/sw/politicaDeCache.js`, usado pelo service
worker e pela limpeza do logout - e e esse arquivo que os testes exercitam.

1. **Nenhuma resposta de `/api/`.** `estrategiaPara` devolve IGNORAR para todo
   caminho que comeca com `/api/`, sem diferenciar maiuscula: o service worker
   nao chama `respondWith`, e a requisicao vai para a rede como sem service
   worker - nem passa perto do Cache Storage.
2. **Segunda camada.** Toda gravacao passa por `podeGuardar`, que recusa de novo
   `/api/`, e tambem: outra origem, escrita, caminho fora da lista do build,
   status diferente de 200, `Set-Cookie`, e `Cache-Control: no-store` ou
   `private`. Mesmo que uma estrategia errada deixasse passar, a gravacao recusa.
3. **Por consequencia, o veredito nunca e guardado.** Ele so viaja em resposta
   de `/api/` (assistente, comparacao). O que fica no Cache Storage e o build, o
   mesmo para todo mundo.
4. **A chave de API nunca e guardada.** Ela vive so no backend e nunca viaja numa
   resposta; o teste procura a forma de chave no `sw.js`, no build e em tudo que
   ficou guardado.

Sobre Set-Cookie: no navegador, o service worker nem enxerga esse cabecalho. A
regra fica mesmo assim, para a garantia nao depender disso.

## Logout e exclusao

Toda volta a visitante - sair da conta, conta excluida, sessao recusada pelo
servidor (401) - limpa os DOIS armazenamentos: o IndexedDB, como desde a
v0.11.0, e o Cache Storage (`src/sw/limpezaDoCacheStorage.js`):

- todo cache que nao e do shell do app sai inteiro;
- dentro do cache do shell, sai toda entrada que nao tem a forma de arquivo do
  shell (uma resposta de `/api/`, um JSON, uma URL com query).

O shell fica: ele nao e de nenhuma conta, e e o que deixa o app abrir sem rede
para a proxima pessoa do aparelho. A exclusao so limpa depois de o servidor
confirmar, como na v0.11.0.

## Invalidacao por versao

- O nome do cache e `nutriscan-shell-<versao>`, com a versao do `package.json`
  posta no `sw.js` no build.
- Versao nova = `sw.js` com bytes novos. O navegador confere o `sw.js` a cada
  abertura do app (sem cache HTTP: `Cache-Control: no-cache`, e o registro usa
  `updateViaCache: "none"`). Com o app aberto por muito tempo, a conferencia
  roda tambem a cada volta para a tela, no maximo uma vez por hora.
- A versao nova baixa o shell inteiro dela, num cache novo, ao lado do antigo. Se
  um arquivo falhar, a instalacao falha e ela nao assume: shell pela metade nao
  vira o app sem rede de ninguem.
- Quando ela assume, apaga o cache de qualquer outra versao.

## Atualizar: o momento seguro

A pagina NUNCA recarrega sozinha. A pessoa pode estar no meio de um veredito,
de uma comparacao, digitando um codigo; recarregar ali apagaria o que ela le.

A versao nova assume:

- **sozinha, quando nenhuma aba da versao antiga estiver aberta** - a proxima
  vez que a pessoa abrir o app. Nesse momento nao ha nada na tela para perder;
- **ou quando a pessoa tocar em "Atualizar agora"**, no aviso "Há uma versão
  nova do NutriScan. Atualize quando terminar o que está lendo. A tela
  recarrega." O aviso fica no topo da tela ate ela atualizar, sem cobrir o
  veredito, e e anunciado ao leitor de tela sem interromper (`polite`).

Nao ha como ficar preso numa versao antiga: o aviso fica ate a pessoa tocar, e a
proxima abertura do app atualiza de qualquer jeito. E, com rede, a pagina ja vem
da rede a cada abertura - o que espera e o shell guardado para usar sem rede.

## Escopo

O service worker esta em `/sw.js`, com escopo `/`. O app vive na raiz (as telas
sao `#scan`, `#conta`...), entao o escopo precisa incluir `/` para controlar a
pagina. A API tambem esta debaixo de `/`, e nao da para tira-la do escopo - por
isso a regra de `/api/` e no codigo, e testada (P3, P16).

## Sem service worker

O app nao depende dele. `main.jsx` desenha o app ANTES de registrar o service
worker, e o registro nunca lanca. Navegador sem suporte, contexto nao seguro
(http fora de localhost) ou registro que falha: o app segue como na v0.12.0, sem
aviso, sem tela branca. Em `npm run dev` nao ha service worker.

## Instalar

- **Manifesto** (`public/manifest.webmanifest`): nome e nome curto "NutriScan",
  `start_url` e `scope` "/", `display: standalone`, `orientation: portrait`, cor
  de tema `#3d472b` (o oliva da barra) e de fundo `#f5f2ea` (o creme), em
  portugues.
- **Icones**: o `nutriscan-icon.svg` que ja existia, e PNG de 192, 512, 512
  maskable e 180 (iPhone) - o mesmo "N" em Cormorant Garamond sobre o oliva,
  desenhado na v0.13.0 com a geometria e a fonte do SVG. O maskable e o do
  iPhone vao sem cantos, porque o sistema os recorta.
- **Convite**: nao na primeira visita. O navegador que oferece instalar (Chrome,
  Edge, Samsung Internet) mostraria uma barra sozinho logo de cara; o app segura
  esse pedido e convida na tela Inicio so depois de a pessoa ter aberto 2
  produtos neste aparelho - quando ja sabe para que o app serve. "Agora nao"
  dispensa de vez. No iPhone, instalar e pelo Safari: compartilhar, "Adicionar
  a Tela de Inicio".

## Publicacao

Service worker exige HTTPS (exceto `localhost`). O backend serve o `sw.js` e o
manifesto com `Cache-Control: no-cache` e o tipo certo. O `verify:deploy` ganhou
quatro subgates, so de leitura: D9 (manifesto valido), D10 (os icones
declarados existem), D11 (`sw.js` servido como JavaScript) e D12 (`sw.js` sem
cache longo). Ver `docs/DEPLOY.md`.

## O que CONTINUA ABERTO

- **Instalar num celular de verdade: NAO VERIFICADO.** Ninguem instalou o app num
  Android ou num iPhone. O convite e o pedido do navegador foram testados com
  dubles; o manifesto, os icones e o service worker, no Chromium do ambiente.
- **Service worker em HTTPS real: NAO VERIFICADO.** O Chromium do ambiente
  rodou o service worker em `http://127.0.0.1`, que o navegador trata como
  seguro. Nada foi publicado: no ar segue a v0.7.0.
- **Outros navegadores**: so o Chromium do ambiente. Safari (iPhone) e Firefox
  nao foram abertos - e o Safari tem regras proprias de armazenamento.
- **Cota e limpeza pelo sistema**: o navegador pode apagar o Cache Storage de um
  app pouco usado. Ai o app volta a precisar de rede para abrir - como antes da
  v0.13.0. Nao medido.
- **Abrir o app sem rede pela primeira vez**: impossivel - o shell so e guardado
  depois de uma abertura com rede.
- **Imagem de produto sem rede**: nao e guardada (decisao); pode nao aparecer.
- **Mesma versao, build diferente**: o nome do cache e a versao. Um build
  republicado sem subir a versao reaproveita o mesmo cache - as regras do
  projeto mandam subir a versao a cada entrega.

## Na v0.14.0

Nada mudou no service worker nem no cache. A regressao desta parte rodou de novo
pelo codigo real em `backend/tests/medicaoDoMotor.test.js` (R5: o cache offline
sem veredito e o logout limpando; R6: nenhuma rota de `/api/` interceptada nem
gravada, nem com a rota na lista do shell), e `serviceWorker.test.js` segue
verde. A correcao do motor desta versao chega a quem instalou o app pelo caminho
de sempre: o aviso de versao nova.

## Na v0.15.0

Nada mudou no service worker nem nas regras de cache. O selo da tabela, as
faixas da TACO e o botao de menu sao codigo do bundle: entram no shell com o
build, e a versao nova troca o nome do cache, como sempre. As faixas valem sem
rede porque a lista fechada do cache offline (`src/services/offlineCache.js`) ja
guardava `categories_tags` - conferido em `backend/tests/faixasPorCategoria.test.js`
("sem rede: o produto guardado no aparelho mantem a categoria").
`serviceWorker.test.js` segue verde.
