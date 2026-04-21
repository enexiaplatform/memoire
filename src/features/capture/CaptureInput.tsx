import { useState, useRef, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { useAnonymize } from '../../hooks/useAnonymize';
import type { AnonymizationSuggestion, AnonymizationState } from '../../types/anonymization';

interface CaptureInputProps {
  rawText: string;
  setRawText: (text: string) => void;
  onProcess: () => void;
  isProcessing: boolean;
  disabled?: boolean;
  onAnonymizeData: (data: { state: AnonymizationState, originalText?: string }) => void;
}

export function CaptureInput({
  rawText,
  setRawText,
  onProcess,
  isProcessing,
  disabled,
  onAnonymizeData
}: CaptureInputProps) {
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autoAnonymize, setAutoAnonymize] = useState(true);
  
  // Anonymization States
  const { suggestAnonymization, isAnonymizing } = useAnonymize();
  const [suggestion, setSuggestion] = useState<AnonymizationSuggestion | null>(null);
  const [originalText, setOriginalText] = useState<string>('');
  const [editedSuggestedText, setEditedSuggestedText] = useState<string>('');

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current && !disabled && !suggestion) {
      textareaRef.current.focus();
    }
  }, [disabled, suggestion]);

  useEffect(() => {
    async function loadPref() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data } = await supabase.from('user_profiles').select('anonymize_default').eq('id', userData.user.id).single();
      if (data && data.anonymize_default !== null) setAutoAnonymize(data.anonymize_default);
    }
    loadPref();
  }, []);

  const handleToggleAutoAnonymize = async (checked: boolean) => {
    setAutoAnonymize(checked);
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase.from('user_profiles').update({ anonymize_default: checked }).eq('id', userData.user.id);
    }
  };

  const handleSuggestAnonymization = async () => {
    if (rawText.length < 30) return;
    const result = await suggestAnonymization(rawText);
    if (result) {
      setOriginalText(rawText);
      setSuggestion(result);
      setEditedSuggestedText(result.suggested);
    }
  };

  const handleAcceptAnonymization = () => {
    const isEdited = editedSuggestedText !== suggestion?.suggested;
    setRawText(editedSuggestedText);
    onAnonymizeData({
      state: isEdited ? 'mixed' : 'anonymized',
      originalText: originalText
    });
    setSuggestion(null);
  };

  const handleRejectAnonymization = () => {
    setSuggestion(null);
    onAnonymizeData({ state: 'original' });
  };

  const handleProcess = () => {
    setError(null);
    if (!rawText.trim()) {
      setError('Write something first');
      return;
    }
    if (rawText.trim().length < 10) {
      setError('Add a bit more detail for better extraction');
      return;
    }
    onProcess();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleProcess();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  if (suggestion) {
    return (
      <div className="bg-white rounded-[16px] border-[1.5px] border-gray-200 shadow-sm p-5 space-y-4 animate-in fade-in zoom-in-95">
        <h3 className="font-bold text-navy font-display">Review Anonymization</h3>
        <p className="text-sm text-gray-500">
          We've replaced proprietary data with generalized placeholders. Please review and edit if necessary.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Original</label>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 font-body min-h-[150px] whitespace-pre-wrap opacity-70">
              {originalText}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold brand-gradient-text uppercase tracking-wider">Suggested</label>
            <textarea
              value={editedSuggestedText}
              onChange={(e) => setEditedSuggestedText(e.target.value)}
              className="w-full resize-none border border-brand-blue/30 rounded-lg focus:ring-2 focus:ring-brand-blue/20 p-3 min-h-[150px] font-body text-sm text-gray-900 block bg-[#F4F6FB]"
            />
          </div>
        </div>

        {suggestion.replacements.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
             <h4 className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">Changes Made</h4>
             <ul className="text-xs text-amber-700 space-y-1">
               {suggestion.replacements.map((r, i) => (
                 <li key={i}>
                   <span className="line-through opacity-70 mr-1">{r.from}</span> &rarr; 
                   <span className="font-bold mx-1">{r.to}</span> 
                   <span className="opacity-70">({r.reason})</span>
                 </li>
               ))}
             </ul>
          </div>
        )}

        <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100">
           <button onClick={handleRejectAnonymization} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-navy hover:bg-gray-50 rounded-lg transition-colors border border-transparent">
             Reject
           </button>
           <button onClick={handleAcceptAnonymization} className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors brand-gradient hover:opacity-90">
             Accept & Continue
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[16px] border-[1.5px] border-gray-200 shadow-sm focus-within:border-brand-blue focus-within:shadow-[0_0_0_3px_rgba(25,118,210,0.10)] transition-all flex flex-col group overflow-hidden">
      <textarea
        ref={textareaRef}
        value={rawText}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={isProcessing || disabled}
        placeholder="What happened today? Write freely — a meeting, a call, an insight, anything. Memoire will structure it for you."
        className="w-full resize-none bg-transparent border-none focus:ring-0 px-5 pt-4 pb-2 min-h-[150px] font-body text-[16px] text-gray-900 leading-[1.65] placeholder:text-gray-400 block"
        rows={6}
      />
      
      {error && <div className="px-5 py-2 text-sm text-red-600 font-medium">{error}</div>}

      <div className="flex items-center justify-between px-5 py-3 bg-gray-50/50 border-t border-gray-100">
        <div className="flex items-center gap-4 hidden sm:flex">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={autoAnonymize} 
              onChange={(e) => handleToggleAutoAnonymize(e.target.checked)} 
              className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
            />
            <span className="text-xs font-medium text-gray-500">Auto-anonymize data</span>
          </label>
        </div>
        
        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={handleSuggestAnonymization}
            disabled={rawText.length < 30 || isAnonymizing || isProcessing || disabled}
            className={`text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white transition-colors ${
              rawText.length < 30 ? 'text-gray-400 opacity-50 cursor-not-allowed' : 'text-navy hover:bg-gray-50'
            }`}
          >
            {isAnonymizing ? 'Analyzing...' : 'Suggest Anonymization'}
          </button>
          
          <Button
            onClick={handleProcess}
            loading={isProcessing}
            disabled={isProcessing || disabled}
            className="min-w-[120px]"
          >
            {isProcessing ? 'Extracting...' : 'Process →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
