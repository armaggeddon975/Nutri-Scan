import { Bot, Lock, LogIn, LogOut, Mail, ShieldAlert, User, UserPlus } from "lucide-react";

import { ALLERGY_OPTIONS } from "../../data/allergens";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

export function AccountPage({
  currentUser,
  selectedAllergies,
  authMode,
  authForm,
  authStatus,
  onAuthModeChange,
  onAuthFormChange,
  onSubmitAuth,
  onLogout,
  onToggleAllergy,
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
            <div className="allergy-grid">
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
            </div>
          </article>
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
