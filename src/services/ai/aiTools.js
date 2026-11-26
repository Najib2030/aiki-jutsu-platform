// src/services/ai/aiTools.js
import {
  doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc, arrayUnion, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { emitProgressChanged } from '../../utils/progressEvents';
import { getStudentXP } from '../../utils/badges';
import { ALLOWED_PATHS } from './appRegistry';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

export const CONFIRMATION_TOOLS = new Set([
  'update_technique_status', 'update_profile', 'claim_user_reward', 'claim_all_rewards'
]);

// ─── Badge Definitions (Copied from Rewards.jsx) ─────────────────────
const BADGES = [
  { id: 'first_step', compute: (s) => ({ earned: s.completedCount >= 1 }) },
  { id: 'yellow_warrior', compute: (s) => {
      const b = s.beltStats.yellow || { total: 0, completed: 0 };
      return { earned: b.total > 0 && b.completed === b.total && s.validatedBelts.has('yellow') };
  }},
  { id: 'orange_horizon', compute: (s) => {
      const b = s.beltStats.orange || { total: 0, completed: 0 };
      return { earned: b.total > 0 && b.completed === b.total && s.validatedBelts.has('orange') };
  }},
  { id: 'green_path', compute: (s) => {
      const b = s.beltStats.green || { total: 0, completed: 0 };
      return { earned: b.total > 0 && b.completed === b.total && s.validatedBelts.has('green') };
  }},
  { id: 'blue_depths', compute: (s) => {
      const b = s.beltStats.blue || { total: 0, completed: 0 };
      return { earned: b.total > 0 && b.completed === b.total && s.validatedBelts.has('blue') };
  }},
  { id: 'brown_foundation', compute: (s) => {
      const b = s.beltStats.brown || { total: 0, completed: 0 };
      return { earned: b.total > 0 && b.completed === b.total && s.validatedBelts.has('brown') };
  }},
  { id: 'black_mastery', compute: (s) => {
      const b = s.beltStats.black || { total: 0, completed: 0 };
      return { earned: b.total > 0 && b.completed === b.total && s.validatedBelts.has('black') };
  }},
  { id: 'dan_1_master', compute: (s) => ({ earned: s.belt === 'dan1' }) },
  { id: 'welcome_aboard', compute: () => ({ earned: true }) },
  { id: 'consistent_samurai', compute: (s) => ({ earned: s.longestStreak >= 5 }) },
  { id: 'week_warrior', compute: (s) => ({ earned: s.longestStreak >= 7 }) },
  { id: 'fortnight_fighter', compute: (s) => ({ earned: s.longestStreak >= 14 }) },
  { id: 'monthly_master', compute: (s) => ({ earned: s.longestStreak >= 30 }) },
  { id: 'century_club', compute: (s) => ({ earned: s.longestStreak >= 100 }) },
  { id: 'quiz_rookie', compute: (s) => ({ earned: s.quizCount >= 1 }) },
  { id: 'quiz_veteran', compute: (s) => ({ earned: s.quizCount >= 10 }) },
  { id: 'quiz_master', compute: (s) => ({ earned: s.quizCount >= 50 }) },
  { id: 'perfect_score', compute: (s) => ({ earned: s.perfectQuizzes >= 1 }) },
  { id: 'sharpshooter', compute: (s) => ({ earned: s.maxQuizStreak80 >= 5 }) },
  { id: 'perfectionist', compute: (s) => ({ earned: s.perfectQuizzes >= 3 }) },
  { id: 'quiz_scholar', compute: (s) => ({ earned: s.quizCount >= 10 && s.avgQuiz >= 80 }) },
  { id: 'halfway_there', compute: (s) => ({ earned: s.percent >= 50 }) },
  { id: 'almost_there', compute: (s) => ({ earned: s.percent >= 75 }) },
  { id: 'completionist', compute: (s) => ({ earned: s.percent >= 100 && s.total > 0 }) },
  { id: 'speed_learner', compute: (s) => ({ earned: s.maxDailyCompletions >= 5 }) },
  { id: 'category_master', compute: (s) => ({ earned: s.anyCategoryComplete }) },
  { id: 'explorer', compute: (s) => ({ earned: s.categoriesTotal > 0 && s.categoriesStarted >= s.categoriesTotal }) },
  { id: 'early_bird', compute: (s) => ({ earned: s.hasEarlyBird }) },
  { id: 'night_owl', compute: (s) => ({ earned: s.hasNightOwl }) },
  { id: 'weekend_warrior', compute: (s) => ({ earned: s.hasWeekend }) },
  { id: 'bright_day', compute: (s) => ({ earned: s.maxDailyActivity >= 10 }) },
  { id: 'belt_collector', compute: (s) => ({ earned: s.hasApprovedValidation }) },
];

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Open a page in the app for the user. Use when they say open/go to/show me <page>.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', enum: ALLOWED_PATHS } },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: "Return the signed-in user's public profile: name, belt, age, joined date, role.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_settings_info',
      description: "Return the user's private account details: email, birth date, age, joined date, and role.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_app_stats',
      description: 'Get total counts for the app: total techniques, total categories, total badges (rewards).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_category_techniques',
      description: 'Get the list of techniques in a specific category (e.g., "Mai", "Ishiru"). Use this whenever the user asks what techniques are in a category.',
      parameters: {
        type: 'object',
        properties: { categoryName: { type: 'string' } },
        required: ['categoryName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leaderboard',
      description: 'Get the competition leaderboard rankings. Returns the top 10 students and the current user\'s exact rank. Optional belt filter.',
      parameters: {
        type: 'object',
        properties: {
          beltFilter: { type: 'string', description: 'Filter by belt (e.g. "yellow", "black"). Defaults to "all".' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chat_messages',
      description: 'Read the most recent messages from the Dojo Chat room. Use this if the user asks what people are talking about or if they missed anything.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Number of recent messages to fetch (default 10).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pinned_messages',
      description: 'Read the messages that are currently pinned in the Dojo Chat (usually important announcements from admins).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_notifications',
      description: "Retrieve the user's recent notifications (inbox).",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_progress',
      description: 'Return counts of techniques completed / learning / not-started, plus per-category and per-belt breakdowns.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_rewards',
      description: 'Check exactly which badges the user has claimed, which are ready to claim, and which are locked.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_belt_status',
      description: "Return the current belt, whether all current-belt techniques are done, the latest validation request status, and whether the user can request validation now.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quiz_history',
      description: 'Return the most recent quiz attempts with score, total, percentage, type and date.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Default 5.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_techniques',
      description: 'Search accessible techniques by name (JA/EN/FR/AR). Returns itemId, names, category, belt and the user’s current status for each match.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 1 } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_item_details',
      description: 'Get the FULL details of a specific technique (descriptions in EN/FR/AR, attack, defense). Use this after finding the itemId via search_techniques.',
      parameters: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_technique_status',
      description: "Change one of the user's technique statuses. itemId must come from search_techniques. The UI will ask the user to confirm.",
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          status: { type: 'string', enum: ['learning', 'completed', 'none'] },
        },
        required: ['itemId', 'status'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_profile',
      description: "Update the user's own profile. Supports name and birthDate (YYYY-MM-DD). The UI will ask the user to confirm.",
      parameters: {
        type: 'object',
        properties: {
          name:      { type: 'string', minLength: 1, maxLength: 80 },
          birthDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'claim_user_reward',
      description: 'Claim ONE specific badge by its ID. Only use if the user names a specific reward.',
      parameters: {
        type: 'object',
        properties: { badgeId: { type: 'string' } },
        required: ['badgeId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'claim_all_rewards',
      description: 'Claim ALL currently available (unclaimed) rewards at once. Use this if the user says "claim all", "claim my rewards", or asks you to claim them without naming a specific one.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  }
];

// ── Helpers ──────────────────────────────────────────────────────────
async function fetchAccessibleItems(userData) {
  if (userData?.role === 'admin') {
    const snap = await getDocs(collection(db, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const belt  = userData?.belt || 'yellow';
  const maxIdx = BELT_ORDER.indexOf(belt);
  const belts  = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];
  const batches = await Promise.all(
    belts.map(b => getDocs(query(collection(db, 'items'), where('minimumGrade', '==', b))))
  );
  return batches.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
}

async function fetchProgressMap(uid) {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', uid)));
  const map = {};
  snap.forEach(d => {
    const data = d.data();
    if (!data.itemId) return;
    let st = data.status;
    if (st === 'validated') st = 'completed';
    if (st === 'review')    st = 'learning';
    map[data.itemId] = st;
  });
  return map;
}

async function fetchCategoryNames() {
  const snap = await getDocs(collection(db, 'categories'));
  const map = {};
  snap.forEach(d => { map[d.id] = d.data().names?.en || 'Untitled'; });
  return map;
}

async function computeRewardsStats(uid, userData) {
  const userBelt = userData?.belt || 'yellow';
  const maxIdx = BELT_ORDER.indexOf(userBelt);
  const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];

  const [itemBatches, progSnap, quizSnap, reqSnap] = await Promise.all([
    Promise.all(belts.map(async (b) => {
      const snap = await getDocs(query(collection(db, 'items'), where('minimumGrade', '==', b)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    })),
    getDocs(query(collection(db, 'progress'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'beltRequests'), where('userId', '==', uid))),
  ]);

  const items = itemBatches.flat();
  const progress = progSnap.docs.map(d => d.data());
  const quizAttempts = quizSnap.docs.map(d => d.data());
  const beltRequests = reqSnap.docs.map(d => d.data());

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
      if (p.status === 'completed') dailyCompletions[key] = (dailyCompletions[key] || 0) + 1;
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

  const sortedDays = Object.keys(dailyActivity).filter(k => dailyActivity[k] > 0).sort();
  let longestStreak = 0, currentRun = 0, prevDate = null;
  sortedDays.forEach(day => {
    const d = new Date(day);
    if (prevDate) {
      const diff = Math.round((d - prevDate) / (1000 * 60 * 60 * 24));
      currentRun = diff === 1 ? currentRun + 1 : 1;
    } else { currentRun = 1; }
    longestStreak = Math.max(longestStreak, currentRun);
    prevDate = d;
  });

  const maxDailyActivity = Object.values(dailyActivity).reduce((m, v) => Math.max(m, v), 0);
  const maxDailyCompletions = Object.values(dailyCompletions).reduce((m, v) => Math.max(m, v), 0);

  const hasEarlyBird = allTimestamps.some(ts => ts.getHours() < 7);
  const hasNightOwl = allTimestamps.some(ts => ts.getHours() >= 22);
  const hasWeekend = allTimestamps.some(ts => { const d = ts.getDay(); return d === 0 || d === 6; });

  const quizCount = quizAttempts.length;
  const perfectQuizzes = quizAttempts.filter(q => (q.percentage || 0) === 100).length;
  const avgQuiz = quizCount > 0 ? Math.round(quizAttempts.reduce((s, q) => s + (q.percentage || 0), 0) / quizCount) : 0;

  const sortedQuizzes = [...quizAttempts].sort((a, b) => (a.completedAt?.toDate?.()?.getTime?.() || 0) - (b.completedAt?.toDate?.()?.getTime?.() || 0));
  let maxQuizStreak80 = 0, currentQuizStreak = 0;
  sortedQuizzes.forEach(q => {
    if ((q.percentage || 0) >= 80) {
      currentQuizStreak++;
      maxQuizStreak80 = Math.max(maxQuizStreak80, currentQuizStreak);
    } else { currentQuizStreak = 0; }
  });

  const hasApprovedValidation = beltRequests.some(r => r.status === 'approved');
  const validatedBelts = new Set();
  beltRequests.forEach(r => { if (r.status === 'approved') validatedBelts.add(r.belt); });
  const userBeltIdx = BELT_ORDER.indexOf(userBelt);
  BELT_ORDER.forEach((belt, idx) => { if (idx < userBeltIdx) validatedBelts.add(belt); });

  return {
    completedCount, total, percent, beltStats, categoriesTotal, categoriesStarted, anyCategoryComplete,
    currentStreak: 0, longestStreak, quizCount, perfectQuizzes, avgQuiz, maxQuizStreak80,
    maxDailyActivity, maxDailyCompletions, hasEarlyBird, hasNightOwl, hasWeekend, hasApprovedValidation,
    validatedBelts, belt: userBelt,
  };
}

// ── Executor ─────────────────────────────────────────────────────────
export async function executeTool(name, args, ctx) {
  const { user, userData, navigate } = ctx;
  const uid = user?.uid;
  if (!uid) throw new Error('Not authenticated');

  switch (name) {
    case 'navigate_to': {
      if (!ALLOWED_PATHS.includes(args.path)) throw new Error('That page does not exist.');
      navigate(args.path);
      return JSON.stringify({ ok: true, navigatedTo: args.path });
    }

    case 'get_user_profile':
      return JSON.stringify({
        name: userData?.name, belt: userData?.belt, age: userData?.age, joinedDate: userData?.joinedDate, role: userData?.role,
      });

    case 'get_settings_info':
      return JSON.stringify({
        email: userData?.email, birthDate: userData?.birthDate, age: userData?.age, joinedDate: userData?.joinedDate, role: userData?.role,
      });

    case 'get_app_stats': {
      const [itemsSnap, catsSnap] = await Promise.all([
        getDocs(collection(db, 'items')), getDocs(collection(db, 'categories')),
      ]);
      return JSON.stringify({ totalTechniques: itemsSnap.size, totalCategories: catsSnap.size, totalRewards: 33 });
    }

    case 'get_leaderboard': {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
      let students = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.isApproved === true && !s.isDisabled && !s.isDeleted && (s.emailVerified !== false || s.adminVerified === true));

      if (args.beltFilter && args.beltFilter !== 'all') {
        students = students.filter(s => (s.belt || 'yellow') === args.beltFilter);
      }

      const ranked = students.map(s => {
        const claimed = Array.isArray(s.claimedBadges) ? s.claimedBadges : [];
        return {
          id: s.id,
          name: s.name || 'Unknown',
          belt: s.belt || 'yellow',
          xp: getStudentXP(claimed),
          badges: claimed.length
        };
      }).sort((a, b) => {
        if (b.xp !== a.xp) return b.xp - a.xp;
        if (b.badges !== a.badges) return b.badges - a.badges;
        return (a.name || '').localeCompare(b.name || '');
      });
      
      const myRankIndex = ranked.findIndex(s => s.id === uid);
      
      return JSON.stringify({
        totalStudents: ranked.length,
        myRank: myRankIndex >= 0 ? myRankIndex + 1 : null,
        top10: ranked.slice(0, 10)
      });
    }

    case 'get_chat_messages': {
      const limitCount = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
      const roomSnap = await getDoc(doc(db, 'chatRooms', 'global'));
      const isClosed = roomSnap.exists() ? roomSnap.data().isClosed : false;
      
      const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      
      const messages = snap.docs.map(d => d.data())
        .filter(m => !m.isDeleted)
        .map(m => ({
          userName: m.userName,
          text: m.text,
          time: m.createdAt?.toDate?.()?.toISOString?.() || null,
          hasImages: m.imageUrls?.length > 0,
          hasSyllabusRef: !!m.syllabusRef,
          isPinned: !!m.pinned
        })).reverse();
        
      return JSON.stringify({ isClosed, messages });
    }

    case 'get_pinned_messages': {
      const roomSnap = await getDoc(doc(db, 'chatRooms', 'global'));
      if (!roomSnap.exists()) return JSON.stringify({ count: 0, messages: [] });
      
      const pinnedIds = roomSnap.data().pinnedMessageIds || [];
      if (pinnedIds.length === 0) return JSON.stringify({ count: 0, messages: [] });
      
      const promises = pinnedIds.map(id => getDoc(doc(db, 'messages', id)));
      const snaps = await Promise.all(promises);
      
      const pinned = snaps.filter(s => s.exists()).map(s => {
        const m = s.data();
        return {
          userName: m.userName,
          text: m.text,
          time: m.createdAt?.toDate?.()?.toISOString?.() || null,
          hasImages: m.imageUrls?.length > 0,
        };
      });
      
      return JSON.stringify({ count: pinned.length, messages: pinned });
    }

    case 'get_notifications': {
      const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', uid)));
      const list = snap.docs.map(d => d.data()).filter(n => !n.deletedByUser)
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime?.() || 0) - (a.createdAt?.toDate?.()?.getTime?.() || 0))
        .slice(0, 5).map(n => ({ title: n.title, message: n.message, read: n.read }));
      return JSON.stringify({ count: list.length, notifications: list });
    }

    case 'get_user_rewards': {
      const stats = await computeRewardsStats(uid, userData);
      const claimedBadges = userData?.claimedBadges || [];

      const evaluated = BADGES.map(b => {
        const res = b.compute(stats);
        return { id: b.id, earned: !!res.earned, claimed: claimedBadges.includes(b.id) };
      });

      const claimable = evaluated.filter(b => b.earned && !b.claimed).map(b => b.id);
      const locked = evaluated.filter(b => !b.earned && !b.claimed).map(b => b.id);

      return JSON.stringify({
        total: BADGES.length,
        claimed: claimedBadges,
        claimable: claimable,
        lockedCount: locked.length,
        message: "The 'claimable' array contains the IDs of rewards ready to be claimed right now."
      });
    }

    case 'get_user_progress': {
      const [items, progressMap, catNames] = await Promise.all([
        fetchAccessibleItems(userData), fetchProgressMap(uid), fetchCategoryNames(),
      ]);
      const byCategory = {}, byBelt = {};
      let completed = 0, learning = 0, none = 0;
      for (const it of items) {
        const st = progressMap[it.id] || 'none';
        if (st === 'completed') completed++; else if (st === 'learning') learning++; else none++;
        const cat = catNames[it.categoryId] || 'Uncategorized';
        byCategory[cat] ??= { total: 0, completed: 0 }; byCategory[cat].total++;
        if (st === 'completed') byCategory[cat].completed++;
        const b = it.minimumGrade || 'yellow';
        byBelt[b] ??= { total: 0, completed: 0 }; byBelt[b].total++;
        if (st === 'completed') byBelt[b].completed++;
      }
      return JSON.stringify({ total: items.length, completed, learning, none, percent: items.length ? Math.round((completed / items.length) * 100) : 0, byCategory, byBelt });
    }

    case 'get_belt_status': {
      const userBelt = userData?.belt || 'yellow';
      const [items, progressMap, reqSnap] = await Promise.all([
        fetchAccessibleItems(userData), fetchProgressMap(uid), getDocs(query(collection(db, 'beltRequests'), where('userId', '==', uid))),
      ]);
      const cur = items.filter(it => (it.minimumGrade || 'yellow') === userBelt);
      const total = cur.length; const done = cur.filter(it => progressMap[it.id] === 'completed').length;
      const requests = reqSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.belt === userBelt)
        .sort((a, b) => (b.requestedAt?.toDate?.()?.getTime?.() || 0) - (a.requestedAt?.toDate?.()?.getTime?.() || 0));
      return JSON.stringify({
        belt: userBelt, currentBeltTechniques: { completed: done, total, allDone: total > 0 && done === total },
        latestRequest: requests[0] ? { status: requests[0].status, requestedAt: requests[0].requestedAt?.toDate?.()?.toISOString?.() || null, rejectionReason: requests[0].rejectionReason || null } : null,
        canRequestValidation: total > 0 && done === total && (!requests[0] || requests[0].status === 'rejected'),
      });
    }

    case 'get_quiz_history': {
      const limitCount = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      const rows = snap.docs.map(d => d.data())
        .sort((a, b) => (b.completedAt?.toDate?.()?.getTime?.() || 0) - (a.completedAt?.toDate?.()?.getTime?.() || 0))
        .slice(0, limitCount).map(a => ({ score: a.score, total: a.total, percentage: a.percentage, type: a.quizType, date: a.completedAt?.toDate?.()?.toISOString?.() || null }));
      return JSON.stringify({ count: rows.length, attempts: rows });
    }

    case 'search_techniques': {
      const q = String(args.query || '').toLowerCase().trim();
      if (!q) return JSON.stringify({ count: 0, matches: [] });
      const [items, progressMap, catNames] = await Promise.all([
        fetchAccessibleItems(userData), fetchProgressMap(uid), fetchCategoryNames(),
      ]);
      const matches = items.filter(it => {
        const n = it.names || {};
        return [n.ja, n.en, n.fr, n.ar].some(v => (v || '').toLowerCase().includes(q));
      }).slice(0, 8).map(it => ({
        itemId: it.id, nameJa: it.names?.ja || '', nameEn: it.names?.en || '', category: catNames[it.categoryId] || 'Uncategorized',
        belt: it.minimumGrade || 'yellow', status: progressMap[it.id] || 'none', link: `/syllabus/${it.categoryId}/${it.id}`,
      }));
      return JSON.stringify({ count: matches.length, matches });
    }

    case 'get_item_details': {
      const { itemId } = args;
      if (!itemId) throw new Error('itemId required');
      const itemSnap = await getDoc(doc(db, 'items', itemId));
      if (!itemSnap.exists()) return JSON.stringify({ error: 'Item not found.' });
      const item = itemSnap.data();
      return JSON.stringify({
        nameJa: item.names?.ja || '', nameEn: item.names?.en || '', nameFr: item.names?.fr || '', nameAr: item.names?.ar || '',
        descriptionEn: item.description?.en || '', descriptionFr: item.description?.fr || '', descriptionAr: item.description?.ar || '',
        attack: item.attack || '', defense: item.defense || '', belt: item.minimumGrade || 'yellow',
      });
    }

    case 'update_technique_status': {
      const { itemId, status } = args;
      if (!itemId || !['learning', 'completed', 'none'].includes(status)) throw new Error('Invalid status or item.');
      const itemSnap = await getDoc(doc(db, 'items', itemId));
      if (!itemSnap.exists()) throw new Error('Technique not found.');
      await setDoc(doc(db, 'progress', `${uid}_${itemId}`), { userId: uid, itemId, status, updatedAt: new Date() }, { merge: true });
      emitProgressChanged({ itemId, status });
      return JSON.stringify({ ok: true, itemId, status });
    }

    case 'update_profile': {
      const patch = {};
      if (args.name?.trim()) patch.name = args.name.trim();
      if (args.birthDate) {
        const [y, m, d] = args.birthDate.split('-').map(Number);
        if (!y || !m || !d) throw new Error('Invalid birth date.');
        const today = new Date();
        let age = today.getFullYear() - y;
        const md = today.getMonth() + 1 - m;
        if (md < 0 || (md === 0 && today.getDate() < d)) age--;
        if (age < 5)  throw new Error('The user must be at least 5 years old.');
        if (age > 120) throw new Error('Please enter a valid birth date.');
        patch.birthDate = args.birthDate; patch.age = age;
      }
      if (!Object.keys(patch).length) return JSON.stringify({ ok: false, reason: 'No valid fields.' });
      await updateDoc(doc(db, 'users', uid), patch);
      return JSON.stringify({ ok: true, updated: Object.keys(patch) });
    }

    case 'claim_user_reward': {
      const { badgeId } = args;
      if (!badgeId) throw new Error('Badge ID required');
      await updateDoc(doc(db, 'users', uid), { claimedBadges: arrayUnion(badgeId) });
      return JSON.stringify({ ok: true, claimed: badgeId });
    }

    case 'claim_all_rewards': {
      const stats = await computeRewardsStats(uid, userData);
      const claimedBadges = userData?.claimedBadges || [];
      
      const claimable = BADGES.filter(b => {
        const res = b.compute(stats);
        return res.earned && !claimedBadges.includes(b.id);
      }).map(b => b.id);

      if (claimable.length === 0) {
        return JSON.stringify({ ok: false, message: "There are no rewards ready to claim right now." });
      }

      await updateDoc(doc(db, 'users', uid), { claimedBadges: arrayUnion(...claimable) });
      return JSON.stringify({ ok: true, claimedCount: claimable.length, claimed: claimable });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}