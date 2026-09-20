import { CircleGauge, ClipboardList, ShieldAlert } from "lucide-react";

import { PRIORITY_ALLERGY_OPTIONS } from "../../data/allergens";
import { PageHeader } from "../../components/common/PageHeader";

export function GuidePage() {
  return (
    <>
      <PageHeader eyebrow="Guia" title="O que olhar no rótulo." />
      <section className="guide-band guide-page">
        <div className="guide-item">
          <ClipboardList size={20} aria-hidden="true" />
          <span>Tem alergia? Leia os ingredientes primeiro.</span>
        </div>
        <div className="guide-item">
          <CircleGauge size={20} aria-hidden="true" />
          <span>Compare açúcar, sódio e proteínas por 100 g.</span>
        </div>
        <div className="guide-item">
          <ShieldAlert size={20} aria-hidden="true" />
          <span>Sem informação aqui? Confira a embalagem.</span>
        </div>
      </section>
      {/* So os alergenicos que a lei obriga a destacar: o catalogo completo
          tem ~170 itens e viraria uma parede de cartoes. O resto esta no
          seletor de alergias, atras da busca. */}
      <section className="page-grid">
        {PRIORITY_ALLERGY_OPTIONS.map((option) => (
          <article className="page-card" key={option.id}>
            <ShieldAlert size={22} aria-hidden="true" />
            <h3>{option.label}</h3>
            <p>Procure por: {option.terms.slice(0, 4).join(", ")}.</p>
          </article>
        ))}
      </section>
    </>
  );
}
