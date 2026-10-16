import { apiRequest } from "./apiClient";
import { buildAssistantProductContext } from "./aiAssistantService";
import { analyzeComparedProduct, compareProducts } from "../../shared/productComparison.js";

// Comparacao de dois produtos (v0.10.0), do lado do navegador.
//
// Os dois produtos JA foram buscados por `consultarDoisProdutos`, o caminho de
// sempre. Aqui eles vao ao backend, que calcula um veredito por produto com o
// perfil da sessao. O produto vai enxuto, pelo mesmo `buildAssistantProductContext`
// que o assistente usa.

function corpo(itens, guestAllergies) {
  return {
    products: itens.map((item) => ({ code: item.codigo, product: buildAssistantProductContext(item.produto) })),
    guestAllergies,
  };
}

export function compararNoServidor(itens, { guestAllergies = [] } = {}) {
  return apiRequest("/api/compare", { method: "POST", body: corpo(itens, guestAllergies), timeoutMs: 15000 });
}

export function explicarNoServidor(itens, { guestAllergies = [] } = {}) {
  return apiRequest("/api/compare/explain", { method: "POST", body: corpo(itens, guestAllergies), timeoutMs: 30000 });
}

// Sem servidor, o mesmo modulo compartilhado roda aqui, com o perfil que o
// aparelho tem - o mesmo que a tela do produto ja usa. O alerta de alergia nao
// depende de rede.
export function compararNoAparelho(itens, { profileAllergies = [], alertLevels = {} } = {}) {
  return compareProducts(
    itens.map((item) => ({ code: item.codigo, product: buildAssistantProductContext(item.produto) })),
    { profileAllergies, alertLevels },
  );
}

// Um lado so, quando o outro nao foi encontrado: o produto que veio aparece
// com o veredito DELE, e o que faltou aparece como faltou.
export function analisarUmNoAparelho(item, lado, { profileAllergies = [], alertLevels = {} } = {}) {
  return {
    slot: lado,
    code: item.codigo,
    ...analyzeComparedProduct(buildAssistantProductContext(item.produto), { profileAllergies, alertLevels }),
  };
}
