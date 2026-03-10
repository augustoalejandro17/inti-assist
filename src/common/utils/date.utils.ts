/**
 * Date utility functions for the tracker
 */

/**
 * Get the start of today in a specific timezone
 */
export function getStartOfDay(date: Date = new Date(), timezone = "UTC"): Date {
  // Get the date string in the target timezone (YYYY-MM-DD format)
  const formatted = date.toLocaleDateString("en-CA", { timeZone: timezone });
  // Get the timezone offset to create a proper local midnight
  const localMidnight = new Date(`${formatted}T00:00:00`);

  // Calculate the offset between target timezone and local
  const tzDate = new Date(
    localMidnight.toLocaleString("en-US", { timeZone: timezone }),
  );
  const utcDate = new Date(
    localMidnight.toLocaleString("en-US", { timeZone: "UTC" }),
  );
  const offset = utcDate.getTime() - tzDate.getTime();

  return new Date(localMidnight.getTime() + offset);
}

/**
 * Get the end of today in a specific timezone
 */
export function getEndOfDay(date: Date = new Date(), timezone = "UTC"): Date {
  const formatted = date.toLocaleDateString("en-CA", { timeZone: timezone });
  const localEndOfDay = new Date(`${formatted}T23:59:59.999`);

  const tzDate = new Date(
    localEndOfDay.toLocaleString("en-US", { timeZone: timezone }),
  );
  const utcDate = new Date(
    localEndOfDay.toLocaleString("en-US", { timeZone: "UTC" }),
  );
  const offset = utcDate.getTime() - tzDate.getTime();

  return new Date(localEndOfDay.getTime() + offset);
}

/**
 * Format date for display
 */
export function formatDate(date: Date, locale = "es-AR"): string {
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
