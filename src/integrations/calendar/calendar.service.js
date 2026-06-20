const ical = require('ical-generator').default;


const generateEventInvite = ({ startTime, endTime, title, description }) => {
  const calendar = ical({ name: title });

  calendar.createEvent({
    start: new Date(startTime),
    end: new Date(endTime),
    summary: title,
    description,
  });

  return calendar.toString();
};

module.exports = {
  generateEventInvite,
};
