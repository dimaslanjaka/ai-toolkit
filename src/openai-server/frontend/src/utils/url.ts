function sanitizeApiBase(apiBase: string): string {
  const trimmed = apiBase.trim();

  if (!trimmed || trimmed === '.' || trimmed === './' || trimmed === '/') {
    return '';
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }

  try {
    const resolved = new URL(trimmed);

    if (!['http:', 'https:'].includes(resolved.protocol)) {
      return '';
    }

    if (resolved.origin === window.location.origin && /^\/chat(?:\/|$)/.test(resolved.pathname)) {
      return '';
    }

    return resolved.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function hostnameToUrl(hostname: string): string {
  const trimmed = hostname
    .trim()
    .replace(/^(?:https?:)?\/\//i, '')
    .replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  return `${window.location.protocol}//${trimmed}`;
}

export function getApiBaseUrl(): URL {
  const backendHostname = import.meta.env.DEV
    ? import.meta.env.VITE_BACKEND_HOSTNAME_DEV || ''
    : import.meta.env.VITE_BACKEND_HOSTNAME_PROD || '';
  const environmentBase = sanitizeApiBase(hostnameToUrl(backendHostname));

  return environmentBase ? new URL(environmentBase) : new URL(window.location.origin);
}

export function createApiUrl(
  pathname: string,
  params: Record<string, string | number | boolean | null | undefined> = {}
): string {
  const base = getApiBaseUrl();
  const endpoint = pathname.replace(/^\/+/, '');
  const url = new URL(endpoint, `${base.href.replace(/\/+$/, '')}/`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.href;
}
