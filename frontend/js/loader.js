import { searchParticipants, getDetail } from './api.js';

const LETTERS    = 'abcdefghijklmnopqrstuvwxyz'.split('');
const PREFIXES_2 = Array.from({ length: 90 }, (_, i) => String(i + 10));
const PREFIXES_3 = Array.from({ length: 46 }, (_, i) => String(i + 100));
export const SEARCH_PHRASES = [...LETTERS, ...PREFIXES_2, ...PREFIXES_3];

const CACHE_TTL = Infinity; // results are final; never evict

// ── Cache ─────────────────────────────────────────────────────────────────────

export function saveCache(year, subEventId, participants) {
  if (!participants?.length) return; // never cache empty results — a transient fetch failure must not poison the cache permanently
  try {
    localStorage.setItem(`race_${year}_${subEventId}`, JSON.stringify({
      ts: Date.now(),
      participants,
    }));
  } catch { /* quota exceeded — ignore */ }
}

export function loadCache(year, subEventId) {
  try {
    const key = `race_${year}_${subEventId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, participants } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    if (!participants?.length) { localStorage.removeItem(key); return null; } // discard poisoned empty entries from older versions
    return participants;
  } catch { return null; }
}

export function pruneExpiredCache() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith('race_')) continue;
    try {
      const { ts } = JSON.parse(localStorage.getItem(key));
      if (Date.now() - ts > CACHE_TTL) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }
}

// ── Concurrency primitives ────────────────────────────────────────────────────

// Fixed-size worker pool — workers grab tasks as they complete (no batching)
async function runPool(tasks, concurrency, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await fn(tasks[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// Semaphore — limits how many async operations run at once
function createSemaphore(limit) {
  let count = 0;
  const queue = [];
  return function acquire(fn) {
    return new Promise((resolve, reject) => {
      function attempt() {
        if (count < limit) {
          count++;
          Promise.resolve().then(fn).then(
            v => { count--; if (queue.length) queue.shift()(); resolve(v); },
            e => { count--; if (queue.length) queue.shift()(); reject(e); }
          );
        } else {
          queue.push(attempt);
        }
      }
      attempt();
    });
  };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchSingleTiming(code, p) {
  const detail = await getDetail(code, p.id);
  if (detail?.chipTimeSec != null) {
    p.chipTime    = detail.chipTime    ?? null;
    p.chipTimeSec = detail.chipTimeSec ?? 0;
    p.raceStatus  = detail.raceStatus  ?? 'UNKNOWN';
  } else {
    p.chipTime    = null;
    p.chipTimeSec = 0;
    p.raceStatus  = 'UNKNOWN';
  }
}

// ── Pipelined discovery + timing ──────────────────────────────────────────────
//
// Runs both phases concurrently: timing fetches start as soon as each
// participant is discovered, instead of waiting for all 162 searches first.
//
// `out` is a caller-owned array populated in place so the caller can render
// partial results live without waiting for the full result.
//
// onProgress({ searchDone, searchTotal, found, timingDone })

export async function collectAndFetchAll(code, subEventId, out, onProgress) {
  const seen         = new Map();
  const timingSem    = createSemaphore(50); // max 50 concurrent timing fetches
  const timingJobs   = [];
  let searchDone = 0;
  let timingDone = 0;

  await runPool(SEARCH_PHRASES, 20, async (phrase) => {
    const rows = await searchParticipants(code, phrase);
    for (const r of rows) {
      if (!subEventId || String(r.resultSubEventId) === String(subEventId)) {
        if (!seen.has(r.id)) {
          seen.set(r.id, r);
          out.push(r); // immediately visible to caller
          timingJobs.push(
            timingSem(async () => {
              try {
                await fetchSingleTiming(code, r); // mutates r in place
              } catch {
                r.chipTimeSec = 0; r.chipTime = null; r.raceStatus = 'UNKNOWN';
              }
              timingDone++;
              onProgress?.({ searchDone, searchTotal: SEARCH_PHRASES.length, found: out.length, timingDone });
            })
          );
        }
      }
    }
    searchDone++;
    onProgress?.({ searchDone, searchTotal: SEARCH_PHRASES.length, found: out.length, timingDone });
  });

  await Promise.all(timingJobs);
}
