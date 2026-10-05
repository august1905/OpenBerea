// Data pipeline entry point: `npm run data` runs every stage; `npm run data -- kjv asv` runs only those
// (plus anything they depend on when `--deps` is given). Stages live in ./stages/*.ts and export `stage`.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { log, writtenStats } from './lib/context';

export interface Stage {
  id: string;
  /** Stages whose output this stage reads. */
  deps?: string[];
  description: string;
  /** Runs after every other stage (e.g. the manifest). */
  last?: boolean;
  run: () => Promise<void>;
}

async function loadStages(): Promise<Map<string, Stage>> {
  const dir = join(__dirname, 'stages');
  const stages = new Map<string, Stage>();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as { stage?: Stage; stages?: Stage[] };
    for (const s of mod.stages ?? (mod.stage ? [mod.stage] : [])) {
      if (stages.has(s.id)) throw new Error(`Duplicate stage id ${s.id} in ${file}`);
      stages.set(s.id, s);
    }
  }
  return stages;
}

function order(stages: Map<string, Stage>, wanted: string[], withDeps: boolean): Stage[] {
  const result: Stage[] = [];
  const seen = new Set<string>();
  const visit = (id: string, chain: string[]) => {
    if (seen.has(id)) return;
    const s = stages.get(id);
    if (!s) throw new Error(`Unknown stage "${id}". Known: ${[...stages.keys()].join(', ')}`);
    if (chain.includes(id)) throw new Error(`Dependency cycle: ${[...chain, id].join(' → ')}`);
    for (const d of s.deps ?? []) if (withDeps || wanted.includes(d)) visit(d, [...chain, id]);
    seen.add(id);
    result.push(s);
  };
  for (const id of wanted) visit(id, []);
  return [...result.filter((s) => !s.last), ...result.filter((s) => s.last)];
}

async function main() {
  const args = process.argv.slice(2);
  const withDeps = args.includes('--deps');
  const ids = args.filter((a) => !a.startsWith('--'));
  const stages = await loadStages();
  const plan = order(stages, ids.length ? ids : [...stages.keys()], withDeps || ids.length === 0);
  const t0 = Date.now();
  for (const s of plan) {
    const t = Date.now();
    log(s.id, s.description);
    await s.run();
    log(s.id, `done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }
  const { files, bytes } = writtenStats();
  console.log(`\nPipeline finished in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${files} files, ${(bytes / 1e6).toFixed(1)} MB written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
