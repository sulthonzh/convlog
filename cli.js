#!/usr/bin/env node
'use strict';

const { generate, stats, getCommits, getTags, DEFAULT_TYPES } = require('./index');

const args = process.argv.slice(2);

function help() {
  console.log(`
convlog — Generate CHANGELOGs from conventional git commits.

Usage:
  convlog [options]

Options:
  -f, --from <tag>       Start from tag (default: latest tag)
  -t, --to <ref>         End at ref (default: HEAD)
  -p, --path <path>      Filter by file path
  -s, --scope            Group commits by scope
  --stats                Show commit statistics instead
  --hidden               Include non-standard commit types
  --json                 Output as JSON
  --no-header            Omit the changelog header
  -h, --help             Show this help

Examples:
  convlog                          # Generate changelog from last tag to HEAD
  convlog --from v1.0.0            # From specific tag
  convlog --from v1.0.0 --to v2.0.0
  convlog --stats                  # Show stats
  convlog --scope                  # Group by scope
`);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '-f' || a === '--from') && argv[i + 1]) { opts.from = argv[++i]; }
    else if ((a === '-t' || a === '--to') && argv[i + 1]) { opts.to = argv[++i]; }
    else if ((a === '-p' || a === '--path') && argv[i + 1]) { opts.path = argv[++i]; }
    else if (a === '-s' || a === '--scope') { opts.groupByScope = true; }
    else if (a === '--stats') { opts.showStats = true; }
    else if (a === '--hidden') { opts.includeHidden = true; }
    else if (a === '--json') { opts.json = true; }
    else if (a === '--no-header') { opts.noHeader = true; }
    else if (a === '-h' || a === '--help') { opts.help = true; }
  }
  return opts;
}

function main() {
  const opts = parseArgs(args);

  if (opts.help) { help(); return; }

  if (opts.showStats) {
    const commits = getCommits({ from: opts.from, to: opts.to, path: opts.path });
    const s = stats(commits);
    if (opts.json) {
      console.log(JSON.stringify(s, null, 2));
    } else {
      console.log(`Commits: ${s.total}`);
      console.log(`Breaking: ${s.breaking}`);
      console.log(`Scopes: ${s.scopes.join(', ') || 'none'}`);
      console.log('\nBy type:');
      for (const [type, count] of Object.entries(s.byType).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
      }
    }
    return;
  }

  const changelog = generate({
    from: opts.from,
    to: opts.to,
    path: opts.path,
    groupByScope: opts.groupByScope,
    includeHidden: opts.includeHidden,
    header: opts.noHeader ? '' : undefined,
  });

  if (opts.json) {
    const commits = getCommits({ from: opts.from, to: opts.to, path: opts.path });
    console.log(JSON.stringify({ changelog, commits }, null, 2));
  } else {
    console.log(changelog);
  }
}

main();
