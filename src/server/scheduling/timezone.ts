function partsFor(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function zonedLocalDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("Invalid appointment date/time.");

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? "0"),
  };
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  if (!Number.isFinite(targetUtc)) throw new Error("Invalid appointment date/time.");

  let guess = targetUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = partsFor(new Date(guess), timeZone);
    const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
    guess += targetUtc - renderedAsUtc;
  }

  const result = new Date(guess);
  const verify = partsFor(result, timeZone);
  const matches = verify.year === target.year
    && verify.month === target.month
    && verify.day === target.day
    && verify.hour === target.hour
    && verify.minute === target.minute
    && verify.second === target.second;
  if (!matches) throw new Error("The requested local appointment time is invalid in the workspace timezone.");
  return result;
}

export function zonedDateTimeParts(date: Date, timeZone: string) {
  return partsFor(date, timeZone);
}
