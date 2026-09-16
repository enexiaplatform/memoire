import { useId, type ReactNode } from 'react';

/**
 * The Daylight form controls.
 *
 * These three had been retyped, character for character, at the bottom of every
 * page that edits a record - Stakeholders, Objections, and now Leads would have
 * been the fourth. The markup is identical in each copy, which is exactly the
 * condition under which one of them quietly stops being identical: somebody
 * fixes a focus ring or a label size in the page they are working in, and the
 * product grows a second input style nobody decided on.
 *
 * So they are named once. Nothing here is new: the classes are the ones already
 * in use, lifted unchanged, which is why adopting this in an existing page is a
 * delete and an import rather than a redesign.
 */

const CONTROL =
  'mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10';

/**
 * The label and its hint, associated by id rather than by nesting alone.
 *
 * Wrapping an input in a <label> names it in most browsers, but the hint then
 * becomes part of the name, and some assistive tech computes nothing at all for
 * a select nested that way - it announced the selected option instead of the
 * question. An explicit for/id and aria-describedby say which is which.
 */
function Label({ htmlFor, hintId, children, hint }: { htmlFor: string; hintId: string; children: ReactNode; hint?: string }) {
  return (
    <>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-bold text-ink">{children}</label>
      {hint && <span id={hintId} className="mt-0.5 block text-[11.5px] leading-4 text-muted">{hint}</span>}
    </>
  );
}

export function Field({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
  listId,
  placeholder,
  hint,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  listId?: string;
  /**
   * Describes the answer, never an example identity. A placeholder naming a
   * plausible company is a company the operator did not enter.
   */
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <Label htmlFor={id} hintId={hintId} hint={hint}>{label}{required ? ' *' : ''}</Label>
      <input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        aria-required={required || undefined}
        type={type}
        value={value}
        list={listId}
        placeholder={placeholder}
        // Only ever set by a drawer that opened because the operator asked a
        // question - the cursor belongs in the answer, not on the panel.
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL}
      />
    </div>
  );
}

export function SelectField<Value extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  placeholderOption,
}: {
  label: string;
  value: Value | '';
  options: readonly Value[];
  onChange: (value: Value | '') => void;
  hint?: string;
  /** The "not stated" row, when an empty value is a legitimate answer. */
  placeholderOption?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <Label htmlFor={id} hintId={hintId} hint={hint}>{label}</Label>
      <select
        id={id}
        aria-describedby={hint ? hintId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value as Value | '')}
        className={CONTROL}
      >
        {placeholderOption !== undefined && <option value="">{placeholderOption}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 'min-h-[100px]',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  /** A Tailwind min-height, for the short notes that do not need five lines. */
  rows?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <Label htmlFor={id} hintId={hintId} hint={hint}>{label}</Label>
      <textarea
        id={id}
        aria-describedby={hint ? hintId : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} ${rows} leading-6`}
      />
    </div>
  );
}
