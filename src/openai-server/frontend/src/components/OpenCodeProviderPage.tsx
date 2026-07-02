import { Link } from 'react-router';
import OpenCodeKeyManager from './OpenCodeKeyManager';

export default function OpenCodeProviderPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6">
          <Link
            to="/providers"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-emerald-400 transition mb-3">
            <i aria-hidden="true" className="fa-solid fa-chevron-left text-xs" />
            Back to Providers
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-100">OpenCode Provider</h1>
          <p className="mt-1 text-sm text-neutral-400">Manage API keys and proxy assignments for OpenCode.ai.</p>
        </div>

        <OpenCodeKeyManager />
      </div>
    </div>
  );
}
