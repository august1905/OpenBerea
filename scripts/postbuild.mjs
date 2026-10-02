// Runs after `expo export`: adds Cloudflare static-asset headers.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

writeFileSync(
  join(dist, '_headers'),
  ['/_expo/static/*', '  Cache-Control: public, max-age=31536000, immutable', ''].join('\n'),
);
console.log('postbuild: wrote dist/_headers');
