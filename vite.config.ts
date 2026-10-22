import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'LOCAL_VLM_');
  for (const key of [
    'LOCAL_VLM_BASE_URL', 'LOCAL_VLM_MODEL', 'LOCAL_VLM_TIMEOUT_MS',
    'LOCAL_VLM_VISUAL_REVIEW_TIMEOUT_MS', 'LOCAL_VLM_MAX_TOKENS',
    'LOCAL_VLM_RETRY_MAX_TOKENS', 'LOCAL_VLM_FINAL_MAX_TOKENS', 'LOCAL_VLM_KNOWLEDGE_CHARS',
  ]) {
    if (env[key]) process.env[key] = env[key];
  }

  // Local model middleware is only needed by the dev server. Don't initialize
  // vision inference/server modules when creating the production client bundle.
  const localAiPlugins = command === 'serve'
    ? [(await import('./src/server/vite-local-ai-plugin.ts')).layoutAnalysisApi()]
    : [];

  return {
    plugins: [react(), tailwindcss(), ...localAiPlugins],
    resolve: { alias: { '@': projectRoot } },
    server: {
      cors: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
