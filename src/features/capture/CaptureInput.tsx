import { useState, useRef, useEffect } from 'react';
import { Button } from '../../components/ui/Button';

interface CaptureInputProps {
  rawText: string;
  setRawText: (text: string) => void;
  onProcess: () => void;
  isProcessing: boolean;
  disabled?: boolean;
}

export function CaptureInput({
  rawText,
  setRawText,
  onProcess,
  isProcessing,
  disabled,
}: CaptureInputProps) {
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

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

  // Auto-expand textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset to auto to compute new scrollHeight
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

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

      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[12px] font-body text-[#94A3B8] hidden sm:inline-block">Cmd+Enter to process</span>
        <Button
          onClick={handleProcess}
          loading={isProcessing}
          disabled={isProcessing || disabled}
          className="ml-auto min-w-[120px]"
        >
          {isProcessing ? 'Extracting...' : 'Process →'}
        </Button>
      </div>
    </div>
  );
}
