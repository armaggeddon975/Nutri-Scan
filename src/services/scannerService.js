let scannerLibPromise = null;

// Formatos de varejo. CODE_39 saiu: nao aparece em embalagem de alimento e cada
// formato extra e mais uma chance de leitura errada em imagem borrada.
// ITF cobre caixa de papelao; CODE_128 cobre etiqueta de balanca.
const RETAIL_FORMAT_NAMES = ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF", "CODE_128"];

// O padrao da @zxing/browser e 500ms entre tentativas, ou seja, apenas duas
// leituras por segundo — pouco para quem esta com a mao tremendo na frente do
// rotulo. 100ms da dez tentativas por segundo. A espera apos sucesso continua
// maior porque uma leitura boa nao precisa ser repetida de imediato.
export const SCAN_OPTIONS = {
  delayBetweenScanAttempts: 100,
  delayBetweenScanSuccess: 300,
};

// Erros que a propria @zxing/browser trata como "continue tentando" no laco
// interno (BrowserCodeReader: isChecksumError || isFormatError || isNotFound).
// Sao o funcionamento normal do scanner enquanto a pessoa mira: quadro sem
// codigo, codigo cortado, codigo borrado. Quem chama NAO pode desligar a camera
// nesses casos. A comparacao usa `kind`, que e string estatica e sobrevive a
// minificacao, ao contrario do nome da classe.
const TRANSIENT_SCAN_ERROR_KINDS = new Set([
  "NotFoundException",
  "ChecksumException",
  "FormatException",
]);

export function isTransientScanError(error) {
  if (!error) return true;

  const kind =
    typeof error.getKind === "function" ? error.getKind() : error?.constructor?.kind;

  return TRANSIENT_SCAN_ERROR_KINDS.has(kind);
}

// `decodeFromVideoDevice(undefined, ...)` pede so `{ facingMode: 'environment' }`
// e aceita a resolucao padrao da camera, que costuma ser 640x480. Um EAN-13 a
// essa resolucao ocupa poucos pixels por barra e falha muito. Pedimos 1920x1080
// como `ideal`: quando a camera nao alcanca, o navegador entrega o mais proximo
// em vez de dar erro.
export function buildVideoConstraints() {
  return {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      // Foco continuo e o que resolve o codigo borrado de perto. Ainda nao e
      // constraint padronizada; navegador que nao conhece ignora sem quebrar,
      // por isso vai dentro de `advanced`.
      advanced: [{ focusMode: "continuous" }],
    },
  };
}

export function loadScannerLib() {
  if (!scannerLibPromise) {
    scannerLibPromise = Promise.all([import("@zxing/browser"), import("@zxing/library")]).then(
      ([browser, library]) => {
        const { BarcodeFormat, DecodeHintType } = library;
        const hints = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            RETAIL_FORMAT_NAMES.map((name) => BarcodeFormat[name]),
          ],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        return { BrowserMultiFormatReader: browser.BrowserMultiFormatReader, hints };
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
