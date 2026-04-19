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
        <label htmlFor={inputId} className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          block w-full rounded-xl border-[1.5px] px-4 py-2.5 text-[15px]
          placeholder:text-gray-400 font-body text-gray-900 bg-white
          focus:outline-none transition-all
          ${
            error
              ? 'border-red-300 focus:border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.1)]'
              : 'border-gray-200 focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(25,118,210,0.10)] hover:border-gray-300'
          }
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 flex items-center text-sm text-red-600 font-medium">{error}</p>}
      {helperText && !error && <p className="mt-1 text-sm text-gray-500">{helperText}</p>}
    </div>
  );
}
