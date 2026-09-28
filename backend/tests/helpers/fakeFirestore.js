/**
 * fakeFirestore.js — minimal in-memory Firestore for unit tests.
 *
 * Transactions use optimistic concurrency like the real service: every doc
 * has a version; a transaction records the versions it read and, at commit,
 * retries the whole callback if any of them changed. Transaction callbacks
 * run concurrently (they are NOT serialized), so tests exercise the same
 * read-then-write races that production would.
 */

const INC = Symbol.for("fake.increment");
const TS = Symbol.for("fake.serverTimestamp");

const FieldValue = {
  increment: (n) => ({ [INC]: n }),
  serverTimestamp: () => ({ [TS]: true }),
};

function applyFields(existing, data) {
  const out = { ...(existing || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && INC in v) out[k] = (Number(out[k]) || 0) + v[INC];
    else if (v && typeof v === 'object' && TS in v) out[k] = new Date();
    else out[k] = v;
  }
  return out;
}

const tick = () => new Promise((r) => setImmediate(r));
let autoId = 0;

class FakeFirestore {
  constructor() {
    this.docs = new Map(); // path -> { data, version }
  }

  collection(name) { return new CollectionRef(this, name); }

  _read(path) {
    const entry = this.docs.get(path);
    return entry ? { data: entry.data, version: entry.version } : { data: undefined, version: 0 };
  }

  _write(path, op, data, opts = {}) {
    const entry = this.docs.get(path);
    const exists = Boolean(entry && entry.data);
    if (op === 'create' && exists) {
      const err = new Error(`ALREADY_EXISTS: ${path}`);
      err.code = 6;
      throw err;
    }
    if (op === 'update' && !exists) {
      const err = new Error(`NOT_FOUND: No document to update: ${path}`);
      err.code = 5;
      throw err;
    }
    const base = op === 'update' || (op === 'set' && opts.merge) ? entry && entry.data : undefined;
    this.docs.set(path, { data: applyFields(base, data), version: (entry ? entry.version : 0) + 1 });
  }

  batch() {
    const writes = [];
    return {
      set: (ref, data, opts) => writes.push(['set', ref.path, data, opts]),
      update: (ref, data) => writes.push(['update', ref.path, data]),
      create: (ref, data) => writes.push(['create', ref.path, data]),
      commit: async () => { await tick(); writes.forEach(([op, path, data, opts]) => this._write(path, op, data, opts)); },
    };
  }

  async runTransaction(fn, { maxAttempts = 10 } = {}) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const reads = new Map();
      const writes = [];
      const tx = {
        get: async (ref) => {
          await tick();
          if (ref instanceof Query) return ref.get();
          const { data, version } = this._read(ref.path);
          reads.set(ref.path, version);
          return snapshot(ref, data);
        },
        set: (ref, data, opts) => { writes.push(['set', ref.path, data, opts]); return tx; },
        update: (ref, data) => { writes.push(['update', ref.path, data]); return tx; },
        create: (ref, data) => { writes.push(['create', ref.path, data]); return tx; },
      };

      const result = await fn(tx);
      await tick();

      // Commit is synchronous => atomic with respect to other callbacks.
      const conflict = [...reads].some(([path, v]) => this._read(path).version !== v);
      if (conflict) continue;
      for (const w of writes) {
        if (w[0] === 'create' && this._read(w[1]).data) throw new Error(`ALREADY_EXISTS: ${w[1]}`);
        if (w[0] === 'update' && !this._read(w[1]).data) throw new Error(`NOT_FOUND: ${w[1]}`);
      }
      writes.forEach(([op, path, data, opts]) => this._write(path, op, data, opts));
      return result;
    }
    throw new Error('ABORTED: too much contention');
  }

  // test helpers
  data(path) { const e = this.docs.get(path); return e ? e.data : undefined; }
  seed(path, data) { this._write(path, 'set', data); }
  paths(prefix) { return [...this.docs.keys()].filter((p) => p.startsWith(prefix) && this.docs.get(p).data); }
}

function snapshot(ref, data) {
  return { id: ref.id, ref, exists: data !== undefined, data: () => (data === undefined ? undefined : { ...data }) };
}

class Query {
  constructor(db, path, filters = [], lim = null) {
    Object.assign(this, { db, _path: path, filters, lim });
  }

  where(field, op, value) { return new Query(this.db, this._path, [...this.filters, [field, op, value]], this.lim); }
  orderBy() { return this; }
  limit(n) { return new Query(this.db, this._path, this.filters, n); }

  async get() {
    await tick();
    const depth = this._path.split('/').length + 1;
    let docs = [...this.db.docs.entries()]
      .filter(([p, e]) => e.data && p.startsWith(`${this._path}/`) && p.split('/').length === depth)
      .filter(([, e]) => this.filters.every(([f, op, v]) => compare(e.data[f], op, v)))
      .map(([p, e]) => snapshot(new DocRef(this.db, p), e.data));
    if (this.lim != null) docs = docs.slice(0, this.lim);
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb) => docs.forEach(cb) };
  }
}

function compare(a, op, b) {
  const n = (x) => (x instanceof Date ? x.getTime() : x);
  switch (op) {
    case '==': return n(a) === n(b);
    case '>=': return a != null && n(a) >= n(b);
    case '<=': return a != null && n(a) <= n(b);
    case '>': return a != null && n(a) > n(b);
    case '<': return a != null && n(a) < n(b);
    default: throw new Error(`fake: unsupported op ${op}`);
  }
}

class CollectionRef extends Query {
  constructor(db, path) { super(db, path); }
  doc(id) { return new DocRef(this.db, `${this._path}/${id || `auto${++autoId}`}`); }
  async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
}

class DocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  collection(name) { return new CollectionRef(this.db, `${this.path}/${name}`); }
  async get() { await tick(); return snapshot(this, this.db._read(this.path).data); }
  async set(data, opts) { await tick(); this.db._write(this.path, 'set', data, opts); }
  async update(data) { await tick(); this.db._write(this.path, 'update', data); }
  async create(data) { await tick(); this.db._write(this.path, 'create', data); }
}

module.exports = { FakeFirestore, FieldValue };
