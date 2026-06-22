const ical = require('ical-generator').default;


const generateEventInvite = ({ uid, startTime, endTime, title, description }) => {
  const calendar = ical({ name: title });

  calendar.createEvent({
    id: uid, 
    start: new Date(startTime),
    end: new Date(endTime),
    summary: title,
    description,
  });

  return calendar.toString();
};

const generateEventCancellation = ({ uid, title, startTime, endTime, }) => {
  const calendar = ical({
    name: title,
    method: 'CANCEL',
  });

  calendar.createEvent({
    id: uid,
    start: new Date(startTime),
    end: new Date(endTime),
    summary: title,
    status: 'CANCELLED',
    sequence: 1,
  });

  return calendar.toString();
};

module.exports = {
  generateEventInvite, generateEventCancellation
};
