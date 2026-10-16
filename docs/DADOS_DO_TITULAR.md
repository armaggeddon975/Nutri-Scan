# Dados do titular - exportacao e exclusao de conta (v0.8.0)

Este documento descreve **o que o software faz** com os dados de quem tem conta,
e por que foi feito assim. Nao e parecer juridico e nao declara o NutriScan "em
conformidade" com lei nenhuma: conformidade envolve base legal, politica de
privacidade e encarregado, que nao fazem parte do codigo.

O que existe desde a v0.8.0:

```text
GET    /api/account/export   exportar os proprios dados
DELETE /api/account          excluir a propria conta (exige a senha atual)
```

Na tela **Conta**, logado, o cartao **Seus dados** tem os dois botoes: "Baixar
meus dados" e "Excluir minha conta". Formato de request e response em
[API.md](API.md#conta-dados-do-titular-v080).

## O que o NutriScan guarda de quem tem conta

```text
users               nome, e-mail, hash e salt da senha, data de criacao
user_allergies      alergias marcadas no perfil (dado de saude), cada uma com
                    o nivel de alerta declarado (v0.9.0)
product_history     produtos abertos: codigo, nome, marca, imagem, quando
product_favorites   produtos favoritados: codigo, nome, marca, imagem, quando
sessions            uma linha por aparelho logado: hash do token e validade
```

O app nao guarda veredito de alergia, nivel de risco nem lista de alergenicos
de produto: o veredito e recalculado na hora de exibir (ver README).

O que fica **no navegador**, e nao na conta: as alergias, o historico e os
favoritos do modo visitante. Eles nunca foram para o servidor, nao entram na
exportacao e nao sao apagados pela exclusao da conta. Para apagar, limpe os
dados do site no navegador.

## Exportacao

### O que entra, campo a campo

```text
campo                         de onde vem                        por que
formato                       constante                          identifica o arquivo
versaoDoFormato               constante (1)                      leitura por maquina
geradoEm                      relogio do servidor                quando a copia foi feita
conta.nome                    users.name                         dado do titular
conta.email                   users.email                        dado do titular
conta.criadaEm                users.created_at                   dado do titular
alergias[].id                 user_allergies.allergy_id          codigo do catalogo (ex.: milk)
alergias[].nome               rotulo do catalogo                 legivel por gente
alergias[].alertaMaximo       user_allergies.alert_level         nivel declarado (v0.9.0)
alergias[].marcadaEm          user_allergies.created_at          dado do titular
historico[].codigo            product_history.product_code       dado do titular
historico[].nome/marca        product_history.product_name/brand dado do titular
historico[].imagem            product_history.image_url          dado do titular
historico[].consultadoEm      product_history.viewed_at          dado do titular
favoritos[].codigo            product_favorites.product_code     dado do titular
favoritos[].nome/marca        product_favorites.product_name/... dado do titular
favoritos[].imagem            product_favorites.image_url        dado do titular
favoritos[].favoritadoEm      product_favorites.created_at       dado do titular
```

### O que NUNCA entra

```text
users.password_hash, users.password_salt   material de senha
sessions (a tabela inteira)                hash do token, id e validade de sessao
cookie de sessao                           e credencial
users.id, product_history.id, ...          id interno: so serve ao banco
user_id de qualquer linha                  idem
qualquer dado de outro usuario             as consultas filtram por user_id
chave de API, DATABASE_URL                 nunca sao lidas por estas rotas
```

**As sessoes ficam de fora de proposito.** O que o banco guarda de uma sessao e
o hash do token, o id e a validade. Nada disso ajuda o titular a saber o que o
app sabe dele, e o hash e exatamente o que o arquivo nao pode carregar: um
arquivo exportado vai parar em pasta de downloads, e-mail e backup.

**Os ids internos ficam de fora pelo mesmo motivo de economia:** um UUID de
linha nao diz nada ao titular, nao serve para importar em outro servico, e e
mais um identificador estavel circulando fora do sistema. O `id` das alergias
fica, porque ele e o codigo do catalogo (`milk`, `gluten`), nao uma chave do
banco.

As consultas da exportacao nomeiam cada coluna (`backend/src/repositories/accountRepository.js`)
e nunca usam `SELECT *`: uma coluna nova em `users` nao entra no arquivo sem
alguem decidir. Um teste reprova se o repositorio passar a citar `password`
(o hash ou o salt), `token_hash` ou `SELECT *`.

### Identidade

O titular exportado e o dono da **sessao**. `userId` no corpo, na query ou em
cabecalho e ignorado - o teste E5 manda os tres de uma vez com o id de outra
conta. Sem sessao valida: 401. Nao existe rota para exportar os dados de outra
pessoa, nem de administrador: nao ha administrador neste produto.

### Formato: JSON, com versao do formato

JSON e o formato que qualquer linguagem le sem biblioteca extra, e e o mesmo que
a API ja fala. O campo `versaoDoFormato` existe para que uma mudanca futura de
estrutura seja anunciada no proprio arquivo, em vez de quebrar em silencio quem
le. As datas saem em ISO 8601 (UTC).

**Quando a versao do formato muda.** Ela muda quando um campo some, troca de
nome ou muda de significado - o que quebraria quem le. Campo ACRESCENTADO nao
muda a versao: quem le a versao 1 continua lendo do mesmo jeito. Foi o caso do
`alertaMaximo`, na v0.9.0.

### Entrega: download direto, com `Content-Disposition`

Duas opcoes foram consideradas:

```text
download direto        a resposta e o arquivo: Content-Disposition: attachment
JSON + frontend monta  a resposta e JSON comum; o app cria o arquivo no navegador
```

Escolhido: **download direto**. A rota se comporta igual para o app e para quem
a abrir por link ou por linha de comando: o navegador salva o arquivo, com o
nome que o servidor escolheu. O app usa o mesmo nome lido do cabecalho, entao
ha uma regra so de nome de arquivo, no backend, coberta por teste. O corpo
continua sendo JSON, entao a mesma resposta serve a maquina.

### Nome do arquivo

```text
nutriscan-meus-dados-AAAA-MM-DD.json
```

So o produto e o dia. **Nunca o e-mail nem o nome**: o nome do arquivo aparece
em listagem de pasta e no historico de downloads, onde qualquer pessoa com
acesso ao aparelho le. Teste E7.

### Cabecalhos

```text
Cache-Control: no-store   proibe guardar a resposta em QUALQUER cache - proxy,
                          CDN e o cache do proprio navegador. `no-cache` e
                          `private` ainda permitem guardar; so `no-store` impede
                          a copia.
Pragma: no-cache          intermediario antigo, que so entende HTTP/1.0
```

Uma exportacao guardada em cache seria entregue de novo a quem passasse pelo
mesmo caminho depois - inclusive outra pessoa no mesmo aparelho.

### Limitador proprio: 5 por usuario e 20 por IP, por 24 horas

Quantas vezes por dia uma pessoa exporta os proprios dados? Quase sempre uma.
O que justifica mais de uma e o imprevisto: o download que nao terminou, o
arquivo salvo no aparelho errado, exportar de novo depois de apagar um favorito
para ver a diferenca.

```text
por usuario   5 / 24 h    a exportacao de verdade e mais quatro imprevistos
por IP       20 / 24 h    quatro pessoas atras do mesmo endereco (casa,
                          escritorio, CGNAT de celular) esgotando a propria cota
                          no mesmo dia - o que ja e improvavel; contem quem
                          cria contas para exportar em serie
```

A janela e de 24 horas porque a pergunta e "por dia". Mesmo desenho dos tetos de
colecoes da v0.7.2 - usuario E IP, o mais restritivo vence, usuario conferido
primeiro -, pela MESMA fabrica (`criarLimitadoresDeColecoes`), com baldes
proprios: exportar nao gasta a cota de historico e favoritos. Nenhum limitador
existente mudou, e nao ha variavel, cabecalho ou cookie que desligue este.

## Exclusao de conta

### Confirmacao forte

- **A senha atual vai no corpo** e e conferida de novo contra o hash. Sessao
  valida nao basta: um aparelho esquecido aberto nao pode apagar a conta de
  alguem.
- **Senha errada:** 403 `INVALID_CREDENTIALS`, "Senha incorreta. Nada foi
  apagado." - e nada e apagado. 403, e nao 401, porque a sessao continua valida;
  um 401 faria o app achar que a pessoa saiu da conta.
- **A tentativa passa pelo limitador de AUTENTICACAO** (40 por 15 minutos por
  IP), o mesmo balde do login: conferir senha e teste de senha. O limitador vem
  antes da autenticacao, como no login, entao toda tentativa conta.
- **Na tela, nao e um clique.** "Excluir minha conta" so abre o formulario, com
  o aviso "Isso apaga sua conta, suas alergias, seu historico e seus favoritos.
  Nao da para desfazer." O botao "Excluir para sempre" fica desabilitado ate a
  senha estar digitada **e** a caixa "Entendo que nao da para desfazer." marcada.

### O que sai, e por onde

```text
tabela              FK para users.id          ON DELETE   desde
sessions            sessions.user_id          CASCADE     v0.6.6 (migration 001)
user_allergies      user_allergies.user_id    CASCADE     v0.6.6 (migration 001)
product_history     product_history.user_id   CASCADE     v0.7.0 (migration 002)
product_favorites   product_favorites.user_id CASCADE     v0.7.0 (migration 002)
```

Sao todas as tabelas com chave estrangeira para `users` - conferido no catalogo
do PostgreSQL (`pg_constraint`), no banco local e no de producao, e de novo pelo
teste D4 a cada execucao da suite. Nenhuma tabela sem cascata foi encontrada,
entao nenhuma migration foi necessaria.

A rota apaga as sessoes explicitamente e depois a linha do usuario; alergias,
historico e favoritos saem pela cascata. As sessoes nao dependeriam disso - a
cascata tambem as levaria -, mas apagar explicitamente deixa a intencao no
codigo e nao depende de ninguem lembrar da FK.

### Atomicidade

As duas remocoes rodam na **mesma transacao** (`withTransaction`). Se qualquer
etapa falhar - inclusive dentro da cascata, numa tabela filha -, o `ROLLBACK`
desfaz tudo, sessoes inclusive. O teste D8 prova isso no banco real: um gatilho
que faz a remocao de favoritos falhar no meio deixa a conta, as sessoes, o
historico e os favoritos exatamente como estavam.

Uma conta pela metade e pior que uma conta inteira: sobra dado sem dono, e o
titular acredita que foi apagado.

### Exclusao FISICA, e nao logica

Quando o produto diz "excluir", as linhas saem do banco. Nao existe coluna
`deleted_at`, nao existe tabela de "contas excluidas", e nada do conteudo vai
para log ou arquivo.

Exclusao logica - marcar a linha como apagada e esconde-la - foi considerada e
rejeitada:

- o titular pediu para apagar, e os dados continuariam la;
- toda consulta do sistema teria de lembrar do filtro `deleted_at IS NULL`, e a
  primeira que esquecesse devolveria dado de conta "excluida" - inclusive dado
  de saude;
- o e-mail e o nome continuariam ocupando a restricao de unicidade, e a pessoa
  nao conseguiria se cadastrar de novo;
- nada no produto precisa restaurar conta: nao ha periodo de carencia nem painel
  administrativo, e o escopo desta versao exclui os dois.

Se um dia houver motivo para exclusao logica, ela e decisao do dono do projeto,
descrita antes, e nao detalhe de implementacao.

### Depois da exclusao

- o cookie de sessao e limpo na resposta;
- toda sessao da conta, em qualquer aparelho, passa a responder **401** - nao
  500 (teste D5, com tres aparelhos);
- o e-mail e o nome ficam livres para um cadastro novo (teste D7);
- as outras contas nao sao tocadas: historico, favoritos, alergias e login do
  vizinho continuam (teste D6).

### Log

O backend registra **que** houve uma exclusao, e so isso:

```text
[conta] uma conta foi excluida pelo titular
```

Sem id, nome, e-mail ou qualquer dado da conta. Saber que acontece serve a
operacao; saber de quem, nao.

### Nada vai para a Anthropic

Nenhuma das duas rotas importa ou chama o cliente de IA. Um teste reprova se
`accountService`, `accountController`, `accountRoutes` ou `accountRepository`
passarem a importar qualquer coisa de `ai/` ou citarem a Anthropic.

## O que este codigo NAO controla

Escrito para nao parecer que a exclusao alcanca mais do que alcanca:

- **Copias de seguranca do provedor do banco.** A exclusao remove as linhas do
  banco em uso. O provedor do PostgreSQL de producao pode manter historico para
  restauracao por um periodo que depende do plano contratado. Este codigo nao
  le nem apaga esse historico. O prazo **nao foi verificado**.
- **O arquivo exportado.** Depois do download, ele esta no aparelho da pessoa e
  fora do alcance do sistema. Excluir a conta nao apaga copias ja baixadas.
- **Logs da hospedagem.** A plataforma de hospedagem pode registrar as
  requisicoes HTTP (metodo, caminho, status) - o que ela guarda, e por quanto
  tempo, **nao foi verificado**. O caminho das rotas de conta nao carrega dado
  do titular, e esta rota nao apaga log da plataforma.
- **Dados do modo visitante**, que ficam no navegador (ver acima).

## Onde esta no codigo

```text
backend/src/routes/accountRoutes.js          rotas e limitadores
backend/src/controllers/accountController.js cabecalhos, cookie
backend/src/services/accountService.js       montagem do arquivo, senha, transacao
backend/src/repositories/accountRepository.js consultas, coluna por coluna
backend/src/middleware/rateLimit.js          tetos da exportacao e o raciocinio
src/services/accountService.js               download no navegador
src/pages/Account/AccountPage.jsx            cartao "Seus dados" e a confirmacao
backend/tests/account.test.js                testes sem banco
backend/tests/accountIntegration.test.js     E1-E8 e D1-D9 contra PostgreSQL real
```
