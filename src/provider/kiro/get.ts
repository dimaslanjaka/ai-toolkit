const KIRO_API_BASE_URL = 'https://api.kiro.ai/v1'; // placeholder
const KIRO_API_KEY_ENV = 'KIRO_API_KEY';

export interface KiroConfig {
  apiKey?: string;
  baseUrl?: string;
}

export default async function get(config?: KiroConfig) {
  const apiKey = config?.apiKey || process.env[KIRO_API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Kiro API key not found. Set ${KIRO_API_KEY_ENV} environment variable or pass apiKey in config.`);
  }

  return {
    apiKey,
    baseUrl: config?.baseUrl || KIRO_API_BASE_URL
    // TODO: Add Kiro API client initialization
    // e.g., new OpenAI({ apiKey, baseURL: baseUrl })
  };
}

export const kiroProvider = get;
