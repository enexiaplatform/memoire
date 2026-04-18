import { useState, useRef, useEffect } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}

export function InlineEdit({ value, onSave, placeholder = 'Empty', multiline = false, className = '' }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async (forceValue?: string) => {
    const valToSave = forceValue !== undefined ? forceValue : editValue;
    if (valToSave !== value) {
      setIsSaving(true);
      await onSave(valToSave);
      setIsSaving(false);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    } else if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      handleSave();
    }
  };

  if (isEditing) {
    const sharedClasses = `w-full bg-white border border-memoire-500 rounded p-1 focus:outline-none focus:ring-1 focus:ring-memoire-500 text-gray-900 ${className}`;
    
    return multiline ? (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => handleSave()}
        onKeyDown={handleKeyDown}
        className={`${sharedClasses} min-h-[100px] resize-y`}
        placeholder={placeholder}
      />
    ) : (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => handleSave()}
        onKeyDown={handleKeyDown}
        className={sharedClasses}
        placeholder={placeholder}
      />
    );
  }

  const displayValue = value || placeholder;
  const isPlaceholder = !value;

  return (
    <div 
      className={`group relative cursor-pointer border border-transparent hover:border-gray-200 hover:bg-gray-50 rounded p-1 -m-1 transition-colors ${isPlaceholder ? 'text-gray-400 italic' : 'text-gray-900'} ${className}`}
      onClick={() => setIsEditing(true)}
    >
      <div className={multiline ? 'whitespace-pre-wrap' : ''}>
        {displayValue}
      </div>
      {isSaving && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs font-medium">
          Saving...
        </div>
      )}
    </div>
  );
}
