import { useContractStore } from './store';

/**
 * Formats a time according to global display preferences (12-hour vs 24-hour and timezone)
 */
export function formatTime(
  dateInput: Date | string | number = new Date(),
  customZone?: 'EST' | 'UTC' | 'LOCAL',
  customFormat?: '12H' | '24H'
): string {
  // Graceful handling during initial render/fallback
  let tz: 'EST' | 'UTC' | 'LOCAL' = 'EST';
  let fmt: '12H' | '24H' = '12H';

  try {
    const storeState = useContractStore.getState();
    tz = storeState.timeZone || 'EST';
    fmt = storeState.timeFormat || '12H';
  } catch (e) {
    // Falls back to standard default
  }

  if (customZone) tz = customZone;
  if (customFormat) fmt = customFormat;

  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;

  let timeZoneId: string | undefined;
  if (tz === 'EST') {
    timeZoneId = 'America/New_York';
  } else if (tz === 'UTC') {
    timeZoneId = 'UTC';
  } else {
    // LOCAL, so let browser default (local time zone of user)
    timeZoneId = undefined;
  }

  const is12Hour = fmt === '12H';

  try {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: is12Hour,
      timeZone: timeZoneId
    });
  } catch (e) {
    // If the timezone throws, fallback
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: is12Hour
    });
  }
}

/**
 * Formats date and time fully
 */
export function formatDateTime(
  dateInput: Date | string | number = new Date()
): string {
  let tz: 'EST' | 'UTC' | 'LOCAL' = 'EST';
  let fmt: '12H' | '24H' = '12H';

  try {
    const storeState = useContractStore.getState();
    tz = storeState.timeZone || 'EST';
    fmt = storeState.timeFormat || '12H';
  } catch (e) {
    // Falls back to standard default
  }

  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;

  let timeZoneId: string | undefined;
  if (tz === 'EST') {
    timeZoneId = 'America/New_York';
  } else if (tz === 'UTC') {
    timeZoneId = 'UTC';
  } else {
    timeZoneId = undefined;
  }

  const is12Hour = fmt === '12H';

  try {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: is12Hour,
      timeZone: timeZoneId
    });
  } catch (e) {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: is12Hour
    });
  }
}
