'use strict';

function linesWithOffsets(text) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const offsets = [0];
  for (const line of lines) offsets.push(offsets.at(-1) + line.length);
  return { lines, offsets };
}

// Keep both sides of each edit so replay can leave the intervening text alone.
function changedBlocks(before, after, maxCells = 160000) {
  const old = linesWithOffsets(before);
  const next = linesWithOffsets(after);
  const a = old.lines;
  const b = next.lines;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  if (prefix === a.length && prefix === b.length) return [];
  let oldEnd = a.length;
  let newEnd = b.length;
  while (oldEnd > prefix && newEnd > prefix && a[oldEnd - 1] === b[newEnd - 1]) {
    oldEnd--; newEnd--;
  }
  const lineCount = after.split('\n').length;
  const block = (i, j, endI, endJ, coarse = false) => {
    const start = Math.min(j, lineCount - 1);
    return {
      oldStart: old.offsets[i], oldEnd: old.offsets[endI],
      newStart: next.offsets[j], newEnd: next.offsets[endJ],
      start, end: Math.min(Math.max(coarse ? j + 24 : endJ, start + 1), lineCount), coarse
    };
  };
  const m = oldEnd - prefix;
  const n = newEnd - prefix;
  if (!m || !n) return [block(prefix, prefix, oldEnd, newEnd)];
  if (m * n > maxCells) return [block(prefix, prefix, oldEnd, newEnd, true)];

  const width = n + 1;
  const dp = new Uint32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * width + j] = a[prefix + i] === b[prefix + j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  let start;
  const flush = () => {
    if (start) result.push(block(prefix + start.i, prefix + start.j, prefix + i, prefix + j));
    start = undefined;
  };
  while (i < m || j < n) {
    if (i < m && j < n && a[prefix + i] === b[prefix + j]) {
      flush(); i++; j++;
    } else {
      start ||= { i, j };
      if (j < n && (i === m || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) j++;
      else i++;
    }
  }
  flush();
  return result;
}

function changedHunks(before, after, maxCells) {
  return changedBlocks(before, after, maxCells).map(({ start, end }) => ({ start, end }));
}

module.exports = { changedBlocks, changedHunks };
