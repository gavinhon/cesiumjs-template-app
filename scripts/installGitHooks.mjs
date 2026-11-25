import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../.githooks/pre-commit', import.meta.url));

function insideGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(hook) || !insideGitRepo()) {
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks']);

try {
  chmodSync(hook, 0o755);
} catch {}
