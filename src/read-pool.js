'use strict';

// Keep the same limit across startup, watcher bursts, inspections, and rescans.
class ReadPool {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.pending = new Set();
    this.disposed = false;
  }

  run(read, current) {
    if (this.disposed) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      this.pending.add({ read, current, resolve, reject });
      this.drain();
    });
  }

  drain() {
    while (!this.disposed && this.active < this.limit && this.pending.size) {
      const request = this.pending.values().next().value;
      this.pending.delete(request);
      this.active++;
      Promise.resolve().then(() => !this.disposed && request.current() ? request.read() : null)
        .then(request.resolve, request.reject)
        .finally(() => { this.active--; this.drain(); });
    }
  }

  clear() {
    for (const request of this.pending) request.resolve(null);
    this.pending.clear();
    // In-flight I/O still occupies a slot until it settles, including across resets.
  }

  dispose() { this.disposed = true; this.clear(); }
}

module.exports = { ReadPool };
