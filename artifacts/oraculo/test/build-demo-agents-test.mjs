import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('../src/lib/demoAgents.ts', import.meta.url));
const outDir = fileURLToPath(new URL('./.tmp/', import.meta.url));
const outFile = path.join(outDir, 'demoAgents.mjs');

mkdirSync(outDir, { recursive: true });

const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});

writeFileSync(outFile, output.outputText);
