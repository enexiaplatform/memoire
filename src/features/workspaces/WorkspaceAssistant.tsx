import { useEffect, useState } from 'react';
import { controlClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { sendAiChat } from '../../services/aiChat';

export function WorkspaceAssistant({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<AbortController | null>(null);
  useEffect(() => () => pending?.abort(), [pending]);

  return <section aria-label="Ask Memoire" className="space-y-3 rounded-panel bg-white p-5 shadow-panel">
    <h2 className="font-display font-bold">Ask Memoire</h2>
    <p className="text-sm text-muted">Sending a question shares it and a limited snapshot of this workspace with Groq.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (!question.trim() || pending) return;
      const controller = new AbortController();
      setPending(controller);
      setError('');
      setAnswer('');
      try {
        const result = await sendAiChat(userId, [{ role: 'user', content: question.trim() }], {
          asOf: new Date().toISOString(), scope: 'Selected workspace', sources: [], facts: [], limitations: [],
        }, controller.signal, workspaceId);
        if (!controller.signal.aborted) setAnswer(result.answer);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Memoire could not answer.');
      } finally {
        if (!controller.signal.aborted) setPending(null);
      }
    }}>
      <label className="block text-sm font-semibold">Question<textarea className={`${controlClass} mt-1`} rows={3} maxLength={4000} required value={question} onChange={event => setQuestion(event.target.value)} /></label>
      <button type="submit" className={primaryPillClass} disabled={Boolean(pending) || !question.trim()}>{pending ? 'Asking…' : 'Ask'}</button>
    </form>
    {error && <p role="alert" className="text-sm text-tint-red-solid">{error}</p>}
    {answer && <p aria-live="polite" className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{answer}</p>}
  </section>;
}
