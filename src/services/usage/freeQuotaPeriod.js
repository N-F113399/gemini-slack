export function periodStart(period, now = new Date()) {
  const value = new Date(now);
  if (Number.isNaN(value.getTime())) throw new TypeError("Invalid quota date");
  if (period === "day") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (period === "month") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  if (period === "week") {
    const day = value.getUTCDay();
    value.setUTCDate(value.getUTCDate() - day);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  throw new TypeError(`Unsupported quota period: ${period}`);
}
