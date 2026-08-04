#!/usr/bin/env node
/**
 * Zero-dependency Conventional Commits validator.
 * Standard defined in docs/handbook/01-standards.md §4.
 *
 * Usage:
 *   node scripts/validate-commit-msg.mjs <path-to-commit-msg-file>   # git commit-msg hook
 *   node scripts/validate-commit-msg.mjs --range <base>..<head>      # CI over a PR range (uses git log)
 *
 * Exit 0 = all messages valid; exit 1 = at least one violation (message printed).
 * Intentionally has NO npm dependencies so it runs in a bare hook and in CI
 * without an install step.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'ci', 'chore', 'revert'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: .{1,72}$`);

// Commits git creates itself that we should not police.
const IGNORE = [/^Merge /, /^Revert "/, /^fixup! /, /^squash! /, /^Initial commit$/];

/** @returns {string[]} validation errors for a single message (empty = valid) */
function validate(message) {
  const firstLine = message.split('\n')[0]?.trim() ?? '';
  if (IGNORE.some((re) => re.test(firstLine))) return [];
  const errors = [];
  if (!HEADER.test(firstLine)) {
    errors.push(
      `header must be "<type>(<scope>): <subject>" with type ∈ {${TYPES.join(', ')}} and subject ≤ 72 chars`,
    );
  }
  if (/\.$/.test(firstLine)) errors.push('subject must not end with a period');
  const lines = message.split('\n');
  if (lines.length > 1 && lines[1]?.trim() !== '') {
    errors.push('a blank line must separate the header from the body');
  }
  return errors;
}

function report(label, message) {
  const errors = validate(message);
  if (errors.length === 0) return true;
  console.error(`\n✖ Invalid commit message${label ? ` (${label})` : ''}:`);
  console.error(`  "${message.split('\n')[0]}"`);
  for (const e of errors) console.error(`   - ${e}`);
  return false;
}

const args = process.argv.slice(2);
let ok = true;

if (args[0] === '--range' && args[1]) {
  // CI mode: validate every commit subject in the range.
  const raw = execSync(`git log --format=%B --no-merges ${args[1]}`, { encoding: 'utf8' });
  const messages = raw.split('\0').length > 1 ? raw.split('\0') : raw.split(/\n(?=\S)/);
  for (const msg of messages.map((m) => m.trim()).filter(Boolean)) {
    ok = report(null, msg) && ok;
  }
} else if (args[0]) {
  // Hook mode: validate the single message file git passes.
  ok = report(null, readFileSync(args[0], 'utf8').trim());
} else {
  console.error('usage: validate-commit-msg.mjs <msg-file> | --range <base>..<head>');
  process.exit(2);
}

if (!ok) {
  console.error('\nSee docs/handbook/01-standards.md §4 for the commit format.\n');
  process.exit(1);
}
console.log('✓ commit message(s) valid');
