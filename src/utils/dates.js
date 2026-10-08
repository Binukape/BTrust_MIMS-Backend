const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function slToday() {
  return new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 10);
}

export function slNowText() {
  return new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

export function ageOn(dateOfBirth, onDate) {
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = onDate.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}
