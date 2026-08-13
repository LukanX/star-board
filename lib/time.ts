export const rollingSevenDaysMs = 7 * 24 * 60 * 60 * 1000;

export function getRollingSevenDaysStart(now = Date.now()) {
  return new Date(now - rollingSevenDaysMs);
}
