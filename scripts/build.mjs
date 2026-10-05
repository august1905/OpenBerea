// `npm run build`: exports the web app to dist/ (or DIST_DIR), then runs the post-build steps.
// A Node script rather than shell syntax, so it runs the same on Windows, macOS, and Linux.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.DIST_DIR || 'dist';

function run(args) {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run([require.resolve('expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', dist]);
run(['scripts/postbuild.mjs']);
