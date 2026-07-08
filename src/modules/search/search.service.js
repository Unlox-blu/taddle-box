'use strict';

class SearchService {
  constructor({searchRepository}) {
    this.searchRepo = searchRepository;
  }

  async search({type, query, filter, limit, offset}) {
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

        default:
          {
            const { rows, total } = await this.searchRepo.searchPost(query, limit, offset);
            return { dataType: 'posts', data: rows, total };
          }
      }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SearchService;
