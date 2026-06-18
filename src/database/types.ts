export interface ProxyEntry {
  id?: number;
  proxy: string;
  /** 'http' | 'https' | 'socks4' | 'socks5' */
  type?: string;
  username?: string;
  password?: string;
  status?: string;
  latency?: string;
  last_check?: string;
  region?: string;
  city?: string;
  country?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  anonymity?: string;
  https?: string;
  private?: string;
  lang?: string;
  useragent?: string;
  webgl_vendor?: string;
  webgl_renderer?: string;
  browser_vendor?: string;
}

export interface HostEntry {
  id?: number;
  host: string;
  created_at?: string;
}

export interface ProxyHostEntry {
  proxy_id: number;
  host_id: number;
  status?: string;
  last_check?: string;
  created_at?: string;
}
