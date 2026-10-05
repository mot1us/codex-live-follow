'use strict';

function escapeGlob(path) { return path.replace(/[\\*?]/g, '\\$&'); }

function segmentTokens(segment) {
  const tokens = [];
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (char === '\\' && i + 1 < segment.length) tokens.push({ literal: segment[++i] });
    else if (char === '*' || char === '?') tokens.push({ wildcard: char });
    else tokens.push({ literal: char });
  }
  return tokens;
}

// A single * stays inside one folder. A whole ** segment crosses folders.
// Matching uses bounded tables, rather than a backtracking regular expression.
function matchesSegment(tokens, text) {
  let row = new Uint8Array(text.length + 1);
  row[0] = 1;
  for (const token of tokens) {
    const next = new Uint8Array(text.length + 1);
    if (token.wildcard === '*') next[0] = row[0];
    for (let i = 1; i <= text.length; i++) {
      next[i] = token.wildcard === '*' ? row[i] || next[i - 1]
        : row[i - 1] && (token.wildcard === '?' || token.literal === text[i - 1]);
    }
    row = next;
  }
  return !!row[text.length];
}

function compileGlobs(patterns) {
  const compiled = (Array.isArray(patterns) ? patterns : []).slice(0, 200)
    .filter(pattern => typeof pattern === 'string' && pattern.length > 0 && pattern.length <= 1024)
    .map(pattern => pattern.split('/').map(segment => segment === '**' ? null : segmentTokens(segment)));
  return path => {
    const parts = path.split('/');
    return compiled.some(pattern => {
      let row = new Uint8Array(parts.length + 1);
      row[0] = 1;
      for (const segment of pattern) {
        const next = new Uint8Array(parts.length + 1);
        if (segment === null) next[0] = row[0];
        for (let i = 1; i <= parts.length; i++) {
          next[i] = segment === null ? row[i] || next[i - 1]
            : row[i - 1] && matchesSegment(segment, parts[i - 1]);
        }
        row = next;
      }
      return !!row[parts.length];
    });
  };
}

module.exports = { compileGlobs, escapeGlob };
