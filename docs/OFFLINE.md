# Usar o app sem rede - v0.11.0

Este documento registra as decisoes da leitura sem rede: o que fica no aparelho,
o que nunca fica, por quanto tempo, e por que nao ha escrita sem rede. Ele
descreve o que o software faz. Nao e orientacao de saude nem de nutricao.

## O problema

O NutriScan vive no celular, dentro do supermercado - exatamente onde o sinal
cai: corredor fundo, subsolo, estoque. Ate a v0.10.0, sem rede o app nao fazia
nada, nem com o que ja tinha visto. Quem leu um produto ontem nao conseguia rever
o veredito hoje se o sinal sumisse.

O motor de alergia vive em `shared/` e sempre rodou no navegador. A capacidade de
avaliar um produto sem rede existia; faltava guardar o produto.

## O que funciona sem rede

```text
FUNCIONA, com o que ja passou por este aparelho
  o perfil de alergias e o nivel de alerta da conta aberta aqui
  os produtos ABERTOS com internet neste aparelho (historico e favoritos)
  consulta por codigo de barras, so desses produtos
  o veredito de alergia, REFEITO no aparelho com o perfil de agora
  as listas de historico e favoritos, como estavam na ultima conexao
  comparar dois produtos, quando os DOIS estao guardados
  a base local de alimentos que ja vem no app

NAO FUNCIONA
  buscar produto novo (por codigo ou por nome)
  o assistente de IA - a tela diz "Sem internet, o assistente nao responde"
  comparar com produto que nao esta guardado
  exportar os dados, excluir a conta, entrar, criar conta
  favoritar, marcar alergia, mudar o nivel de alerta, apagar historico
```

Todo dado vindo do aparelho aparece marcado: "Do aparelho · guardado em
16/10/2026". Ele nunca se passa por dado fresco.

## Produto que nao esta no aparelho: nao disponivel offline

Sem rede, o app consulta APENAS o que o aparelho guardou, pelo codigo exato. Para
qualquer outro codigo a resposta e explicita:

"Sem internet. O produto 7894900011517 nao esta disponivel offline. Ele so fica
guardado depois de aberto com internet."

Nada de produto parecido, por prefixo de codigo, por marca ou por semelhanca. Num
app de alergia, produto aproximado e produto errado.

O codigo passa antes pela MESMA conferencia de sempre: digito verificador de
`shared/barcode.js`, UPC-A para EAN-13, codigo nao-EAN intacto. Codigo invalido e
recusado antes de o aparelho ser consultado.

## O veredito NUNCA e guardado

Esta e a regra mais importante. O aparelho guarda o PRODUTO - nome, marca,
ingredientes, alergenicos, tabela nutricional. Ele nunca guarda o veredito.

O veredito depende do perfil de alergias e do nivel de alerta, que mudam. Um
veredito guardado de tres semanas atras poderia dizer "sem conflito" para quem
marcou uma alergia nova ontem: informacao de seguranca errada com cara de certa.
E a mesma regra que ja vale para historico e favoritos desde a v0.7.0.

Sem rede, o veredito e refeito a cada leitura pelo motor de `shared/`, com o
perfil que o aparelho tem naquele momento. O alerta maximo vale igual: piso
`urgent` no declarado, conflito com `caution` no traco.

## O que fica guardado, e o que nunca fica

O mecanismo e o IndexedDB do navegador, num banco proprio (`nutriscan-offline`).

```text
produtos   so os campos que o motor e a tela leem, e a data em que vieram da
           internet - por conta, ate 300 (o historico guarda 100 e os
           favoritos, 200)
perfis     id e nome da conta, alergias e nivel de alerta
colecoes   as listas de historico e favoritos, so as referencias
sessao     qual conta esta aberta neste aparelho
```

Nunca: veredito ou qualquer resultado do motor; senha, hash, salt, token de
sessao, cookie, chave de API; e-mail.

Tudo entra por uma lista fechada de campos, na escrita e de novo na leitura: dado
da Open Food Facts continua nao confiavel por estar no aparelho.

**Por que IndexedDB:** o `localStorage` e sincrono e pequeno - 300 produtos lidos
e reescritos a cada abertura travariam a tela de um celular simples. IndexedDB e
assincrono, guarda objeto estruturado e tem bem mais espaco. Cookie esta fora:
iria para o servidor em toda requisicao.

## Uma conta por aparelho, e a saida limpa

O cache e por aparelho e por conta. Cada registro tem dono: a conta, ou o
visitante. O aparelho guarda o cache de UMA conta por vez: quando o servidor
confirma uma conta, o de qualquer outra sai.

O cache da conta sai do aparelho inteiro - perfil, listas, produtos e a marca de
sessao:

- **ao sair da conta**, sempre - mesmo que o servidor nao responda;
- **ao excluir a conta**, neste aparelho, depois de o servidor confirmar;
- **quando o servidor recusa a sessao** (expirou, saiu em outro aparelho, conta
  excluida em outro aparelho) - na proxima vez que este aparelho falar com ele.

O cadastro leva as alergias marcadas como visitante para a conta nova; a copia de
visitante sai do aparelho. Sem isso, depois de sair, as alergias de quem saiu
continuariam no navegador, como "de visitante".

O cache do visitante e dele e fica: nunca veio de uma conta.

## Validade do produto: 30 dias

Rotulo muda: receita reformulada e real, e para alergia ela importa. Por isso o
produto guardado vale 30 dias a contar de quando veio da internet. Passado isso,
ele NAO e servido sem rede - e tratado como ausente, com o motivo dito:

"Sem internet. O dado do produto 5449000000996 neste aparelho e de 15/09/2026,
antigo demais para usar. Confira o rotulo."

Por que 30 dias: cobre a compra da semana e a do mes, que e o uso real; um mes e
curto perto do ritmo em que um rotulo e reformulado, e longo o bastante para o
aparelho ser util. Abrir o produto com internet renova a copia e a data. O app
nao renova sozinho em segundo plano: buscaria ate 300 produtos na Open Food Facts
sem a pessoa pedir.

O perfil nao vence: e da propria pessoa e so muda por acao dela. Aparece com a
data de quando o servidor o confirmou.

## "Online" que nao responde

O navegador diz se esta offline, mas "online" nao garante resposta.

- **Navegador sem rede:** o app nem tenta a internet - vai direto ao aparelho.
- **Online, mas a Open Food Facts nao responde:** a consulta por codigo insiste
  tres vezes, ate 8 s cada. Com o produto guardado, a pessoa nao espera tudo
  isso: passados 6 s, ve o que o aparelho tem, marcado ("A internet esta
  demorando..."), e a tela troca pela versao da internet se ela chegar. Se a
  internet desistir, fica o do aparelho, marcado ("A internet nao respondeu").
- **Online, mas o servidor do NutriScan nao responde:** a sessao e lida do
  aparelho e a tela avisa: "Sem conexao com o servidor. Perfil guardado neste
  aparelho em ...". Quando o navegador avisa que a rede voltou, o app pede ao
  servidor de novo.
- **Com rede de verdade, a rede manda.** O cache nunca impede uma consulta
  fresca, e o produto aberto com rede atualiza a copia.

## Por que nao ha escrita sem rede

Nesta versao, sem rede, o app SO LE. Favoritar, marcar alergia, mudar o nivel de
alerta, apagar historico - com conta, nada disso acontece sem internet, nem fica
guardado para depois. A tela diz: "Sem internet. Nao da para favoritar agora."

Uma fila de escrita para mandar depois traz conflito entre aparelhos: a pessoa
tira uma alergia no celular sem rede e marca outra no computador; quando o
celular volta, qual vale? Resolver isso direito e uma versao inteira, e nao cabe
junto com a leitura.

O visitante continua como sempre: o que ele marca fica so no proprio navegador,
sem servidor e sem fila.

## O que esta versao NAO faz

- **Abrir o app ja sem sinal.** Funciona o app aberto que perde o sinal - entrou
  no mercado com rede e foi para o corredor do fundo. Abrir do zero, sem rede,
  exige um service worker que guarde o proprio app, e isso nao foi feito nesta
  versao.
- **Imagem do produto sem rede.** A imagem nao e guardada; sem rede ela pode nao
  aparecer.
- **Produto aberto em OUTRO aparelho.** O historico da conta pode ter produtos
  que este aparelho nunca abriu: sem rede, eles aparecem na lista, mas abrir diz
  que nao estao disponiveis offline.
