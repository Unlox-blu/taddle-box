'use strict';

/**
 * Lightweight circuit breaker for DB-dependent sweepers.
 *
 * States:
 *   CLOSED   → normal operation, calls pass through
 *   OPEN     → consecutive failures exceeded threshold; calls are skipped
 *              until the backoff window elapses
 *   HALF_OPEN → backoff elapsed; one probe call is allowed through
 *
 * On success the breaker resets to CLOSED.
 * On failure in HALF_OPEN or CLOSED it increments the failure count and
 * may transition to OPEN (or stay OPEN with an extended backoff).
 */
const CLOSED = 'CLOSED';
const OPEN = 'OPEN';
const HALF_OPEN = 'HALF_OPEN';

class CircuitBreaker {
  /**
   * @param {object} opts
   * @param {number}  opts.failThreshold   – consecutive failures before OPEN (default 3)
   * @param {number}  opts.baseBackoffMs   – initial OPEN duration (default 30 000)
   * @param {number}  opts.maxBackoffMs    – ceiling for exponential backoff (default 300 000)
   * @param {number}  opts.backoffMultiplier – multiplier per consecutive trip (default 2)
   * @param {string}  opts.name            – label for log lines
   * @param {function} opts.logger         – optional logger({ level, message })
   */
  constructor({
    failThreshold = 3,
    baseBackoffMs = 30_000,
    maxBackoffMs = 300_000,
    backoffMultiplier = 2,
    name = 'circuit',
    logger = null,
  } = {}) {
    this.failThreshold = failThreshold;
    this.baseBackoffMs = baseBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.backoffMultiplier = backoffMultiplier;
    this.name = name;
    this.logger = logger;

    this.state = CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.currentBackoffMs = baseBackoffMs;
  }

  _log(level, msg) {
    if (this.logger) {
      this.logger({ level, message: `[CircuitBreaker:${this.name}] ${msg}` });
    } else {
      const ts = new Date().toISOString();
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](
        `${ts} [CircuitBreaker:${this.name}] ${msg}`,
      );
    }
  }

  _transition(newState) {
    if (this.state === newState) return;
    const prev = this.state;
    this.state = newState;
    this._log('warn', `${prev} → ${newState}`);
  }

  /**
   * Run `fn` through the circuit breaker.
   * Returns the result of fn, or `fallback` if the circuit is OPEN.
   */
  async run(fn, fallback) {
    // ── OPEN check ──────────────────────────────────────────────────────
    if (this.state === OPEN) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.currentBackoffMs) {
        // Still in the cooldown window — skip silently.
        return fallback;
      }
      // Cooldown elapsed → allow one probe call.
      this._transition(HALF_OPEN);
    }

    try {
      const result = await fn();
      // Success — reset everything.
      if (this.consecutiveFailures > 0 || this.state !== CLOSED) {
        this._log('info', `probe succeeded after ${this.consecutiveFailures} failure(s) — resetting`);
      }
      this.consecutiveFailures = 0;
      this.currentBackoffMs = this.baseBackoffMs;
      this._transition(CLOSED);
      return result;
    } catch (err) {
      this.consecutiveFailures++;
      this._log('warn', `failure #${this.consecutiveFailures}: ${err.message || err}`);

      if (this.state === HALF_OPEN || this.consecutiveFailures >= this.failThreshold) {
        // Trip the breaker — open with exponential backoff.
        this.openedAt = Date.now();
        this.currentBackoffMs = Math.min(
          this.currentBackoffMs * this.backoffMultiplier,
          this.maxBackoffMs,
        );
        this._log('warn', `OPEN for ${Math.round(this.currentBackoffMs / 1000)}s`);
        this._transition(OPEN);
      }

      return fallback;
    }
  }

  /** Introspection for health endpoints / logging. */
  getStatus() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : null,
      backoffMs: this.currentBackoffMs,
    };
  }
}

module.exports = CircuitBreaker;
module.exports.CLOSED = CLOSED;
module.exports.OPEN = OPEN;
module.exports.HALF_OPEN = HALF_OPEN;
