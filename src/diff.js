'use strict';

function splitLines(text) {
  return text.split(/\r?\n/);
}

function changedHunks(before, after, maxCells = 160000) {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }
  if (prefix === oldLines.length && prefix === newLines.length) return [];

  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (
    oldEnd > prefix &&
    newEnd > prefix &&
    oldLines[oldEnd - 1] === newLines[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  const oldMiddle = oldLines.slice(prefix, oldEnd);
  const newMiddle = newLines.slice(prefix, newEnd);
  const hunk = (start, end) => {
    const line = Math.min(start, newLines.length - 1);
    return { start: line, end: Math.min(Math.max(end, line + 1), newLines.length) };
  };

  if (!oldMiddle.length || !newMiddle.length) {
    return [hunk(prefix, prefix + newMiddle.length)];
  }

  const m = oldMiddle.length;
  const n = newMiddle.length;
  if (m * n > maxCells) {
    return [hunk(prefix, Math.min(prefix + n, prefix + 24))];
  }

  const width = n + 1;
  const dp = new Uint32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * width + j] = oldMiddle[i] === newMiddle[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  let start = null;
  const flush = () => {
    if (start !== null) {
      result.push(hunk(start, prefix + j));
      start = null;
    }
  };
  while (i < m || j < n) {
    if (i < m && j < n && oldMiddle[i] === newMiddle[j]) {
      flush();
      i++;
      j++;
    } else {
      if (start === null) start = prefix + j;
      if (j < n && (i === m || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) {
        j++;
      } else {
        i++;
      }
    }
  }
  flush();
  return result;
}

module.exports = { changedHunks };
