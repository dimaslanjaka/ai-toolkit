import Database from 'better-sqlite3';

const DB_PATH = 'C:\\Users\\Dell\\AppData\\Local\\Kiro-Cli\\data.sqlite3';

export interface KiroToken {
  access_token: string;
  expires_at: string;
  refresh_token: string;
  provider: string;
  profile_arn: string;
}

// Read Kiro token from local SQLite database (raw JSON string)
export function getKiroToken(): string | null {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Try common key first
    let row = db.prepare('SELECT value FROM auth_kv WHERE key = ?').get('token') as { value: string } | undefined;

    // fallback patterns
    if (!row) {
      row = db.prepare('SELECT value FROM auth_kv WHERE key LIKE ? LIMIT 1').get('%token%') as
        | { value: string }
        | undefined;
    }

    if (!row?.value) return null;

    return row.value;
  } finally {
    db.close();
  }
}

// Get parsed Kiro token object
export function getKiroTokenParsed(): KiroToken | null {
  const raw = getKiroToken();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as KiroToken;
  } catch {
    return null;
  }
}
