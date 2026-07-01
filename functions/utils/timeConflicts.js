// Shared time-conflict utilities for scheduling operations.
// Handles sets that cross midnight by building mirrored intervals.

export function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function normalizeEndMinutes(startMinutes, endMinutes) {
  return endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
}

export function buildIntervals(start, end) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes);
  return [
    [startMinutes, normalizedEnd],
    [startMinutes + 24 * 60, normalizedEnd + 24 * 60],
  ];
}

export function intervalsOverlap(a, b) {
  return a[0] < b[1] && b[0] < a[1];
}

// Shifts start_time while preserving set duration. Handles midnight crossing.
export function computeNewEndTime(oldStart, oldEnd, newStart) {
  const fromMins = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  let dur = toMinutes(oldEnd) - toMinutes(oldStart);
  if (dur < 0) dur += 24 * 60;
  return fromMins((toMinutes(newStart) + dur) % (24 * 60));
}
