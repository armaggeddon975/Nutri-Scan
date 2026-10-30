import { Bot, Loader2, MessageSquareText } from "lucide-react";

import { AllergyVerdict } from "../../components/assistant/AllergyVerdict";
import { PageHeader } from "../../components/common/PageHeader";
import { STATUS_ICONS } from "../../components/common/StatusLine";

export function AssistantPage({
  chatLogRef,
  assistantConnection,
  assistantMessages,
  assistantLoading,
  assistantQuestion,
  hasLastQuestion,
  onQuestionChange,
  onSubmitAssistant,
  onRetryAssistant,
}) {
  const StatusIcon = STATUS_ICONS[assistantConnection.type] || STATUS_ICONS.ready;

  return (
    <>
      <PageHeader
        eyebrow="Assistente"
        title="Tire suas dúvidas sobre alimentos."
        subtitle="Pergunte sobre qualquer alimento."
      />
      <article className="assistant-card assistant-page">
        <div className="panel-heading">
          <Bot size={18} aria-hidden="true" />
          {/* h3, e nao h4 (v0.12.0): logo abaixo do h2 da tela, sem pular nivel. */}
          <h3 className="panel-title">Nutri Assistente</h3>
        </div>
        <p className="assistant-disclaimer">
          Orientação informativa, baseada em dados públicos de rótulo que podem estar incompletos ou
          desatualizados. Não substitui avaliação de médico ou nutricionista. Em caso de reação
          alérgica, procure atendimento.
        </p>
        <div className={`assistant-status ${assistantConnection.type}`} role="status" aria-live="polite">
          <StatusIcon
            size={17}
            className={assistantConnection.type === "loading" ? "spin" : ""}
            aria-hidden="true"
          />
          <span>{assistantConnection.message}</span>
        </div>
        <div className="prompt-suggestions">
          {[
            "Oi, tudo bem?",
            "O que você consegue fazer?",
            "Esse produto é uma boa escolha?",
          ].map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => {
                if (!assistantLoading) onQuestionChange(suggestion);
              }}
              aria-disabled={assistantLoading || undefined}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="chat-log" ref={chatLogRef} role="log" aria-live="polite">
          {assistantMessages.map((message, index) => (
            <div className="chat-entry" key={`${message.role}-${index}`}>
              {/* O veredito deterministico vem antes da explicacao do modelo. */}
              {message.role === "assistant" && <AllergyVerdict verdict={message.verdict} />}
              <p className={`chat-message ${message.role}`}>
                {message.role === "assistant" && message.source && (
                  <span className="chat-source">
                    {message.source === "local" ? "Resposta local" : "Nutri IA"}
                  </span>
                )}
                {message.text}
              </p>
            </div>
          ))}
          {assistantLoading && (
            <p className="chat-message assistant pending">
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Pensando...
            </p>
          )}
        </div>
        {/* OCUPADO SEM PERDER O FOCO (v0.12.0). Com `disabled`, o campo onde a
            pessoa acabou de apertar Enter saia da ordem de foco, e o foco caia no
            <body>. `readOnly` + `aria-disabled` dizem "ocupado" e mantem o foco;
            o envio repetido e barrado aqui. */}
        <form
          className="assistant-form"
          onSubmit={(event) => {
            if (assistantLoading) {
              event.preventDefault();
              return;
            }
            onSubmitAssistant(event);
          }}
        >
          <label className="assistant-label" htmlFor="assistant-question">
            Sua pergunta
          </label>
          <input
            id="assistant-question"
            placeholder="Pergunte sobre calorias, açúcar, alergias..."
            value={assistantQuestion}
            onChange={(event) => onQuestionChange(event.target.value)}
            readOnly={assistantLoading}
            aria-disabled={assistantLoading || undefined}
          />
          <button type="submit" aria-label="Perguntar ao assistente" aria-disabled={assistantLoading || undefined}>
            <MessageSquareText size={18} aria-hidden="true" />
            {assistantLoading ? "Enviando" : "Enviar"}
          </button>
        </form>
        {hasLastQuestion && !assistantLoading && (
          <button className="retry-button" type="button" onClick={onRetryAssistant}>
            Tentar novamente a última pergunta
          </button>
        )}
      </article>
    </>
  );
}
