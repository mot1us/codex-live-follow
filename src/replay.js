'use strict';

const { changedBlocks } = require('./diff');

function insideSurrogatePair(text, index) {
  const head = text.charCodeAt(index - 1);
  const tail = text.charCodeAt(index);
  return head >= 0xd800 && head <= 0xdbff && tail >= 0xdc00 && tail <= 0xdfff;
}

function replayBounds(before, after) {
  // Find unchanged text without allocating character arrays for the whole file.
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) prefix++;
  if (insideSurrogatePair(before, prefix) || insideSurrogatePair(after, prefix)) prefix--;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix++;
  if (insideSurrogatePair(before, before.length - suffix) ||
    insideSurrogatePair(after, after.length - suffix)) suffix--;

  const end = after.length - suffix;
  return { prefix, end, suffix };
}

function makeReplayPlan(before, after) {
  const { prefix, end } = replayBounds(before, after);
  return {
    head: after.slice(0, prefix),
    typed: Array.from(after.slice(prefix, end)),
    tail: after.slice(end)
  };
}

function makeReplayStages(before, after, maxCharacters = Infinity) {
  const stages = changedBlocks(before, after).map(block => {
    const old = before.slice(block.oldStart, block.oldEnd);
    const next = after.slice(block.newStart, block.newEnd);
    const { prefix, end, suffix } = replayBounds(old, next);
    return {
      start: block.newStart + prefix,
      deleteCount: old.length - prefix - suffix,
      text: next.slice(prefix, end),
      hunk: { start: block.start, end: block.end },
      coarse: block.coarse
    };
  });
  // Decide whether typing is allowed before allocating one array entry per code
  // point. Stop counting at the limit, including across separate changed blocks.
  let limited = Number.isFinite(maxCharacters) && stages.some(stage => stage.coarse);
  if (Number.isFinite(maxCharacters) && !limited) {
    let count = 0;
    counting: for (const stage of stages) {
      for (let i = 0; i < stage.text.length;) {
        if (++count > maxCharacters) { limited = true; break counting; }
        i += stage.text.codePointAt(i) > 0xffff ? 2 : 1;
      }
    }
  }
  return stages.map(({ text, ...stage }) => limited
    ? { ...stage, typed: [], limited: true }
    : { ...stage, typed: Array.from(text) });
}

module.exports = { makeReplayPlan, makeReplayStages };
