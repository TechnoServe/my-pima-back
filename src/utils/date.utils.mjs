// dateUtils.js
import moment from 'moment';

// Get the start of any week (Monday)
export function getStartOfWeek(date = moment(), weeksAgo = 0) {
  return moment(date)
    .subtract(weeksAgo, "weeks")
    .startOf("isoWeek")
    .format("YYYY-MM-DD");
}

// Get the end of any week (Sunday)
export function getEndOfWeek(date = moment(), weeksAgo = 0) {
  return moment(date)
    .subtract(weeksAgo, "weeks")
    .endOf("isoWeek")
    .format("YYYY-MM-DD");
}

// Get the range for any specific week
export function getWeekRange(weeksAgo = 0) {
  const startOfWeek = getStartOfWeek(moment(), weeksAgo);
  const endOfWeek = getEndOfWeek(moment(), weeksAgo);
  return { startOfWeek, endOfWeek };
}
