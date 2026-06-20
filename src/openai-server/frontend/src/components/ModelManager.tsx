import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { createApiUrl } from '../utils/url';

interface Model {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  permission?: string;
  root?: string;
  parent?: string;
  provider: string;
  enabled: boolean;
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
}

type ModalMode = 'add' | 'edit' | 'delete' | null;

function requestHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = { 'X-AI-Toolkit-Frontend': 'true' };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp * 1000));
}

export default function ModelManager() {
  const { settings } = useSettings();
  const { apiBase, apiKey, theme } = settings;

  const [models, setModels] = useState<Model[]>([]);
  const [filteredModels, setFilteredModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  const [formData, setFormData] = useState({
    id: '',
    provider: 'opencode',
    object: 'model',
    owned_by: '',
    permission: '',
    root: '',
    parent: '',
    enabled: true
  });

  const isDark = theme === 'dark';
  const panelClass = isDark
    ? 'border-white/10 bg-[#272727] shadow-black/10'
    : 'border-neutral-200 bg-white shadow-neutral-200/50';

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const url = createApiUrl('/admin/models', { apiBase });
      const response = await fetch(url, { headers: requestHeaders(apiKey) });
      const payload = (await response.json()) as ApiResponse<Model[]>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || `Failed to load models (${response.status})`);
      }

      setModels(payload.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apiBase, apiKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    let filtered = models;

    if (providerFilter !== 'all') {
      filtered = filtered.filter((m) => m.provider === providerFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => m.id.toLowerCase().includes(query));
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilteredModels(filtered);
  }, [models, providerFilter, searchQuery]);

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(timeout);
  }, [success]);

  const openAddModal = () => {
    setFormData({
      id: '',
      provider: 'opencode',
      object: 'model',
      owned_by: '',
      permission: '',
      root: '',
      parent: '',
      enabled: true
    });
    setEditingModel(null);
    setModalMode('add');
  };

  const openEditModal = (model: Model) => {
    setFormData({
      id: model.id,
      provider: model.provider,
      object: model.object,
      owned_by: model.owned_by || '',
      permission: model.permission || '',
      root: model.root || '',
      parent: model.parent || '',
      enabled: model.enabled
    });
    setEditingModel(model);
    setModalMode('edit');
  };

  const openDeleteModal = (model: Model) => {
    setEditingModel(model);
    setModalMode('delete');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingModel(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const mode = modalMode;
    if (!mode || mode === 'delete') return;

    try {
      const url = createApiUrl('/admin/models', { apiBase });
      const body = {
        id: formData.id.trim(),
        provider: formData.provider,
        object: formData.object,
        owned_by: formData.owned_by.trim() || undefined,
        permission: formData.permission.trim() || undefined,
        root: formData.root.trim() || undefined,
        parent: formData.parent.trim() || undefined,
        enabled: formData.enabled ? 1 : 0
      };

      const response = await fetch(url, {
        method: mode === 'add' ? 'POST' : 'PUT',
        headers: { ...requestHeaders(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || `Failed to ${mode} model`);
      }

      setSuccess(`Model ${mode === 'add' ? 'added' : 'updated'} successfully`);
      closeModal();
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (!editingModel) return;
    setError('');

    try {
      const url = createApiUrl(
        '/admin/models',
        { apiBase },
        {
          id: editingModel.id,
          provider: editingModel.provider
        }
      );

      const response = await fetch(url, {
        method: 'DELETE',
        headers: requestHeaders(apiKey)
      });

      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Failed to delete model');
      }

      setSuccess('Model deleted successfully');
      closeModal();
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleEnabled = async (model: Model) => {
    const newEnabled = !model.enabled;
    // Optimistically update UI
    setModels((prev) =>
      prev.map((m) => (m.id === model.id && m.provider === model.provider ? { ...m, enabled: newEnabled } : m))
    );

    try {
      const url = createApiUrl('/admin/models', { apiBase });
      const response = await fetch(url, {
        method: 'PUT',
        headers: { ...requestHeaders(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: model.id,
          provider: model.provider,
          enabled: newEnabled ? 1 : 0
        })
      });

      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        // Revert on failure
        setModels((prev) =>
          prev.map((m) => (m.id === model.id && m.provider === model.provider ? { ...m, enabled: model.enabled } : m))
        );
        throw new Error(payload.message || 'Failed to toggle enabled state');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const providerBadgeClass = (provider: string) => {
    const badges: Record<string, string> = {
      opencode: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      puter: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
      chatgpt: 'border-purple-500/30 bg-purple-500/10 text-purple-400'
    };
    return badges[provider] || 'border-neutral-500/30 bg-neutral-500/10 text-neutral-400';
  };

  return (
    <section className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-7 md:py-8">
        <div className={`rounded-3xl border p-5 shadow-xl md:p-7 ${panelClass}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-xl ${
                    isDark ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                  <i aria-hidden="true" className="fa-solid fa-cubes" />
                </span>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Model Manager</h1>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Manage OpenAI-compatible models across providers
              </p>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <i aria-hidden="true" className="fa-solid fa-plus" />
              Add Model
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by model ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                  isDark
                    ? 'border-white/10 bg-white/5 text-white placeholder-neutral-500'
                    : 'border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400'
                }`}
              />
            </div>

            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className={`rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                isDark ? 'border-white/10 bg-white/5 text-white' : 'border-neutral-200 bg-white text-neutral-900'
              }`}>
              <option value="all">All Providers</option>
              <option value="opencode">OpenCode</option>
              <option value="puter">Puter</option>
              <option value="chatgpt">ChatGPT</option>
            </select>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Error</p>
                <p className="mt-0.5 text-red-300/80">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-red-300/70 transition hover:text-red-200"
                aria-label="Dismiss error">
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </button>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <i aria-hidden="true" className="fa-solid fa-circle-check" />
              {success}
            </div>
          )}

          <div className="mt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <i aria-hidden="true" className="fa-solid fa-spinner-third animate-spin text-3xl text-emerald-500" />
                <p className="mt-4 text-sm text-neutral-500">Loading models…</p>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <i aria-hidden="true" className="fa-solid fa-database text-3xl text-neutral-500" />
                <p className="mt-4 text-sm text-neutral-500">No models found</p>
              </div>
            ) : (
              <div
                className={`app-scrollbar overflow-x-auto rounded-xl border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                <table className="w-full text-left text-sm">
                  <thead className={isDark ? 'bg-white/[0.02]' : 'bg-neutral-50'}>
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Provider
                      </th>
                      <th className="px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Owned By
                      </th>
                      <th className="px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Created
                      </th>
                      <th className="px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Enabled
                      </th>
                      <th className="px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-neutral-100'}`}>
                    {filteredModels.map((model) => (
                      <tr
                        key={`${model.id}-${model.provider}`}
                        className={isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-neutral-50/50'}>
                        <td className="px-4 py-3">
                          <span className="font-semibold" title={model.id}>
                            {model.id.length > 40 ? `${model.id.slice(0, 40)}…` : model.id}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${providerBadgeClass(model.provider)}`}>
                            {model.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-500" title={model.owned_by}>
                          {model.owned_by
                            ? model.owned_by.length > 20
                              ? `${model.owned_by.slice(0, 20)}…`
                              : model.owned_by
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">{formatDate(model.created)}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleEnabled(model)}
                            className="transition hover:scale-110"
                            aria-label={`Toggle enabled state for ${model.id}`}>
                            <i
                              aria-hidden="true"
                              className={`fa-solid fa-toggle-${model.enabled ? 'on' : 'off'} text-xl ${
                                model.enabled ? 'text-emerald-500' : 'text-neutral-500'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(model)}
                              className={`rounded-lg px-2 py-1 transition ${
                                isDark
                                  ? 'text-neutral-400 hover:bg-white/10 hover:text-white'
                                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                              }`}
                              aria-label={`Edit ${model.id}`}>
                              <i aria-hidden="true" className="fa-solid fa-pen" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(model)}
                              className="rounded-lg px-2 py-1 text-red-500 transition hover:bg-red-500/10"
                              aria-label={`Delete ${model.id}`}>
                              <i aria-hidden="true" className="fa-solid fa-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl ${panelClass}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{modalMode === 'add' ? 'Add Model' : 'Edit Model'}</h2>
              <button
                type="button"
                onClick={closeModal}
                className={`rounded-lg p-2 transition ${
                  isDark ? 'text-neutral-400 hover:bg-white/10' : 'text-neutral-600 hover:bg-neutral-100'
                }`}>
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">
                    Model ID <span className="text-red-500">*</span>
                  </label>
                  {modalMode === 'edit' ? (
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2.5 text-sm ${
                        isDark
                          ? 'border-white/10 bg-white/5 text-neutral-400'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                      }`}>
                      {formData.id}
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                        isDark
                          ? 'border-white/10 bg-white/5 text-white'
                          : 'border-neutral-200 bg-white text-neutral-900'
                      }`}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Provider <span className="text-red-500">*</span>
                  </label>
                  {modalMode === 'edit' ? (
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2.5 text-sm ${
                        isDark
                          ? 'border-white/10 bg-white/5 text-neutral-400'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                      }`}>
                      {formData.provider}
                    </div>
                  ) : (
                    <select
                      required
                      value={formData.provider}
                      onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                      className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                        isDark
                          ? 'border-white/10 bg-white/5 text-white'
                          : 'border-neutral-200 bg-white text-neutral-900'
                      }`}>
                      <option value="opencode">OpenCode</option>
                      <option value="puter">Puter</option>
                      <option value="chatgpt">ChatGPT</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Object</label>
                  <input
                    type="text"
                    value={formData.object}
                    onChange={(e) => setFormData({ ...formData, object: e.target.value })}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                      isDark ? 'border-white/10 bg-white/5 text-white' : 'border-neutral-200 bg-white text-neutral-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Owned By</label>
                  <input
                    type="text"
                    value={formData.owned_by}
                    onChange={(e) => setFormData({ ...formData, owned_by: e.target.value })}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                      isDark ? 'border-white/10 bg-white/5 text-white' : 'border-neutral-200 bg-white text-neutral-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium">Permission</label>
                <textarea
                  rows={3}
                  value={formData.permission}
                  onChange={(e) => setFormData({ ...formData, permission: e.target.value })}
                  className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                    isDark ? 'border-white/10 bg-white/5 text-white' : 'border-neutral-200 bg-white text-neutral-900'
                  }`}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Root</label>
                  <input
                    type="text"
                    value={formData.root}
                    onChange={(e) => setFormData({ ...formData, root: e.target.value })}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                      isDark ? 'border-white/10 bg-white/5 text-white' : 'border-neutral-200 bg-white text-neutral-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Parent</label>
                  <input
                    type="text"
                    value={formData.parent}
                    onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                      isDark ? 'border-white/10 bg-white/5 text-white' : 'border-neutral-200 bg-white text-neutral-900'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="size-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="enabled" className="text-sm font-medium">
                  Enabled
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-neutral-500 ${
                    isDark
                      ? 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  {modalMode === 'add' ? 'Add Model' : 'Update Model'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modalMode === 'delete' && editingModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${panelClass}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <i aria-hidden="true" className="fa-solid fa-triangle-exclamation" />
              </span>
              <h2 className="text-xl font-semibold">Delete Model</h2>
            </div>

            <p className="mt-4 text-sm text-neutral-500">
              Are you sure you want to delete <span className="font-semibold text-white">{editingModel.id}</span> (
              <span className="font-semibold">{editingModel.provider}</span>)? This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-neutral-500 ${
                  isDark
                    ? 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
