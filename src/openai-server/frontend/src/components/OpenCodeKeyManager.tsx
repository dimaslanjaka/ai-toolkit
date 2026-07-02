import { useState, useEffect } from 'react';

interface OpenCodeKey {
  id: number;
  name: string;
  key_preview: string;
  enabled: boolean;
  proxy_id: number | null;
  proxy_address: string | null;
  proxy_type: string | null;
  last_used: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

interface ProxyEntry {
  id: number;
  proxy: string;
  type: string;
}

interface KeyFormData {
  name: string;
  key: string;
  proxy_id: number | null;
  enabled: boolean;
}

export default function OpenCodeKeyManager() {
  const [keys, setKeys] = useState<OpenCodeKey[]>([]);
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<KeyFormData>({
    name: '',
    key: '',
    proxy_id: null,
    enabled: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [updatingProxyKey, setUpdatingProxyKey] = useState<number | null>(null);

  const fetchKeys = async () => {
    try {
      const response = await fetch('/api/providers/opencode/keys');
      if (!response.ok) throw new Error('Failed to fetch keys');
      const data = await response.json();
      setKeys(data.keys || []);
      setError(null);
    } catch (err) {
      // Don't show error on initial load if keys are empty
      console.error('Failed to fetch keys:', err);
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    if (!formData.name.trim() || !formData.key.trim()) {
      setError('Name and key are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/providers/opencode/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add key');
      }

      // Reset form and refresh keys
      setFormData({ name: '', key: '', proxy_id: null, enabled: true });
      setShowAddForm(false);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleKey = async (keyId: number, currentEnabled: boolean) => {
    try {
      setError(null);
      const response = await fetch(`/api/providers/opencode/keys/${keyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to toggle key');
      }

      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDeleteKey = async (keyId: number) => {
    if (!confirm('Are you sure you want to delete this key?')) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/providers/opencode/keys/${keyId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete key');
      }

      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleUpdateProxy = async (keyId: number, proxyId: number | null) => {
    try {
      setError(null);
      const response = await fetch(`/api/providers/opencode/keys/${keyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_id: proxyId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update proxy');
      }

      setUpdatingProxyKey(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkImportText.trim()) {
      setError('Please enter keys to import');
      return;
    }

    setBulkImporting(true);
    setError(null);

    try {
      // Parse input: "name|key" or "name|key|proxy_id" per line
      const lines = bulkImportText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const parsed: { name: string; key: string; proxy_id: number | null }[] = [];
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const parts = line.split('|');

        if (parts.length < 2 || parts.length > 3) {
          errors.push(`Line ${i + 1}: Invalid format (expected "name|key" or "name|key|proxy_id")`);
          continue;
        }

        const [name, key, proxyIdStr] = parts.map((p) => p.trim());

        if (!name || !key) {
          errors.push(`Line ${i + 1}: Name and key cannot be empty`);
          continue;
        }

        let proxy_id: number | null = null;
        if (proxyIdStr) {
          const pid = parseInt(proxyIdStr, 10);
          if (isNaN(pid)) {
            errors.push(`Line ${i + 1}: Invalid proxy_id "${proxyIdStr}"`);
            continue;
          }
          proxy_id = pid;
        }

        parsed.push({ name, key, proxy_id });
      }

      if (errors.length > 0 && parsed.length === 0) {
        throw new Error(`No valid keys found:\n${errors.join('\n')}`);
      }

      // Check for duplicate names in input
      const nameSet = new Set<string>();
      const duplicates: string[] = [];

      for (const { name } of parsed) {
        if (nameSet.has(name)) {
          duplicates.push(name);
        }
        nameSet.add(name);
      }

      if (duplicates.length > 0) {
        throw new Error(`Duplicate names found in input: ${Array.from(new Set(duplicates)).join(', ')}`);
      }

      // Import each key individually
      let imported = 0;
      const importErrors: string[] = [];

      for (const { name, key, proxy_id } of parsed) {
        try {
          const response = await fetch('/api/providers/opencode/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, key, proxy_id, enabled: true })
          });

          if (!response.ok) {
            const errorData = await response.json();
            importErrors.push(`${name}: ${errorData.error || 'Failed to add'}`);
          } else {
            imported++;
          }
        } catch (err) {
          importErrors.push(`${name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Success - reset and refresh
      setBulkImportText('');
      setShowBulkImport(false);
      await fetchKeys();

      // Show result message
      if (importErrors.length > 0) {
        setError(`Imported ${imported}/${parsed.length} key(s). Errors:\n${importErrors.join('\n')}`);
      } else if (errors.length > 0) {
        setError(`Imported ${imported} key(s). Some lines had format errors:\n${errors.join('\n')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBulkImporting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  // Fetch keys and proxies on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const keysResponse = await fetch('/api/providers/opencode/keys');
        if (keysResponse.ok) {
          const data = (await keysResponse.json()) as { keys: OpenCodeKey[] };
          setKeys(data.keys || []);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch keys:', err);
        setKeys([]);
      }

      try {
        const proxiesResponse = await fetch('/api/providers/opencode/proxies');
        if (proxiesResponse.ok) {
          const data = (await proxiesResponse.json()) as { proxies: ProxyEntry[] };
          setProxies(data.proxies || []);
        }
      } catch (err) {
        console.error('Failed to fetch proxies:', err);
        setProxies([]);
      }

      setLoading(false);
    };

    loadInitialData();
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-[#242424]">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-medium text-neutral-100">OpenCode API Keys</h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          Manage multiple OpenCode API keys. The system automatically selects working keys.
        </p>
      </div>

      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-lg text-emerald-500" />
            <span className="ml-2 text-sm text-neutral-400">Loading keys...</span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <i aria-hidden="true" className="fa-solid fa-exclamation-circle mt-0.5 flex-shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="mt-0.5 text-xs text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* Keys list */}
            {keys.length > 0 ? (
              <div className="space-y-3 mb-6">
                {keys.map((key) => (
                  <div key={key.id} className="rounded-lg border border-neutral-600 bg-neutral-800 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-sm font-medium text-neutral-100">{key.name}</h3>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              key.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-600/30 text-neutral-400'
                            }`}>
                            {key.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                          {key.last_status && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                key.last_status === 'success'
                                  ? 'bg-blue-500/10 text-blue-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}>
                              {key.last_status === 'success' ? 'Working' : 'Failed'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-neutral-400 mb-2">{key.key_preview}</p>
                        <div className="flex items-center gap-2 mb-2">
                          <i
                            aria-hidden="true"
                            className={`fa-solid text-xs ${key.proxy_address ? 'fa-network-wired text-neutral-500' : 'fa-globe text-neutral-500'}`}
                          />
                          <select
                            value={key.proxy_id || ''}
                            disabled={updatingProxyKey === key.id}
                            onChange={async (e) => {
                              setUpdatingProxyKey(key.id);
                              const newProxyId = e.target.value ? parseInt(e.target.value, 10) : null;
                              await handleUpdateProxy(key.id, newProxyId);
                            }}
                            className="flex-1 rounded-lg border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-white focus:border-emerald-500 focus:ring-emerald-500 disabled:opacity-50">
                            <option value="">Direct connection (no proxy)</option>
                            {proxies.map((proxy) => (
                              <option key={proxy.id} value={proxy.id}>
                                {proxy.proxy} ({proxy.type})
                              </option>
                            ))}
                          </select>
                          {updatingProxyKey === key.id && (
                            <i
                              aria-hidden="true"
                              className="fa-solid fa-spinner animate-spin text-[10px] text-emerald-400"
                            />
                          )}
                        </div>
                        <div className="flex gap-4 text-xs text-neutral-500">
                          <span>Last used: {formatDate(key.last_used)}</span>
                          <span>Created: {formatDate(key.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          type="button"
                          onClick={() => handleToggleKey(key.id, key.enabled)}
                          className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-700 hover:text-white"
                          title={key.enabled ? 'Disable key' : 'Enable key'}>
                          <i
                            aria-hidden="true"
                            className={`fa-solid ${key.enabled ? 'fa-toggle-on' : 'fa-toggle-off'} text-sm`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(key.id)}
                          className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition hover:bg-red-500/10 hover:text-red-400"
                          title="Delete key">
                          <i aria-hidden="true" className="fa-solid fa-trash text-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <i aria-hidden="true" className="fa-solid fa-key text-3xl text-neutral-600 mb-3" />
                <p className="text-sm text-neutral-400">No API keys configured</p>
                <p className="text-xs text-neutral-500 mt-1">Add your first OpenCode API key to get started</p>
              </div>
            )}

            {/* Add key button */}
            {!showAddForm && !showBulkImport && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="flex-1 rounded-lg border border-dashed border-neutral-600 bg-neutral-800/50 px-4 py-3 text-sm font-medium text-neutral-300 transition hover:bg-neutral-700/50 hover:border-emerald-500/50 hover:text-emerald-400">
                  <i aria-hidden="true" className="fa-solid fa-plus mr-2" />
                  Add New Key
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkImport(true)}
                  className="flex-1 rounded-lg border border-dashed border-neutral-600 bg-neutral-800/50 px-4 py-3 text-sm font-medium text-neutral-300 transition hover:bg-neutral-700/50 hover:border-blue-500/50 hover:text-blue-400">
                  <i aria-hidden="true" className="fa-solid fa-file-import mr-2" />
                  Bulk Import
                </button>
              </div>
            )}

            {/* Add key form */}
            {showAddForm && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-4">Add New API Key</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-300">Key Name</span>
                    <input
                      type="text"
                      value={formData.name}
                      placeholder="e.g., Primary Key, Backup Key"
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-300">API Key</span>
                    <input
                      type="password"
                      value={formData.key}
                      placeholder="sk-..."
                      onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                      className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500 font-mono"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-300">Proxy (Optional)</span>
                    <select
                      value={formData.proxy_id || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, proxy_id: e.target.value ? parseInt(e.target.value, 10) : null })
                      }
                      className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-emerald-500">
                      <option value="">Direct connection (no proxy)</option>
                      {proxies.map((proxy) => (
                        <option key={proxy.id} value={proxy.id}>
                          {proxy.proxy} ({proxy.type})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="rounded border-neutral-600 bg-neutral-800 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-neutral-300">Enable this key immediately</span>
                  </label>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleAddKey}
                      disabled={submitting}
                      className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      {submitting ? (
                        <>
                          <i aria-hidden="true" className="fa-solid fa-spinner animate-spin mr-2" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <i aria-hidden="true" className="fa-solid fa-check mr-2" />
                          Add Key
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setFormData({ name: '', key: '', proxy_id: null, enabled: true });
                        setError(null);
                      }}
                      disabled={submitting}
                      className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk import modal */}
            {showBulkImport && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">Bulk Import API Keys</h3>
                <p className="text-xs text-neutral-400 mb-4">
                  Enter one key per line in the format:{' '}
                  <code className="bg-neutral-800 px-1 py-0.5 rounded text-blue-400">name|key</code> or{' '}
                  <code className="bg-neutral-800 px-1 py-0.5 rounded text-blue-400">name|key|proxy_id</code>
                </p>

                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-300">Keys to Import</span>
                    <textarea
                      value={bulkImportText}
                      onChange={(e) => setBulkImportText(e.target.value)}
                      placeholder="Primary Key|sk-abc123&#10;Backup Key|sk-def456&#10;Test Key|sk-ghi789"
                      rows={8}
                      className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-blue-500 focus:ring-blue-500 font-mono"
                    />
                  </label>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      disabled={bulkImporting}
                      className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      {bulkImporting ? (
                        <>
                          <i aria-hidden="true" className="fa-solid fa-spinner animate-spin mr-2" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <i aria-hidden="true" className="fa-solid fa-upload mr-2" />
                          Import Keys
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBulkImport(false);
                        setBulkImportText('');
                        setError(null);
                      }}
                      disabled={bulkImporting}
                      className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
