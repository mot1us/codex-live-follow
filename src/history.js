'use strict';

const LIMIT = 20;
const BYTE_LIMIT = 4 * 1024 * 1024;

class RecentEdits {
  constructor() { this.entries = []; this.bytes = 0; this.serial = 0; }

  add(job) {
    if (job.bytes > BYTE_LIMIT) return undefined;
    const entry = { id: String(++this.serial), uri: job.uri, before: job.before,
      after: job.after, bytes: job.bytes, time: Date.now(), skipped: false };
    this.entries.unshift(entry);
    this.bytes += entry.bytes;
    while (this.entries.length > LIMIT || this.bytes > BYTE_LIMIT) {
      this.bytes -= this.entries.pop().bytes;
    }
    return entry.id;
  }

  get(id) { return this.entries.find(entry => entry.id === id); }
  markSkipped(id) { const entry = this.get(id); if (entry) entry.skipped = true; }
  clear() { this.entries = []; this.bytes = 0; }
}

module.exports = { RecentEdits };
