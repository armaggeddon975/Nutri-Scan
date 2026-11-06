# Acessibilidade do alerta de alergia - v0.12.0

Este documento diz o que a v0.12.0 cobriu, qual criterio da WCAG 2.2 cada teste
atende, e o que continua aberto.

**Isto NAO e declaracao de conformidade WCAG.** Conformidade exige auditoria
humana com tecnologia assistiva real, e essa auditoria nao foi feita. O que esta
aqui e: quais criterios foram cobertos por teste automatizado, quais foram
conferidos no navegador, e quais nao foram verificados.

## Por que esta versao existe

Onze versoes garantiram que o veredito de alergia esteja CORRETO. Nenhuma
garantiu que ele CHEGUE a pessoa. Ate a v0.11.0, o alerta dependia de:

- **cor**, para distinguir conflito de ausencia de conflito - na tela do
  produto, os alergenicos do perfil apareciam como etiquetas vermelhas com o
  nome ("Leite/lactose"), sem dizer "contem";
- **leitura visual**: nada anunciava o veredito quando ele aparecia depois de
  escanear ou digitar o codigo;
- **ordem visual**: na comparacao, so a posicao na tela dizia de qual produto
  era cada veredito.

Num app de alergia, alerta que nao chega e alerta que nao existe.

## Escopo: o caminho do alerta

Coberto nesta versao:

- o bloco de veredito (`AllergyVerdict`);
- a tela do produto, onde o veredito aparece;
- a tela do Assistente, onde o veredito vem antes do texto do modelo;
- a comparacao, com dois vereditos na mesma tela;
- a camera e a entrada manual de codigo, e a busca que tambem aceita codigo;
- o seletor de alergias e o nivel de alerta.

Fora de escopo (nao auditado, nao alterado): exportacao, exclusao de conta,
historico, favoritos, telas de entrar e cadastrar.

O conteudo do veredito NAO mudou. `shared/allergyVerdict.js`,
`shared/allergenEngine.js` e `shared/productComparison.js` nao foram tocados. A
v0.12.0 muda como o veredito e APRESENTADO.

## O que mudou, requisito por requisito

### 6.1 A cor nunca e o unico sinal (1.4.1)

- O bloco de veredito tem quatro titulos, um por estado: "Conflito com o seu
  perfil" (ou "Alerta máximo: conflito com o seu perfil"), "Pode conter traços",
  "Sem conflito com o seu perfil" e "Não avaliado".
- "Não avaliado" agora aparece - com o motivo: "Você não marcou alergias. O app
  não conferiu conflito." ou "Sem dados de alergênicos. Confira o rótulo
  físico." Antes, sem alergia marcada, o assistente nao mostrava bloco nenhum,
  e a tela do produto mostrava "Sem conflito com o perfil" - sem ter conferido
  nada, porque nao havia o que conferir. O motor sempre disse `not_evaluated`
  nesse caso; a tela e que nao usava o veredito do motor.
- Cada alergenico diz o seu estado: "Contém Leite/lactose", "Pode conter
  Amendoim", e "· alerta máximo" quando e o caso.
- A tela do produto passa a mostrar o MESMO bloco, para todo produto - da rede,
  da base local ou do aparelho. O veredito e o do motor, calculado pela mesma
  funcao que o modo sem rede usa desde a v0.11.0. A lista "Alertas do perfil"
  saiu: ela montava o proprio texto a partir da analise, e nao do veredito - o
  alergenico declarado aparecia so como "Leite/lactose" em vermelho. Os "Pontos
  de atenção" passaram a dizer "Contém" e "Pode conter".
- O icone e decorativo (`aria-hidden`): o titulo ja diz tudo.

### 6.2 Contraste (1.4.3, 1.4.11)

Calculado pela formula da WCAG a partir dos tokens reais de `:root`, pelo teste
A3t: 63 pares. O app tem um tema so (claro, `color-scheme: light`); o teste
falha se um tema escuro aparecer sem ser medido.

Dois pares reprovavam e foram corrigidos, sem afrouxar o criterio:

```text
par                                              antes   depois
linha "Verificação do próprio app..." no tom     3.89    5.17   (opacidade 0.85 -> 1)
  de tracos (15px)
mesma linha no tom de sem conflito               3.97    5.38
dica da busca do topo ("Buscar alimento")        4.40    4.99   (creme 72% -> 80%)
```

Pares que NAO entram na regra, e por que:

- os icones em salvia (`--sage`, 2.93:1 sobre o creme): decorativos, com
  `aria-hidden`; o texto ao lado diz a mesma coisa;
- a borda rosada da etiqueta de risco (`--danger-line`, 1.68:1): decorativa; a
  etiqueta e identificada pelo texto "Contém ...";
- o fundo dos campos de texto do design (areia sobre creme, cerca de 1.1:1): o
  1.4.11 nao exige borda quando o rotulo identifica o campo, e todo campo do
  caminho tem rotulo (A12). O campo da comparacao, que tem borda desenhada,
  passou de 1.58:1 para 5.53:1.

A tabela completa esta no `AUDIT_REPORT.md`.

### 6.3 Leitor de tela recebe o alerta (1.3.1, 4.1.2, 4.1.3)

- **Papel e nome.** O bloco e um `role="group"` com nome pelo titulo:
  "Nutella: Conflito com o seu perfil". O nome do produto entra no nome
  acessivel, invisivel, para quem ouve dois blocos na mesma tela.
- **Anuncio.** Uma regiao viva UNICA (`#anuncio-do-veredito`), montada uma vez
  no app e nunca desmontada. Recebe o veredito quando um produto abre (camera,
  codigo digitado, busca, lista), quando a alergia muda com o produto aberto e
  quando a comparacao fica pronta. O texto poe o estado primeiro: "Nutella.
  Conflito com o seu perfil: Contém Leite/lactose."
- **`polite`, e nao `assertive`.** O anuncio responde a uma acao da propria
  pessoa, que esta esperando por ele: `polite` e lido assim que o leitor termina
  a frase em curso, sem cortar nada. `assertive` interromperia a leitura no
  meio, e num app em que cada produto aberto traz um veredito, interromper toda
  vez o tornaria insuportavel. Nada no app usa `assertive`. O unico anuncio que
  interrompe e o `role="alert"` do erro de codigo digitado, que ja existia desde
  a v0.7.3: ali a pessoa acabou de enviar e o envio foi recusado.
- **Por que uma regiao so, e nao `aria-live` no proprio bloco.** Leitor de tela
  anuncia mudanca numa regiao que JA existia; uma regiao que nasce junto com o
  texto pode ficar muda. E no assistente o bloco fica dentro do log da conversa
  (`role="log"`), que ja anuncia a mensagem nova: um segundo anunciante leria o
  alerta duas vezes.
- **Ordem de leitura.** O veredito vem antes do texto do modelo no DOM - no
  assistente, na tela do produto e em cada coluna da comparacao.
- **Comparacao.** Cada coluna tem nome ("Primeiro produto: Nutella"), cada bloco
  de veredito tem o nome do produto, e os cabecalhos "Primeiro" e "Segundo" das
  tabelas levam o nome do produto, que o leitor le junto com cada celula.

### 6.4 Foco e teclado (2.1.1, 2.4.3, 2.4.7, 2.4.11)

- **Destino do foco apos uma acao.** O foco FICA no controle que a pessoa
  acionou, e o resultado chega pela regiao viva. Marcar uma alergia, comparar,
  enviar o codigo: o foco nao se move. Mover o foco para o veredito tiraria a
  pessoa do campo onde ela pode querer digitar o proximo codigo.
- **Quando a tela troca,** o foco vai para o titulo da tela nova
  (`h2` com `tabIndex=-1`). Antes, o botao que a pessoa acionou sumia - o
  "Comparar com outro produto", por exemplo - e o foco caia no `<body>`. Na
  primeira carga, o foco fica onde o navegador o poe.
- **Ocupado sem perder o foco.** Os controles que esperam resposta (Comparar,
  Explicar, Buscar codigo, a pergunta ao assistente) usam `aria-disabled` e, no
  campo, `readOnly`, em vez de `disabled`: `disabled` tirava o foco do controle
  que a pessoa acabou de usar. O envio repetido e barrado no codigo.
- **O botao da camera e um so,** que alterna entre "Ligar câmera" e "Desligar
  câmera". Eram dois elementos: ao ligar - e ao a camera desligar sozinha depois
  de ler - o botao focado sumia.
- **Anel de foco.** O design trocava o anel de quatro campos (`outline: none`)
  por uma borda de 1px. O anel de 2px volta neles, e na caixa do seletor de
  alergias e da busca do topo.
- **Foco nao encoberto (2.4.11).** A barra de cima gruda no topo e as abas ficam
  fixas embaixo. `scroll-padding` na pagina com a altura medida de cada barra:
  o navegador rola o campo focado para fora delas.

### 6.5 Alvo de toque (2.5.8)

Medido no navegador, no build real, a 320 e 375 px de largura: nenhum alvo das
telas do caminho abaixo de 40 px no menor lado (minimo exigido: 24). E travado
no CSS pelo teste A11.

### 6.6 Formulario e erro (3.3.1, 3.3.2, 3.3.3)

- O campo de codigo da camera ja tinha `<label>` e erro ligado por
  `aria-describedby` desde a v0.7.3. A busca, que tambem aceita codigo, passou a
  fazer o mesmo: a recusa do codigo marca o campo (`aria-invalid`), fica ligada a
  ele e e anunciada (`role="alert"`).
- Com o erro no campo, a linha de status continua na tela mas cala
  (`aria-live="off"`): antes a mesma recusa era lida duas vezes.
- Os quatro motivos de recusa (vazio, letra, tamanho, digito verificador)
  continuam com mensagens diferentes, e cada um chega ao leitor de tela.
- A pergunta ao assistente ganhou rotulo visivel: "Sua pergunta".
- O nivel de alerta diz o que cada caixa liga: "Alerta máximo para
  Leite/lactose".

### 6.7 Movimento (2.3.3)

A regra de `prefers-reduced-motion` do design ja cobria tudo (`*`, `::before`,
`::after`). A camera nao comunica estado por animacao: o botao e a linha de
status dizem o estado em texto; o icone que gira e decorativo.

### 6.8 Idioma e estrutura (3.1.1, 1.3.1)

- `lang="pt-BR"` no documento (ja estava).
- Cada tela comeca num `h1` - invisivel, "NutriScan: Buscar", porque o design
  desenha o titulo da tela no tamanho de `h2` - e desce sem pular nivel. Foram
  corrigidos: "Nutri Assistente" (`h4` direto abaixo do `h2`), os grupos do
  seletor de alergias (`h5`) e o titulo do nivel de alerta (`h4`).
- Landmarks: `header`, `nav` (duas, com nome), `main` unico, rodape; link "Pular
  para o conteúdo".

## Qual criterio cada teste atende

Os testes estao em `backend/tests/accessibility.test.js`. Eles renderizam o JSX
real com esbuild, como o `assistantPageRender.test.js` faz desde a v0.6.8, e
leem o HTML que sai - papel, nome, texto, ordem, atributos. O CSS e lido como o
navegador o le: os dois arquivos na ordem do `main.jsx`, a ultima declaracao
vencendo.

```text
teste  o que prova                                          WCAG 2.2
A1t    sem cor (classe, estilo, icone), 4 estados distintos 1.4.1
A2t    cada alergenico diz "Contém" ou "Pode conter"        1.4.1, 1.3.1
A3t    63 pares de contraste dos tokens reais               1.4.3, 1.4.11
A4t    grupo com nome: estado e produto                     4.1.2, 1.3.1
A5t    regiao polite unica, existe antes; estado primeiro   4.1.3
A6t    veredito antes do texto do modelo                    1.3.2
A7t    comparacao: coluna, bloco e tabela com o nome        1.3.1, 4.1.2
A8t    controles nativos, sem tabindex positivo, ocupado    2.1.1, 2.1.2, 2.4.3
       sem disabled, botao da camera estavel
A9t    anel de foco de 2px, devolvido onde o design tirou   2.4.7, 1.4.11
A10    folga de rolagem >= barras fixas                     2.4.11
A11    alvos >= 24 px no CSS                                2.5.8
A12    <label> visivel nos campos                           1.3.1, 3.3.2, 2.5.3
A13    4 motivos de recusa distintos, ligados e anunciados  3.3.1, 3.3.3, 4.1.3
A14    alergia e nivel de alerta com nome e estado          4.1.2
A15    movimento reduzido; camera diz o estado em texto     2.3.3
A16    lang, cabecalhos sem pulo, landmarks                 3.1.1, 1.3.1, 2.4.1
A17    nome vindo da Open Food Facts chega como texto       seguranca (e 4.1.2)
R1-R7  regressao: C1, severidade, comparacao, cache offline,
       isolamento, codigo de barras, handler de erro
```

Mutacao: 15 mutantes (`AC1`-`AC15` em `scripts/mutation-check.js`), um para
cada teste que importa - inclusive os cinco exigidos: estado so por cor (A1t),
par de cor abaixo do minimo (A3t), regiao sem `aria-live` (A5t), veredito depois
do texto do modelo (A6t), alvo abaixo de 24 px (A11).

## O que CONTINUA ABERTO

- **Leitor de tela real: NAO VERIFICADO.** Nenhum teste ouviu o NVDA, o JAWS, o
  VoiceOver ou o TalkBack lendo o alerta. Os testes provam que a informacao esta
  exposta - papel, nome, regiao viva, ordem -, nao que a experiencia e boa. Em
  particular, nao foi ouvido: se o anuncio da regiao viva sai inteiro, se ele
  compete com a linha de status ("Nutella carregado.") que tambem e `polite`, e
  como cada leitor le o grupo com nome.
- **Toque em aparelho real: NAO VERIFICADO.** Os alvos foram medidos no
  navegador do ambiente de desenvolvimento, em tamanho de celular emulado.
- **Camera em hardware: NAO VERIFICADO**, como em todas as versoes.
- **Ampliacao de texto e reflow (1.4.4, 1.4.10): NAO TESTADO.** Fora da lista
  desta versao. A folga de rolagem de cima e em `rem` para crescer junto com a
  letra, mas nada foi medido com 200% de texto.
- **Navegadores:** a verificacao no navegador foi feita no Chromium do painel do
  ambiente. Safari e Firefox nao foram abertos.
- **Anuncio em dobro possivel:** ao abrir um produto, a linha de status diz
  "Nutella carregado." e a regiao do veredito diz o estado - duas mensagens
  `polite` seguidas. Ao marcar uma alergia com produto aberto, a lista de
  alergias escolhidas (`aria-live` desde antes) e o veredito mudam juntos. So o
  teste com leitor de tela real diz se isso incomoda.
- **Telas fora do escopo** (conta, exportacao, exclusao, historico, favoritos,
  entrar, cadastrar): nao auditadas.

## Na v0.14.0

Nada mudou na apresentacao do alerta. A v0.14.0 mexeu em tres regras do motor
(o que ele aponta, nao como o veredito chega a pessoa). A regressao desta parte
rodou de novo pelo codigo real em `backend/tests/medicaoDoMotor.test.js` (R7:
os quatro estados do veredito distintos sem cor, o veredito antes do texto do
modelo, anuncio `polite`), e as suites `accessibility.test.js` seguem verdes. O
teste com leitor de tela real continua NAO EXECUTADO.

## Roteiro para a verificacao humana

Com um leitor de tela ligado (NVDA no Windows, TalkBack no Android ou VoiceOver
no iPhone) e uma conta descartavel:

1. Abra a tela Alergias e marque Leite/lactose. O leitor deve dizer o nome da
   caixa e "marcado".
2. Va a Camera, toque em "Ou digite o código", digite `3017624010702` e envie.
   Deve ouvir: "Esse código não existe. Confira número por número na
   embalagem." - uma vez so.
3. Corrija para `3017624010701` e envie. Depois do carregamento, deve ouvir o
   nome do produto e "Conflito com o seu perfil: Contém Leite/lactose", sem
   precisar procurar na tela.
4. Na tela do produto, navegue pelos titulos e grupos: o bloco de veredito deve
   vir antes da tabela nutricional e se chamar "Nutella: Conflito com o seu
   perfil".
5. Toque em "Comparar com outro produto", digite `5449000000996` no segundo
   campo e compare. Deve ouvir "Comparação pronta", com cada veredito dito junto
   do nome do seu produto.
6. Pergunte ao assistente "Posso consumir?" com o produto aberto: o veredito
   deve ser lido antes da resposta.

Anote o que foi ouvido, em que ordem, e o que nao foi ouvido.
