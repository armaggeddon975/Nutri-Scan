import { CircleGauge, ClipboardList, ShieldAlert } from "lucide-react";

import { ALLERGY_OPTIONS } from "../../data/allergens";
import { PageHeader } from "../../components/common/PageHeader";

export function GuidePage() {
  return (
    <>
      <PageHeader eyebrow="Guia" title="O que olhar no rótulo." />
      <section className="guide-band guide-page">
        <div className="guide-item">
          <ClipboardList size={20} aria-hidden="true" />
          <span>Leia ingredientes antes da tabela quando houver alergia.</span>
        </div>
        <div className="guide-item">
          <CircleGauge size={20} aria-hidden="true" />
          <span>Compare açúcar, sódio e proteínas por 100 g.</span>
        </div>
        <div className="guide-item">
          <ShieldAlert size={20} aria-hidden="true" />
          <span>Produto sem dado cadastrado deve ser conferido no rótulo físico.</span>
        </div>
      </section>
      <section className="page-grid">
        {ALLERGY_OPTIONS.map((option) => (
          <article className="page-card" key={option.id}>
            <ShieldAlert size={22} aria-hidden="true" />
            <h3>{option.label}</h3>
            <p>Observe termos como {option.terms.slice(0, 4).join(", ")} nos ingredientes.</p>
          </article>
        ))}
      </section>
    </>
  );
}
