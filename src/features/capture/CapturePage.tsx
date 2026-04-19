import { useState, useEffect } from 'react';
import { extractEntities } from '../../lib/claude';
import { CaptureInput } from './CaptureInput';
import { CapturePreview } from './CapturePreview';
import { CaptureHistory } from './CaptureHistory';
import { useCaptureSubmit } from './useCaptureSubmit';
import type { ExtractionResponse } from './types';
import { PaywallBanner } from '../../components/paywall/PaywallBanner';
import { PaywallModal } from '../../components/paywall/PaywallModal';
import { usePlanLimits } from '../../hooks/usePlanLimits';

export function CapturePage() {
  const [rawText, setRawText] = useState('');
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);

  const { saveCapture, isSaving } = useCaptureSubmit();
  const { isAtCaptureLimit } = usePlanLimits();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      setShowUpgradeSuccess(true);
      window.history.replaceState({}, '', '/app/capture');
      setTimeout(() => setShowUpgradeSuccess(false), 5000);
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleProcess = async () => {
    if (!rawText.trim() || rawText.length < 10) return;
    if (isAtCaptureLimit) return;
    
    setIsProcessing(true);
    try {
      const result = await extractEntities(rawText);
      if (result.error) {
        showToast('Extraction failed. Processing again or saving as raw text.', 'error');
      } else {
        setExtraction(result);
      }
    } catch (err) {
      console.error(err);
      showToast('Connection to AI failed.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!extraction) return;
    const success = await saveCapture(rawText, extraction);
    
    if (success) {
      setRawText('');
      setExtraction(null);
      showToast('Captured ✓', 'success');
    } else {
      showToast('Save failed — please try again', 'error');
    }
  };

  const handleDiscard = () => {
    setExtraction(null);
    setRawText('');
  };

  return (
    <div className="h-full flex relative">
      <PaywallModal isOpen={isAtCaptureLimit} onClose={() => {}} />
      
      {/* Main Content Area */}
      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[24px] font-bold font-display text-navy tracking-tight">Capture</h1>
          <button
            onClick={() => setShowHistoryMobile(!showHistoryMobile)}
            className="lg:hidden text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200"
          >
            {showHistoryMobile ? 'Hide History' : 'Show History'}
          </button>
        </div>

        {showUpgradeSuccess && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6 flex justify-between items-center animate-in fade-in slide-in-from-top-4">
            <p className="text-green-800 text-sm font-medium">🎉 Welcome to Memoire Personal. All limits removed — capture everything.</p>
            <button onClick={() => setShowUpgradeSuccess(false)} className="text-green-600 hover:text-green-800 font-bold px-2">&times;</button>
          </div>
        )}

        <div className="space-y-6">
          <PaywallBanner />
          
          {!extraction && (
            <CaptureInput
              rawText={rawText}
              setRawText={setRawText}
              onProcess={handleProcess}
              isProcessing={isProcessing}
              disabled={isAtCaptureLimit}
            />
          )}

          {extraction && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-700 font-medium">
                {rawText}
              </div>
              <CapturePreview
                extraction={extraction}
                setExtraction={setExtraction}
                onSave={handleSave}
                onDiscard={handleDiscard}
                isSaving={isSaving}
              />
            </div>
          )}
        </div>
      </div>

      {/* History Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 z-20 transform lg:transform-none lg:static transition-transform duration-300 ease-in-out ${
          showHistoryMobile ? 'translate-x-0 pt-16' : 'translate-x-full lg:translate-x-0 lg:pt-0'
        }`}
      >
        <CaptureHistory />
      </div>

      {/* Mobile History Backdrop */}
      {showHistoryMobile && (
        <div
          className="fixed inset-0 bg-black/20 z-10 lg:hidden pt-16"
          onClick={() => setShowHistoryMobile(false)}
        />
      )}

      {/* Toasts */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
          <div
            className={`px-4 py-2.5 rounded-full shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-600 text-white shadow-green-600/20'
                : 'bg-red-600 text-white shadow-red-600/20'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
