'use strict';

function makeReplayPlan(before, after) {
  const oldChars = Array.from(before);
  const newChars = Array.from(after);
  let prefix = 0;
  while (
    prefix < oldChars.length &&
    prefix < newChars.length &&
    oldChars[prefix] === newChars[prefix]
  ) prefix++;

  let suffix = 0;
  while (
    suffix < oldChars.length - prefix &&
    suffix < newChars.length - prefix &&
    oldChars[oldChars.length - suffix - 1] === newChars[newChars.length - suffix - 1]
  ) suffix++;

  return {
    head: newChars.slice(0, prefix).join(''),
    typed: newChars.slice(prefix, newChars.length - suffix),
    tail: newChars.slice(newChars.length - suffix).join('')
  };
}

module.exports = { makeReplayPlan };
