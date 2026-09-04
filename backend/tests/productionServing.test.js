import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { createApp } from "../src/app.js";

// Regressao da v0.6.7: o backend passou a servir o frontend na mesma origem e
// esse codigo nasceu sem teste nenhum. Dois defeitos reais escaparam ate a
// auditoria: `/API/naoexiste` e `/api` devolviam o HTML do app com status 200,
// porque o roteamento do Express nao diferencia maiusculas e o guarda do
// fallback diferenciava.

const tempRoots = [];

function makeDist({ withBuild }) {
  const root = mkdtempSync(path.join(os.tmpdir(), "nutriva-dist-"));
  tempRoots.push(root);

  if (withBuild) {
    mkdirSync(path.join(root, "assets"), { recursive: true });
    writeFileSync(path.join(root, "index.html"), "<!doctype html><title>NutriVa</title>");
    writeFileSync(path.join(root, "assets", "app.js"), "console.log('build');");
    // Arquivo sensivel dentro da raiz servida, para provar que so o que existe
    // em dist/ e exposto e que nada de fora vaza.
    writeFileSync(path.join(root, "publico.txt"), "conteudo publico");
  }

  return root;
}

after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

async function withServer(distDir, callback) {
  const server = createServer(createApp({ distDir }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function fetchInfo(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return {
    status: response.status,
    type: response.headers.get("content-type") || "",
    body: await response.text(),
    headers: response.headers,
  };
}

test("com build presente, o app e servido e os assets tambem", async () => {
  const distDir = makeDist({ withBuild: true });

  await withServer(distDir, async (baseUrl) => {
    const home = await fetchInfo(baseUrl, "/");
    assert.equal(home.status, 200);
    assert.match(home.type, /text\/html/);
    assert.match(home.body, /NutriVa/);

    const asset = await fetchInfo(baseUrl, "/assets/app.js");
    assert.equal(asset.status, 200);

    // Rota do app, que nao existe como arquivo, recebe o HTML (fallback de SPA).
    const rota = await fetchInfo(baseUrl, "/alergias");
    assert.equal(rota.status, 200);
    assert.match(rota.type, /text\/html/);
  });
});

test("contrato da API sobrevive a maiusculas e a barra final", async () => {
  const distDir = makeDist({ withBuild: true });

  await withServer(distDir, async (baseUrl) => {
    // O roteamento do Express nao diferencia maiusculas: todas estas sao rotas
    // de API e precisam responder erro JSON, nunca o HTML do app.
    for (const pathname of ["/api/naoexiste", "/API/naoexiste", "/Api/naoexiste", "/api", "/API"]) {
      const resposta = await fetchInfo(baseUrl, pathname);
      assert.equal(resposta.status, 404, `${pathname} deveria ser 404`);
      assert.match(resposta.type, /application\/json/, `${pathname} deveria ser JSON`);
      assert.equal(/<!doctype html>/i.test(resposta.body), false, `${pathname} devolveu HTML`);
    }

    // A API de verdade continua respondendo, inclusive em caixa mista.
    for (const pathname of ["/api/health", "/Api/health"]) {
      const saude = await fetchInfo(baseUrl, pathname);
      assert.equal(saude.status, 200, pathname);
      assert.match(saude.type, /application\/json/, pathname);
    }
  });
});

test("metodo diferente de GET nunca recebe o HTML do app", async () => {
  const distDir = makeDist({ withBuild: true });

  await withServer(distDir, async (baseUrl) => {
    const post = await fetchInfo(baseUrl, "/rota-qualquer", { method: "POST" });
    assert.equal(post.status, 404);
    assert.match(post.type, /application\/json/);
  });
});

test("sem build, a API funciona e a raiz devolve erro JSON, nao HTML quebrado", async () => {
  const distDir = makeDist({ withBuild: false });

  await withServer(distDir, async (baseUrl) => {
    const home = await fetchInfo(baseUrl, "/");
    assert.equal(home.status, 404);
    assert.match(home.type, /application\/json/);

    const saude = await fetchInfo(baseUrl, "/api/health");
    assert.equal(saude.status, 200);
  });
});

test("CSP libera a Open Food Facts e nada alem do necessario", async () => {
  const distDir = makeDist({ withBuild: true });

  await withServer(distDir, async (baseUrl) => {
    const home = await fetchInfo(baseUrl, "/");
    const csp = home.headers.get("content-security-policy") || "";

    // Sem isto, a consulta de produto e as imagens quebram so em producao.
    assert.match(csp, /connect-src [^;]*https:\/\/world\.openfoodfacts\.org/);
    assert.match(csp, /img-src [^;]*https:\/\/images\.openfoodfacts\.org/);

    // A build do Vite nao gera inline: nao pode haver afrouxamento.
    assert.equal(/script-src[^;]*unsafe-inline/.test(csp), false, "script-src afrouxado");
    assert.equal(/script-src[^;]*unsafe-eval/.test(csp), false, "script-src com eval");
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);

    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  });
});
