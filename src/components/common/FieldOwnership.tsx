/**
 * Who owns a field.
 *
 * A distributor's tracking workbook answers this with four fill colours, and a
 * salesperson opening it knows within a second which cells are theirs, which
 * are waiting on somebody else, and which are formulas they must not type over.
 * It costs one legend line and removes a whole class of question.
 *
 * Memoire has the same three answers scattered across its surfaces and no
 * convention for saying them. `planItemEditPolicy` knows which fields a day
 * column may write and why not; the qualification score is computed from other
 * records and cannot be typed at all; a deal's customer belongs to the deal and
 * changing it from a plan item would move an opportunity's money and history.
 * All three were expressed differently, or not at all.
 *
 * Three owners, not four. The workbook's fourth colour marks a mandatory field
 * left empty, which is a *state* rather than an owner - `recordIntegrity`
 * already reports that, by name, on the record itself.
 */

export type FieldOwner =
  /** The operator types it. The default, and therefore never marked. */
  | 'you'
  /** Computed from other records. Typing over it would be meaningless. */
  | 'derived'
  /** Held by another record. Changing it here would move that record. */
  | 'elsewhere';

const OWNER_COPY: Record<Exclude<FieldOwner, 'you'>, { label: string; hint: string }> = {
  derived: {
    label: 'Derived',
    hint: 'Worked out from your other records. There is nothing to type here — change the records it reads and this follows.',
  },
  elsewhere: {
    label: 'Lives elsewhere',
    hint: 'This belongs to another record. Open that record to change it, so one edit does not quietly move something larger.',
  },
};

/**
 * A small marker beside a label.
 *
 * Nothing is drawn for `you`: the operator owning a field is the ordinary case,
 * and a badge on every field is a badge on none. Only the two exceptions are
 * marked, which is what makes them read as exceptions.
 */
export function FieldOwnership({ owner, className = '' }: { owner: FieldOwner; className?: string }) {
  if (owner === 'you') return null;
  const copy = OWNER_COPY[owner];
  return (
    <span
      title={copy.hint}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        owner === 'derived' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-brand-blue'
      } ${className}`}
    >
      {copy.label}
    </span>
  );
}
