#!/usr/bin/env node
/**
 * Lightweight module-boundary check: common/ must not import from modules/.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/common', import.meta.url).pathname;
let violations = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) {
      const text = readFileSync(p, 'utf8');
      if (/from ['"].*modules\//.test(text)) {
        console.error(`boundary violation: ${relative(process.cwd(), p)}`);
        violations++;
      }
    }
  }
}

walk(root);
if (violations) {
  console.error(`Failed: ${violations} boundary violation(s)`);
  process.exit(1);
}
console.log('boundary check ok');
