import { Modal } from '../ui/Modal';
import { useNavigate } from 'react-router-dom';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const navigate = useNavigate();

  // Get next month's 1st day for reset date
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetDate = nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="You've reached your free limit">
      <div className="space-y-6">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-700">
            <strong>Free plan:</strong> 30 captures/month
          </p>
          <p className="text-sm text-red-600 font-medium">
            You've used all 30 this month.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Upgrade to Personal</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> Unlimited captures
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> Unlimited entities
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> AI-powered search
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> Full data export
            </li>
          </ul>
        </div>

        <div className="pt-4 flex flex-col gap-3">
          <button
            onClick={() => navigate('/pricing')}
            className="w-full py-2.5 bg-memoire-600 text-white font-medium rounded-lg hover:bg-memoire-700 transition"
          >
            Upgrade now — $19/month
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-white text-gray-600 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition"
          >
            Maybe later
          </button>
        </div>

        <p className="text-xs text-center text-gray-400">
          Resets on {resetDate}
        </p>
      </div>
    </Modal>
  );
}
