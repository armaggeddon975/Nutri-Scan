import assert from "node:assert/strict";
import test from "node:test";

import { createOpenFoodFactsService } from "../../src/services/openFoodFactsService.js";

// Medido em 04/09/2026 contra a API publica: os endpoints de BUSCA da Open Food
// Facts respondem 503 em cerca de metade das chamadas, de forma intermitente. A
// resposta de erro nao traz Access-Control-Allow-Origin, entao no navegador a
// falha chega como erro de CORS. Sem retentativa, a busca por nome ficava
// "sem resultado" com a OFF no ar.

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// 503 da OFF vem como pagina HTML, nao como JSON.
function htmlErrorResponse(status) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token '<'");
    },
  };
}

function serviceWith(fetchImpl) {
  // sleep neutralizado: o teste verifica a decisao de repetir, nao a espera.
  return createOpenFoodFactsService({ fetchImpl, sleep: async () => {} });
}

test("busca por nome sobrevive a um 503 intermitente", async () => {
  const urls = [];
  const service = serviceWith(async (url) => {
    urls.push(url);
    if (urls.length === 1) return htmlErrorResponse(503);
    return jsonResponse(200, { products: [{ code: "7891000100103", product_name: "Leite Moça" }] });
  });

  const results = await service.searchProductsByName("leite");

  assert.equal(results.length, 1);
  assert.equal(results[0].code, "7891000100103");
  assert.equal(results[0].source, "Open Food Facts");
});

test("erro de rede tambem e tratado, nao apenas o 503", async () => {
  let calls = 0;
  const service = serviceWith(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("Failed to fetch");
    return jsonResponse(200, { products: [{ code: "1", product_name: "Arroz" }] });
  });

  const results = await service.searchProductsByName("arroz");

  assert.equal(results.length, 1);
});

// Medicao de 04/09/2026: o endpoint principal demora ~7,8s para falhar,
// enquanto o reserva responde em ~0,8s. Insistir no principal deixava a tela
// parada em "Procurando..." por mais de 20s. Se alguem reintroduzir retentativa
// ali, este teste quebra.
test("o endpoint lento nao e tentado duas vezes: o reserva vem antes", async () => {
  const urls = [];
  const service = serviceWith(async (url) => {
    urls.push(url);
    if (url.includes("/api/v2/search")) return htmlErrorResponse(503);
    return jsonResponse(200, { products: [{ code: "3", product_name: "Pão" }] });
  });

  await service.searchProductsByName("pao");

  const primaryCalls = urls.filter((url) => url.includes("/api/v2/search"));
  assert.equal(primaryCalls.length, 1, "o endpoint principal so pode ser chamado uma vez");
});

test("quando o endpoint principal desiste, a busca cai no endpoint reserva", async () => {
  const urls = [];
  const service = serviceWith(async (url) => {
    urls.push(url);
    if (url.includes("/api/v2/search")) return htmlErrorResponse(503);
    return jsonResponse(200, { products: [{ code: "2", product_name: "Feijão" }] });
  });

  const results = await service.searchProductsByName("feijao");

  assert.equal(results.length, 1);
  assert.equal(results[0].product_name, "Feijão");
  assert.ok(
    urls.some((url) => url.includes("/cgi/search.pl")),
    "o endpoint reserva precisa ser tentado",
  );
});

test("o endpoint reserva usa o filtro de pais que ele entende", async () => {
  const urls = [];
  const service = serviceWith(async (url) => {
    urls.push(url);
    if (url.includes("/api/v2/search")) return htmlErrorResponse(503);
    return jsonResponse(200, { products: [] });
  });

  await service.searchProductsByName("bolacha");

  const legacyUrl = urls.find((url) => url.includes("/cgi/search.pl"));
  assert.ok(legacyUrl.includes("countries_tags_en=brazil"));
  assert.ok(legacyUrl.includes("json=1"));
});

test("busca so falha quando os dois endpoints falham", async () => {
  const service = serviceWith(async () => htmlErrorResponse(503));

  await assert.rejects(() => service.searchProductsByName("nutella"));
});

test("consulta por codigo de barras tambem repete em 503", async () => {
  let calls = 0;
  const service = serviceWith(async () => {
    calls += 1;
    if (calls < 3) return htmlErrorResponse(503);
    return jsonResponse(200, {
      status: "success",
      product: { code: "3017624010701", product_name: "Nutella" },
    });
  });

  const product = await service.fetchProductByBarcode("3017624010701");

  assert.equal(product.product_name, "Nutella");
  assert.equal(calls, 3);
});

// Produto ausente do cadastro e resposta definitiva: repetir so faria a pessoa
// esperar mais para receber a mesma resposta.
test("produto nao cadastrado responde na primeira tentativa, sem repetir", async () => {
  let calls = 0;
  const service = serviceWith(async () => {
    calls += 1;
    return jsonResponse(404, { result: { id: "product_not_found" } });
  });

  const product = await service.fetchProductByBarcode("0000000000000");

  assert.equal(product, null);
  assert.equal(calls, 1, "404 nao pode ser repetido");
});

test("resposta de sucesso com aviso ainda entrega o produto", async () => {
  const service = serviceWith(async () =>
    jsonResponse(200, {
      status: "success_with_warnings",
      product: { code: "7891910000197", product_name: "União Refinado" },
    }),
  );

  const product = await service.fetchProductByBarcode("7891910000197");

  assert.equal(product.product_name, "União Refinado");
  assert.equal(product.isLocal, false);
});

test("chamada pendurada nao trava a tela: existe timeout com abort", async () => {
  let sawSignal = false;
  const service = createOpenFoodFactsService({
    sleep: async () => {},
    productTimeoutMs: 5,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        sawSignal = Boolean(init?.signal);
        init.signal.addEventListener("abort", () => reject(new Error("AbortError")));
      }),
  });

  await assert.rejects(() => service.fetchProductByBarcode("3017624010701"));
  assert.equal(sawSignal, true, "a requisicao precisa levar um AbortSignal");
});
