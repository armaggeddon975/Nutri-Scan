import { env } from "../config/env.js";
import { filterValidAllergies } from "../config/allergies.js";
import { getAnthropicClient, hasAnthropicConfig } from "../ai/anthropicClient.js";
import {
  buildAssistantAlertLevels,
  buildAssistantProfileAllergies,
  finalizeAssistantResponse,
  mapProviderError,
  parseStructuredResponse,
} from "../ai/assistantService.js";
import {
  buildComparisonMessages,
  COMPARISON_OUTPUT_FORMAT,
  COMPARISON_SYSTEM_PROMPT,
  comparisonResponseSchema,
} from "../ai/comparisonPrompt.js";
import { buildAllergySnapshot, buildAssistantProductContext } from "../ai/contextBuilder.js";
import { safeAssistantError } from "../ai/safety.js";
import { validateComparison } from "../utils/validation.js";
import { applyAllergyAuthority, PROFILE_SOURCE } from "../../../shared/allergyVerdict.js";
import { compareProducts } from "../../../shared/productComparison.js";

// Comparacao de dois produtos (v0.10.0).
//
// Esta rota NAO busca produto. As duas buscas acontecem no navegador, pelo
// caminho de sempre (`consultarProdutoPorCodigo` + `openFoodFactsService`). O
// que chega aqui e o par ja encontrado - dado nao confiavel - e o que sai e um
// veredito por produto, com o perfil da SESSAO, mais as diferencas.
//
// Nada e gravado: nem comparacao, nem historico, nem veredito. Visitante e
// usuario, igual.

// O perfil: usuario autenticado usa SEMPRE as alergias e o nivel de alerta do
// PostgreSQL; `guestAllergies` so vale para visitante. Os mesmos carregadores do
// assistente - injetaveis so para teste.
async function perfilDaRequisicao(req, guestAllergies, options) {
  const alergias = await buildAssistantProfileAllergies(req, guestAllergies, options.loadUserAllergies);
  return {
    profileAllergies: filterValidAllergies(alergias),
    alertLevels: await buildAssistantAlertLevels(req, options.loadUserAlertLevels),
    profileSource: req.user?.id ? PROFILE_SOURCE.database : PROFILE_SOURCE.request,
  };
}

async function montar(req, input, options) {
  const dados = validateComparison(input);
  const perfil = await perfilDaRequisicao(req, dados.guestAllergies, options);
  // Cada produto e reduzido ao contexto controlado do assistente: tamanho de
  // campo limitado e so os campos que o motor e a tela usam.
  const entradas = dados.products.map((item) => ({
    code: item.code,
    product: buildAssistantProductContext(item.product),
  }));
  return { entradas, perfil, comparacao: compareProducts(entradas, perfil) };
}

// O PISO, PRODUTO A PRODUTO
//
// Cada produto recebe o piso do PROPRIO veredito, numa chamada propria. Nao
// existe piso "da comparacao": um produto em conflito nao eleva o outro, e o
// produto limpo nao rebaixa o que tem conflito.
//
// `respostaPara(produto)` devolve o que o modelo disse SOBRE aquele produto,
// ou, sem modelo, `{ safety: "normal" }`.
function aplicarPisoPorProduto(comparacao, respostaPara, finalizar) {
  for (const produto of comparacao.products) {
    const final = finalizar(respostaPara(produto), produto.allergyVerdict);
    produto.safety = final.safety;
    produto.allergyVerdict = final.allergyVerdict;
    produto.explanation = final.answer ?? null;
  }
  return comparacao;
}

export async function compararProdutos(req, input, options = {}) {
  const { comparacao } = await montar(req, input, options);
  aplicarPisoPorProduto(comparacao, () => ({ safety: "normal" }), applyAllergyAuthority);
  return { comparison: comparacao, explanation: { status: "not_requested" } };
}

// A AMARRACAO EXPLICACAO-PRODUTO, CONFERIDA POR CODIGO
//
// O modelo devolve uma lista de explicacoes, cada uma com o `productCode` que
// recebeu. A posicao na lista NAO significa nada: um modelo que troca a ordem
// nao pode trocar o que aparece em cada produto. Aqui cada codigo da
// comparacao precisa aparecer EXATAMENTE uma vez, e nenhum outro; senao a
// resposta inteira e recusada.
export function amarrarExplicacoes(explicacoes, produtos) {
  const porCodigo = new Map();
  for (const explicacao of explicacoes) {
    if (porCodigo.has(explicacao.productCode)) {
      throw safeAssistantError("AI_SCHEMA_INVALID", "Assistente inteligente retornou estrutura invalida.", 502);
    }
    porCodigo.set(explicacao.productCode, explicacao);
  }
  const esperados = produtos.map((produto) => produto.code);
  if (porCodigo.size !== esperados.length || esperados.some((codigo) => !porCodigo.has(codigo))) {
    throw safeAssistantError("AI_SCHEMA_INVALID", "Assistente inteligente retornou estrutura invalida.", 502);
  }
  return porCodigo;
}

export async function explicarComparacao(req, input, client = getAnthropicClient(), options = {}) {
  const { entradas, perfil, comparacao } = await montar(req, input, options);

  if (!client || (!hasAnthropicConfig() && client === getAnthropicClient())) {
    throw safeAssistantError("AI_NOT_CONFIGURED", "Assistente inteligente nao configurado.", 503);
  }

  // O que vai ao modelo, por produto: o contexto controlado e o MESMO
  // allergySnapshot do chat - a classificacao do motor, pronta. O nivel de
  // alerta nao vai, como desde a v0.9.0: o snapshot nao o carrega.
  const produtosParaOModelo = entradas.map((entrada) => ({
    productCode: entrada.code,
    product: entrada.product,
    allergySnapshot: buildAllergySnapshot(entrada.product, perfil.profileAllergies),
  }));

  let resposta;
  try {
    const bruta = await client.messages.create(
      {
        model: env.anthropicModel,
        max_tokens: env.anthropicMaxOutputTokens,
        system: COMPARISON_SYSTEM_PROMPT,
        messages: buildComparisonMessages({ products: produtosParaOModelo, differences: comparacao.differences }),
        thinking: { type: "disabled" },
        output_config: { format: COMPARISON_OUTPUT_FORMAT },
      },
      { timeout: env.anthropicTimeoutMs },
    );
    resposta = parseStructuredResponse(bruta, comparisonResponseSchema);
  } catch (error) {
    if (error?.code?.startsWith?.("AI_")) throw error;
    throw mapProviderError(error);
  }

  const porCodigo = amarrarExplicacoes(resposta.explanations, comparacao.products);
  aplicarPisoPorProduto(
    comparacao,
    (produto) => {
      const explicacao = porCodigo.get(produto.code);
      return { answer: explicacao.text, safety: explicacao.safety };
    },
    (respostaDoProduto, veredito) => finalizeAssistantResponse(respostaDoProduto, veredito, options),
  );

  return {
    comparison: comparacao,
    explanation: { status: "ok", source: "anthropic", category: resposta.category },
  };
}
