'use strict';

const { createError } = require('../../utils/error.util');

class SharekService {
  constructor({ shareRepository }) {
    this.shareRepo = shareRepository;
  }

  async getPost ({userId, postId}) {
    try {
        const post = await this.shareRepo.findPost(postId)
        if(!post )
            throw createError("Post not found", 404)

        const authorId = post.author.id

        const author = await this.shareRepo.findUser(authorId)

        if(!author)
            throw createError("Post not found", 404)

        if(author.privacy !== 'public') {
            if(!userId)
                throw createError("You are not authorized", 403)
            
            const isFollow = await this.shareRepo.findByFollowerIdAndFollowingId(userId, authorId)

            if(!isFollow)
                throw createError("You are not authorized to view post of this private account", 403);
        }

        return post
    } catch (error) {
        throw error
    }
  }

  async getProfile ({userId, profileId}) {
    try {
        const user = await this.shareRepo.findUser(profileId)
        
        if(!user )
            throw createError("user not found", 404)

        return user
    } catch (error) {
        throw error
    }
  }

  async getEvent ({userId, eventId}) {
    try {
        const event = await this.shareRepo.findEvent(eventId)
        
        if(!event )
            throw createError("event not found", 404)

        return event
    } catch (error) {
        throw error
    }
  }

  async getCommunity ({userId, communityId}) {
    try {
        const community = await this.shareRepo.findCommunity(communityId)
        
        if(!community )
            throw createError("community not found", 404)

        return community
    } catch (error) {
        throw error
    }
  }

}

module.exports = SharekService