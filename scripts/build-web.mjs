// Build a browser version from packed Board output. Adapters never enter dist/ or the native zip.
import {copyFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist'), destination = join(root, 'web-dist');
const entry = join(dist, 'index.html');
const platformTag = /<script\b[^>]*\bid=["']board-platform["'][^>]*>\s*<\/script>/i;
if (!existsSync(entry) || !existsSync(join(dist, 'board-platform.js'))) {
  throw new Error('build:web needs packed dist/. Run npm run pack first.');
}
const html = readFileSync(entry, 'utf8');
if (!platformTag.test(html)) throw new Error('Cannot find the packed Board platform script.');
rmSync(destination, {recursive:true, force:true});
cpSync(dist, destination, {recursive:true});
const scripts = ['browser-host.js', 'player-selector.js', 'putting-controls.js'];
for (const name of scripts) copyFileSync(join(root, 'dev', name), join(destination, name));
const adapters = scripts.map(name => `<script src="./${name}"></script>`).join('\n') + '\n';
writeFileSync(join(destination, 'index.html'), html.replace(platformTag, tag => adapters + tag));
console.log('build:web: web-dist/ is ready. Native Board package unchanged.');
