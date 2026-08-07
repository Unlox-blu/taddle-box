'use strict';

const { createError } = require("../../utils/error.util");
const { getPaginationParams } = require("../../utils/pagination.util");

class SearchService {
  constructor({searchRepository}) {
    this.searchRepo = searchRepository;
  }

  async search({type, query, filter, limit, offset, page, userId = null}) {
    try {
      switch(type){
        case 'people' : 
          {
            if(!query)
              return await this.discoverPeople({userId, page, limit, offset})

            const {rows, total} = await this.searchRepo.searchUser(query, limit, offset)
            return {dataType: type, data: rows, total };
          }

        case 'communities' : 
          {
            if(!query && !filter)
              return await this.discoverCommunity({userId, page, limit, offset});
            
            const { rows, total } = await this.searchRepo.searchCommunity(query, filter, limit, offset);
            return { dataType: type, data: rows, total };
          }

        case 'events' :
          {
            if(!query && !filter)
              return await this.discoverEvents ({limit, offset});

            const { rows, total } = await this.searchRepo.searchEvent(query, filter, limit, offset);
            return { dataType: type, data: rows, total };
          }

        case 'games' :
          {
            if(!query)
              return await this.discoverGames ({limit, offset});

            const { rows, total } = await this.searchRepo.searchGame(query, limit, offset);
            return { dataType: type, data: rows, total };
          }

        case 'all' :
          {
            if(!query && !filter)
              return this.discoverAll(limit = 10, offset = 0, page = 1, userId)
            
            return this.searchAll(query, filter, limit, offset, userId);
          }
        
        case 'posts' :
          {
            if(!query)
              return this.discoverPost ({userId, limit, offset});

            const { rows, total } = await this.searchRepo.searchPost(query, limit, offset, userId);
            return { dataType: 'posts', data: rows, total };
          }

        default:
          {
            throw createError("Search type not found", 404)
          }
      }
    } catch (error) {
      throw error;
    }
  }

  // Combined search used by the app's "All" tab. Runs every entity search in
  // parallel server-side (previously the client fired 4-5 concurrent requests)
  // and caps each group to a small preview count. When the query is empty the
  // individual searches already return their top/trending content, which the
  // app renders as a "Discoveries" landing for the search screen.
  async searchAll(query, filter, limit = 10, offset = 0, userId = null) {
    try {
      const perTypeLimit = Math.min(Math.max(limit, 3), 8);
      const [people, communities, events, games, posts, hashtags] = await Promise.all([
        this.searchRepo.searchUser(query, perTypeLimit, offset),
        this.searchRepo.searchCommunity(query, filter, perTypeLimit, offset),
        this.searchRepo.searchEvent(query, filter, perTypeLimit, offset),
        this.searchRepo.searchGame(query, perTypeLimit, offset),
        this.searchRepo.searchPost(query, perTypeLimit, offset, userId),
        this.searchRepo.getHashtags(query),
      ]);

      return {
        dataType: 'all',
        data: {
          people: people.rows,
          communities: communities.rows,
          events: events.rows,
          games: games.rows,
          posts: posts.rows,
          hashtags: hashtags,
        },
        total: people.total + communities.total + events.total + games.total + posts.total,
      };
    } catch (error) {
      throw error;
    }
  }

  async discoverAll(limit = 10, offset = 0, page = 1, userId) {
    try {
      const perTypeLimit = Math.min(Math.max(limit, 3), 8);
      const [people, communities, events, games, posts, hashtags] = await Promise.all([
        this.discoverPeople ({userId, page, perTypeLimit, offset}),
        this.discoverCommunity ({userId, page, perTypeLimit, offset}),
        this.discoverEvents ({perTypeLimit, offset}),
        this.discoverGames ({perTypeLimit, offset}),
        this.discoverPost ({userId, perTypeLimit, offset}),
        this.getHashtags(),
      ]);

      return {
        dataType: 'all',
        data: {
          people: people.data,
          communities: communities.data,
          events: events.data,
          games: games.data,
          posts: posts.data,
          hashtags: hashtags,
        },
        total: people.total + communities.total + events.total + games.total + posts.total,
      };
    } catch (error) {
      throw error;
    }
  }

  async discoverPost ({userId, limit, offset}) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId)
      const interests = userInterests.map(item =>  item.replace(/^\p{Extended_Pictographic}\s*/u, ''));

      const { rows, total } = await this.searchRepo.discoverPost({userId, interests, limit, offset})
      return { dataType: 'posts', data: rows, total };
    } catch (error) {
      throw error
    }
  }

  async discoverCommunity ({userId, page, limit, offset}) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId)
      const interests = userInterests.map(item =>  item.replace(/^\p{Extended_Pictographic}\s*/u, ''));
      const communityId = await this.getFollowingCommunityIds({userId, page})

      const { rows, total } = await this.searchRepo.discoverCommunity({ interests, communityId, limit, offset})
      return { dataType: 'communities', data: rows, total };
    } catch (error) {
      throw error
    }
  }

  async discoverPeople ({userId, page, limit, offset}) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId)
      const interests = userInterests.map(item =>  item.replace(/^\p{Extended_Pictographic}\s*/u, ''));
      const followingId = await this.getFollowingUserIds({userId, page})

      const { rows, total } = await this.searchRepo.discoverPeople({ interests, userId, followingId, limit, offset})
      return { dataType: 'people', data: rows, total };
    } catch (error) {
      throw error
    }
  }

  async discoverEvents ({limit, offset}) {
    try {
        const { rows, total } = await this.searchRepo.searchEvent('', '', limit, offset);
        return { dataType: "events", data: rows, total };
    } catch (error) {
      throw error
    }
  }

  async discoverGames ({limit, offset}) {
    try {
        const { rows, total } = await this.searchRepo.searchGame('', limit, offset);
        return { dataType: 'games', data: rows, total };
    } catch (error) {
      throw error
    }
  }

  async getHashtags(q = '') {
    try {
      return await this.searchRepo.getHashtags(q);
    } catch (error) {
      throw error;
    }
  }

  
  async getFollowingUserIds({userId, page}) {
    try {
      const { limit, offset } = getPaginationParams({page})
      const {total, followings} = await this.searchRepo.findFollowers(userId, limit, offset)
      const followingId = followings.map(ele => ele.followingid)
      return followingId
    } catch (error) {
      throw error
    }
  }

  
  async getFollowingCommunityIds({userId, page}) {
    try {
      const { limit, offset } = getPaginationParams({page})
      const {total, communities} = await this.searchRepo.findFollowingCommunity(userId, limit, offset)
      const communityId = communities.map(ele => ele.communityid)
      return communityId
    } catch (error) {
      throw error
    }
  }
}

module.exports = SearchService;
