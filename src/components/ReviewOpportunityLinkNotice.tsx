import { Link } from 'react-router-dom';

export function ReviewOpportunityLinkNotice({ checking, onRetry }: { checking: boolean; onRetry?: () => void }) {
  if (checking) return <p role="status">Checking the linked opportunity…</p>;
  return <>
    <p role="alert">The linked opportunity is unavailable.</p>
    <div className="flex flex-wrap gap-x-4 text-sm font-semibold text-brand-blue">
      {onRetry && <button type="button" className="min-h-11 underline" onClick={onRetry}>Retry opportunity lookup</button>}
      <Link to="/app/reviews" className="inline-flex min-h-11 items-center underline">Back to Review</Link>
    </div>
  </>;
}
