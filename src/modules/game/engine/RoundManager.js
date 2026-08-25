'use strict';

/**
 * RoundManager — manages per-round lifecycle within a match.
 *
 * Architecture:
 *   - Rounds are created ON DEMAND (not upfront) so each round can
 *     have its own config/assets from the plugin.
 *   - Strict state machine: WAITING → LOADING → READY → ACTIVE → FINISHED
 *   - Every round has a UUID (roundId) for event correlation.
 *   - Single-round games still create a RoundContext internally (total=1),
 *     the frontend hides the label when total === 1.
 *
 * Core invariant:
 *   one round at a time per match.
 *   next round created only after current round finishes.
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const pool = require('../../../config/db');

// ── Round Lifecycle States ──────────────────────────────────────────────

const ROUND_STATES = {
  WAITING:  'WAITING',   // created, waiting for asset loading
  LOADING:  'LOADING',   // clients downloading assets
  READY:    'READY',     // all clients confirmed ready
  ACTIVE:   'ACTIVE',    // round in progress
  FINISHED: 'FINISHED',  // round completed
};

class RoundManager {
  // ── Create ──────────────────────────────────────────────────────────

  /**
   * Create the next round for a match.
   * Called by MatchManager when the previous round finishes
   * or when the match first starts.
   *
   * @param {string} matchId
   * @param {number} configuredRounds - total rounds for the match
   * @param {Object} plugin - game plugin instance
   * @param {Object} matchState - current match state (for plugin context)
   * @returns {Object|null} RoundContext or null if no more rounds
   */
  static async createNextRound(matchId, configuredRounds, plugin, matchState) {
    const currentRound = await RoundManager.getCurrentRound(matchId);
    const nextNumber = currentRound ? currentRound.round_number + 1 : 1;

    // No more rounds
    if (nextNumber > configuredRounds) return null;

    // Ask plugin for this round's definition (config, assets, etc.)
    const definition = typeof plugin.getRoundDefinition === 'function'
      ? plugin.getRoundDefinition(nextNumber, configuredRounds, matchState)
      : {
          config: matchState.configSnapshot || {},
          assetSetId: matchState.assetSetId || null,
          assetManifestVersion: matchState.assetManifestVersion || 1,
        };

    const roundId = crypto.randomUUID();

    const { rows } = await pool.query(`
      INSERT INTO game_rounds 
        (id, match_id, round_number, status, config_snapshot, 
         asset_set_id, asset_manifest_version)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      roundId,
      matchId,
      nextNumber,
      ROUND_STATES.WAITING,
      JSON.stringify(definition.config || {}),
      definition.assetSetId || null,
      definition.assetManifestVersion || 1,
    ]);

    // Update match pointer
    await pool.query(`
      UPDATE game_matches 
      SET current_round_number = $1, current_round_id = $2, updated_at = NOW()
      WHERE id = $3
    `, [nextNumber, roundId, matchId]);

    return RoundManager._toRoundContext(rows[0], configuredRounds);
  }

  // ── Status transitions ─────────────────────────────────────────────

  /**
   * Update round status. Enforces valid transitions.
   */
  static async updateStatus(roundId, newStatus) {
    const validTransitions = {
      [ROUND_STATES.WAITING]:  [ROUND_STATES.LOADING],
      [ROUND_STATES.LOADING]:  [ROUND_STATES.READY],
      [ROUND_STATES.READY]:    [ROUND_STATES.ACTIVE],
      [ROUND_STATES.ACTIVE]:   [ROUND_STATES.FINISHED],
    };

    // Get current status
    const { rows } = await pool.query(
      'SELECT status FROM game_rounds WHERE id = $1', [roundId]
    );
    if (!rows[0]) throw new Error(`Round ${roundId} not found`);

    const currentStatus = rows[0].status;
    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}`);
    }

    const updates = { status: newStatus, updated_at: new Date() };
    if (newStatus === ROUND_STATES.ACTIVE) updates.started_at = new Date();
    if (newStatus === ROUND_STATES.FINISHED) updates.finished_at = new Date();

    await pool.query(`
      UPDATE game_rounds 
      SET status = $1, started_at = COALESCE($2, started_at), 
          finished_at = COALESCE($3, finished_at), updated_at = NOW()
      WHERE id = $4
    `, [newStatus, updates.started_at || null, updates.finished_at || null, roundId]);
  }

  /**
   * Mark round as LOADING (server created definition, sending to clients).
   */
  static async markLoading(roundId) {
    return RoundManager.updateStatus(roundId, ROUND_STATES.LOADING);
  }

  /**
   * Mark round as READY (all clients confirmed asset loading).
   */
  static async markReady(roundId) {
    return RoundManager.updateStatus(roundId, ROUND_STATES.READY);
  }

  /**
   * Mark round as ACTIVE (server started the round).
   */
  static async markActive(roundId) {
    return RoundManager.updateStatus(roundId, ROUND_STATES.ACTIVE);
  }

  /**
   * Mark round as FINISHED and store result.
   */
  static async markFinished(roundId, resultSnapshot) {
    await pool.query(`
      UPDATE game_rounds 
      SET status = $1, result_snapshot = $2, finished_at = NOW(), updated_at = NOW()
      WHERE id = $3
    `, [ROUND_STATES.FINISHED, JSON.stringify(resultSnapshot || {}), roundId]);
  }

  // ── Queries ────────────────────────────────────────────────────────

  /**
   * Get the current round for a match (ACTIVE or WAITING/LOADING/READY).
   */
  static async getCurrentRound(matchId) {
    const { rows } = await pool.query(`
      SELECT * FROM game_rounds 
      WHERE match_id = $1 AND status != 'FINISHED'
      ORDER BY round_number ASC LIMIT 1
    `, [matchId]);
    return rows[0] || null;
  }

  /**
   * Get all rounds for a match (for replay/reconnect).
   */
  static async getRounds(matchId) {
    const { rows } = await pool.query(`
      SELECT * FROM game_rounds WHERE match_id = $1 ORDER BY round_number
    `, [matchId]);
    return rows;
  }

  /**
   * Get a specific round by ID.
   */
  static async getRoundById(roundId) {
    const { rows } = await pool.query(
      'SELECT * FROM game_rounds WHERE id = $1', [roundId]
    );
    return rows[0] || null;
  }

  /**
   * Get the round number for a match.
   */
  static async getCurrentRoundNumber(matchId) {
    const { rows } = await pool.query(`
      SELECT current_round_number FROM game_matches WHERE id = $1
    `, [matchId]);
    return rows[0]?.current_round_number || 1;
  }

  /**
   * Check if all required players are READY for a round.
   */
  static async allPlayersReady(roundId, requiredCount, readyPlayerIds) {
    return readyPlayerIds.length >= requiredCount;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /**
   * Convert DB row to RoundContext for socket events.
   */
  static _toRoundContext(row, totalRounds) {
    if (!row) return null;
    return {
      roundId: row.id,
      number: row.round_number,
      total: totalRounds,
      status: row.status,
      config: row.config_snapshot || {},
      assetSetId: row.asset_set_id,
      assetManifestVersion: row.asset_manifest_version,
      stateRevision: row.state_revision || 0,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    };
  }

  /**
   * Get full RoundContext for a match (for FULL_SYNC response).
   */
  static async getRoundContext(matchId) {
    const match = await pool.query(
      'SELECT configured_rounds, current_round_number FROM game_matches WHERE id = $1',
      [matchId]
    );
    if (!match.rows[0]) return null;

    const total = match.rows[0].configured_rounds;
    const current = await RoundManager.getCurrentRound(matchId);
    return RoundManager._toRoundContext(current, total);
  }
}

RoundManager.STATES = ROUND_STATES;

module.exports = RoundManager;
