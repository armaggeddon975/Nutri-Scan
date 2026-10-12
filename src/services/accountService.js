import { ApiError, apiRequest } from "./apiClient";

// Direitos do titular (v0.8.0): baixar os proprios dados e excluir a conta.

const NOME_PADRAO = "nutriscan-meus-dados.json";

function nomeDoArquivo(resposta) {
  const disposicao = resposta.headers.get("content-disposition") || "";
  return /filename="([^"]+)"/.exec(disposicao)?.[1] || NOME_PADRAO;
}

// O download e montado aqui, com `fetch`, em vez de um link direto para a rota:
// assim um erro (sessao vencida, limite do dia) vira mensagem na tela, e nao um
// arquivo baixado com um JSON de erro dentro. O nome do arquivo vem do servidor
// e nao leva e-mail nem nome.
export async function baixarMeusDados() {
  let resposta;
  try {
    resposta = await fetch("/api/account/export", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    throw new ApiError("Sem conexão. Tente de novo.", 0, "NETWORK_ERROR");
  }

  if (!resposta.ok) {
    let erro = {};
    try {
      erro = (await resposta.json()).error || {};
    } catch {
      erro = {};
    }
    if (resposta.status === 429) {
      throw new ApiError("Você já baixou seus dados várias vezes hoje. Tente amanhã.", 429, "RATE_LIMITED");
    }
    throw new ApiError(erro.message || "Não deu para baixar. Tente de novo.", resposta.status, erro.code || "HTTP_ERROR");
  }

  const arquivo = await resposta.blob();
  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nomeDoArquivo(resposta);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // O endereco temporario guarda o arquivo na memoria da pagina; solta depois
  // que o navegador comecou o download.
  window.setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

export function excluirMinhaConta(senha) {
  return apiRequest("/api/account", {
    method: "DELETE",
    body: { password: senha },
  });
}
