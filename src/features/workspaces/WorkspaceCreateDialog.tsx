import { useCallback, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { controlClass, fieldLabelClass, ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { normalizeCopySelection, workspaceCopyOptions, type CopyCategory, type Workspace } from './workspaceCopy';

type WorkspaceChoice = Pick<Workspace, 'id' | 'name'>;

export function WorkspaceCreateDialog({ workspaces, sourceId, onClose, onCreate }: {
  workspaces: WorkspaceChoice[];
  sourceId: string;
  onClose: () => void;
  onCreate: (input: { name: string; sourceId: string; categories: CopyCategory[] }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [source, setSource] = useState(sourceId);
  const [categories, setCategories] = useState<CopyCategory[]>([]);
  const [confirmedCopy, setConfirmedCopy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => { if (!saving) onClose(); }, [onClose, saving]);

  const copyKey = JSON.stringify([name.trim(), source, categories]);
  const requiresConfirmation = categories.length > 0;
  const copyConfirmed = confirmedCopy === copyKey;
  const canCreate = Boolean(name.trim()) && (!requiresConfirmation || copyConfirmed);

  function toggleCategory(key: CopyCategory, checked: boolean) {
    setConfirmedCopy('');
    setCategories(current => normalizeCopySelection(
      checked ? [...current, key] : current.filter(value => value !== key && !(key === 'accounts' && value === 'contacts')),
    ));
  }

  return (
    <Modal isOpen title="Create workspace" onClose={close}>
      <form className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1" onSubmit={async event => {
        event.preventDefault();
        if (saving || !canCreate) return;
        setError('');
        setSaving(true);
        try {
          await onCreate({ name: name.trim(), sourceId: source, categories });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : 'Could not create the workspace. Please try again.');
        } finally {
          setSaving(false);
        }
      }}>
        <fieldset disabled={saving} className="space-y-4">
          <label className={fieldLabelClass}>
            Workspace name
            <input className={`${controlClass} mt-1`} value={name} onChange={event => { setName(event.target.value); setConfirmedCopy(''); }} placeholder="e.g. Servicebio Vietnam" required maxLength={80} />
          </label>
          <label className={fieldLabelClass}>
            Copy from
            <select className={`${controlClass} mt-1`} value={source} onChange={event => { setSource(event.target.value); setCategories([]); setConfirmedCopy(''); }}>
              {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <fieldset className="space-y-1">
            <legend className={`${fieldLabelClass} mb-1.5`}>Choose what to copy</legend>
            {workspaceCopyOptions.map(option => (
              <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-blue" checked={categories.includes(option.key)} onChange={event => toggleCategory(option.key, event.target.checked)} />
                <span>
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="block text-xs text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </fieldset>
        <section aria-label="Copy preview" className="space-y-2 rounded-lg bg-canvas px-3 py-2.5 text-xs leading-5 text-tint-neutral-ink">
          {requiresConfirmation ? (
            <>
              <p>
                Copy from <strong>{workspaces.find(workspace => workspace.id === source)?.name}</strong>
                {' to '}<strong>{name.trim() || 'your new workspace'}</strong>.
              </p>
              <ul className="list-disc pl-4">
                {workspaceCopyOptions.filter(option => categories.includes(option.key)).map(option => (
                  <li key={option.key}><strong>{option.label}</strong>. {option.description}</li>
                ))}
              </ul>
              {categories.includes('contacts') && <p>Contacts link to their copied accounts.</p>}
              <label className="flex items-start gap-2 font-semibold">
                <input type="checkbox" disabled={saving || !name.trim()} checked={copyConfirmed}
                  onChange={event => setConfirmedCopy(event.target.checked ? copyKey : '')} className="mt-1 accent-brand-blue" />
                Confirm copying this information into the new workspace
              </label>
            </>
          ) : <p>Create a workspace with an empty commercial book.</p>}
        </section>
        {error && <p role="alert" className="text-sm font-semibold text-tint-red-solid">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostPillClass} disabled={saving} onClick={close}>Cancel</button>
          <button type="submit" className={primaryPillClass} disabled={saving || !canCreate}>{saving ? 'Creating…' : 'Create workspace'}</button>
        </div>
      </form>
    </Modal>
  );
}
