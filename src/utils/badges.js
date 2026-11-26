// src/utils/badges.js
// ─────────────────────────────────────────────────────────────
// Shared badge definitions + XP math.
// Used by:
//   • src/pages/Rewards.jsx     — renders the badge grid
//   • src/pages/Competition.jsx — computes each student's XP
//
// Keeping this in one place means the two pages can never disagree
// about how much XP a badge is worth.
// ─────────────────────────────────────────────────────────────

export const RARITY = {
  common:    { color: '#8b9ba8', xp: 10,  weight: 1 },
  rare:      { color: '#3498db', xp: 25,  weight: 2 },
  epic:      { color: '#9b59b6', xp: 50,  weight: 3 },
  legendary: { color: '#d4af37', xp: 100, weight: 4 },
};

export const BADGES = [
  { id: 'first_step', category: 'progression', rarity: 'common', icon: '👣',
    compute: (s) => ({ current: Math.min(s.completedCount, 1), target: 1, earned: s.completedCount >= 1 }) },

  { id: 'yellow_warrior', category: 'progression', rarity: 'common', icon: '🟡',
    compute: (s) => {
      const b = s.beltStats.yellow || { total: 0, completed: 0 };
      const allDone = b.total > 0 && b.completed === b.total;
      const validated = s.validatedBelts.has('yellow');
      return { current: b.completed, target: b.total, earned: allDone && validated, awaitingValidation: allDone && !validated };
    } },

  { id: 'orange_horizon', category: 'progression', rarity: 'rare', icon: '🟠',
    compute: (s) => {
      const b = s.beltStats.orange || { total: 0, completed: 0 };
      const allDone = b.total > 0 && b.completed === b.total;
      const validated = s.validatedBelts.has('orange');
      return { current: b.completed, target: b.total, earned: allDone && validated, awaitingValidation: allDone && !validated };
    } },

  { id: 'green_path', category: 'progression', rarity: 'rare', icon: '🟢',
    compute: (s) => {
      const b = s.beltStats.green || { total: 0, completed: 0 };
      const allDone = b.total > 0 && b.completed === b.total;
      const validated = s.validatedBelts.has('green');
      return { current: b.completed, target: b.total, earned: allDone && validated, awaitingValidation: allDone && !validated };
    } },

  { id: 'blue_depths', category: 'progression', rarity: 'epic', icon: '🔵',
    compute: (s) => {
      const b = s.beltStats.blue || { total: 0, completed: 0 };
      const allDone = b.total > 0 && b.completed === b.total;
      const validated = s.validatedBelts.has('blue');
      return { current: b.completed, target: b.total, earned: allDone && validated, awaitingValidation: allDone && !validated };
    } },

  { id: 'brown_foundation', category: 'progression', rarity: 'epic', icon: '🟤',
    compute: (s) => {
      const b = s.beltStats.brown || { total: 0, completed: 0 };
      const allDone = b.total > 0 && b.completed === b.total;
      const validated = s.validatedBelts.has('brown');
      return { current: b.completed, target: b.total, earned: allDone && validated, awaitingValidation: allDone && !validated };
    } },

  { id: 'black_mastery', category: 'progression', rarity: 'legendary', icon: '⚫',
    compute: (s) => {
      const b = s.beltStats.black || { total: 0, completed: 0 };
      const allDone = b.total > 0 && b.completed === b.total;
      const validated = s.validatedBelts.has('black');
      return { current: b.completed, target: b.total, earned: allDone && validated, awaitingValidation: allDone && !validated };
    } },

  { id: 'dan_1_master', category: 'progression', rarity: 'legendary', icon: '🎖️',
    compute: (s) => ({ current: s.belt === 'dan1' ? 1 : 0, target: 1, earned: s.belt === 'dan1' }) },

  { id: 'welcome_aboard', category: 'dedication', rarity: 'common', icon: '🏯',
    compute: () => ({ current: 1, target: 1, earned: true }) },
  { id: 'consistent_samurai', category: 'dedication', rarity: 'common', icon: '⚔️',
    compute: (s) => ({ current: Math.min(s.longestStreak, 5), target: 5, earned: s.longestStreak >= 5 }) },
  { id: 'week_warrior', category: 'dedication', rarity: 'common', icon: '📅',
    compute: (s) => ({ current: Math.min(s.longestStreak, 7), target: 7, earned: s.longestStreak >= 7 }) },
  { id: 'fortnight_fighter', category: 'dedication', rarity: 'rare', icon: '🗓️',
    compute: (s) => ({ current: Math.min(s.longestStreak, 14), target: 14, earned: s.longestStreak >= 14 }) },
  { id: 'monthly_master', category: 'dedication', rarity: 'epic', icon: '🌙',
    compute: (s) => ({ current: Math.min(s.longestStreak, 30), target: 30, earned: s.longestStreak >= 30 }) },
  { id: 'century_club', category: 'dedication', rarity: 'legendary', icon: '💯',
    compute: (s) => ({ current: Math.min(s.longestStreak, 100), target: 100, earned: s.longestStreak >= 100 }) },

  { id: 'quiz_rookie', category: 'performance', rarity: 'common', icon: '📝',
    compute: (s) => ({ current: Math.min(s.quizCount, 1), target: 1, earned: s.quizCount >= 1 }) },
  { id: 'quiz_veteran', category: 'performance', rarity: 'rare', icon: '📖',
    compute: (s) => ({ current: Math.min(s.quizCount, 10), target: 10, earned: s.quizCount >= 10 }) },
  { id: 'quiz_master', category: 'performance', rarity: 'epic', icon: '🎓',
    compute: (s) => ({ current: Math.min(s.quizCount, 50), target: 50, earned: s.quizCount >= 50 }) },
  { id: 'perfect_score', category: 'performance', rarity: 'rare', icon: '💯',
    compute: (s) => ({ current: Math.min(s.perfectQuizzes, 1), target: 1, earned: s.perfectQuizzes >= 1 }) },
  { id: 'sharpshooter', category: 'performance', rarity: 'epic', icon: '🎯',
    compute: (s) => ({ current: Math.min(s.maxQuizStreak80, 5), target: 5, earned: s.maxQuizStreak80 >= 5 }) },
  { id: 'perfectionist', category: 'performance', rarity: 'legendary', icon: '⭐',
    compute: (s) => ({ current: Math.min(s.perfectQuizzes, 3), target: 3, earned: s.perfectQuizzes >= 3 }) },
  { id: 'quiz_scholar', category: 'performance', rarity: 'rare', icon: '🧠',
    compute: (s) => ({ current: s.quizCount >= 10 ? s.avgQuiz : 0, target: 80, earned: s.quizCount >= 10 && s.avgQuiz >= 80 }) },

  { id: 'halfway_there', category: 'mastery', rarity: 'common', icon: '⛰️',
    compute: (s) => ({ current: Math.min(s.percent, 50), target: 50, earned: s.percent >= 50 }) },
  { id: 'almost_there', category: 'mastery', rarity: 'rare', icon: '🏔️',
    compute: (s) => ({ current: Math.min(s.percent, 75), target: 75, earned: s.percent >= 75 }) },
  { id: 'completionist', category: 'mastery', rarity: 'legendary', icon: '🏆',
    compute: (s) => ({ current: s.percent, target: 100, earned: s.percent >= 100 && s.total > 0 }) },
  { id: 'speed_learner', category: 'mastery', rarity: 'rare', icon: '⚡',
    compute: (s) => ({ current: Math.min(s.maxDailyCompletions, 5), target: 5, earned: s.maxDailyCompletions >= 5 }) },
  { id: 'category_master', category: 'mastery', rarity: 'epic', icon: '📚',
    compute: (s) => ({ current: s.anyCategoryComplete ? 1 : 0, target: 1, earned: s.anyCategoryComplete }) },
  { id: 'explorer', category: 'mastery', rarity: 'common', icon: '🧭',
    compute: (s) => ({ current: s.categoriesStarted, target: s.categoriesTotal, earned: s.categoriesTotal > 0 && s.categoriesStarted >= s.categoriesTotal }) },

  { id: 'early_bird', category: 'special', rarity: 'common', icon: '🌅',
    compute: (s) => ({ current: s.hasEarlyBird ? 1 : 0, target: 1, earned: s.hasEarlyBird }) },
  { id: 'night_owl', category: 'special', rarity: 'common', icon: '🦉',
    compute: (s) => ({ current: s.hasNightOwl ? 1 : 0, target: 1, earned: s.hasNightOwl }) },
  { id: 'weekend_warrior', category: 'special', rarity: 'rare', icon: '🌸',
    compute: (s) => ({ current: s.hasWeekend ? 1 : 0, target: 1, earned: s.hasWeekend }) },
  { id: 'bright_day', category: 'special', rarity: 'rare', icon: '☀️',
    compute: (s) => ({ current: Math.min(s.maxDailyActivity, 10), target: 10, earned: s.maxDailyActivity >= 10 }) },
  { id: 'belt_collector', category: 'special', rarity: 'rare', icon: '🛡️',
    compute: (s) => ({ current: s.hasApprovedValidation ? 1 : 0, target: 1, earned: s.hasApprovedValidation }) },
];

export const TOTAL_XP = BADGES.reduce((acc, b) => acc + RARITY[b.rarity].xp, 0);

// ─── Tier system ─────────────────────────────────────────────
// Tier is based on % of the total possible XP, so it stays meaningful
// even as new badges are added.
const TIERS = [
  { min: 90, key: 'legend',     color: '#d4af37' },
  { min: 70, key: 'elite',      color: '#e67e22' },
  { min: 50, key: 'veteran',    color: '#9b59b6' },
  { min: 30, key: 'journeyman', color: '#2ecc71' },
  { min: 10, key: 'apprentice', color: '#3498db' },
  { min: 0,  key: 'initiate',   color: '#8b9ba8' },
];

export function getTier(xp) {
  const pct = TOTAL_XP === 0 ? 0 : (xp / TOTAL_XP) * 100;
  return TIERS.find((t) => pct >= t.min) || TIERS[TIERS.length - 1];
}

// ─── XP from claimed badge IDs ───────────────────────────────
// Defensive: ignores unknown / duplicate IDs and users with no claims.
export function getStudentXP(claimedBadges = []) {
  if (!Array.isArray(claimedBadges) || claimedBadges.length === 0) return 0;
  return claimedBadges.reduce((sum, id) => {
    const badge = BADGES.find((b) => b.id === id);
    if (!badge || !RARITY[badge.rarity]) return sum;
    return sum + RARITY[badge.rarity].xp;
  }, 0);
}

// ─────────────────────────────────────────────────────────────
// Shared stats + claimable-count helpers
// Used by Layout.jsx to compute the sidebar rewards badge.
// ─────────────────────────────────────────────────────────────

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

/**
 * Compute the same `stats` shape that each BADGES[i].compute(stats) expects.
 * Mirrors the inline useMemo in Rewards.jsx so the two stay consistent.
 */
export function computeBadgeStats(userData, {
  items = [],
  progress = [],
  quizAttempts = [],
  beltRequests = [],
} = {}) {
  const userBelt = userData?.belt || 'yellow';

  const progressMap = {};
  progress.forEach(p => {
    progressMap[p.itemId] = { status: p.status, updatedAt: p.updatedAt };
  });

  const itemsWithStatus = items.map(item => ({
    ...item,
    status: progressMap[item.id]?.status || 'none',
    updatedAt: progressMap[item.id]?.updatedAt,
  }));

  const completedCount = itemsWithStatus.filter(i => i.status === 'completed').length;
  const total = itemsWithStatus.length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  const beltStats = {};
  BELT_ORDER.forEach(belt => {
    const beltItems = itemsWithStatus.filter(i => (i.minimumGrade || 'yellow') === belt);
    beltStats[belt] = {
      total: beltItems.length,
      completed: beltItems.filter(i => i.status === 'completed').length,
    };
  });

  const catStats = {};
  itemsWithStatus.forEach(i => {
    if (!i.categoryId) return;
    if (!catStats[i.categoryId]) catStats[i.categoryId] = { total: 0, completed: 0, started: 0 };
    catStats[i.categoryId].total++;
    if (i.status === 'completed') catStats[i.categoryId].completed++;
    if (i.status !== 'none') catStats[i.categoryId].started++;
  });
  const catList = Object.values(catStats);
  const categoriesTotal = catList.length;
  const categoriesStarted = catList.filter(c => c.started > 0).length;
  const anyCategoryComplete = catList.some(c => c.total > 0 && c.completed === c.total);

  const dailyActivity = {};
  const dailyCompletions = {};
  const allTimestamps = [];

  progress.forEach(p => {
    const ts = p.updatedAt?.toDate?.();
    if (ts) {
      const key = ts.toISOString().slice(0, 10);
      dailyActivity[key] = (dailyActivity[key] || 0) + 1;
      if (p.status === 'completed') {
        dailyCompletions[key] = (dailyCompletions[key] || 0) + 1;
      }
      allTimestamps.push(ts);
    }
  });

  quizAttempts.forEach(q => {
    const ts = q.completedAt?.toDate?.();
    if (ts) {
      const key = ts.toISOString().slice(0, 10);
      dailyActivity[key] = (dailyActivity[key] || 0) + 1;
      allTimestamps.push(ts);
    }
  });

  const sortedDays = Object.keys(dailyActivity)
    .filter(k => dailyActivity[k] > 0)
    .sort();
  let longestStreak = 0;
  let currentRun = 0;
  let prevDate = null;
  sortedDays.forEach(day => {
    const d = new Date(day);
    if (prevDate) {
      const diff = Math.round((d - prevDate) / (1000 * 60 * 60 * 24));
      currentRun = diff === 1 ? currentRun + 1 : 1;
    } else {
      currentRun = 1;
    }
    longestStreak = Math.max(longestStreak, currentRun);
    prevDate = d;
  });

  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dailyActivity[key] > 0) currentStreak++;
    else if (i === 0) continue;
    else break;
  }

  const maxDailyActivity = Object.values(dailyActivity).reduce((m, v) => Math.max(m, v), 0);
  const maxDailyCompletions = Object.values(dailyCompletions).reduce((m, v) => Math.max(m, v), 0);

  const hasEarlyBird = allTimestamps.some(ts => ts.getHours() < 7);
  const hasNightOwl = allTimestamps.some(ts => ts.getHours() >= 22);
  const hasWeekend = allTimestamps.some(ts => {
    const d = ts.getDay();
    return d === 0 || d === 6;
  });

  const quizCount = quizAttempts.length;
  const perfectQuizzes = quizAttempts.filter(q => (q.percentage || 0) === 100).length;
  const avgQuiz = quizCount > 0
    ? Math.round(quizAttempts.reduce((s, q) => s + (q.percentage || 0), 0) / quizCount)
    : 0;

  const sortedQuizzes = [...quizAttempts].sort((a, b) => {
    const at = a.completedAt?.toDate?.()?.getTime?.() || 0;
    const bt = b.completedAt?.toDate?.()?.getTime?.() || 0;
    return at - bt;
  });
  let maxQuizStreak80 = 0;
  let currentQuizStreak = 0;
  sortedQuizzes.forEach(q => {
    if ((q.percentage || 0) >= 80) {
      currentQuizStreak++;
      maxQuizStreak80 = Math.max(maxQuizStreak80, currentQuizStreak);
    } else {
      currentQuizStreak = 0;
    }
  });

  const hasApprovedValidation = beltRequests.some(r => r.status === 'approved');

  const validatedBelts = new Set();
  beltRequests.forEach(r => {
    if (r.status === 'approved') validatedBelts.add(r.belt);
  });
  const userBeltIdx = BELT_ORDER.indexOf(userBelt);
  BELT_ORDER.forEach((belt, idx) => {
    if (idx < userBeltIdx) validatedBelts.add(belt);
  });

  return {
    completedCount, total, percent, beltStats,
    categoriesTotal, categoriesStarted, anyCategoryComplete,
    currentStreak, longestStreak,
    quizCount, perfectQuizzes, avgQuiz, maxQuizStreak80,
    maxDailyActivity, maxDailyCompletions,
    hasEarlyBird, hasNightOwl, hasWeekend, hasApprovedValidation,
    validatedBelts,
    belt: userBelt,
  };
}

export function countClaimableBadges(userData, data) {
  if (!userData) return 0;
  const stats = computeBadgeStats(userData, data);
  const claimed = userData.claimedBadges || [];
  let count = 0;
  for (const badge of BADGES) {
    const result = badge.compute(stats);
    if (result.earned && !claimed.includes(badge.id)) count++;
  }
  return count;
}