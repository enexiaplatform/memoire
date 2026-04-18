import { PlanCard } from './PlanCard';
import { UsageMeter } from './UsageMeter';

export function BillingPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-8">Billing</h1>
      
      <div className="space-y-12">
        <PlanCard />
        <UsageMeter />
      </div>
    </div>
  );
}
