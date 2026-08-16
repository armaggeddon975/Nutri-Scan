let scannerLibPromise = null;

export function loadScannerLib() {
  if (!scannerLibPromise) {
    scannerLibPromise = Promise.all([import("@zxing/browser"), import("@zxing/library")]).then(
      ([browser, library]) => {
        const { BarcodeFormat, DecodeHintType, NotFoundException } = library;
        const hints = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A,
              BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128,
              BarcodeFormat.CODE_39,
              BarcodeFormat.ITF,
            ],
          ],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        return { BrowserMultiFormatReader: browser.BrowserMultiFormatReader, NotFoundException, hints };
      },
    );
  }
  return scannerLibPromise;
}

const CAMERA_ERROR_MESSAGES = {
  NotAllowedError:
    "Permissão da câmera negada. Clique no cadeado da barra de endereço, libere a Câmera e tente de novo.",
  NotFoundError:
    "Nenhuma câmera encontrada neste aparelho. Use o campo \"Digitar código manualmente\".",
  NotReadableError:
    "A câmera está sendo usada por outro programa. Feche o outro aplicativo e tente de novo.",
  OverconstrainedError:
    "Não encontrei uma câmera compatível. Tente pelo celular ou digite o código.",
  SecurityError: "O navegador bloqueou a câmera: a página precisa estar em HTTPS ou localhost.",
  AbortError: "A abertura da câmera foi interrompida. Tente novamente.",
};

export function describeCameraError(error) {
  return CAMERA_ERROR_MESSAGES[error?.name] || "Não foi possível iniciar o scanner.";
}
