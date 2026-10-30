import { useState } from "react";
import { Bot, Download, Lock, LogIn, LogOut, Mail, ShieldAlert, Trash2, User, UserPlus } from "lucide-react";

import { ALLERGY_OPTIONS } from "../../data/allergens";
import { AlertLevelPicker } from "../../components/allergies/AlertLevelPicker";
import { AllergyPicker } from "../../components/allergies/AllergyPicker";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

// SEUS DADOS (v0.8.0): baixar uma copia e excluir a conta.
//
// A exclusao nao tem desfazer, entao nao e um botao de um clique. O primeiro
// botao so ABRE a confirmacao; para excluir de fato a pessoa digita a senha E
// marca que entende que nao da para voltar atras. So entao o botao final
// funciona.
function SeusDados({ dataStatus, onExportData, onDeleteAccount }) {
  const [confirmando, setConfirmando] = useState(false);
  const [senha, setSenha] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const fechar = () => {
    setConfirmando(false);
    setSenha("");
    setEntendi(false);
  };

  const excluir = async (event) => {
    event.preventDefault();
    if (!senha || !entendi || enviando) return;
    setEnviando(true);
    const excluiu = await onDeleteAccount(senha);
    setEnviando(false);
    // A senha nunca fica guardada no campo depois da tentativa.
    setSenha("");
    if (excluiu) fechar();
  };

  return (
    <article className="account-card account-data">
      <div className="panel-heading">
        <Download size={18} aria-hidden="true" />
        <h4>Seus dados</h4>
      </div>

      <p>Baixe um arquivo com sua conta, suas alergias, seu histórico e seus favoritos.</p>
      <button className="secondary-button" type="button" onClick={onExportData}>
        <Download size={18} aria-hidden="true" />
        Baixar meus dados
      </button>

      {!confirmando ? (
        <button className="account-delete-open" type="button" onClick={() => setConfirmando(true)}>
          <Trash2 size={18} aria-hidden="true" />
          Excluir minha conta
        </button>
      ) : (
        <form className="account-delete-confirm" onSubmit={excluir}>
          <p className="account-delete-warning">
            Isso apaga sua conta, suas alergias, seu histórico e seus favoritos. Não dá para desfazer.
          </p>
          <label>
            <span>Sua senha</span>
            <div className="field-with-icon">
              <Lock size={18} aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
              />
            </div>
          </label>
          <label className="account-delete-check">
            <input type="checkbox" checked={entendi} onChange={(event) => setEntendi(event.target.checked)} />
            <span>Entendo que não dá para desfazer.</span>
          </label>
          <div className="account-delete-actions">
            <button className="account-delete-final" type="submit" disabled={!senha || !entendi || enviando}>
              <Trash2 size={18} aria-hidden="true" />
              Excluir para sempre
            </button>
            <button className="secondary-button" type="button" onClick={fechar}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {dataStatus && <StatusLine status={dataStatus} />}
    </article>
  );
}

export function AccountPage({
  currentUser,
  selectedAllergies,
  alertLevels,
  authMode,
  authForm,
  authStatus,
  dataStatus,
  onAuthModeChange,
  onAuthFormChange,
  onSubmitAuth,
  onLogout,
  onToggleAllergy,
  onSetAlertLevel,
  onExportData,
  onDeleteAccount,
}) {
  return (
    <>
      <PageHeader
        eyebrow="Conta"
        title="Entre na sua conta."
        subtitle="Suas alergias salvas em qualquer aparelho."
      />

      {currentUser ? (
        <section className="account-grid">
          <article className="account-card profile-card">
            <div className="account-avatar">
              <User size={30} aria-hidden="true" />
            </div>
            <p className="eyebrow dark">Perfil conectado</p>
            <h3>{currentUser.name}</h3>
            <span>{currentUser.email}</span>
            <div className="saved-allergies">
              {selectedAllergies.length ? (
                selectedAllergies.map((id) => {
                  const allergy = ALLERGY_OPTIONS.find((option) => option.id === id);
                  return (
                    <span className="soft-tag" key={id}>
                      {allergy?.label || id}
                      {alertLevels?.[id] === "strict" ? " · alerta máximo" : ""}
                    </span>
                  );
                })
              ) : (
                <span className="quiet-tag">Nenhuma alergia marcada</span>
              )}
            </div>
            <button className="secondary-button" type="button" onClick={onLogout}>
              <LogOut size={18} aria-hidden="true" />
              Sair da conta
            </button>
          </article>

          <article className="account-card">
            <div className="panel-heading">
              <ShieldAlert size={18} aria-hidden="true" />
              <h4>Alergias desse perfil</h4>
            </div>
            {/* Dentro do cartao, abaixo do h4 "Alergias desse perfil": h5. */}
            <AllergyPicker selectedAllergies={selectedAllergies} onToggleAllergy={onToggleAllergy} TituloDoGrupo="h5" />
            <AlertLevelPicker
              selectedAllergies={selectedAllergies}
              alertLevels={alertLevels}
              onSetAlertLevel={onSetAlertLevel}
              Titulo="h5"
            />
          </article>

          <SeusDados dataStatus={dataStatus} onExportData={onExportData} onDeleteAccount={onDeleteAccount} />
        </section>
      ) : (
        <section className="auth-layout">
          <article className="auth-card">
            <div className="auth-tabs" aria-label="Tipo de acesso">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => onAuthModeChange("login")}
              >
                <LogIn size={18} aria-hidden="true" />
                Entrar
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => onAuthModeChange("register")}
              >
                <UserPlus size={18} aria-hidden="true" />
                Criar conta
              </button>
            </div>

            <form className="auth-form" onSubmit={onSubmitAuth}>
              {authMode === "register" && (
                <label>
                  <span>Usuário</span>
                  <div className="field-with-icon">
                    <User size={18} aria-hidden="true" />
                    <input
                      value={authForm.name}
                      onChange={(event) => onAuthFormChange("name", event.target.value)}
                      placeholder="Ex: Diego"
                    />
                  </div>
                </label>
              )}
              <label>
                <span>{authMode === "login" ? "E-mail ou usuário" : "E-mail"}</span>
                <div className="field-with-icon">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    type={authMode === "login" ? "text" : "email"}
                    value={authForm.email}
                    onChange={(event) => onAuthFormChange("email", event.target.value)}
                    placeholder={authMode === "login" ? "seu e-mail ou usuário" : "voce@email.com"}
                  />
                </div>
              </label>
              <label>
                <span>Senha</span>
                <div className="field-with-icon">
                  <Lock size={18} aria-hidden="true" />
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => onAuthFormChange("password", event.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                  />
                </div>
              </label>
              <button className="primary-button" type="submit">
                {authMode === "register" ? (
                  <UserPlus size={18} aria-hidden="true" />
                ) : (
                  <LogIn size={18} aria-hidden="true" />
                )}
                {authMode === "register" ? "Criar minha conta" : "Entrar na conta"}
              </button>
            </form>

            <StatusLine status={authStatus} />
          </article>

          <aside className="account-card account-benefits">
            <h3>Por que criar uma conta?</h3>
            <p>O app lembra suas alergias e avisa quando houver risco.</p>
            <div className="guide-item">
              <ShieldAlert size={20} aria-hidden="true" />
              <span>Suas alergias em qualquer aparelho.</span>
            </div>
            <div className="guide-item">
              <Bot size={20} aria-hidden="true" />
              <span>O assistente conhece suas alergias.</span>
            </div>
          </aside>
        </section>
      )}
    </>
  );
}
