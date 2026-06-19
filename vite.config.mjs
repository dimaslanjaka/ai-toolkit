import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';
import tailwindcss from 'tailwindcss';
import path from 'upath';
import { defineConfig, loadEnv } from 'vite';
import mkcert from 'vite-plugin-mkcert';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.join(packageDirectory, 'src/openai-server/frontend');

function normalizeProxyTarget(hostname) {
  const trimmed = hostname.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return 'http://127.0.0.1:5758';
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, packageDirectory, '');
  const hostname = env.VITE_HOSTNAME || '0.0.0.0';
  const parsedPort = Number(env.VITE_PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5173;
  const backendDev = normalizeProxyTarget(env.VITE_BACKEND_HOSTNAME_DEV || '127.0.0.1:5758');

  return {
    root: frontendDirectory,
    envDir: packageDirectory,
    base: '/chat/',
    plugins: [react(), mkcert()],
    css: {
      postcss: {
        plugins: [
          tailwindcss({
            content: [path.join(frontendDirectory, 'index.html'), path.join(frontendDirectory, 'src/**/*.{ts,tsx}')],
            theme: {
              extend: {
                fontFamily: {
                  sans: [
                    'Inter',
                    'ui-sans-serif',
                    'system-ui',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Segoe UI"',
                    'sans-serif'
                  ]
                }
              }
            }
          }),
          autoprefixer()
        ]
      }
    },
    build: {
      outDir: path.join(packageDirectory, 'dist/openai-server/frontend'),
      emptyOutDir: true
    },
    server: {
      host: hostname,
      port,
      allowedHosts: [hostname],
      proxy: {
        '/v1': {
          target: backendDev,
          changeOrigin: true,
          secure: false
        },
        '/proxy-checker': {
          target: backendDev,
          changeOrigin: true,
          secure: false
        }
      }
    },
    preview: {
      host: hostname,
      port: 4173
    }
  };
});
