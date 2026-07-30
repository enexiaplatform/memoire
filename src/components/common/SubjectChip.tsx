import { Link } from 'react-router-dom';
import { relationTypeLabel, type ActivityRelation, type ActivityRelationType } from '../../utils/activityLedger';

/**
 * What a row of work is about, drawn as one chip.
 *
 * Shared between the Activity ledger and the Timeline calendar on purpose. The
 * calendar's claim is that every note points at one specific thing; if the chip
 * on a calendar day were styled by different rules from the chip in the ledger,
 * the two surfaces would be quietly disagreeing about what a note is attached to
 * on the same screen.
 *
 * Amber-and-dashed for `unresolved` is the one tone that has to earn its
 * loudness. It marks a name the operator is working that no account, deal or line
 * answers to - work that reaches no forecast and no invoice - and on a plain
 * calendar it is completely indistinguishable from work that does.
 */
const relationChipTone: Record<ActivityRelationType, string> = {
  opportunity: 'border-blue-200 bg-blue-50 text-blue-800',
  account: 'border-sky-200 bg-sky-50 text-sky-800',
  brand: 'border-violet-200 bg-violet-50 text-violet-800',
  internal: 'border-gray-200 bg-gray-50 text-gray-600',
  unresolved: 'border-dashed border-amber-400 bg-amber-50 text-amber-800',
};

export function SubjectChip({
  relation,
  /** The operator's own wording, when it differs from the resolved name. */
  label,
  size = 'default',
  className = '',
}: {
  relation: ActivityRelation;
  label?: string;
  size?: 'default' | 'compact';
  className?: string;
}) {
  const text = (label || '').trim() || relation.name;
  const sizing = size === 'compact'
    ? 'max-w-[110px] rounded px-1 py-0.5 text-[10px] sm:max-w-[150px]'
    : 'max-w-[136px] rounded-full px-2 py-0.5 text-[11px] sm:max-w-[190px]';
  const shape = `inline-flex shrink-0 items-center gap-1 truncate border font-bold ${sizing} ${relationChipTone[relation.type]} ${className}`;

  // The tooltip carries what the chip cannot: which of the five kinds of thing
  // this is, and the canonical name when the operator wrote a different one.
  const title = relation.type === 'unresolved'
    ? `${text} is not an account, a deal or a line you carry yet - this work reaches no deal and no money`
    // "Internal: Internal" is what the generic form produces for admin work, so
    // internal names its domain instead of repeating the type.
    : relation.type === 'internal'
      ? `Internal work · ${relation.name}`
      : `${relationTypeLabel(relation.type)}: ${relation.name}`;

  if (!relation.href) {
    return <span className={shape} title={title}>{text}</span>;
  }
  return (
    <Link to={relation.href} className={`${shape} hover:underline`} title={title}>
      {text}
    </Link>
  );
}
