// Camada de rede da Open Food Facts.
//
// A infraestrutura publica da OFF e instavel: os endpoints de BUSCA respondem
// 503 de forma intermitente (medido em 04/09/2026: cerca de metade das
// chamadas). A resposta de erro nao traz `Access-Control-Allow-Origin`, entao
// no navegador a falha aparece como erro de CORS, e nao como 503 — foi isso que
// deixou a busca por nome "sem resultado" mesmo com a OFF no ar.
//
// Duas defesas, porque as falhas sao independentes entre si:
//   1. retentativa com espera crescente para erro de rede, 5xx e 429;
//   2. endpoint reserva (`/cgi/search.pl`) quando o `/api/v2/search` desiste.
//
// A consulta por CODIGO DE BARRAS (`/api/v3/product`) e estavel e continua
// sendo a chamada principal do scanner, mas ganha a mesma retentativa: ela
// tambem pode cair em 503.

const PRODUCT_BASE = "https://world.openfoodfacts.org/api/v3/product";
const SEARCH_BASE = "https://world.openfoodfacts.org/api/v2/search";
const LEGACY_SEARCH_BASE = "https://world.openfoodfacts.org/cgi/search.pl";

// Tempos medidos em 04/09/2026 contra a API publica, do navegador:
//   /api/v2/search   falha em ~7,8s quando esta fora   |  lento quando responde
//   /cgi/search.pl   responde em ~0,8s                 |  falha rapido
//
// Por isso os dois caminhos tem orcamento diferente. A busca por nome nao pode
// insistir no endpoint lento: tres tentativas ali passavam de 20s de espera com
// a tela parada em "Procurando...". Uma tentativa curta no principal e entao o
// reserva, que e rapido, da resposta em poucos segundos na maioria dos casos.
const SEARCH_TIMEOUT_MS = 5000;
const PRODUCT_TIMEOUT_MS = 8000;

// O endpoint principal de busca nao ganha retentativa: quando ele falha, o
// reserva chega antes de uma segunda tentativa terminar.
const SEARCH_PRIMARY_RETRY_DELAYS_MS = [];
const SEARCH_FALLBACK_RETRY_DELAYS_MS = [300];

// A consulta por codigo e o caminho critico do scanner e e estavel: aqui vale
// insistir, porque a alternativa e a pessoa escanear o produto de novo.
const PRODUCT_RETRY_DELAYS_MS = [400, 1200];

const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "product_name_pt",
  "product_name_en",
  "brands",
  "quantity",
  "image_front_url",
  "ingredients_text",
  "ingredients_text_pt",
  "ingredients_text_en",
  "nutriments",
  "nutriscore_grade",
  "nutrition_grades",
  "nutrition_data_per",
  "serving_size",
  "allergens_tags",
  "traces_tags",
  "traces",
  "labels_tags",
  "categories_tags",
].join(",");

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// 429 e 5xx sao temporarios: a OFF costuma responder na tentativa seguinte.
// 4xx (fora 429) e resposta definitiva e nao deve ser repetida.
function isRetriableStatus(status) {
  return status === 429 || status >= 500;
}

function markProductSource(product) {
  return { ...product, source: "Open Food Facts", isLocal: false };
}

export function createOpenFoodFactsService({
  fetchImpl,
  sleep = defaultSleep,
  searchTimeoutMs = SEARCH_TIMEOUT_MS,
  productTimeoutMs = PRODUCT_TIMEOUT_MS,
} = {}) {
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);

  // Evita que uma chamada pendurada segure a interface para sempre: sem
  // timeout, uma conexao lenta trava a tela de "Buscando produto...".
  async function requestOnce(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await doFetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        // 503 da OFF vem como pagina HTML. Corpo ilegivel nao e resposta util:
        // o status decide o que fazer.
        data = null;
      }

      return { ok: response.ok, status: response.status, data };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Repete enquanto o erro for temporario. Devolve a ultima resposta obtida,
  // mesmo que ainda seja um erro: quem chamou decide como traduzir isso.
  async function requestWithRetry(url, { retryDelaysMs, timeoutMs }) {
    let lastError = null;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        const result = await requestOnce(url, timeoutMs);
        if (result.ok || !isRetriableStatus(result.status)) return result;
        lastError = new Error(`Open Food Facts respondeu HTTP ${result.status}`);
        // 5xx com corpo ilegivel: guarda o resultado para o caso de acabarem
        // as tentativas.
        lastError.lastResult = result;
      } catch (error) {
        // Erro de rede, CORS ou timeout. Sao os casos em que o navegador nem
        // chega a ver um status.
        lastError = error;
      }

      const delay = retryDelaysMs[attempt];
      if (delay === undefined) break;
      await sleep(delay);
    }

    if (lastError?.lastResult) return lastError.lastResult;
    throw lastError || new Error("Open Food Facts indisponivel");
  }

  function readSearchResults(data) {
    return (data?.products || [])
      .filter((item) => item.product_name || item.product_name_pt)
      .map(markProductSource);
  }

  async function searchWithV2(term) {
    const params = new URLSearchParams({
      search_terms: term,
      countries_tags: "en:brazil",
      fields: PRODUCT_FIELDS,
      page_size: "12",
      sort_by: "unique_scans_n",
    });

    const { ok, data } = await requestWithRetry(`${SEARCH_BASE}?${params}`, {
      retryDelaysMs: SEARCH_PRIMARY_RETRY_DELAYS_MS,
      timeoutMs: searchTimeoutMs,
    });
    if (!ok) throw new Error("Busca indisponivel no endpoint principal");
    return readSearchResults(data);
  }

  // Endpoint antigo, ainda mantido pela OFF. Devolve o mesmo formato
  // (`count` + `products[]`), mas o filtro de pais tem outro nome.
  async function searchWithLegacy(term) {
    const params = new URLSearchParams({
      search_terms: term,
      countries_tags_en: "brazil",
      fields: PRODUCT_FIELDS,
      page_size: "12",
      sort_by: "unique_scans_n",
      json: "1",
    });

    const { ok, data } = await requestWithRetry(`${LEGACY_SEARCH_BASE}?${params}`, {
      retryDelaysMs: SEARCH_FALLBACK_RETRY_DELAYS_MS,
      timeoutMs: searchTimeoutMs,
    });
    if (!ok) throw new Error("Busca indisponivel no endpoint reserva");
    return readSearchResults(data);
  }

  async function searchProductsByName(term) {
    try {
      return await searchWithV2(term);
    } catch (primaryError) {
      try {
        return await searchWithLegacy(term);
      } catch {
        // Preserva o erro do endpoint principal: e o mais informativo dos dois.
        throw primaryError;
      }
    }
  }

  async function fetchProductByBarcode(barcode) {
    const url = `${PRODUCT_BASE}/${encodeURIComponent(barcode)}?fields=${PRODUCT_FIELDS}`;
    const { ok, status, data } = await requestWithRetry(url, {
      retryDelaysMs: PRODUCT_RETRY_DELAYS_MS,
      timeoutMs: productTimeoutMs,
    });

    // Produto ausente do cadastro e resposta valida, nao falha de rede.
    if (status === 404 || data?.result?.id === "product_not_found") return null;

    if (!ok) throw new Error("A consulta falhou. Tente novamente.");

    const found = data?.status === "success" || data?.status === "success_with_warnings";
    if (!found || !data?.product) return null;

    return markProductSource(data.product);
  }

  return { searchProductsByName, fetchProductByBarcode };
}

const defaultService = createOpenFoodFactsService();

export const searchProductsByName = (term) => defaultService.searchProductsByName(term);
export const fetchProductByBarcode = (barcode) => defaultService.fetchProductByBarcode(barcode);
