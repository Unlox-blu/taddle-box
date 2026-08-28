'use strict';

/**
 * Wraps an entity in a standard envelope format.
 * @param {string} itemType - The singular type of the entity (e.g. 'post', 'person', 'community')
 * @param {object} item - The entity data
 * @param {object} extra - Extra envelope metadata (e.g. score, highlight)
 * @returns {object} The enveloped item
 */
const envelopeItem = (itemType, item, extra = {}) => ({
  itemType,
  id: item.id || item._id,
  data: item,
  ...extra,
});

module.exports = { envelopeItem };
