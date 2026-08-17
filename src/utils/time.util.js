'use strict';

// Maps the TIME filter to a cutoff timestamp (null = all time). Values mirror
// the frontend's filter sheet: recent | past_week | past_month | past_year.
const timeToCutoff = (time) => {
  const hours = {
    recent: 24,
    past_week: 24 * 7,
    past_month: 24 * 30,
    past_year: 24 * 365,
  }[String(time || '').trim().toLowerCase()];
  return hours ? new Date(Date.now() - hours * 3600 * 1000) : null;
};

module.exports = { timeToCutoff };
