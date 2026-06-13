'use strict';

const { parseCommit, getCommits, generateChangelog, generate, stats, guessNextVersion, DEFAULT_TYPES } = require('./index');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('convlog tests\n');

// ── parseCommit ────────────────────────────────────────────────────

test('parses basic conventional commit', () => {
  const c = parseCommit('feat: add login page');
  assert.strictEqual(c.type, 'feat');
  assert.strictEqual(c.scope, null);
  assert.strictEqual(c.description, 'add login page');
  assert.strictEqual(c.breaking, false);
});

test('parses commit with scope', () => {
  const c = parseCommit('fix(auth): redirect after logout');
  assert.strictEqual(c.type, 'fix');
  assert.strictEqual(c.scope, 'auth');
  assert.strictEqual(c.description, 'redirect after logout');
});

test('parses breaking change with bang', () => {
  const c = parseCommit('feat(api)!: changed response format');
  assert.strictEqual(c.type, 'feat');
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.description, 'changed response format');
});

test('parses breaking change in body', () => {
  const c = parseCommit('feat: new feature\n\nBREAKING CHANGE: the old API is gone');
  assert.strictEqual(c.breaking, true);
});

test('parses breaking change hyphenated', () => {
  const c = parseCommit('feat: new feature\n\nBREAKING-CHANGE: removed old endpoint');
  assert.strictEqual(c.breaking, true);
});

test('returns null for non-conventional commit', () => {
  assert.strictEqual(parseCommit('random commit message'), null);
});

test('returns null for empty string', () => {
  assert.strictEqual(parseCommit(''), null);
});

test('parses commit without scope but with bang', () => {
  const c = parseCommit('refactor!: rewrite everything');
  assert.strictEqual(c.type, 'refactor');
  assert.strictEqual(c.scope, null);
  assert.strictEqual(c.breaking, true);
});

test('parses all standard types', () => {
  for (const type of Object.keys(DEFAULT_TYPES)) {
    const c = parseCommit(`${type}: some message`);
    assert.strictEqual(c.type, type, `Failed for type: ${type}`);
  }
});

test('handles multi-scope with slashes', () => {
  const c = parseCommit('feat(api/v2): new endpoint');
  assert.strictEqual(c.scope, 'api/v2');
});

// ── generateChangelog ──────────────────────────────────────────────

test('generates changelog for commits', () => {
  const commits = [
    { type: 'feat', scope: null, description: 'new login', breaking: false, hash: 'abc1234def' },
    { type: 'fix', scope: 'auth', description: 'fix logout', breaking: false, hash: 'def5678abc' },
  ];
  const md = generateChangelog(commits, { version: '1.1.0', date: '2026-06-13' });
  assert(md.includes('## 1.1.0'));
  assert(md.includes('### Features'));
  assert(md.includes('### Bug Fixes'));
  assert(md.includes('new login'));
  assert(md.includes('**auth:** fix logout'));
});

test('includes BREAKING label', () => {
  const commits = [
    { type: 'feat', scope: null, description: 'big change', breaking: true, hash: 'aaa111' },
  ];
  const md = generateChangelog(commits, { version: '2.0.0' });
  assert(md.includes('**BREAKING**'));
});

test('groups by scope when enabled', () => {
  const commits = [
    { type: 'feat', scope: 'ui', description: 'new button', breaking: false, hash: 'a1' },
    { type: 'feat', scope: 'api', description: 'new endpoint', breaking: false, hash: 'a2' },
    { type: 'feat', scope: null, description: 'general thing', breaking: false, hash: 'a3' },
  ];
  const md = generateChangelog(commits, { version: '1.0.0', groupByScope: true });
  assert(md.includes('**ui:**'));
  assert(md.includes('**api:**'));
  assert(md.includes('general thing'));
});

test('empty commits produces no notable changes', () => {
  const md = generateChangelog([], { version: '1.0.0' });
  assert(md.includes('No notable changes'));
});

test('compare link generated when previous version provided', () => {
  const commits = [
    { type: 'fix', scope: null, description: 'patch', breaking: false, hash: 'a' },
  ];
  const md = generateChangelog(commits, { version: '1.0.1', previousVersion: '1.0.0' });
  assert(md.includes('Compare'));
  assert(md.includes('v1.0.0...v1.0.1'));
});

test('sorts types by weight', () => {
  const commits = [
    { type: 'chore', scope: null, description: 'cleanup', breaking: false, hash: 'a' },
    { type: 'feat', scope: null, description: 'new thing', breaking: false, hash: 'b' },
    { type: 'fix', scope: null, description: 'patch', breaking: false, hash: 'c' },
  ];
  const md = generateChangelog(commits, { version: '1.0.0' });
  const featIdx = md.indexOf('### Features');
  const fixIdx = md.indexOf('### Bug Fixes');
  const choreIdx = md.indexOf('### Chores');
  assert(featIdx < fixIdx);
  assert(fixIdx < choreIdx);
});

test('includes hidden types when flag set', () => {
  const commits = [
    { type: 'custom', scope: null, description: 'custom thing', breaking: false, hash: 'a' },
  ];
  const md = generateChangelog(commits, { version: '1.0.0', includeHidden: true });
  assert(md.includes('custom thing'));
});

// ── stats ──────────────────────────────────────────────────────────

test('stats returns correct counts', () => {
  const commits = [
    { type: 'feat', scope: 'ui', breaking: false },
    { type: 'feat', scope: 'api', breaking: false },
    { type: 'fix', scope: null, breaking: true },
  ];
  const s = stats(commits);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.byType.feat, 2);
  assert.strictEqual(s.byType.fix, 1);
  assert.strictEqual(s.breaking, 1);
  assert(s.scopes.includes('ui'));
  assert(s.scopes.includes('api'));
});

test('stats with empty array', () => {
  const s = stats([]);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.breaking, 0);
  assert.deepStrictEqual(s.scopes, []);
});

// ── guessNextVersion ───────────────────────────────────────────────

test('guesses 1.0.0 with no tags', () => {
  assert.strictEqual(guessNextVersion([], []), '1.0.0');
});

test('bumps patch for fix only', () => {
  assert.strictEqual(guessNextVersion(['v1.2.3'], [{ type: 'fix', breaking: false }]), '1.2.4');
});

test('bumps minor for feat', () => {
  assert.strictEqual(guessNextVersion(['v1.2.3'], [{ type: 'feat', breaking: false }]), '1.3.0');
});

test('bumps minor for feat without fix', () => {
  assert.strictEqual(guessNextVersion(['v1.2.3'], [{ type: 'feat', breaking: false }]), '1.3.0');
});

test('bumps major for breaking', () => {
  assert.strictEqual(guessNextVersion(['v1.2.3'], [{ type: 'feat', breaking: true }]), '2.0.0');
});

test('0.x bumps minor for breaking', () => {
  assert.strictEqual(guessNextVersion(['v0.5.0'], [{ type: 'feat', breaking: true }]), '0.6.0');
});

// ── Integration with real git ──────────────────────────────────────

test('getCommits from this repo returns array', () => {
  const commits = getCommits({ cwd: __dirname });
  // This test just checks it doesn't throw
  assert(Array.isArray(commits));
});

test('generate produces output', () => {
  const md = generate({ cwd: __dirname, header: '' });
  assert(typeof md === 'string');
});

// ── Summary ────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
