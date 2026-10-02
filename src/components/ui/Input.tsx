import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-[12.5px] font-bold text-ink mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          block w-full rounded-xl border px-3 py-2 text-sm
          placeholder:text-gray-400 font-body text-ink bg-white
          focus:outline-none transition-all
          ${
            error
              ? 'border-red-300 focus:border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.1)]'
              : 'border-line focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(25,118,210,0.10)] hover:border-line-strong'
          }
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 flex items-center text-sm text-red-600 font-medium">{error}</p>}
      {helperText && !error && <p className="mt-1 text-sm text-muted">{helperText}</p>}
    </div>
  );
}
