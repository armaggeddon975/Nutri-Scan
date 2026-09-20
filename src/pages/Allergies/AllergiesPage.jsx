import { AllergyPicker } from "../../components/allergies/AllergyPicker";
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
      <section className="allergy-page-picker" aria-label="Suas alergias">
        <AllergyPicker selectedAllergies={selectedAllergies} onToggleAllergy={onToggleAllergy} />
      </section>
      {productAnalysis}
    </>
  );
}
