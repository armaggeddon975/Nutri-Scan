import assert from "node:assert/strict";
import test from "node:test";

import {
  SCAN_OPTIONS,
  buildVideoConstraints,
  isTransientScanError,
} from "../../src/services/scannerService.js";
import { EMPTY_CONFIRMATION, nextConfirmation } from "../../src/utils/barcodeConfirm.js";

// A @zxing/library e dependencia do package raiz. Quem instalou so o backend
// nao tem como executar a parte que usa as classes reais: isso e ambiente
// ausente e precisa aparecer como NAO EXECUTADO, nao como aprovacao.
async function loadZxingExceptions() {
  try {
    const library = await import("@zxing/library");
    return {
      NotFoundException: library.NotFoundException,
      ChecksumException: library.ChecksumException,
      FormatException: library.FormatException,
    };
  } catch {
    return null;
  }
}

// Regressao da falha relatada em 04/09/2026: a camera desligava sozinha assim
// que encontrava um codigo borrado ou cortado. O laco interno da
// @zxing/browser continua tentando em ChecksumException, FormatException e
// NotFoundException; o App tratava os dois primeiros como falha fatal e
// chamava stop(), matando o scanner no primeiro quadro imperfeito.
test("erro normal de mira nao pode ser tratado como falha fatal", () => {
  for (const kind of ["NotFoundException", "ChecksumException", "FormatException"]) {
    const error = { getKind: () => kind };
    assert.equal(isTransientScanError(error), true, `${kind} precisa manter a camera ligada`);
  }
});

test("falha real da camera continua sendo fatal", () => {
  assert.equal(isTransientScanError(new Error("stream perdido")), false);
  assert.equal(isTransientScanError({ getKind: () => "ArgumentException" }), false);
});

test("callback sem erro nenhum nao derruba o scanner", () => {
  assert.equal(isTransientScanError(undefined), true);
  assert.equal(isTransientScanError(null), true);
});

test("as classes reais da @zxing/library sao reconhecidas como transitorias", async (t) => {
  const exceptions = await loadZxingExceptions();
  if (!exceptions) {
    t.skip("NAO EXECUTADO: @zxing/library ausente (instalacao apenas do backend)");
    return;
  }

  for (const [name, Exception] of Object.entries(exceptions)) {
    assert.equal(
      isTransientScanError(new Exception("falha de leitura")),
      true,
      `${name} real precisa manter a camera ligada`,
    );
  }
});

// O padrao da biblioteca e 500ms, ou seja, duas tentativas de leitura por
// segundo. Se alguem remover a configuracao, o scanner volta a ficar lento sem
// nenhum erro aparente.
test("o scanner tenta ler bem mais rapido que o padrao da biblioteca", () => {
  const LIBRARY_DEFAULT_MS = 500;
  assert.ok(
    SCAN_OPTIONS.delayBetweenScanAttempts < LIBRARY_DEFAULT_MS / 2,
    "o intervalo entre tentativas precisa ficar bem abaixo do padrao de 500ms",
  );
  assert.ok(SCAN_OPTIONS.delayBetweenScanAttempts > 0);
});

// `decodeFromVideoDevice` pede so facingMode e aceita a resolucao padrao da
// camera. A 640x480 um EAN-13 tem poucos pixels por barra e a leitura falha.
test("a camera e pedida com resolucao alta e camera traseira", () => {
  const { video } = buildVideoConstraints();

  assert.equal(video.facingMode.ideal, "environment");
  assert.ok(video.width.ideal >= 1280, "largura ideal precisa ser de camera moderna");
  assert.ok(video.height.ideal >= 720, "altura ideal precisa ser de camera moderna");
  assert.ok(
    video.advanced.some((entry) => entry.focusMode === "continuous"),
    "foco continuo e o que resolve codigo borrado de perto",
  );
});

test("um codigo lido uma vez so ainda nao e aceito", () => {
  const state = nextConfirmation(EMPTY_CONFIRMATION, "7891000100103");

  assert.equal(state.confirmed, "");
  assert.equal(state.hits, 1);
});

test("duas leituras iguais seguidas confirmam o codigo", () => {
  const first = nextConfirmation(EMPTY_CONFIRMATION, "7891000100103");
  const second = nextConfirmation(first, "7891000100103");

  assert.equal(second.confirmed, "7891000100103");
});

// Leitura errada isolada e o caso que importa: num app de alergia, abrir o
// produto errado e informacao de seguranca errada na tela.
test("uma leitura errada no meio do caminho nao e aceita e reinicia a contagem", () => {
  const first = nextConfirmation(EMPTY_CONFIRMATION, "7891000100103");
  const ruido = nextConfirmation(first, "7891000999999");

  assert.equal(ruido.confirmed, "");
  assert.equal(ruido.candidate, "7891000999999");
  assert.equal(ruido.hits, 1);
});

test("codigo vazio nao altera o estado da confirmacao", () => {
  const state = nextConfirmation(EMPTY_CONFIRMATION, "");

  assert.deepEqual(state, EMPTY_CONFIRMATION);
});
