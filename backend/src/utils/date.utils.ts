/**
 * Date and Age calculation utilities for MediBrief
 */

export function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const dobStr = typeof dob === 'string' ? dob.trim() : dob.toISOString().split('T')[0];
  if (!dobStr) return null;

  // Match YYYY-MM-DD format or ISO date prefix
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

export function formatAge(dob: string | Date | null | undefined, options?: { short?: boolean }): string {
  const age = calculateAge(dob);
  if (age === null) return 'Age not available';
  if (options?.short) {
    if (age === 0) return '< 1 yr';
    if (age === 1) return '1 yr';
    return `${age} yrs`;
  }
  if (age === 0) return '< 1 year';
  if (age === 1) return '1 year';
  return `${age} years`;
}
