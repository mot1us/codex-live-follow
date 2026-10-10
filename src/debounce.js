'use strict';

// One timer for a bounded set of files, ordered by their latest save deadline.
class DebouncedReads {
  constructor(flush, dropped, limit = 256, delay = 90) {
    this.flush = flush;
    this.dropped = dropped;
    this.limit = limit;
    this.delay = delay;
    this.pending = new Map();
  }

  schedule(key, value) {
    this.pending.delete(key);
    this.pending.set(key, { value, due: Date.now() + this.delay });
    while (this.pending.size > this.limit) {
      const oldest = this.pending.keys().next().value;
      const entry = this.pending.get(oldest);
      this.pending.delete(oldest);
      this.dropped(oldest, entry.value);
    }
    this.arm();
  }

  arm() {
    if (this.timer || !this.pending.size) return;
    const first = this.pending.values().next().value;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const ready = [];
      const now = Date.now();
      for (const [key, entry] of this.pending) {
        if (entry.due > now) break;
        this.pending.delete(key);
        ready.push(entry.value);
      }
      if (ready.length) this.flush(ready);
      this.arm();
    }, Math.max(0, first.due - Date.now()));
  }

  delete(key) {
    this.pending.delete(key);
    if (!this.pending.size) { clearTimeout(this.timer); this.timer = undefined; }
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }
}

module.exports = { DebouncedReads };
