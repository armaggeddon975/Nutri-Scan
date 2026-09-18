// Limites por usuario para historico e favoritos.
//
// Os dois numeros vivem aqui, em um lugar so, porque sao aplicados por codigo
// no servico e verificados por teste: espalha-los pelo repositorio faria a
// regra existir em dois lugares que podem divergir.

// HISTORICO - 100 itens.
//
// O historico e um registro automatico: ele cresce sem o usuario pedir. Cem
// produtos DISTINTOS (a deduplicacao por produto ja evita repeticao) cobrem
// meses de compra real. Acima disso a lista deixa de ser navegavel e vira
// armazenamento - ninguem rola ate o item 300 para lembrar de algo.
//
// Quando estoura, o mais antigo sai EM SILENCIO. Isso e aceitavel justamente
// porque o registro e automatico: o usuario nunca pediu para guardar o item
// 101, entao descarta-lo nao desfaz escolha nenhuma dele.
export const HISTORY_LIMIT = 100;

// FAVORITOS - 200 itens.
//
// Favorito e intencao explicita. Descartar um em silencio para caber outro
// apagaria uma escolha que a pessoa fez de proposito - o oposto do caso do
// historico. Por isso aqui o limite NAO poda: estourar devolve erro, e quem
// decide o que sai e o usuario.
//
// O numero existe para limitar abuso, nao uso real: marcar 200 produtos ja e
// muito acima de qualquer uso plausivel, e um script que martela a rota para
// inchar a tabela encontra o teto.
export const FAVORITES_LIMIT = 200;
