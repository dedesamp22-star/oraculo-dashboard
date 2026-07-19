import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const pnpmRoot = path.join(workspaceRoot, 'node_modules', '.pnpm');
const esbuildDir = readdirSync(pnpmRoot).find((name) => name.startsWith('esbuild@'));
if (!esbuildDir) throw new Error('esbuild not found in pnpm store');
const require = createRequire(path.join(pnpmRoot, esbuildDir, 'node_modules', 'esbuild', 'package.json'));
const { build } = require('esbuild');

mkdirSync(new URL('./.tmp/', import.meta.url), { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/demoAgents.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./.tmp/demoAgents.mjs', import.meta.url)),
  bundle: true,
  format: 'esm',
  platform: 'node',
  sourcemap: false,
  tsconfigRaw: {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
    },
  },
  logLevel: 'silent',
});
