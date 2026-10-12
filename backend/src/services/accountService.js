import { ALLERGY_DEFINITIONS } from "../config/allergies.js";
import { withTransaction } from "../database/pool.js";
import {
  lerAlergias,
  lerConta,
  lerFavoritos,
  lerHistorico,
  removerSessoes,
  removerUsuario,
} from "../repositories/accountRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import { AppError } from "../utils/AppError.js";
import { verifyPassword } from "../utils/password.js";
import { validateDeleteAccount } from "../utils/validation.js";

// Direitos do titular (v0.8.0): exportar os proprios dados e excluir a conta.
//
// IDENTIDADE VEM DA SESSAO. As duas funcoes recebem o `userId` que o
// controller tirou de `req.user`, preenchido por `requireAuth` a partir do
// token validado no banco. Nenhum parametro da requisicao - corpo, query,
// cabecalho - escolhe de quem sao os dados.
//
// Nenhuma das duas fala com a Anthropic.

export const FORMATO_DA_EXPORTACAO = "nutriscan-dados-do-titular";
export const VERSAO_DO_FORMATO = 1;

const ROTULOS_DE_ALERGIA = new Map(ALLERGY_DEFINITIONS.map((definicao) => [definicao.id, definicao.label]));

function data(valor) {
  return valor instanceof Date ? valor.toISOString() : valor;
}

// ---------------------------------------------------------------------------
// Exportacao
// ---------------------------------------------------------------------------

export async function exportarDadosDoTitular(userId) {
  const conta = await lerConta(userId);
  // A sessao era valida um instante atras e a conta sumiu: foi excluida no
  // meio. Nao ha o que exportar, e a sessao ja nao vale.
  if (!conta) throw new AppError("UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);

  const [alergias, historico, favoritos] = await Promise.all([
    lerAlergias(userId),
    lerHistorico(userId),
    lerFavoritos(userId),
  ]);

  return {
    formato: FORMATO_DA_EXPORTACAO,
    versaoDoFormato: VERSAO_DO_FORMATO,
    geradoEm: new Date().toISOString(),
    conta: { nome: conta.nome, email: conta.email, criadaEm: data(conta.criadaEm) },
    alergias: alergias.map((linha) => ({
      id: linha.allergy_id,
      nome: ROTULOS_DE_ALERGIA.get(linha.allergy_id) ?? linha.allergy_id,
      marcadaEm: data(linha.created_at),
    })),
    historico: historico.map((linha) => ({
      codigo: linha.product_code,
      nome: linha.product_name,
      marca: linha.product_brand,
      imagem: linha.image_url,
      consultadoEm: data(linha.viewed_at),
    })),
    favoritos: favoritos.map((linha) => ({
      codigo: linha.product_code,
      nome: linha.product_name,
      marca: linha.product_brand,
      imagem: linha.image_url,
      favoritadoEm: data(linha.created_at),
    })),
  };
}

// O nome do arquivo NAO leva e-mail nem nome: ele aparece em listagem de pasta
// e no historico de downloads do navegador, onde qualquer pessoa com acesso ao
// aparelho le. So o produto e o dia.
export function nomeDoArquivoDeExportacao(geradoEm) {
  const dia = String(geradoEm).slice(0, 10);
  return `nutriscan-meus-dados-${dia}.json`;
}

// ---------------------------------------------------------------------------
// Exclusao
// ---------------------------------------------------------------------------

// O executor da transacao fica numa constante para que a atomicidade seja uma
// decisao visivel - e verificavel por mutacao - e nao um detalhe enterrado.
const executarEmTransacao = withTransaction;

export async function excluirConta(userId, corpo) {
  const { password } = validateDeleteAccount(corpo);

  // SESSAO VALIDA NAO BASTA. Um aparelho esquecido aberto nao pode apagar a
  // conta de alguem: a senha atual e conferida de novo contra o hash.
  const usuario = await findUserById(userId);
  if (!usuario) throw new AppError("UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);

  const senhaConfere = await verifyPassword(password, usuario.password_salt, usuario.password_hash);
  if (!senhaConfere) {
    // 403, e nao 401: a sessao continua valida, so a confirmacao falhou. Um 401
    // aqui faria o app achar que a pessoa saiu da conta. A mensagem diz o que a
    // pessoa precisa saber - a senha nao confere e nada foi apagado - e nada
    // alem disso.
    throw new AppError("INVALID_CREDENTIALS", "Senha incorreta. Nada foi apagado.", 403);
  }

  // ATOMICIDADE
  //
  // As duas remocoes acontecem na MESMA transacao. Se qualquer etapa falhar -
  // inclusive dentro da cascata, numa das tabelas filhas -, o ROLLBACK desfaz
  // tudo, sessoes inclusive. Uma conta pela metade e pior que uma conta
  // inteira: sobra dado sem dono, e o titular acredita que foi apagado.
  //
  // Exclusao FISICA: as linhas saem do banco. Nao existe `deleted_at`, nao
  // existe copia em outra tabela, e nada do conteudo vai para o log.
  await executarEmTransacao(async (client) => {
    await removerSessoes(userId, client);
    const removidos = await removerUsuario(userId, client);
    if (removidos !== 1) {
      // Outra requisicao excluiu a conta entre a conferencia e aqui.
      throw new AppError("UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);
    }
  });

  // Registra QUE houve uma exclusao - sem id, nome, e-mail ou qualquer dado da
  // conta. Saber que acontece serve a operacao; saber de quem, nao.
  console.log("[conta] uma conta foi excluida pelo titular");
}
