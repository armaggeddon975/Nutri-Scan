import { ALLERGY_OPTIONS } from "../../data/allergens";
import { PageHeader } from "../../components/common/PageHeader";

export function AllergiesPage({ currentUser, selectedAllergies, productAnalysis, onToggleAllergy }) {
  return (
    <>
      <PageHeader
        eyebrow="Alergias"
        title="Marque o que você não pode comer."
        subtitle={
          currentUser
            ? `Salvo na conta de ${currentUser.name}.`
            : "Depois disso, o app avisa em cada produto."
        }
      />
      <section className="allergy-page-grid">
        {ALLERGY_OPTIONS.map((option) => (
          <label key={option.id} className="check-row">
            <input
              type="checkbox"
              checked={selectedAllergies.includes(option.id)}
              onChange={() => onToggleAllergy(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </section>
      {productAnalysis}
    </>
  );
}
