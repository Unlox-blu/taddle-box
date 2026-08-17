'use strict';

// Reused cross-module repositories so the spotlight payload doesn't duplicate
// the event/game ranking logic (both are read-only queries, no cycles).
const eventRepository = require('../event/event.repository');
const gameRepository = require('../game/game.repository');

class HighlightService {
  constructor({ highlightRepository }) {
    this.highlightRepo = highlightRepository;
  }

  // One round-trip for the Home spotlight: curated spotlight rows PLUS
  // featured events and trending games, so the app's carousel doesn't fan out
  // to /events/discover + /game/trending separately. The event query reuses
  // the discover scope='featured' filter (is_featured = true, not deleted,
  // upcoming/ongoing, soonest first).
  async getSpotligth({limit, offset}) {
    try {
      const [spotlightRes, eventsRes, gamesRes] = await Promise.all([
        this.highlightRepo.getSpotLight(limit, offset),
        eventRepository.search('', null, 3, 0, null, 'featured'),
        gameRepository.getTrendingGames({ limit: 3 }),
      ]);

      return {
        spotlight: spotlightRes.spotligth,
        total: spotlightRes.total,
        featuredEvents: eventsRes.event || [],
        trendingGames: gamesRes || [],
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = HighlightService;
