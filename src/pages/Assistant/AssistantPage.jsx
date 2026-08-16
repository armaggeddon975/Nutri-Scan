import { Bot, Loader2, MessageSquareText } from "lucide-react";

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
        title="Converse com o assistente normalmente."
        subtitle="Ele responde dúvidas gerais, ajuda com alimentos e usa o produto atual quando houver um selecionado."
      />
      <article className="assistant-card assistant-page">
        <div className="panel-heading">
          <Bot size={18} aria-hidden="true" />
          <h4>Nutri Assistente</h4>
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
              onClick={() => onQuestionChange(suggestion)}
              disabled={assistantLoading}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="chat-log" ref={chatLogRef} role="log" aria-live="polite">
          {assistantMessages.map((message, index) => (
            <p className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" && message.source && (
                <span className="chat-source">
                  {message.source === "local" ? "Resposta local" : "Nutri IA"}
                </span>
              )}
              {message.text}
            </p>
          ))}
          {assistantLoading && (
            <p className="chat-message assistant pending">
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Pensando...
            </p>
          )}
        </div>
        <form className="assistant-form" onSubmit={onSubmitAssistant}>
          <input
            id="assistant-question"
            placeholder="Pergunte sobre calorias, açúcar, alergias..."
            value={assistantQuestion}
            onChange={(event) => onQuestionChange(event.target.value)}
            disabled={assistantLoading}
          />
          <button type="submit" aria-label="Perguntar ao assistente" disabled={assistantLoading}>
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
