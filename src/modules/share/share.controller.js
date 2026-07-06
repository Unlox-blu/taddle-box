'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class ShareController {
  constructor({ shareService }) {
    this.shareSvc = shareService;
  }

  getPost = async (req, res, next) => {
    try {
        const userId = req.userId
        const {postId} = req.params
        const post = await this.shareSvc.getPost({userId, postId})
        res.json(apiResponse(post, 'Post fetched successfully'))
    } catch (error) {
        next(error)
    }
  }  

  getProfile = async (req, res, next) => {
    try {
        const userId = req.userId
        const {profileId} = req.params
        const profile = await this.shareSvc.getProfile({userId, profileId})
        res.json(apiResponse(profile, 'Profile fetched successfully'))
    } catch (error) {
        next(error)
    }
  }

  getEvent = async (req, res, next) => {
    try {
        const userId = req.userId
        const {eventId} = req.params
        const event = await this.shareSvc.getEvent({userId, eventId})
        res.json(apiResponse(event, 'Event fetched successfully'))
    } catch (error) {
        next(error)
    }
  }

  getCommunity = async (req, res, next) => {
    try {
        const userId = req.userId
        const {communityId} = req.params
        const community = await this.shareSvc.getCommunity({userId, communityId})
        res.json(apiResponse(community, 'Community fetched successfully'))
    } catch (error) {
        next(error)
    }
  }  

}


module.exports = ShareController