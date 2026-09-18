// Historico e favoritos do VISITANTE.
//
// Tudo aqui vive so no navegador. Nada disso chega ao PostgreSQL: sem conta nao
// existe usuario a que associar a linha, e inventar um seria criar dado orfao
// que ninguem consegue apagar depois.
//
// A separacao deste arquivo em relacao a `collectionsService.js` e proposital.
// Uma funcao unica que decidisse sozinha entre banco e localStorage seria o
// lugar exato onde um visitante acabaria gravando no servidor por engano.
//
// NAO HA MIGRACAO AUTOMATICA para a conta no login. Mover dado local para o
// servidor sem o usuario pedir e mudanca de contrato: ele marcou favoritos num
// aparelho emprestado, cria conta, e de repente aquilo virou parte do perfil
// dele em todo lugar. Se isso for desejado, e decisao de produto com tela de
// confirmacao, nao detalhe de implementacao.

const HISTORY_KEY = "nutriscan:guest-history";
const FAVORITES_KEY = "nutriscan:guest-favorites";

// Os mesmos limites do servidor, pela mesma razao: o historico e automatico e
// poda sozinho; favorito e escolha explicita e nao e descartado em silencio.
const HISTORY_LIMIT = 100;
const FAVORITES_LIMIT = 200;

function ler(chave) {
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? dados : [];
  } catch {
    // Armazenamento bloqueado, cota estourada ou JSON corrompido: lista vazia
    // e o resultado seguro. Visitante perder historico local nao tem
    // consequencia de seguranca.
    return [];
  }
}

function gravar(chave, itens) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(itens));
    return true;
  } catch {
    return false;
  }
}

export function readGuestHistory() {
  return ler(HISTORY_KEY);
}

export function recordGuestView(produto) {
  if (!produto?.productCode) return readGuestHistory();

  const atual = readGuestHistory().filter((item) => item.productCode !== produto.productCode);
  const item = { ...produto, id: `local-${produto.productCode}`, viewedAt: new Date().toISOString() };
  const atualizado = [item, ...atual].slice(0, HISTORY_LIMIT);
  gravar(HISTORY_KEY, atualizado);
  return atualizado;
}

export function removeGuestHistoryItem(id) {
  const atualizado = readGuestHistory().filter((item) => item.id !== id);
  gravar(HISTORY_KEY, atualizado);
  return atualizado;
}

export function clearGuestHistory() {
  gravar(HISTORY_KEY, []);
  return [];
}

export function readGuestFavorites() {
  return ler(FAVORITES_KEY);
}

export function toggleGuestFavorite(produto) {
  if (!produto?.productCode) return { favoritado: false, itens: readGuestFavorites() };

  const atual = readGuestFavorites();
  const jaTem = atual.some((item) => item.productCode === produto.productCode);

  if (jaTem) {
    const atualizado = atual.filter((item) => item.productCode !== produto.productCode);
    gravar(FAVORITES_KEY, atualizado);
    return { favoritado: false, itens: atualizado };
  }

  if (atual.length >= FAVORITES_LIMIT) {
    return { favoritado: false, itens: atual, limite: true };
  }

  const item = { ...produto, id: `local-${produto.productCode}`, createdAt: new Date().toISOString() };
  const atualizado = [item, ...atual];
  gravar(FAVORITES_KEY, atualizado);
  return { favoritado: true, itens: atualizado };
}

export function removeGuestFavorite(id) {
  const atualizado = readGuestFavorites().filter((item) => item.id !== id);
  gravar(FAVORITES_KEY, atualizado);
  return atualizado;
}
