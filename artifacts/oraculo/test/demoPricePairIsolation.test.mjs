import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const homeSource = readFileSync(fileURLToPath(new URL('../src/pages/Home.tsx', import.meta.url)), 'utf8');
const hookSource = readFileSync(fileURLToPath(new URL('../src/hooks/useDemoTrading.ts', import.meta.url)), 'utf8');
const apiSource = readFileSync(fileURLToPath(new URL('../src/lib/demoApi.ts', import.meta.url)), 'utf8');

test('active trade quote keeps price inseparable from the pair before demo price updates', () => {
  assert.match(homeSource, /type ActiveTradeQuote = \{\s+pair: string;\s+price: number;\s+\};/);
  assert.match(homeSource, /const \[activeTradeQuote, setActiveTradeQuote\] = useState<ActiveTradeQuote \| null>\(null\)/);
  assert.match(homeSource, /activeTradeQuote\?\.pair === activeTradePair \? activeTradeQuote\.price : null/);
  assert.match(homeSource, /const requestedPair = activeTradePair/);
  assert.match(homeSource, /fetchPrice\(requestedPair, controller\.signal\)/);
  assert.match(homeSource, /\{ pair: requestedPair, price \}/);
  assert.match(homeSource, /setActiveTradeQuote\(null\)/);
  assert.match(homeSource, /activeTradeQuote\?\.pair === activeTradePair/);
});

test('frontend never submits demo price without explicit pair or while automation is enabled', () => {
  assert.match(hookSource, /updatePrice: \(price: number, pair: string\) => void/);
  assert.match(hookSource, /const updatePrice = useCallback\(\(price: number, pair: string\) =>/);
  assert.match(hookSource, /pair\.trim\(\)\.length === 0 \|\| automationEnabled/);
  assert.match(hookSource, /submitDemoPrice\(price, pair\)/);
  assert.doesNotMatch(hookSource, /pair \?\? sessionRef\.current\.activeTrade\?\.pair/);
  assert.match(apiSource, /submitDemoPrice\(price: number, pair: string\)/);
  assert.doesNotMatch(apiSource, /submitDemoPrice\(price: number, pair\?: string\)/);
});
