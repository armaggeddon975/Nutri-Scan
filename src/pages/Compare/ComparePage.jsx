import { Camera } from "lucide-react";

import { AllergyVerdict } from "../../components/assistant/AllergyVerdict";
import { PageHeader } from "../../components/common/PageHeader";
import { formatNumber } from "../../utils/formatting";

// Comparacao de dois produtos (v0.10.0).
//
// A tela MOSTRA os dois lado a lado. Ela nao elege vencedor: nao ha "melhor",
// "recomendado" nem destaque para um dos lados, e a ordem e a que a pessoa
// escolheu. O veredito de cada coluna vem do motor para AQUELE produto; a
// explicacao do assistente, quando existe, aparece embaixo, como texto dele.
//
// "Nao informado" e escrito por extenso. Produto sem dado de alergenico nunca
// aparece como "sem conflito", e nutriente que a base nao traz nunca vira 0.

const ESTADO_DO_ALERGENICO = {
  contains: "Tem",
  traces: "Pode conter",
  not_detected: "Não aparece no rótulo",
  not_informed: "Não informado",
};

const TITULO_DO_LADO = { a: "Primeiro", b: "Segundo" };

function valorNutricional(valor, unidade) {
  if (valor === null || valor === undefined) return "Não informado";
  return `${formatNumber(valor)} ${unidade}`;
}

function VereditoDoProduto({ produto }) {
  const veredito = produto.allergyVerdict;
  if (produto.allergenData === "not_informed" || veredito?.reason === "no_allergen_data") {
    return <p className="compare-missing">Sem dados de alergênicos. Confira o rótulo físico.</p>;
  }
  if (veredito?.reason === "no_profile_allergies") {
    return <p className="compare-missing">Você não marcou alergias. O app não conferiu conflito.</p>;
  }
  return <AllergyVerdict verdict={veredito} origem="Verificação do próprio app, só para este produto." />;
}

function ColunaDoProduto({ produto, onAbrirProduto }) {
  return (
    <article className="compare-col" aria-label={`${TITULO_DO_LADO[produto.slot]} produto`}>
      <p className="eyebrow">{TITULO_DO_LADO[produto.slot]}</p>
      <h3>{produto.name || `Código ${produto.code}`}</h3>
      {produto.brand && <p className="compare-brand">{produto.brand}</p>}
      <VereditoDoProduto produto={produto} />
      {produto.explanation && (
        <div className="compare-explanation">
          <strong>O assistente explica:</strong>
          <p>{produto.explanation}</p>
        </div>
      )}
      <button className="secondary-button" type="button" onClick={() => onAbrirProduto(produto.code)}>
        Abrir este produto
      </button>
    </article>
  );
}

function ColunaQueFaltou({ lado, consulta }) {
  const mensagem =
    consulta.estado === "erro_de_rede"
      ? `Não consegui buscar o produto ${consulta.codigo} agora. Verifique sua internet.`
      : `Não encontrei o produto ${consulta.codigo} na Open Food Facts.`;
  return (
    <article className="compare-col compare-col-missing" aria-label={`${TITULO_DO_LADO[lado]} produto`}>
      <p className="eyebrow">{TITULO_DO_LADO[lado]}</p>
      <p className="compare-missing">{mensagem}</p>
    </article>
  );
}

function Diferencas({ comparacao }) {
  const { allergens, nutrition } = comparacao.differences;
  const algumSemDado = comparacao.products.some((produto) => produto.allergenData === "not_informed");

  return (
    <section className="compare-differences" aria-label="Diferenças">
      <h3>Diferenças</h3>

      <h4>Alergênicos</h4>
      {allergens.length > 0 ? (
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Alergênico</th>
              <th scope="col">Primeiro</th>
              <th scope="col">Segundo</th>
            </tr>
          </thead>
          <tbody>
            {allergens.map((linha) => (
              <tr key={linha.id}>
                <th scope="row">{linha.label}</th>
                <td>{ESTADO_DO_ALERGENICO[linha.a]}</td>
                <td>{ESTADO_DO_ALERGENICO[linha.b]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : algumSemDado ? (
        <p className="compare-missing">Sem dados de alergênicos em um dos produtos. Não dá para comparar.</p>
      ) : (
        <p>Os alergênicos que aparecem no rótulo são os mesmos nos dois.</p>
      )}

      <h4>Nutrientes por 100 g</h4>
      {nutrition.length > 0 ? (
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Nutriente</th>
              <th scope="col">Primeiro</th>
              <th scope="col">Segundo</th>
            </tr>
          </thead>
          <tbody>
            {nutrition.map((linha) => (
              <tr key={linha.key}>
                <th scope="row">{linha.label}</th>
                <td>{valorNutricional(linha.a, linha.unit)}</td>
                <td>{valorNutricional(linha.b, linha.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="compare-missing">Nenhum dos dois traz tabela nutricional. Confira a embalagem.</p>
      )}
    </section>
  );
}

export function ComparePage({
  comparacao,
  opcoesMeusProdutos,
  onChangeEntrada,
  onEscolher,
  onEscanear,
  onComparar,
  onExplicar,
  onAbrirProduto,
}) {
  const { entradaA, entradaB, carregando, mensagem, resultado, parcial, explicando } = comparacao;
  const opcoes = opcoesMeusProdutos.filter((opcao) => opcao.codigo !== entradaA && opcao.codigo !== entradaB);

  return (
    <>
      <PageHeader
        eyebrow="Comparar"
        title="Compare dois produtos."
        subtitle="Os dois lado a lado. A escolha é sua."
      />

      <form
        className="compare-form"
        onSubmit={(event) => {
          event.preventDefault();
          onComparar();
        }}
      >
        <label className="compare-field">
          <span>Primeiro produto (código)</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={entradaA}
            onChange={(event) => onChangeEntrada("a", event.target.value)}
          />
        </label>
        <label className="compare-field">
          <span>Segundo produto (código)</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={entradaB}
            onChange={(event) => onChangeEntrada("b", event.target.value)}
          />
        </label>

        {opcoes.length > 0 && (
          <div className="compare-pick">
            <p>Ou escolha em Meus produtos:</p>
            <div className="chip-list">
              {opcoes.slice(0, 8).map((opcao) => (
                <button type="button" key={opcao.codigo} onClick={() => onEscolher(opcao.codigo)}>
                  {opcao.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="compare-actions">
          <button className="secondary-button" type="button" onClick={onEscanear}>
            <Camera size={20} aria-hidden="true" />
            Escanear
          </button>
          <button className="primary-button" type="submit" disabled={carregando}>
            {carregando ? "Comparando..." : "Comparar"}
          </button>
        </div>
      </form>

      {mensagem && (
        <p className={`compare-message ${mensagem.type}`} role="status">
          {mensagem.text}
        </p>
      )}

      {parcial && (
        <section className="compare-grid" aria-label="Produtos comparados">
          {["a", "b"].map((lado) =>
            parcial[lado].produto ? (
              <ColunaDoProduto key={lado} produto={parcial[lado].produto} onAbrirProduto={onAbrirProduto} />
            ) : (
              <ColunaQueFaltou key={lado} lado={lado} consulta={parcial[lado].consulta} />
            ),
          )}
        </section>
      )}

      {resultado && (
        <>
          <section className="compare-grid" aria-label="Produtos comparados">
            {resultado.products.map((produto) => (
              <ColunaDoProduto key={produto.slot} produto={produto} onAbrirProduto={onAbrirProduto} />
            ))}
          </section>

          <Diferencas comparacao={resultado} />

          <div className="compare-explain">
            <button className="secondary-button" type="button" onClick={onExplicar} disabled={explicando}>
              {explicando ? "Pedindo explicação..." : "Explicar as diferenças"}
            </button>
          </div>

          <p className="compare-note">O app mostra o que está no rótulo. A escolha é sua.</p>
        </>
      )}
    </>
  );
}
