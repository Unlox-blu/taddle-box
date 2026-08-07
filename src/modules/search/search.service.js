'use strict';

class SearchService {
  constructor({searchRepository}) {
    this.searchRepo = searchRepository;
  }

  async search({type, query, filter, limit, offset, userId = null}) {
    try {
      switch(type){
        case 'people' : 
          {
            const {rows, total} = await this.searchRepo.searchUser(query, limit, offset)
            return {dataType: type, data: rows, total };
          }

        case 'communities' : 
          {
              const { rows, total } = await this.searchRepo.searchCommunity(query, filter, limit, offset);
              return { dataType: type, data: rows, total };
          }

        case 'events' :
          {
            const { rows, total } = await this.searchRepo.searchEvent(query, filter, limit, offset);
            return { dataType: type, data: rows, total };
          }

        case 'games' :
          {
            const { rows, total } = await this.searchRepo.searchGame(query, limit, offset);
            return { dataType: type, data: rows, total };
          }

        case 'all' :
          {
            return this.searchAll(query, filter, limit, offset, userId);
          }

        default:
          {
            const { rows, total } = await this.searchRepo.searchPost(query, limit, offset, userId);
            return { dataType: 'posts', data: rows, total };
          }
      }
    } catch (error) {
      throw error;
    }
  }

  async discover({type, query, filter, limit, offset, userId = null}) {
    try {
      switch(type){
        case 'people' : 
          {
            return await this.discoverPeople({userId, limit, offset})
          }

        case 'communities' : 
          {
              return await this.discoverCommunity({userId, limit, offset});
          }

        case 'events' :
          {
            return await this.discoverEvents ({limit, offset});
          }

        case 'games' :
          {
            return await this.discoverGames ({limit, offset});
          }

        case 'posts' :
          {
            return this.discoverPost ({userId, limit, offset});
          }
          
        default:
          {
              return this.searchAll(query, filter, limit, offset, userId);
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

  async discoverCommunity ({userId, limit, offset}) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId)
      const interests = userInterests.map(item =>  item.replace(/^\p{Extended_Pictographic}\s*/u, ''));

      const { rows, total } = await this.searchRepo.discoverCommunity({ interests, limit, offset})
      return { dataType: 'communities', data: rows, total };
    } catch (error) {
      throw error
    }
  }

  async discoverPeople ({userId, limit, offset}) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId)
      const interests = userInterests.map(item =>  item.replace(/^\p{Extended_Pictographic}\s*/u, ''));

      const { rows, total } = await this.searchRepo.discoverPeople({ interests, limit, offset})
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
        return { dataType: type, data: rows, total };
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
}

module.exports = SearchService;
