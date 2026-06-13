'use strict';

/**
 * convlog — Generate CHANGELOGs from conventional git commits.
 * Zero dependencies.
 */

const { execSync } = require('child_process');

// ── Types & Configuration ──────────────────────────────────────────

const DEFAULT_TYPES = {
  feat: { title: 'Features', weight: 0 },
  fix: { title: 'Bug Fixes', weight: 1 },
  perf: { title: 'Performance', weight: 2 },
  refactor: { title: 'Refactoring', weight: 3 },
  docs: { title: 'Documentation', weight: 4 },
  test: { title: 'Tests', weight: 5 },
  build: { title: 'Build', weight: 6 },
  ci: { title: 'CI', weight: 7 },
  chore: { title: 'Chores', weight: 8 },
  style: { title: 'Style', weight: 9 },
  revert: { title: 'Reverts', weight: 10 },
};

const SEMVER_BUMP = { feat: 'minor', fix: 'patch', perf: 'patch' };
const BREAKING_BUMP = 'major';

// ── Helpers ────────────────────────────────────────────────────────

function tryRun(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function guessNextVersion(tags, commits) {
  if (!tags.length) return '1.0.0';
  const latest = tags[0].replace(/^v/, '');
  const parts = latest.split('.').map(Number);
  let bump = 'patch';
  let hasBreaking = false;

  for (const c of commits) {
    if (c.breaking) hasBreaking = true;
    const typeBump = SEMVER_BUMP[c.type];
    if (typeBump === 'minor') bump = 'minor';
  }

  if (hasBreaking) {
    if (parts[0] === 0) {
      // 0.x → bump minor for breaking
      parts[1]++;
      parts[2] = 0;
    } else {
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
    }
  } else if (bump === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else {
    parts[2]++;
  }

  return parts.join('.');
}

function parseVersion(tag) {
  return tag.replace(/^v/, '');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toISOString().split('T')[0];
}

// ── Commit Parser ──────────────────────────────────────────────────

function parseCommit(raw) {
  // Conventional commit: type(scope): description
  // Breaking: type(scope)!: description or BREAKING CHANGE in body
  const firstLine = raw.split('\n')[0] || '';
  const match = firstLine.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);

  if (!match) return null;

  const [, type, scope, bang, description] = match;
  const body = raw.includes('\n\n') ? raw.slice(raw.indexOf('\n\n') + 2) : '';
  const breaking = bang === '!' || /BREAKING[ -]CHANGE/i.test(body);

  return { type, scope: scope || null, description, breaking, body, raw };
}

function getCommits(options = {}) {
  const { from, to, cwd, path: filePath } = options;
  const args = ['git', 'log', '--format=%H%n%s%n%b%n---END---'];
  if (from && to) {
    args.push(`${from}..${to}`);
  } else if (from) {
    args.push(`${from}..HEAD`);
  }
  if (filePath) args.push('--', filePath);

  const output = tryRun(args.join(' '), cwd);
  if (!output) return [];

  return output
    .split('---END---')
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n');
      const hash = lines[0] || '';
      const subject = lines[1] || '';
      const body = lines.slice(2).join('\n');
      const parsed = parseCommit(subject + (body ? '\n\n' + body : ''));
      if (!parsed) return null;
      return { ...parsed, hash, subject };
    })
    .filter(Boolean);
}

function getTags(cwd) {
  const output = tryRun('git tag --sort=-v:refname', cwd);
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

function getVersionDates(cwd) {
  const output = tryRun('git tag --sort=-v:refname --format="%(refname:short) %(creatordate:short)"', cwd);
  if (!output) return {};
  const dates = {};
  for (const line of output.split('\n').filter(Boolean)) {
    const [tag, date] = line.split(/\s+/);
    dates[tag] = date;
  }
  return dates;
}

// ── Changelog Generator ────────────────────────────────────────────

function generateChangelog(commits, options = {}) {
  const {
    title = 'Changelog',
    types = DEFAULT_TYPES,
    version,
    date,
    previousVersion,
    groupByScope = false,
    includeHidden = false,
  } = options;

  const filtered = commits.filter(c => {
    if (!types[c.type] && !includeHidden) return false;
    return true;
  });

  const grouped = {};
  for (const c of filtered) {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  }

  const sortedTypes = Object.entries(grouped).sort((a, b) => {
    const wa = types[a[0]]?.weight ?? 99;
    const wb = types[b[0]]?.weight ?? 99;
    return wa - wb;
  });

  let md = '';

  // Version header
  const versionLabel = version || 'Unreleased';
  const dateLabel = date ? ` (${date})` : '';
  const compareLink = previousVersion && version
    ? `\n\n[Compare](https://github.com/compare/v${previousVersion}...v${version})`
    : '';
  md += `## ${versionLabel}${dateLabel}${compareLink}\n\n`;

  if (filtered.length === 0) {
    md += 'No notable changes.\n\n';
    return md;
  }

  for (const [type, typeCommits] of sortedTypes) {
    const config = types[type] || { title: type };
    md += `### ${config.title}\n\n`;

    if (groupByScope) {
      const scopes = {};
      const noScope = [];
      for (const c of typeCommits) {
        if (c.scope) {
          if (!scopes[c.scope]) scopes[c.scope] = [];
          scopes[c.scope].push(c);
        } else {
          noScope.push(c);
        }
      }

      for (const c of noScope) {
        md += formatCommit(c);
      }
      for (const [scope, scopeCommits] of Object.entries(scopes)) {
        md += `- **${scope}:**\n`;
        for (const c of scopeCommits) {
          md += `  ${formatCommit(c, true).trim()}\n`;
        }
      }
    } else {
      for (const c of typeCommits) {
        md += formatCommit(c);
      }
    }
    md += '\n';
  }

  return md;
}

function formatCommit(commit, indent = false) {
  const prefix = indent ? '' : '- ';
  let line = `${prefix}`;

  if (commit.scope) {
    line += `**${commit.scope}:** `;
  }

  line += commit.description;

  if (commit.breaking) {
    line += ' **BREAKING**';
  }

  if (commit.hash) {
    line += ` (${commit.hash.slice(0, 7)})`;
  }

  line += '\n';
  return line;
}

// ── Full Report ────────────────────────────────────────────────────

function generate(options = {}) {
  const {
    cwd = process.cwd(),
    from,
    to,
    path: filePath,
    title = 'Changelog',
    types = DEFAULT_TYPES,
    groupByScope = false,
    includeHidden = false,
    header = '# Changelog\n\nAll notable changes to this project will be documented in this file.',
  } = options;

  const tags = getTags(cwd);
  const tagDates = getVersionDates(cwd);
  const commits = getCommits({ from: from || tags[0], to: to || 'HEAD', cwd, path: filePath });

  if (commits.length === 0) {
    return header + '\n\nNo commits found for the specified range.\n';
  }

  const nextVersion = guessNextVersion(tags, commits);
  let md = header + '\n\n';

  md += generateChangelog(commits, {
    title,
    types,
    version: nextVersion,
    date: formatDate(new Date().toISOString()),
    previousVersion: tags[0] ? parseVersion(tags[0]) : null,
    groupByScope,
    includeHidden,
  });

  // Previous versions
  for (let i = 0; i < Math.min(tags.length, 5); i++) {
    const tag = tags[i];
    const prevTag = tags[i + 1];
    const versionCommits = getCommits({ from: prevTag, to: tag, cwd, path: filePath });
    md += generateChangelog(versionCommits, {
      title,
      types,
      version: parseVersion(tag),
      date: tagDates[tag] || '',
      previousVersion: prevTag ? parseVersion(prevTag) : null,
      groupByScope,
      includeHidden,
    });
  }

  return md;
}

// ── Stats ──────────────────────────────────────────────────────────

function stats(commits) {
  const total = commits.length;
  const byType = {};
  let breaking = 0;
  const scopes = new Set();

  for (const c of commits) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    if (c.breaking) breaking++;
    if (c.scope) scopes.add(c.scope);
  }

  return {
    total,
    byType,
    breaking,
    scopes: [...scopes],
    conventional: total,
    conventionalPct: 100, // since we only parse conventional commits
  };
}

// ── Exports ────────────────────────────────────────────────────────

module.exports = {
  parseCommit,
  getCommits,
  getTags,
  generateChangelog,
  generate,
  stats,
  guessNextVersion,
  DEFAULT_TYPES,
};
