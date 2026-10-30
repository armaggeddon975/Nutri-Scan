// O ESTADO do veredito, em palavras (v0.12.0).
//
// Fonte unica do texto que diz o estado: o bloco de veredito na tela e o anuncio
// para leitor de tela leem daqui, e por isso nunca dizem coisas diferentes.
//
// Isto e APRESENTACAO. O veredito em si - `status`, `conflicts`, `traces`,
// `minimumSafety`, `reason` - vem do motor de `shared/`, e nada aqui muda nem
// acrescenta campo nele. A cor da tela e reforco: cada estado se distingue
// pelo TEXTO, sem cor nenhuma.
//
// O texto diz o que o produto contem e o que o perfil declara. Nunca conduta.

export const ESTADO = {
  conflito: "conflito",
  traco: "traco",
  semConflito: "sem_conflito",
  naoAvaliado: "nao_avaliado",
};

// Sem produto nao ha o que avaliar: a pergunta geral ao assistente nao ganha
// bloco de veredito. Com produto, "nao avaliado" APARECE - e diz por que.
const MOTIVO_NAO_AVALIADO = {
  no_profile_allergies: "Você não marcou alergias. O app não conferiu conflito.",
  no_allergen_data: "Sem dados de alergênicos. Confira o rótulo físico.",
};

export function estadoDoVeredito(verdict) {
  if (!verdict) return null;
  if (verdict.status === "conflict") return ESTADO.conflito;
  if (verdict.status === "traces") return ESTADO.traco;
  if (verdict.status === "clear") return ESTADO.semConflito;
  if (verdict.status === "not_evaluated" && MOTIVO_NAO_AVALIADO[verdict.reason]) return ESTADO.naoAvaliado;
  return null;
}

// O titulo do bloco: e ele que diz o estado.
export function tituloDoEstado(verdict) {
  const estado = estadoDoVeredito(verdict);
  if (estado === ESTADO.conflito) {
    // O piso `urgent` so existe para conflito declarado de alergia em alerta
    // maximo (v0.9.0).
    return verdict.minimumSafety === "urgent" ? "Alerta máximo: conflito com o seu perfil" : "Conflito com o seu perfil";
  }
  if (estado === ESTADO.traco) return "Pode conter traços";
  if (estado === ESTADO.semConflito) return "Sem conflito com o seu perfil";
  if (estado === ESTADO.naoAvaliado) return "Não avaliado";
  return null;
}

export function motivoDoNaoAvaliado(verdict) {
  return MOTIVO_NAO_AVALIADO[verdict?.reason] ?? null;
}

// Cada alergenico com o seu estado escrito: "Contém Leite/lactose", nunca so
// "Leite/lactose" - o nome sozinho, em vermelho, dependeria da cor.
export function textoDoRisco(risk, status) {
  const traco = status === "traces" || risk.origin === "traces";
  const base = traco ? `Pode conter ${risk.label}` : `Contém ${risk.label}`;
  return risk.alertLevel === "strict" ? `${base} · alerta máximo` : base;
}

export function riscosDoVeredito(verdict) {
  if (!verdict) return [];
  const riscos = verdict.status === "traces" ? verdict.traces : verdict.conflicts;
  return Array.isArray(riscos) ? riscos : [];
}

// Uma frase so, para o anuncio: o estado PRIMEIRO, depois os alergenicos.
export function fraseDoEstado(verdict) {
  const titulo = tituloDoEstado(verdict);
  if (!titulo) return null;
  if (estadoDoVeredito(verdict) === ESTADO.naoAvaliado) return `${titulo}. ${motivoDoNaoAvaliado(verdict)}`;
  const riscos = riscosDoVeredito(verdict).map((risk) => textoDoRisco(risk, verdict.status));
  return riscos.length ? `${titulo}: ${riscos.join(", ")}.` : `${titulo}.`;
}

// O anuncio de um produto: o nome, e o estado do veredito dele.
export function anuncioDoProduto(nome, verdict) {
  const frase = fraseDoEstado(verdict);
  if (!frase) return "";
  return nome ? `${nome}. ${frase}` : frase;
}

// O anuncio da comparacao: cada estado ao lado do NOME do seu produto - quem nao
// ve as duas colunas lado a lado nao pode confundir de quem e cada veredito.
export function anuncioDaComparacao(produtos) {
  const partes = (produtos || [])
    .map((produto, indice) => {
      const frase = fraseDoEstado(produto.allergyVerdict);
      if (!frase) return null;
      const lado = indice === 0 ? "Primeiro produto" : "Segundo produto";
      return `${lado}, ${produto.name || `código ${produto.code}`}. ${frase}`;
    })
    .filter(Boolean);
  return partes.length ? `Comparação pronta. ${partes.join(" ")}` : "";
}
