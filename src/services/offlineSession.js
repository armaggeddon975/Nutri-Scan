import { cacheDoAparelho, semInternet } from "./offlineLookup.js";

// A conta e o aparelho (v0.11.0).
//
// ONLINE, A IDENTIDADE VEM DA SESSAO NO SERVIDOR. O que este modulo guarda e o
// perfil que o servidor acabou de confirmar - nada que o aparelho decida
// sozinho. Sem rede, o perfil guardado e o da conta que estava aberta neste
// aparelho, e so dela.
//
// QUANDO O CACHE DA CONTA SAI DO APARELHO
//
//   sair da conta                 sempre, mesmo que o servidor nao responda
//   excluir a conta               depois que o servidor confirma a exclusao
//   servidor recusa a sessao      401 em `me`: a sessao acabou (expirou, saiu
//                                 em outro aparelho, conta excluida em outro)
//
// Nao existe escrita sem rede (ver `escreverComInternet`).

/**
 * Recupera a sessao ao abrir o app.
 *
 *   servidor confirma         -> "conta": o perfil novo vai para o aparelho
 *   servidor recusa (401)     -> "visitante": o cache de conta sai do aparelho
 *   sem resposta (rede, 5xx)  -> "aparelho": o perfil guardado, se houver;
 *                                senao "visitante", sem apagar nada
 */
export async function recuperarSessao({ getMe, cache = cacheDoAparelho }) {
  try {
    const { user } = await getMe();
    await cache.guardarPerfil(user).catch(() => false);
    return { tipo: "conta", user };
  } catch (error) {
    if (error?.status === 401) {
      await cache.apagarContas().catch(() => false);
      return { tipo: "visitante", motivo: "sem_sessao" };
    }
    const perfil = await cache.lerSessao().catch(() => null);
    if (perfil) return { tipo: "aparelho", perfil };
    return { tipo: "visitante", motivo: "fora_do_ar" };
  }
}

// O servidor confirmou a conta (login, cadastro, `me`, alergias salvas): o
// perfil confirmado vai para o aparelho, e o de qualquer outra conta sai.
export async function aoConfirmarConta(usuario, { cache = cacheDoAparelho } = {}) {
  if (!usuario?.id) return false;
  return cache.guardarPerfil(usuario).catch(() => false);
}

/**
 * Sair. O cache da conta sai do aparelho SEMPRE - e e o que um aparelho
 * compartilhado exige. A resposta diz se o servidor encerrou a sessao: sem
 * resposta, o cookie de sessao continua valido no servidor, e a tela avisa.
 */
export async function aoSairDaConta({ sair, cache = cacheDoAparelho }) {
  let servidorRespondeu = true;
  try {
    await sair();
  } catch {
    servidorRespondeu = false;
  }
  await cache.apagarContas();
  return { servidorRespondeu };
}

// Excluir. So limpa depois que o servidor confirma: exclusao recusada (senha
// errada, sem rede) nao pode fazer o aparelho esquecer uma conta que existe.
export async function aoExcluirConta(senha, { excluir, cache = cacheDoAparelho }) {
  const resposta = await excluir(senha);
  await cache.apagarContas();
  return resposta;
}

// A sessao terminou por outro caminho (401 numa chamada qualquer).
export async function aoPerderSessao({ cache = cacheDoAparelho } = {}) {
  return cache.apagarContas().catch(() => false);
}

/**
 * NENHUMA ESCRITA SEM REDE.
 *
 * Favoritar, marcar alergia, mudar o nivel de alerta, apagar historico: com
 * conta, tudo isso so acontece no servidor. Sem internet, a acao NAO e feita -
 * nem guardada para depois. Fila de sincronizacao traz conflito entre
 * aparelhos, e resolver isso direito e outra versao.
 *
 * `gravar` so e chamado com rede. Sem rede, nada e escrito em lugar nenhum.
 */
export async function escreverComInternet(gravar, { online = () => !semInternet() } = {}) {
  if (!online()) return { gravado: false, motivo: "sem_internet" };
  return { gravado: true, resultado: await gravar() };
}

export const SEM_INTERNET_PARA_ESCREVER = {
  favorito: "Sem internet. Não dá para favoritar agora.",
  alergia: "Sem internet. Para mudar alergias, conecte-se.",
  historico: "Sem internet. Não dá para mudar a lista agora.",
};
