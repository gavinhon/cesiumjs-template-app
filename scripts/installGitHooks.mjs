// Points this clone's git at the repo's .githooks/ folder, so the
// pre-commit hook there runs. Called by `npm install` / `npm ci` through the
// `prepare` script in package.json.
//
// Git never runs hooks it finds in a repository on its own — a cloned repo
// could otherwise run anything on your machine — so each clone has to opt in
// once with `git config core.hooksPath`. Doing it from `prepare` means
// installing the dependencies is the opt-in, and nobody has to remember.
//
// It's Node rather than a shell one-liner in package.json because npm runs
// scripts with cmd.exe on Windows and sh elsewhere, and no single line of
// shell works in both.
//
// `prepare` only calls this file if it exists (the guard is inline in
// package.json, since a missing file can't guard itself): a Dockerfile
// commonly copies package.json and the lockfile and runs `npm ci` *before*
// copying the rest of the source, and this repo's does.
//
// It does nothing — successfully — where there's no git repository: a
// Docker build (`npm ci` in an image has no .git folder), a downloaded zip,
// or an install from the npm registry. Failing there would break the install
// for a hook nobody could use.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../.githooks/pre-commit', import.meta.url));

function insideGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    return true;
  } catch {
    // No git installed, or not a repository.
    return false;
  }
}

if (!existsSync(hook) || !insideGitRepo()) {
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks']);

// Git on Linux and macOS ignores a hook that isn't executable (with only a
// warning), and Windows checkouts don't record the bit reliably. Setting it
// here makes the hook work on every clone, whatever the checkout did.
try {
  chmodSync(hook, 0o755);
} catch {
  // A read-only checkout: the hook may not run, but the install shouldn't fail.
}
