export function periodStart(period, now = new Date()) {
  const value = new Date(now);
  if (period === "day") {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (period === "month") {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  }
  if (period === "week") {
    const day = value.getUTCDay();
    value.setUTCDate(value.getUTCDate() - day);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  throw new TypeError(`Unsupported quota period: ${period}`);
}
