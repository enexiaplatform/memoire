import { useState } from 'react';

/**
 * A text field that offers what the workspace already knows.
 *
 * The point is not convenience, it is identity. Every account link in this
 * product is the account *name*: a deal, a touch and a quote belong to the same
 * customer because the strings resolve to the same key. So a field where the
 * user retypes a customer is a field where one slip - "Trust Farma" for "Trust
 * Farm" - silently splits that customer's deals, touches, coverage row and
 * cadence, with nothing on screen to say it happened.
 *
 * Matching is diacritic- and punctuation-insensitive and matches anywhere in the
 * name, so "dp" finds "DP Lab" and "euvi" finds "Euvipharm" - which is the whole
 * reason a native `datalist` was not enough: it only matches from the first
 * letter, and only the letters the user reproduced exactly.
 */

export type SuggestOption = {
  key: string;
  primary: string;
  secondary?: string;
  onPick: () => void;
};

type Tone = 'plain' | 'emerald';

const toneStyles: Record<Tone, {
  wrapper: string;
  label: string;
  input: string;
  menu: string;
  option: string;
}> = {
  // Matches the form fields around it on Opportunities and the other editors.
  plain: {
    wrapper: 'relative block',
    label: 'text-sm font-bold text-navy',
    input: 'mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10',
    menu: 'border-gray-200',
    option: 'text-navy hover:bg-blue-50',
  },
  // Matches Quick Capture's green panel.
  emerald: {
    wrapper: 'relative block rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100',
    label: 'text-xs font-bold uppercase tracking-wide text-emerald-700',
    input: 'mt-1 w-full bg-transparent text-sm font-semibold text-emerald-950 outline-none placeholder:text-emerald-300',
    menu: 'border-emerald-100',
    option: 'text-emerald-950 hover:bg-emerald-50',
  },
};

export function SuggestInput({
  label,
  value,
  placeholder = '',
  onChange,
  options,
  tone = 'plain',
  required = false,
  onBlurred,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  options: SuggestOption[];
  tone?: Tone;
  required?: boolean;
  /**
   * Fired when the field is left. Callers use it to hold a warning back until
   * the seller has finished typing - "did you mean X?" on the third keystroke of
   * a name is noise, and noise is how a real warning gets ignored.
   */
  onBlurred?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const styles = toneStyles[tone];

  return (
    <label className={styles.wrapper}>
      <span className={styles.label}>{label}{required ? ' *' : ''}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // Blur closes the menu, so the option buttons below suppress mousedown
        // to survive long enough to be clicked.
        onBlur={() => { setOpen(false); onBlurred?.(); }}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        autoComplete="off"
        className={styles.input}
      />
      {open && options.length > 0 && (
        <div className={`absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg ${styles.menu}`}>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { option.onPick(); setOpen(false); }}
              className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm font-semibold ${styles.option}`}
            >
              <span className="truncate">{option.primary}</span>
              {option.secondary && <span className="shrink-0 text-[11px] font-semibold text-gray-400">{option.secondary}</span>}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
