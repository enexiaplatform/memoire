import { formatSafeBusinessDate, timestampToLocalDateKey } from '../../utils/safeDate';

/**
 * When this record was first written down, and when it last changed.
 *
 * Every store in the workspace has carried `createdAt` and `updatedAt` since the
 * beginning and not one surface showed them, which is how an operator ends up
 * looking at a customer, a deal or a contact with no idea whether it arrived
 * this morning or during last year's import. "How old is this" is the first
 * question anyone asks of a record they did not write themselves, and until now
 * the only honest answer the product could give was "open the CSV".
 *
 * Deliberately one quiet line rather than a pair of fields: it is provenance,
 * not data anyone edits. Days only - the hour a record was saved has never
 * settled an argument - with the full timestamp on hover for the rare case where
 * it has. "Updated" is dropped when nothing has changed since the day it was
 * created, because "Created 6 Aug · Updated 6 Aug" reads as two facts where
 * there is one.
 */
export function RecordStamp({
  createdAt,
  updatedAt,
  className = '',
  /** What the record is, when the surface needs to say it out loud. */
  label = 'Created',
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
  className?: string;
  label?: string;
}) {
  const created = timestampToLocalDateKey(createdAt);
  const updated = timestampToLocalDateKey(updatedAt);
  if (!created && !updated) return null;

  const changedSince = Boolean(updated) && updated !== created;

  return (
    <p className={`text-[11px] font-semibold leading-4 text-gray-400 ${className}`} title={fullStamp(createdAt, updatedAt)}>
      {created ? `${label} ${formatSafeBusinessDate(created)}` : ''}
      {created && changedSince ? ' · ' : ''}
      {changedSince ? `Updated ${formatSafeBusinessDate(updated)}` : ''}
    </p>
  );
}

function fullStamp(createdAt?: string | null, updatedAt?: string | null) {
  return [
    createdAt ? `Created ${readableTimestamp(createdAt)}` : '',
    updatedAt ? `Last updated ${readableTimestamp(updatedAt)}` : '',
  ].filter(Boolean).join('\n');
}

function readableTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
