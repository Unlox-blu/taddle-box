'use strict';

/**
 * CommandValidator — validates command payloads against plugin schemas,
 * enforces kill switches, and checks for secrets in game state.
 *
 * Security pipeline entry point: every command goes through this
 * BEFORE reaching the plugin.
 */

const EVENT_TYPES = require('./EventTypes');

// ── Kill Switch State ─────────────────────────────────────────────────────
const killSwitches = {
  games: {},        // { 'chess': true } → disable chess
  runtimes: {},     // { 'web-v1': true } → disable all web games
  versions: {},     // { 'ludo@2': true } → disable ludo v2
};

// ── Sensitive Patterns ────────────────────────────────────────────────────
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /credential/i,
  /private[_-]?key/i,
  /authorization/i,
  /bearer/i,
  /token[_-]?secret/i,
  /database[_-]?url/i,
  /connection[_-]?string/i,
];

class CommandValidator {
  /**
   * Validate a command payload against the plugin's COMMAND_SCHEMAS.
   * Returns { valid: boolean, reason?: string }.
   */
  static validateSchema(plugin, commandType, payload) {
    const schemas = plugin.constructor.COMMAND_SCHEMAS;
    if (!schemas) return { valid: true }; // No schemas defined → skip validation
    if (!schemas[commandType]) {
      return { valid: false, reason: `Unknown command type: ${commandType}` };
    }

    const schema = schemas[commandType];
    if (!schema || Object.keys(schema).length === 0) return { valid: true };

    for (const [field, expectedType] of Object.entries(schema)) {
      const value = payload[field];
      if (value === undefined) {
        return { valid: false, reason: `Missing required field: ${field}` };
      }
      if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          return { valid: false, reason: `Invalid type for ${field}: expected array` };
        }
      } else if (typeof value !== expectedType) {
        return { valid: false, reason: `Invalid type for ${field}: expected ${expectedType}` };
      }
    }

    // Check payload size
    const size = Buffer.byteLength(JSON.stringify(payload));
    const maxSize = plugin.constructor.SECURITY_POLICY?.maxPayloadBytes || 4096;
    if (size > maxSize) {
      return { valid: false, reason: `Payload too large: ${size} > ${maxSize}` };
    }

    return { valid: true };
  }

  /**
   * Check if a game is killed (disabled by admin).
   */
  static isKilled(gameSlug, runtime = null, version = null) {
    if (killSwitches.games[gameSlug]) return true;
    if (runtime && killSwitches.runtimes[runtime]) return true;
    if (gameSlug && version && killSwitches.versions[`${gameSlug}@${version}`]) return true;
    return false;
  }

  /**
   * Activate a kill switch.
   */
  static activateKillSwitch(type, key) {
    if (type === 'game') killSwitches.games[key] = true;
    else if (type === 'runtime') killSwitches.runtimes[key] = true;
    else if (type === 'version') killSwitches.versions[key] = true;
    console.error(`[KILL SWITCH] Activated: ${type}=${key}`);
  }

  /**
   * Deactivate a kill switch.
   */
  static deactivateKillSwitch(type, key) {
    if (type === 'game') delete killSwitches.games[key];
    else if (type === 'runtime') delete killSwitches.runtimes[key];
    else if (type === 'version') delete killSwitches.versions[key];
    console.info(`[KILL SWITCH] Deactivated: ${type}=${key}`);
  }

  /**
   * Get current kill switch state.
   */
  static getKillSwitches() {
    return { ...killSwitches };
  }

  /**
   * Assert game state does not contain secrets.
   * Throws if sensitive data found.
   */
  static assertNoSecrets(state) {
    const serialized = JSON.stringify(state);
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(serialized)) {
        throw new Error(`State contains sensitive data matching: ${pattern}`);
      }
    }
  }

  /**
   * Full security pipeline check for a command.
   * Returns { allowed: boolean, reason?: string }.
   */
  static checkCommand(plugin, gameSlug, commandType, payload, userId) {
    // 1. Kill switch
    if (this.isKilled(gameSlug)) {
      return { allowed: false, reason: 'Game temporarily disabled' };
    }

    // 2. Schema validation
    const schemaResult = this.validateSchema(plugin, commandType, payload);
    if (!schemaResult.valid) {
      return { allowed: false, reason: schemaResult.reason };
    }

    // 3. Rate limit is handled separately (Redis Lua script)

    // 4. Idempotency is handled separately (EventStore.reserveCommand)

    return { allowed: true };
  }
}

module.exports = CommandValidator;
