// Copies the trained model from the repository root into the site's public data folder.
// Run automatically by the predev and prebuild scripts. Do not copy model.json by hand.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', '..', 'model', 'model.json');
const target = resolve(here, '..', 'public', 'data', 'model.json');

if (!existsSync(source)) {
  console.error(`sync-model: ${source} not found. Train the model first.`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('sync-model: copied model/model.json to web/public/data/model.json');
