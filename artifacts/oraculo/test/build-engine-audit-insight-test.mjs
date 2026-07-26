import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('../src/lib/engineAuditInsight.ts', import.meta.url));
const outDir = fileURLToPath(new URL('./.tmp/', import.meta.url));
const outFile = path.join(outDir, 'engineAuditInsight.mjs');

mkdirSync(outDir, { recursive: true });

let source = readFileSync(sourcePath, 'utf8');
source = source.replace(/^import type .*?;\r?\n/m, '');

const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});

writeFileSync(outFile, output.outputText);
