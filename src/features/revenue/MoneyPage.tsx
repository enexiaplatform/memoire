import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { moneyViewLabels, moneyViews, toMoneyView, type MoneyView } from './moneyViews';

const RevenueViewPage = lazy(() => import('./RevenueViewPage').then((m) => ({ default: m.RevenueViewPage })));
const CashCollectionPage = lazy(() => import('./CashCollectionPage').then((m) => ({ default: m.CashCollectionPage })));
const CostAnalysisPage = lazy(() => import('./CostAnalysisPage').then((m) => ({ default: m.CostAnalysisPage })));

/**
 * Money: one destination for the whole commercial money spine.
 *
 * Orders, Cash Collection and Cost Analysis were three rail rows. They are one
 * question asked at three moments - what did we commit to, did it arrive, was
 * it worth doing - and splitting one question across three destinations made
 * the seller navigate a filing system to follow a single order from contract to
 * margin.
 *
 * The three pages are unchanged and still own their own data, headers and
 * loading. What changed is that they are now views of one place rather than
 * three places, and the tab strip below is the only thing that knows about all
 * three. Their old routes redirect here with the right view selected, so every
 * bookmark, digest link and manager link still lands on the same content.
 */


export function MoneyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = toMoneyView(searchParams.get('view'));

  const selectView = (next: MoneyView) => {
    const params = new URLSearchParams(searchParams);
    // `orders` is the default, so it stays out of the URL - a canonical
    // /app/revenue and /app/revenue?view=orders being different strings is how
    // two links to the same screen start looking like two screens.
    if (next === 'orders') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const tabs = (
    <div
      className="inline-flex flex-wrap rounded-full border border-gray-200 bg-gray-50 p-1"
      role="tablist"
      aria-label="Money view"
    >
      {moneyViews.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={view === option}
          onClick={() => selectView(option)}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
            view === option ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
          }`}
        >
          {moneyViewLabels[option]}
        </button>
      ))}
    </div>
  );

  return (
    <Suspense
      fallback={(
        <SkeletonScreen label={`Loading ${moneyViewLabels[view].toLowerCase()}`}>
          <SkeletonCard lines={5} />
        </SkeletonScreen>
      )}
    >
      {view === 'orders' && <RevenueViewPage tabs={tabs} />}
      {view === 'collections' && <CashCollectionPage tabs={tabs} />}
      {view === 'margin' && <CostAnalysisPage tabs={tabs} />}
    </Suspense>
  );
}
