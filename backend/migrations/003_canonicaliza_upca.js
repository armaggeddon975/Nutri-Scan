import { exigeDigitoVerificador, validarCodigoDeBarras } from "../../shared/barcode.js";

// 003 - canonicaliza codigos UPC-A ja gravados (defeito N1 da auditoria da v0.7.3)
//
// POR QUE ESTA MIGRATION EXISTE
//
// Ate a v0.7.3, `productCodeSchema` conferia o digito verificador mas gravava o
// codigo exatamente como veio na requisicao. `shared/barcode.js` documentava
// que a normalizacao de UPC-A para EAN-13 existia justamente para impedir que o
// mesmo produto virasse duas linhas - e o backend nao a aplicava.
//
// A v0.7.4 canonicaliza na entrada. Sem esta migration, as linhas gravadas
// antes ficariam orfas: o mesmo produto apareceria duas vezes no historico, uma
// com 12 digitos e outra com 13, e o usuario nao teria como saber por que.
//
// POR QUE EM JAVASCRIPT, E NAO EM SQL
//
// Decidir se um codigo de 12 digitos e um UPC-A de verdade depende do digito
// verificador. Escrever esse calculo em SQL seria uma segunda implementacao da
// regra que vive em `shared/barcode.js`, e duas copias divergem. Esta migration
// importa a MESMA funcao que o backend e o frontend usam.
//
// O runner aplica `.js` e `.sql` na mesma ordem de nome, e registra os dois em
// `schema_migrations` - entao a idempotencia vem do mesmo mecanismo de sempre.
//
// REGRA DE SOBREVIVENCIA QUANDO AS DUAS FORMAS EXISTEM
//
// Se o usuario ja tem a linha canonica E a nao canonica do mesmo produto -
// foi exatamente o que o auditor produziu -, canonicalizar a segunda violaria
// `(user_id, product_code)`. A regra, para as duas tabelas:
//
//   A LINHA CANONICA SOBREVIVE. A nao canonica e removida, depois de doar o
//   que tem de mais recente.
//
// O motivo: a canonica e a que vai continuar recebendo escrita daqui em diante.
// Manter a outra significaria apagar a que o app vai usar.
//
// O que cada tabela doa antes de a linha sumir:
//
//   product_history    `viewed_at` mais recente das duas, e o nome/marca/imagem
//                      da linha mais recente. E a mesma regra que o
//                      `ON CONFLICT DO UPDATE` ja usa em escrita normal:
//                      vence a ultima escrita, medida pelo relogio do servidor.
//
//   product_favorites  `created_at` mais ANTIGO das duas. Favoritar e ato
//                      intencional, e a data que interessa e desde quando o
//                      produto e favorito - nao a da duplicata acidental.
//
// NENHUMA LINHA E APAGADA FORA DESSA REGRA. Codigo que nao e UPC-A valido nao
// e tocado.

async function canonicalizarTabela(client, tabela, aoColidir) {
  // Candidatos: exatamente 12 digitos. O filtro grosso acontece no SQL para nao
  // trazer a tabela inteira; a decisao fina - digito verificador - e da funcao
  // compartilhada.
  const candidatos = await client.query(
    `SELECT id, user_id, product_code FROM ${tabela} WHERE product_code ~ '^[0-9]{12}$'`,
  );

  let renomeadas = 0;
  let fundidas = 0;

  for (const linha of candidatos.rows) {
    if (!exigeDigitoVerificador(linha.product_code)) continue;

    const resultado = validarCodigoDeBarras(linha.product_code);

    // Digito verificador invalido: nao e UPC-A, e um numero qualquer de 12
    // digitos. Pode ter entrado antes de a v0.7.3 conferir o digito. Nao se
    // inventa canonico para ele.
    if (!resultado.valido) continue;
    if (resultado.codigo === linha.product_code) continue;

    const existente = await client.query(
      `SELECT id FROM ${tabela} WHERE user_id = $1 AND product_code = $2 LIMIT 1`,
      [linha.user_id, resultado.codigo],
    );

    if (existente.rowCount === 0) {
      await client.query(`UPDATE ${tabela} SET product_code = $1 WHERE id = $2`, [
        resultado.codigo,
        linha.id,
      ]);
      renomeadas += 1;
      continue;
    }

    await aoColidir(client, tabela, { antiga: linha, canonicaId: existente.rows[0].id });
    await client.query(`DELETE FROM ${tabela} WHERE id = $1`, [linha.id]);
    fundidas += 1;
  }

  return { renomeadas, fundidas };
}

// Historico: vence a ultima escrita, como no `ON CONFLICT DO UPDATE`.
async function fundirHistorico(client, tabela, { antiga, canonicaId }) {
  await client.query(
    `UPDATE ${tabela} AS canonica
        SET viewed_at     = GREATEST(canonica.viewed_at, antiga.viewed_at),
            product_name  = CASE WHEN antiga.viewed_at > canonica.viewed_at
                                 THEN antiga.product_name ELSE canonica.product_name END,
            product_brand = CASE WHEN antiga.viewed_at > canonica.viewed_at
                                 THEN antiga.product_brand ELSE canonica.product_brand END,
            image_url     = CASE WHEN antiga.viewed_at > canonica.viewed_at
                                 THEN antiga.image_url ELSE canonica.image_url END
       FROM ${tabela} AS antiga
      WHERE canonica.id = $1 AND antiga.id = $2`,
    [canonicaId, antiga.id],
  );
}

// Favoritos: vale a data em que o produto virou favorito pela primeira vez.
async function fundirFavoritos(client, tabela, { antiga, canonicaId }) {
  await client.query(
    `UPDATE ${tabela} AS canonica
        SET created_at = LEAST(canonica.created_at, antiga.created_at)
       FROM ${tabela} AS antiga
      WHERE canonica.id = $1 AND antiga.id = $2`,
    [canonicaId, antiga.id],
  );
}

export async function up(client) {
  const historico = await canonicalizarTabela(client, "product_history", fundirHistorico);
  const favoritos = await canonicalizarTabela(client, "product_favorites", fundirFavoritos);

  // Silencio nao e prova de que rodou. Em banco sem linha nenhuma - que e o
  // caso de producao hoje - os quatro numeros saem zerados, e isso tambem e
  // informacao.
  console.log(
    `003 historico: ${historico.renomeadas} renomeada(s), ${historico.fundidas} fundida(s) | ` +
      `favoritos: ${favoritos.renomeadas} renomeada(s), ${favoritos.fundidas} fundida(s)`,
  );
}
