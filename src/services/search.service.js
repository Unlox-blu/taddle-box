'use strict';
const UserModel = require('../models/user.model');
const CommunityModel = require('../models/community.model')
const EventModel = require('../models/event.model')
const PostModel = require('../models/post.model')

class SearchService {
  constructor({userRepository, postRepository, communityRepository, eventRepository}) {
    this.userRepo = userRepository;
    this.postRepo = postRepository;
    this.communityRepo = communityRepository;
    this.eventRepo = eventRepository;
  }

  async search({type, query, filter, limit, offset}) {
    try {
      switch(type){
        case 'people' : 
          {
            const {rows, total} = await this.userRepo.search(query, limit, offset)
            return {dataType: type, data: rows.map(UserModel.format), total };
          }

        case 'communities' : 
          {
              const { rows, total } = await this.communityRepo.search(query, filter, limit, offset);
              return { dataType: type, data: rows.map(CommunityModel.format), total };
          }

        case 'events' :
          {
            const { rows, total } = await this.eventRepo.search(query, filter, limit, offset);
            return { dataType: type, data: rows.map(EventModel.format), total };
          }

        default:
          {
            const { rows, total } = await this.postRepo.search(query, limit, offset);
            return { dataType: 'posts', data: rows.map(PostModel.format), total };
          }
      }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SearchService;
