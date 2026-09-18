import { apiRequest } from "./apiClient";

// Historico e favoritos.
//
// FONTE DE VERDADE E O POSTGRESQL. Estas funcoes so falam com a API; nao existe
// leitura de localStorage aqui, e nao deve existir. O cache de leitura, quando
// houver, vive no estado do React e e descartado a cada carga - nunca vira
// fonte, porque um cache que decide o que o usuario ve deixa de ser cache.
//
// VISITANTE NAO CHEGA AQUI. Quem nao tem conta usa `guestCollections.js`, que
// grava apenas no navegador. Esta separacao e proposital: uma unica funcao que
// decidisse sozinha entre banco e localStorage seria o lugar exato onde um
// visitante acabaria gravando no PostgreSQL por engano.

export function fetchHistory() {
  return apiRequest("/api/history");
}

export function recordProductView(produto) {
  return apiRequest("/api/history", { method: "POST", body: produto });
}

export function deleteHistoryItem(id) {
  return apiRequest(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function clearHistory() {
  return apiRequest("/api/history", { method: "DELETE" });
}

export function fetchFavorites() {
  return apiRequest("/api/favorites");
}

export function toggleFavorite(produto) {
  return apiRequest("/api/favorites/toggle", { method: "POST", body: produto });
}

export function deleteFavorite(id) {
  return apiRequest(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Extrai do produto da Open Food Facts apenas os campos que as rotas aceitam.
//
// Passar o produto inteiro seria mandar para o banco dezenas de campos que
// ninguem le, e - pior - abriria espaco para enviar sem querer algo que a
// tabela nao deve guardar, como o resultado do motor de alergia. O veredito e
// sempre recalculado na exibicao, com o perfil atual.
export function toProductRef(produto, nome) {
  if (!produto) return null;
  const codigo = String(produto.code || "").trim();
  if (!codigo) return null;

  const marca = (produto.brands || "").split(",")[0]?.trim() || null;
  const imagem = produto.image_front_url || produto.image_url || null;

  return {
    productCode: codigo,
    productName: (nome || produto.product_name || codigo).slice(0, 300),
    productBrand: marca ? marca.slice(0, 200) : null,
    imageUrl: typeof imagem === "string" && imagem.startsWith("https://") ? imagem : null,
  };
}
