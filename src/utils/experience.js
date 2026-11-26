// src/utils/experience.js
import i18n from '../i18n';

export const BELT_RANK = {
  yellow: 1,
  orange: 2,
  green:  3,
  blue:   4,
  brown:  5,
  black:  6,
  dan1:   7, // graduated — finished all black belt techniques
};

// ⚠️ Legacy static exports — kept English for backward compatibility with
// filter logic (`=== 'Advanced'` etc.). Display code should use the
// translated helpers (`getBeltOptions`, `getExperienceLabel`) instead.
export const BELT_OPTIONS = [
  { value: 'yellow', label: 'Yellow' },
  { value: 'orange', label: 'Orange' },
  { value: 'green',  label: 'Green'  },
  { value: 'blue',   label: 'Blue'   },
  { value: 'brown',  label: 'Brown'  },
  { value: 'black',  label: 'Black'  },
  { value: 'dan1',   label: 'Dan 1 (Master)' },
];

export const BELT_EXPERIENCE = {
  yellow: 'Beginner',
  orange: 'Beginner',
  green:  'Some Experience',
  blue:   'Some Experience',
  brown:  'Advanced',
  black:  'Advanced',
  dan1:   'Master',
};

export const EXPERIENCE_OPTIONS = ['Beginner', 'Some Experience', 'Advanced', 'Master'];

// ─── Translated belt options (for use in selects / dropdowns) ───
// Returns the same shape as BELT_OPTIONS, but with translated labels.
export function getBeltOptions() {
  return BELT_OPTIONS.map(({ value }) => ({
    value,
    label: value === 'dan1'
      ? i18n.t('belts.short.dan1')
      : i18n.t(`belts.short.${value}`),
  }));
}

// ─── Experience (backward-compatible English) ───
// Kept English on purpose: existing filters compare against the English
// strings in EXPERIENCE_OPTIONS. When pages are updated, display code
// should switch to `getExperienceLabel()`.
export function getExperience(belt) {
  return BELT_EXPERIENCE[belt || 'yellow'] || 'Beginner';
}

// ─── Experience label (translated — for display) ───
const EXPERIENCE_KEY_MAP = {
  'Beginner': 'beginner',
  'Some Experience': 'some',
  'Advanced': 'advanced',
  'Master': 'master',
};

export function getExperienceLabel(belt) {
  const level = BELT_EXPERIENCE[belt || 'yellow'] || 'Beginner';
  return i18n.t(`experience.${EXPERIENCE_KEY_MAP[level] || 'beginner'}`);
}

// Belt display colors (used by Dashboard, profile ring, etc.)
export const BELT_COLORS = {
  yellow: '#f1c40f',
  orange: '#e67e22',
  green:  '#2ecc71',
  blue:   '#3498db',
  brown:  '#8B5A2B',
  black:  '#1a1a1a',
  dan1:   '#d4af37', // gold — graduation colour
};

// ─── Belt label (translated) ───
export function getBeltLabel(belt) {
  if (!belt) return i18n.t('belts.label.yellow');
  if (belt === 'dan1') return i18n.t('belts.label.dan1');
  // belt is 'yellow', 'orange', 'green', 'blue', 'brown', 'black'
  return i18n.t(`belts.label.${belt}`);
}

// ─── Time in dojo (translated) ───
export function formatTimeInDojo(dateOrTimestamp) {
  if (!dateOrTimestamp) return null;

  let startDate;
  if (typeof dateOrTimestamp === 'string') {
    startDate = new Date(dateOrTimestamp + 'T00:00:00');
  } else if (typeof dateOrTimestamp.toDate === 'function') {
    startDate = dateOrTimestamp.toDate();
  } else if (dateOrTimestamp instanceof Date) {
    startDate = new Date(dateOrTimestamp);
  } else {
    return null;
  }

  if (isNaN(startDate.getTime())) return null;

  // Normalise both to midnight for accurate day counting
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);

  if (startDate > today) return i18n.t('timeInDojo.justStarted');

  const totalDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  if (totalDays === 0) return i18n.t('timeInDojo.joinedToday');

  // Short durations: no need for years/months
  if (totalDays < 30) {
    return i18n.t('timeInDojo.unit.day', { count: totalDays });
  }

  let years = today.getFullYear() - startDate.getFullYear();
  let months = today.getMonth() - startDate.getMonth();
  let days = today.getDate() - startDate.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts = [];
  if (years > 0)  parts.push(i18n.t('timeInDojo.unit.year',  { count: years  }));
  if (months > 0) parts.push(i18n.t('timeInDojo.unit.month', { count: months }));
  if (days > 0)   parts.push(i18n.t('timeInDojo.unit.day',   { count: days   }));

  return parts.length > 0
    ? parts.join(i18n.t('timeInDojo.separator'))
    : i18n.t('timeInDojo.joinedToday');
}