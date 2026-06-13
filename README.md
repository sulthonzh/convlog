# convlog

Generate CHANGELOGs from [conventional commits](https://www.conventionalcommits.org/). Zero dependencies.

You write commits like `feat(auth): add OAuth2 login` and `fix: crash on empty input`. convlog turns those into a clean, versioned changelog. No config files, no plugins, no nonsense.

## Why

Every changelog generator out there wants your life story in a config file. convlog reads your git log, parses conventional commits, and spits out a changelog. That's it.

Works for solo projects and teams. Handles breaking changes, scopes, semver bumping — all from your commit messages.

## Install

```bash
npm install -g convlog
```

## Usage

### CLI

```bash
# Generate changelog from latest tag to HEAD
convlog

# From a specific tag
convlog --from v1.2.0

# Between two refs
convlog --from v1.0.0 --to v1.1.0

# Group by scope
convlog --scope

# Show stats
convlog --stats

# Output as JSON
convlog --json

# Filter by file path
convlog --path src/auth
```

### Programmatic

```js
const { generate, parseCommit, stats } = require('convlog');

// Parse a single commit message
const parsed = parseCommit('feat(api)!: new response format');
// { type: 'feat', scope: 'api', breaking: true, description: 'new response format' }

// Generate full changelog
const changelog = generate({ cwd: './my-project' });

// Get commit stats
const commits = getCommits({ from: 'v1.0.0' });
const s = stats(commits);
// { total: 42, byType: { feat: 15, fix: 20, ... }, breaking: 3, scopes: ['api', 'ui'] }
```

## What it detects

- **Commit types**: feat, fix, perf, refactor, docs, test, build, ci, chore, style, revert
- **Scopes**: `feat(auth):` → groups under **auth**
- **Breaking changes**: `feat!:` or `BREAKING CHANGE:` in body → marked with **BREAKING**
- **Semver bumping**: fix → patch, feat → minor, breaking → major

## Output format

```markdown
# Changelog

## 1.2.0 (2026-06-13)

### Features

- **api:** add rate limiting (a1b2c3d)
- add search endpoint (e4f5g6h)

### Bug Fixes

- **auth:** fix token expiry (i7j8k9l)

### BREAKING

Changes marked with **BREAKING** are highlighted.
```

## Options

| Flag | Description |
|------|-------------|
| `-f, --from <tag>` | Start from tag (default: latest) |
| `-t, --to <ref>` | End at ref (default: HEAD) |
| `-p, --path <path>` | Filter by file path |
| `-s, --scope` | Group commits by scope |
| `--stats` | Show commit statistics |
| `--hidden` | Include non-standard commit types |
| `--json` | Output as JSON |
| `--no-header` | Omit changelog header |
| `-h, --help` | Show help |

## API

### `parseCommit(message)` → `object | null`

Parse a conventional commit message. Returns `{ type, scope, description, breaking, body }` or `null`.

### `getCommits(options)` → `array`

Get parsed commits from git log. Options: `{ from, to, cwd, path }`.

### `generateChangelog(commits, options)` → `string`

Generate markdown changelog section for given commits.

### `generate(options)` → `string`

Generate a full changelog including recent version tags.

### `stats(commits)` → `object`

Get statistics about commits: counts by type, breaking changes, scopes.

### `guessNextVersion(tags, commits)` → `string`

Guess the next semver version based on tags and commit types.

## Zero dependencies

convlog runs on Node.js built-ins. No external packages, no supply chain risk, no bloated `node_modules`.

## License

MIT
