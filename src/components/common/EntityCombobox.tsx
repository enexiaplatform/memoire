import { useId, useMemo, useRef, useState } from 'react';

export interface ComboboxOption {
  name: string;
  code?: string;
  detail?: string;
}

/** Diacritic-insensitive lowercase, so "cuu long" matches "CỬU LONG". */
function fold(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Name-or-code autocomplete with an optional "create new" affordance. Lets a
 * seller attach a capture to an existing account/deal (picking the canonical
 * record) instead of retyping a variant, and create a new one in place.
 */
export function EntityCombobox({
  label,
  value,
  onChange,
  options,
  placeholder,
  ringClass = 'ring-emerald-100',
  labelClass = 'text-emerald-700',
  textClass = 'text-emerald-950 placeholder:text-emerald-300',
  onCreateNew,
  createNoun = 'record',
  valueOnCreate = false,
  valueLabel = 'Value (SGD)',
  onCreateWithValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  ringClass?: string;
  labelClass?: string;
  textClass?: string;
  onCreateNew?: (name: string) => void;
  createNoun?: string;
  valueOnCreate?: boolean;
  valueLabel?: string;
  onCreateWithValue?: (name: string, value: number) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = fold(value);
  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 40);
    return options
      .filter((option) => fold(option.name).includes(query) || (option.code && fold(option.code).includes(query)))
      .slice(0, 40);
  }, [options, query]);
  const exactMatch = useMemo(() => options.some((option) => fold(option.name) === query), [options, query]);
  const showCreate = Boolean(onCreateNew && value.trim() && !exactMatch);

  const closeSoon = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const cancelClose = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  };

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const create = () => {
    const name = value.trim();
    if (!name) return;
    if (valueOnCreate && onCreateWithValue) {
      onCreateWithValue(name, Number(newValue) || 0);
    } else if (onCreateNew) {
      onCreateNew(name);
    }
    setNewValue('');
    setOpen(false);
  };

  return (
    <label className={`relative block rounded-lg bg-white px-3 py-2 ring-1 ${ringClass}`} onBlur={closeSoon} onFocus={cancelClose}>
      <span className={`text-xs font-bold uppercase tracking-wide ${labelClass}`}>{label}</span>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        className={`mt-1 w-full bg-transparent text-sm font-semibold outline-none ${textClass}`}
      />
      {open && (filtered.length > 0 || showCreate) && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option) => (
            <button
              key={`${option.name}-${option.code || ''}`}
              type="button"
              role="option"
              aria-selected={fold(option.name) === query}
              onMouseDown={(event) => { event.preventDefault(); pick(option.name); }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50"
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-navy">{option.name}</span>
              {option.code && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-gray-500">{option.code}</span>}
            </button>
          ))}
          {showCreate && (
            <div className="border-t border-gray-100 px-3 py-2">
              {valueOnCreate ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-500">New {createNoun}: <span className="text-navy">{value.trim()}</span></p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={newValue}
                      onChange={(event) => setNewValue(event.target.value)}
                      placeholder={valueLabel}
                      onMouseDown={(event) => event.stopPropagation()}
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-brand-blue"
                    />
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); create(); }} className="shrink-0 rounded-full bg-brand-blue px-3 py-1 text-xs font-bold text-white">
                      Create deal
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onMouseDown={(event) => { event.preventDefault(); create(); }} className="w-full rounded-full bg-navy px-3 py-1.5 text-left text-xs font-bold text-white">
                  + Create new {createNoun}: {value.trim()}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </label>
  );
}
