'use strict';

class TaskService {
  constructor({ taskRepository }) {
    this.taskRepo = taskRepository;
  }

  async getTask (userId) {
    try {
        const task = await this.taskRepo.findByUserId(userId)
        return task
    } catch (error) {
        throw error
    }
  }
}

module.exports = TaskService