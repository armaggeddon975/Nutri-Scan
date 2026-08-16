import { ALLERGY_OPTIONS } from "../../data/allergens";
import { PageHeader } from "../../components/common/PageHeader";

export function AllergiesPage({ currentUser, selectedAllergies, productAnalysis, onToggleAllergy }) {
  return (
    <>
      <PageHeader
        eyebrow="Alergias"
        title="Configure o perfil de restrições do usuário."
        subtitle={
          currentUser
            ? `Essas alergias estão salvas na conta de ${currentUser.name}.`
            : "Entre em uma conta para salvar suas alergias e recuperar depois."
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
