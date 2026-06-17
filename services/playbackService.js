export function isWithinWindow({ startAt, endAt }, now = new Date()) {
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
}

/**
 * Picks the current active assignment for an outlet.
 * Rule:
 * - must be assignment.active === true
 * - must be within date window (start/end rules)
 * - newest assignment wins (createdAt desc)
 */
export function pickActiveAssignment(assignments, now = new Date()) {
  const valid = (assignments || []).filter(
    (a) => a.active && isWithinWindow(a, now),
  );
  valid.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return valid[0] || null;
}
