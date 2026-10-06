/**
 * Date and Age calculation utilities for MediBrief frontend
 */

/**
 * Accurately calculates current age in completed years based on Date of Birth.
 * Accurately accounts for leap years, month boundaries, and current date.
 * Returns null if Date of Birth is missing, invalid, or in the future.
 */
export function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const dobStr = typeof dob === 'string' ? dob.trim() : dob.toISOString().split('T')[0];
  if (!dobStr) return null;

  // Match YYYY-MM-DD or ISO string prefix
  const match = dobStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let birthYear: number;
  let birthMonth: number; // 0-indexed
  let birthDay: number;

  if (match) {
    birthYear = parseInt(match[1], 10);
    birthMonth = parseInt(match[2], 10) - 1;
    birthDay = parseInt(match[3], 10);
  } else {
    const d = new Date(dobStr);
    if (isNaN(d.getTime())) return null;
    birthYear = d.getFullYear();
    birthMonth = d.getMonth();
    birthDay = d.getDate();
  }

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  // Guard against future dates
  if (
    birthYear > currentYear ||
    (birthYear === currentYear && birthMonth > currentMonth) ||
    (birthYear === currentYear && birthMonth === currentMonth && birthDay > currentDay)
  ) {
    return null;
  }

  let age = currentYear - birthYear;
  const monthDiff = currentMonth - birthMonth;

  if (monthDiff < 0 || (monthDiff === 0 && currentDay < birthDay)) {
    age--;
  }

  return age >= 0 ? age : null;
}

/**
 * Formats age dynamically derived from Date of Birth.
 * If DOB is unavailable or invalid, returns "Age not available".
 * 
 * Examples:
 * - 19 -> "19 years" (or "19 yrs" if short)
 * - 1 -> "1 year" (or "1 yr" if short)
 * - 0 -> "< 1 year" (or "< 1 yr" if short)
 * - null -> "Age not available"
 */
export function formatAge(
  dob: string | Date | null | undefined, 
  options?: { short?: boolean; prefix?: boolean }
): string {
  const age = calculateAge(dob);
  if (age === null) {
    return 'Age not available';
  }

  let label = '';
  if (options?.short) {
    if (age === 0) label = '< 1 yr';
    else if (age === 1) label = '1 yr';
    else label = `${age} yrs`;
  } else {
    if (age === 0) label = '< 1 year';
    else if (age === 1) label = '1 year';
    else label = `${age} years`;
  }

  return options?.prefix ? `Age: ${label}` : label;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 * for setting HTML5 date input max attribute.
 */
export function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string (YYYY-MM-DD) into a human-friendly format (e.g., "15 Aug 2007")
 */
export function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return dateStr;

  const year = parseInt(match[1], 10);
  const monthIndex = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[monthIndex] || ''} ${year}`;
}
