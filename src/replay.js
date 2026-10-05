'use strict';

const { changedBlocks } = require('./diff');

function insideSurrogatePair(text, index) {
  const head = text.charCodeAt(index - 1);
  const tail = text.charCodeAt(index);
  return head >= 0xd800 && head <= 0xdbff && tail >= 0xdc00 && tail <= 0xdfff;
}

function makeReplayPlan(before, after) {
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
  return {
    head: after.slice(0, prefix),
    typed: Array.from(after.slice(prefix, end)),
    tail: after.slice(end)
  };
}

function makeReplayStages(before, after) {
  return changedBlocks(before, after).map(block => {
    const old = before.slice(block.oldStart, block.oldEnd);
    const plan = makeReplayPlan(old, after.slice(block.newStart, block.newEnd));
    return {
      start: block.newStart + plan.head.length,
      deleteCount: old.length - plan.head.length - plan.tail.length,
      typed: plan.typed,
      hunk: { start: block.start, end: block.end },
      coarse: block.coarse
    };
  });
}

module.exports = { makeReplayPlan, makeReplayStages };
