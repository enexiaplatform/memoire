import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const navigate = useNavigate();
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetDate = nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="You've reached your free limit">
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            <strong>Starter workspace:</strong> 30 captures/month
          </p>
          <p className="text-sm font-medium text-red-600">
            You've used all 30 this month.
          </p>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-gray-900">Request early access</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              'More capture room for real sales work',
              'More account and stakeholder memory',
              'AI-assisted review workflows when enabled',
              'Export and deletion controls',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <button
            onClick={() => navigate('/pricing')}
            className="w-full rounded-lg bg-memoire-600 py-2.5 font-medium text-white transition hover:bg-memoire-700"
          >
            See access options
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Maybe later
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Resets on {resetDate}
        </p>
      </div>
    </Modal>
  );
}
