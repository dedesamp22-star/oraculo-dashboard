import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const sourcePath = path.join(workspaceRoot, 'artifacts', 'shared', 'marketDecisionEngine.ts');
const outDir = fileURLToPath(new URL('./.tmp/', import.meta.url));
const outFile = path.join(outDir, 'marketRadar.mjs');

mkdirSync(outDir, { recursive: true });

const source = `${readFileSync(sourcePath, 'utf8')}\nexport { analyzeMarketDecision as analyzeMarketRadar };\n`;
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});

writeFileSync(outFile, output.outputText);
