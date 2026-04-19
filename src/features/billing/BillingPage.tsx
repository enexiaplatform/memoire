import { PlanCard } from './PlanCard';
import { UsageMeter } from './UsageMeter';

export function BillingPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-[24px] font-bold font-display text-navy mb-8 tracking-tight">Billing</h1>
      
      <div className="space-y-12">
        <PlanCard />
        <UsageMeter />
      </div>
    </div>
  );
}
