import { useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../../components/ui/Card';

export function ExportTab() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          authToken: session?.access_token,
        }),
      });

      if (!response.ok) throw new Error('Export failed to generate');
      
      const data = await response.json();

      // Ensure data is zipped to respect user's requested `.zip` format
      const zip = new JSZip();
      
      // JSON Dump
      zip.file('memoire-complete-export.json', JSON.stringify(data, null, 2));

      // CSV for Entities
      if (data.data.entities.length > 0) {
        const entHeaders = ['ID', 'Type', 'Name', 'Description', 'Created', 'Updated'];
        const entRows = data.data.entities.map((e: any) => 
          [e.id, e.entity_type, `"${e.name.replace(/"/g, '""')}"`, `"${(e.description || '').replace(/"/g, '""')}"`, e.created_at, e.updated_at].join(',')
        );
        zip.file('entities.csv', [entHeaders.join(','), ...entRows].join('\n'));
      }

      // CSV for Captures
      if (data.data.captures.length > 0) {
        const capHeaders = ['ID', 'Captured At', 'Raw Text'];
        const capRows = data.data.captures.map((c: any) => 
          [c.id, c.captured_at, `"${c.raw_text.replace(/"/g, '""')}"`].join(',')
        );
        zip.file('captures.csv', [capHeaders.join(','), ...capRows].join('\n'));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memoire-export-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err: any) {
      console.error(err);
      setExportError(err.message || 'Error occurred while generating export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirm1 = window.confirm("Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.");
    if (!confirm1) return;
    const confirm2 = window.prompt("Type 'DELETE' to confirm:") === 'DELETE';
    if (!confirm2) return;

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          authToken: session?.access_token,
        }),
      });

      if (!response.ok) throw new Error('Deletions failed');
      
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err) {
      console.error(err);
      alert('Failed to delete account. Please try again or contact support.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gradient-border-card shadow-elevated">
        <div className="gradient-border-card-inner p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 brand-gradient-text stroke-[url(#grad)]" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#43A047" />
                      <stop offset="100%" stopColor="#1976D2" />
                    </linearGradient>
                  </defs>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path>
                </svg>
                <h3 className="text-[18px] font-semibold font-display text-navy">Export Your Memory</h3>
              </div>
              <p className="text-[14px] font-body text-gray-500 max-w-xl">
                Your data is always yours. Download a complete archive of everything you've ever captured, including full JSON data and ready-to-import CSVs for your entities and notes. No lock-in, ever.
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-7 py-3 brand-gradient text-white rounded-full font-semibold font-display text-[15px] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isExporting ? 'Generating...' : 'Download ZIP'}
            </button>
          </div>
          {exportError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded">{exportError}</p>
          )}
        </div>
      </div>

      <div className="bg-white shadow-card rounded-[12px] overflow-hidden">
        <div className="p-8 border-t-[3px] border-red-500">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[18px] font-semibold font-display text-navy mb-1">Danger Zone</h3>
              <p className="text-[14px] font-body text-gray-500 max-w-xl">
                Permanently delete your account and all associated data. We recommend exporting your data first. This cannot be undone.
              </p>
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="px-5 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-full font-semibold font-display text-[15px] hover:bg-red-100 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
