import { useState } from 'react';
import { Link } from 'react-router-dom';
export function AutomationSetupShortcut() {
  const [text, setText] = useState('');
  return <details className="my-3 rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold text-ink">Prepare an automation rule</summary>
    <p className="mt-2 text-xs text-muted">Describe internal reminders or preparation. Review the draft in Settings before saving. Email and calendar are excluded.</p>
    <label className="mt-2 block text-sm text-ink">Rule description<input maxLength={500} value={text} onChange={event => setText(event.target.value)}
      className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Nhắc công nợ, lead và review hàng tuần" /></label>
    <Link className="mt-2 inline-block text-sm text-brand-blue underline" to={`/app/settings?tab=automations&intent=${encodeURIComponent(text)}`}>Review rule draft</Link></details>;
}
