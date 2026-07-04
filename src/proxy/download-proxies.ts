import { downloader } from '../utils/downloader.js';
import { extractProxies } from './proxy-extractor.js';

export async function downloadProxies() {
  const [http, socks5] = await Promise.all([
    downloader('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt').then((res) =>
      extractProxies(res).map((p) => ({ ...p, type: 'http' }))
    ),
    downloader('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt').then((res) =>
      extractProxies(res).map((p) => ({ ...p, type: 'socks5' }))
    )
  ]);
  return [...http, ...socks5].sort(() => Math.random() - 0.5);
}
