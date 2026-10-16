import { AlertLevelPicker } from "../../components/allergies/AlertLevelPicker";
import { AllergyPicker } from "../../components/allergies/AllergyPicker";
import { PageHeader } from "../../components/common/PageHeader";

export function AllergiesPage({
  currentUser,
  selectedAllergies,
  alertLevels,
  productAnalysis,
  onToggleAllergy,
  onSetAlertLevel,
}) {
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
        {currentUser ? (
          <AlertLevelPicker
            selectedAllergies={selectedAllergies}
            alertLevels={alertLevels}
            onSetAlertLevel={onSetAlertLevel}
          />
        ) : (
          selectedAllergies.length > 0 && (
            <p className="alert-level-guest">Com conta, você pode pedir alerta máximo em cada alergia.</p>
          )
        )}
      </section>
      {productAnalysis}
    </>
  );
}
