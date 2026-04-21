import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'both' | 'hiring_only' | 'none'>('none');
  const [agreed, setAgreed] = useState({ 1: false, 2: false, 3: false, 4: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data } = await supabase.from('user_profiles').select('acknowledged_at, acknowledged_hiring_boundary_at, onboarding_acknowledged_at').eq('id', userData.user.id).single();
      if (data) {
        if (!data.onboarding_acknowledged_at) {
          setStep('both');
          setIsOpen(true);
        } else if (!data.acknowledged_hiring_boundary_at) {
          setStep('hiring_only');
          setIsOpen(true);
        }
      }
    }
    check();
  }, []);

  if (!isOpen) return null;

  const handleComplete = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    if (step === 'both') {
      await supabase.from('user_profiles').update({
        onboarding_acknowledged_at: new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
        acknowledged_hiring_boundary_at: new Date().toISOString()
      }).eq('id', userData.user.id);
    } else {
      await supabase.from('user_profiles').update({
        acknowledged_hiring_boundary_at: new Date().toISOString()
      }).eq('id', userData.user.id);
    }
    
    setIsOpen(false);
    setSaving(false);
  };

  const isBothReady = agreed[1] && agreed[2] && agreed[3] && agreed[4];
  const isHiringReady = agreed[4];

  return (
    <div className="fixed inset-0 bg-navy/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95">
        <h2 className="text-2xl font-display font-bold text-navy mb-2">
          {step === 'both' ? 'Welcome to Memoire' : 'Update to Memoire boundaries'}
        </h2>
        <p className="text-gray-500 text-sm mb-6 font-body">
          Before continuing, please acknowledge our data and usage boundaries.
        </p>

        <div className="space-y-4 mb-8">
          {step === 'both' && (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreed[1]} onChange={e => setAgreed({...agreed, 1: e.target.checked})} className="mt-1" />
                <span className="text-sm text-gray-700">I understand that Memoire is a private vault and my data is never shared by default.</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreed[2]} onChange={e => setAgreed({...agreed, 2: e.target.checked})} className="mt-1" />
                <span className="text-sm text-gray-700">I will not upload confidential passwords, trade secrets, or highly classified material.</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreed[3]} onChange={e => setAgreed({...agreed, 3: e.target.checked})} className="mt-1" />
                <span className="text-sm text-gray-700">I understand I can export or delete my data at any time.</span>
              </label>
            </>
          )}

          <label className="flex items-start gap-3 cursor-pointer bg-[#F4F6FB] p-4 rounded-xl border border-brand-blue/20">
            <input type="checkbox" checked={agreed[4]} onChange={e => setAgreed({...agreed, 4: e.target.checked})} className="mt-1 text-brand-blue rounded" />
            <span className="text-sm text-navy font-medium leading-relaxed">
              I understand Memoire is a personal reflection and knowledge tool. It is not a professional certification, skill score, or hiring signal. Memoire will not respond to recruiter or employer queries about my account, and I will not represent Memoire data as a certified credential.
            </span>
          </label>
        </div>

        <Button 
          onClick={handleComplete} 
          disabled={step === 'both' ? !isBothReady : !isHiringReady} 
          loading={saving}
          className="w-full h-12 text-base font-bold brand-gradient"
        >
          I acknowledge and accept
        </Button>
      </div>
    </div>
  );
}
