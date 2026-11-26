// src/pages/Dashboard.jsx
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  BELT_COLORS, BELT_OPTIONS, BELT_RANK, getExperience, getBeltLabel,
  formatTimeInDojo,
} from '../utils/experience';
import { getStudentXP } from '../utils/badges';
import {
  Award, TrendingUp, Medal, Sparkles, ClipboardCheck, Clock,
  Users, MailWarning, UserPlus, Library, CheckCircle2,
  Trophy, BrainCircuit, Star, Zap, Activity, FolderTree,
  BookOpen, BarChart3, Calendar, Target, UserCheck, BadgeCheck,
  Settings as SettingsIcon,
} from 'lucide-react';
import styles from './Dashboard.module.css';
import Loading from '../components/Loading';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

const EXPERIENCE_KEY_MAP = {
  'Beginner': 'beginner',
  'Some Experience': 'some',
  'Advanced': 'advanced',
  'Master': 'master',
};
const EXPERIENCE_ENUMS = ['Beginner', 'Some Experience', 'Advanced', 'Master'];

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

function formatTimeAgo(date, t) {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t('time.weeksAgo', { count: weeks });
  const months = Math.floor(days / 30);
  return t('time.monthsAgo', { count: months });
}

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const parts = birthDateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

async function fetchAccessibleItems(userData) {
  const userBelt = userData?.belt || 'yellow';
  const maxIdx = BELT_ORDER.indexOf(userBelt);
  const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];

  if (userData?.role === 'admin') {
    const snap = await getDocs(collection(db, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const batches = await Promise.all(
    belts.map(async belt => {
      const snap = await getDocs(
        query(collection(db, 'items'), where('minimumGrade', '==', belt))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    })
  );
  return batches.flat();
}

// ── Shared XP-based student ranking helper ───────────────────
function buildStudentRanking(allUsers) {
  return allUsers
    .filter((s) =>
      s.isApproved === true
      && !s.isDisabled
      && !s.isDeleted
      && (s.emailVerified !== false || s.adminVerified === true)
    )
    .map((s) => {
      const claimed = Array.isArray(s.claimedBadges) ? s.claimedBadges : [];
      return {
        id: s.id,
        name: s.name || '?',
        belt: s.belt || 'yellow',
        profileImageUrl: s.profileImageUrl || null,
        xp: getStudentXP(claimed),
        claimedCount: claimed.length,
      };
    })
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.claimedCount !== a.claimedCount) return b.claimedCount - a.claimedCount;
      return (a.name || '').localeCompare(b.name || '');
    });
}

// ══════════════════════════════════════════════════════════════════
// CHART PRIMITIVES
// ══════════════════════════════════════════════════════════════════
function ProgressRing({ percent, size = 160, stroke = 14, color = '#c0a062' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <svg width={size} height={size} className={styles.ringSvg}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="rgba(0,0,0,0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
    </svg>
  );
}

function LineChart({ data, height = 160 }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return <div className={styles.chartEmpty}>{t('dashboard.noDataYet')}</div>;
  }
  const width = 400;
  const pad = { top: 16, right: 16, bottom: 30, left: 36 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = 100;
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;
  const points = data.map((v, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + chartH - (v / max) * chartH,
    value: v,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD +
    ` L ${points[points.length - 1].x} ${pad.top + chartH}` +
    ` L ${points[0].x} ${pad.top + chartH} Z`;

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.lineChart}>
      {yTicks.map(v => {
        const y = pad.top + chartH - (v / max) * chartH;
        return (
          <g key={`y-${v}`}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y}
              stroke="rgba(0,0,0,0.06)" strokeDasharray="4 4" />
            <text x={pad.left - 6} y={y + 3}
              textAnchor="end" fontSize="9" fill="#999">
              {v}%
            </text>
          </g>
        );
      })}

      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH}
        stroke="rgba(0,0,0,0.18)" />
      <line x1={pad.left} y1={pad.top + chartH} x2={width - pad.right} y2={pad.top + chartH}
        stroke="rgba(0,0,0,0.18)" />

      {points.map((p, i) => {
        if (data.length > 6 && i % 2 !== 0 && i !== data.length - 1) return null;
        return (
          <text key={`x-${i}`} x={p.x} y={height - 10}
            textAnchor="middle" fontSize="9" fill="#999">
            {i + 1}
          </text>
        );
      })}

      <path d={areaD} fill="rgba(139, 44, 36, 0.08)" />
      <path d={pathD} fill="none" stroke="#8b2c24" strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill="#8b2c24" />
          <circle cx={p.x} cy={p.y} r={2} fill="white" />
        </g>
      ))}
    </svg>
  );
}

function AreaChart({ data, height = 160 }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return <div className={styles.chartEmpty}>{t('dashboard.noDataYet')}</div>;
  }
  const width = 400;
  const pad = { top: 16, right: 16, bottom: 30, left: 44 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map(d => d.value), 1);
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + chartH - (d.value / max) * chartH,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD +
    ` L ${points[points.length - 1].x} ${pad.top + chartH}` +
    ` L ${points[0].x} ${pad.top + chartH} Z`;

  const yTicks = Array.from(new Set([0, Math.round(max / 2), max]));

  const labelCount = Math.min(data.length, 5);
  const labelStep = labelCount > 1 ? (data.length - 1) / (labelCount - 1) : 0;
  const xLabelIndices = labelCount > 1
    ? Array.from({ length: labelCount }, (_, i) => Math.round(i * labelStep))
    : [0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.lineChart}>
      {yTicks.map((v, idx) => {
        const y = pad.top + chartH - (v / max) * chartH;
        return (
          <g key={`y-${idx}`}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y}
              stroke="rgba(0,0,0,0.06)" strokeDasharray="4 4" />
            <text x={pad.left - 6} y={y + 3}
              textAnchor="end" fontSize="9" fill="#999">
              {v}
            </text>
          </g>
        );
      })}

      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH}
        stroke="rgba(0,0,0,0.18)" />
      <line x1={pad.left} y1={pad.top + chartH} x2={width - pad.right} y2={pad.top + chartH}
        stroke="rgba(0,0,0,0.18)" />

      {xLabelIndices.map(idx => {
        const d = data[idx];
        if (!d?.date) return null;
        const parts = d.date.split('-');
        const label = `${parseInt(parts[1])}/${parseInt(parts[2])}`;
        return (
          <text key={`x-${idx}`} x={points[idx].x} y={height - 10}
            textAnchor="middle" fontSize="9" fill="#999">
            {label}
          </text>
        );
      })}

      <path d={areaD} fill="rgba(192, 160, 98, 0.25)" />
      <path d={pathD} fill="none" stroke="#c0a062" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}

function Heatmap({ data }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className={styles.heatmap}>
      <div className={styles.heatmapGrid}>
        {data.map((d, i) => {
          const intensity = d.count === 0 ? 0 : Math.max(0.2, d.count / max);
          return (
            <div key={i} className={styles.heatmapCell}
              style={{
                backgroundColor: d.count === 0 ? 'rgba(0,0,0,0.06)' : `rgba(139, 44, 36, ${intensity})`,
              }}
              title={t('dashboard.heatmapTooltip', { date: d.date, count: d.count })}
            />
          );
        })}
      </div>
      <div className={styles.heatmapLegend}>
        <span>{t('dashboard.heatmapAgo')}</span>
        <span>{t('dashboard.heatmapToday')}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TOP-STUDENTS PANEL (shared by admin & student views)
// ══════════════════════════════════════════════════════════════════
function TopStudentsPanel({ topStudents, currentUid, myRank, t }) {
  return (
    <div className={styles.panel} style={{ marginBottom: 20 }}>
      <h2 className={styles.panelTitle}>
        <Medal size={16} strokeWidth={2} />
        <span>{t('dashboard.topStudentsTitle')}</span>
      </h2>

      {topStudents.length === 0 ? (
        <p className={styles.emptyText}>{t('dashboard.noApprovedYet')}</p>
      ) : (
        <ul className={styles.leaderboard}>
          {topStudents.map((student, idx) => {
            const isMe = student.id === currentUid;
            const beltColor = BELT_COLORS[student.belt] || '#ccc';
            return (
              <li
                key={student.id}
                className={`${styles.leaderRow} ${isMe ? styles.youRow : ''}`}
              >
                <span className={styles.leaderRank}>
                  {idx === 0 ? '🥇'
                    : idx === 1 ? '🥈'
                    : idx === 2 ? '🥉'
                    : `#${idx + 1}`}
                </span>
                <div
                  className={styles.leaderAvatar}
                  style={{ backgroundColor: beltColor }}
                >
                  {student.profileImageUrl ? (
                    <img src={student.profileImageUrl} alt="" />
                  ) : (
                    <span>{(student.name || '?').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className={styles.leaderInfo}>
                  <div className={styles.leaderName}>
                    {student.name}
                    {isMe && <span className={styles.youChip}>{t('competition.you')}</span>}
                  </div>
                  <div className={styles.leaderBelt}>{getBeltLabel(student.belt)}</div>
                </div>
                <span className={styles.leaderCount}>
                  {student.xp}
                  <span className={styles.leaderCountUnit}>XP</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {myRank && !topStudents.some((s) => s.id === currentUid) && (
        <p className={styles.yourRankLine}>
          {t('dashboard.yourRank', { rank: myRank })}
        </p>
      )}

      <Link to="/competition" className={styles.viewLeaderboardLink}>
        {t('dashboard.viewFullLeaderboard')} →
      </Link>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { t } = useTranslation();
  const { userData, currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    items: [],
    categories: {},
    progress: [],
    quizAttempts: [],
    beltRequests: [],
    allUsers: [],
    allProgress: [],
    allQuizAttempts: [],
  });

  useEffect(() => {
    async function fetchAll() {
      if (!userData || !currentUser) return;
      try {
        const isAdmin = userData.role === 'admin';

        const [
          items, catSnap, progSnap, quizSnap, beltReqSnap,
          usersSnap, allProgSnap, allQuizSnap,
        ] = await Promise.all([
          fetchAccessibleItems(userData),
          getDocs(collection(db, 'categories')),
          getDocs(query(collection(db, 'progress'), where('userId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'beltRequests'), where('userId', '==', currentUser.uid))),
          // Always fetch all students (needed for the Top 5 panel)
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
          isAdmin ? getDocs(query(collection(db, 'progress'), where('status', '==', 'completed'))) : Promise.resolve({ docs: [] }),
          isAdmin ? getDocs(collection(db, 'quizAttempts')) : Promise.resolve({ docs: [] }),
        ]);

        const catMap = {};
        catSnap.forEach(d => { catMap[d.id] = { id: d.id, ...d.data() }; });

        setData({
          items,
          categories: catMap,
          progress: progSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          quizAttempts: quizSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          beltRequests: beltReqSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          allUsers: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          allProgress: allProgSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          allQuizAttempts: allQuizSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [userData, currentUser]);

  // ═════════ STUDENT STATS ═════════
  const studentStats = useMemo(() => {
    if (userData?.role === 'admin' || loading) return null;
    const { items, categories, progress, quizAttempts, beltRequests, allUsers } = data;
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

    const total = itemsWithStatus.length;
    const completed = itemsWithStatus.filter(i => i.status === 'completed');
    const learning = itemsWithStatus.filter(i => i.status === 'learning');
    const none = itemsWithStatus.filter(i => i.status === 'none');
    const percent = total === 0 ? 0 : Math.round((completed.length / total) * 100);

    const currentBeltItems = itemsWithStatus.filter(
      i => (i.minimumGrade || 'yellow') === userBelt
    );
    const currentBeltCompleted = currentBeltItems.filter(i => i.status === 'completed').length;
    const currentBeltPercent = currentBeltItems.length === 0
      ? (userBelt === 'dan1' ? 100 : 0)
      : Math.round((currentBeltCompleted / currentBeltItems.length) * 100);

    const bestQuiz = quizAttempts.length > 0
      ? Math.max(...quizAttempts.map(a => a.percentage || 0)) : 0;
    const avgQuiz = quizAttempts.length > 0
      ? Math.round(quizAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / quizAttempts.length) : 0;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyQuizAttempts = quizAttempts.filter(a => {
      const ts = a.completedAt?.toDate?.()?.getTime?.() || 0;
      return ts >= weekAgo;
    });
    const bestQuizWeek = weeklyQuizAttempts.length > 0
      ? Math.max(...weeklyQuizAttempts.map(a => a.percentage || 0))
      : 0;

    const joinedDate = userData.joinedDate
      ? new Date(userData.joinedDate + 'T00:00:00')
      : userData.createdAt?.toDate?.();
    const daysSinceJoined = joinedDate
      ? Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const userIdx = BELT_ORDER.indexOf(userBelt);
    const beltJourney = BELT_ORDER.map((belt, idx) => {
      const beltItems = itemsWithStatus.filter(i => (i.minimumGrade || 'yellow') === belt);
      const bTotal = beltItems.length;
      const bCompleted = beltItems.filter(i => i.status === 'completed').length;
      let state = 'locked';
      if (idx < userIdx) state = 'completed';
      else if (idx === userIdx) state = 'current';
      return {
        belt,
        label: belt === 'dan1' ? 'Dan 1' : belt.charAt(0).toUpperCase() + belt.slice(1),
        total: bTotal, completed: bCompleted,
        percent: bTotal === 0 ? 0 : Math.round((bCompleted / bTotal) * 100),
        state,
      };
    }).filter(b => b.total > 0);

    const categoryProgress = Object.values(categories)
      .map(cat => {
        const catItems = itemsWithStatus.filter(i => i.categoryId === cat.id);
        if (catItems.length === 0) return null;
        const cCompleted = catItems.filter(i => i.status === 'completed').length;
        return {
          id: cat.id,
          name: cat.names?.en || 'Untitled',
          order: cat.order || 999,
          total: catItems.length,
          completed: cCompleted,
          percent: Math.round((cCompleted / catItems.length) * 100),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);

    const recentActivity = [
      ...itemsWithStatus
        .filter(i => i.updatedAt && i.status !== 'none')
        .map(i => ({
          kind: 'technique',
          label: i.names?.ja || i.names?.en || 'Technique',
          status: i.status,
          timestamp: i.updatedAt?.toDate?.() || new Date(i.updatedAt),
        })),
      ...quizAttempts.map(q => ({
        kind: 'quiz',
        label: `${q.quizType || 'quiz'} · ${q.percentage || 0}%`,
        timestamp: q.completedAt?.toDate?.() || new Date(q.completedAt),
      })),
    ]
      .filter(a => a.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);

    const quizTrend = [...quizAttempts]
      .sort((a, b) => toMs(a.completedAt) - toMs(b.completedAt))
      .slice(-10)
      .map(a => a.percentage || 0);

    const activityByDay = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      activityByDay[d.toISOString().slice(0, 10)] = 0;
    }
    [...progress, ...quizAttempts].forEach(entry => {
      const ts = entry.updatedAt?.toDate?.() || entry.completedAt?.toDate?.();
      if (ts) {
        const key = ts.toISOString().slice(0, 10);
        if (key in activityByDay) activityByDay[key]++;
      }
    });
    const heatmapData = Object.entries(activityByDay).map(([date, count]) => ({ date, count }));

    let streak = 0;
    const reversed = [...heatmapData].reverse();
    for (const d of reversed) {
      if (d.count > 0) streak++;
      else break;
    }
    if (reversed[0]?.count === 0 && reversed[1]?.count > 0) {
      streak = 0;
      for (let i = 1; i < reversed.length; i++) {
        if (reversed[i].count > 0) streak++;
        else break;
      }
    }

    const focusItems = learning.slice(0, 4);
    const pendingRequest = beltRequests.find(r => r.status === 'pending');
    const nextItems = none
      .filter(i => (i.minimumGrade || 'yellow') === userBelt)
      .slice(0, 3);

    // ── Top 5 students by XP ───────────────────────────────
    const ranking = buildStudentRanking(allUsers);
    const topStudents = ranking.slice(0, 5);
    const myRank = ranking.findIndex((s) => s.id === currentUser.uid) + 1 || null;

    return {
      total,
      completedCount: completed.length,
      learningCount: learning.length,
      noneCount: none.length,
      percent,
      currentBeltItems: currentBeltItems.length,
      currentBeltCompleted,
      currentBeltPercent,
      quizAttempts: quizAttempts.length,
      bestQuiz, bestQuizWeek, avgQuiz,
      daysSinceJoined, joinedDate,
      beltJourney, categoryProgress, recentActivity, quizTrend, heatmapData, streak,
      focusItems, nextItems, pendingRequest, userBelt,
      topStudents, myRank,
    };
  }, [data, userData, loading, currentUser]);

  // ═════════ ADMIN STATS ═════════
  const adminStats = useMemo(() => {
    if (userData?.role !== 'admin' || loading) return null;
    const { allUsers, items, categories, allProgress, allQuizAttempts } = data;

    const activeUsers = allUsers.filter(s => !s.isDisabled);

    const approved = activeUsers.filter(s => s.emailVerified !== false && s.isApproved);
    const pending = activeUsers.filter(s => s.emailVerified !== false && !s.isApproved);
    const unverified = activeUsers.filter(s => s.emailVerified === false);

    const beltCounts = {};
    BELT_OPTIONS.forEach(b => { beltCounts[b.value] = 0; });
    approved.forEach(s => {
      const b = s.belt && beltCounts[s.belt] !== undefined ? s.belt : 'yellow';
      beltCounts[b]++;
    });

    const expCounts = {};
    approved.forEach(s => {
      const exp = getExperience(s.belt);
      expCounts[exp] = (expCounts[exp] || 0) + 1;
    });

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    let newThisWeek = 0, newThisMonth = 0;
    allUsers.forEach(s => {
      const ts = toMs(s.createdAt);
      if (ts > weekAgo) newThisWeek++;
      if (ts > monthAgo) newThisMonth++;
    });

    const regByDay = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      regByDay[d.toISOString().slice(0, 10)] = 0;
    }
    allUsers.forEach(s => {
      const ts = s.createdAt?.toDate?.();
      if (ts) {
        const key = ts.toISOString().slice(0, 10);
        if (key in regByDay) regByDay[key]++;
      }
    });
    const regTrendRaw = Object.entries(regByDay).map(([date, count]) => ({ date, count }));

    const earliestKey = Object.keys(regByDay)[0];
    const baselineCount = allUsers.filter(u => {
      const ts = toMs(u.createdAt);
      if (ts === 0) return false;
      return new Date(ts).toISOString().slice(0, 10) < earliestKey;
    }).length;

    let cumulative = baselineCount;
    const regTrend = regTrendRaw.map(d => {
      cumulative += d.count;
      return { date: d.date, value: cumulative };
    });
    const newInWindow = regTrendRaw.reduce((acc, d) => acc + d.count, 0);

    const valByDay = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      valByDay[d.toISOString().slice(0, 10)] = 0;
    }
    allProgress.forEach(p => {
      const ts = p.updatedAt?.toDate?.();
      if (ts) {
        const key = ts.toISOString().slice(0, 10);
        if (key in valByDay) valByDay[key]++;
      }
    });
    const valTrend = Object.entries(valByDay).map(([date, count]) => ({ date, value: count }));

    const categoryCompleteness = Object.values(categories)
      .map(cat => {
        const catItems = items.filter(i => i.categoryId === cat.id);
        if (catItems.length === 0) return null;
        const accessibleStudents = approved.filter(s => {
          const rank = BELT_RANK[s.belt || 'yellow'] || 1;
          return catItems.some(item => rank >= (BELT_RANK[item.minimumGrade || 'yellow'] || 1));
        });
        if (accessibleStudents.length === 0) {
          return { id: cat.id, name: cat.names?.en || 'Untitled', percent: 0, order: cat.order || 999 };
        }
        const itemIds = new Set(catItems.map(i => i.id));
        const studentIds = new Set(accessibleStudents.map(s => s.id));
        const completedHere = allProgress.filter(
          p => itemIds.has(p.itemId) && studentIds.has(p.userId)
        ).length;
        const possible = accessibleStudents.length * catItems.length;
        const percent = possible === 0 ? 0 : Math.round((completedHere / possible) * 100);
        return { id: cat.id, name: cat.names?.en || 'Untitled', percent, order: cat.order || 999 };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);

    const validationsByUser = {};
    allProgress.forEach(p => {
      if (p.userId) validationsByUser[p.userId] = (validationsByUser[p.userId] || 0) + 1;
    });
    const studentMap = {};
    approved.forEach(s => { studentMap[s.id] = s; });
    const leaderboard = Object.entries(validationsByUser)
      .map(([uid, count]) => ({ student: studentMap[uid], count }))
      .filter(e => e.student)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const validationsByItem = {};
    allProgress.forEach(p => {
      if (p.itemId) validationsByItem[p.itemId] = (validationsByItem[p.itemId] || 0) + 1;
    });
    const itemMap = {};
    items.forEach(i => { itemMap[i.id] = i; });
    const topTechniques = Object.entries(validationsByItem)
      .map(([iid, count]) => ({ item: itemMap[iid], count }))
      .filter(e => e.item)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const recent = [...allUsers]
      .filter(s => s.createdAt)
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .slice(0, 6);

    const recentQuizzes = [...allQuizAttempts]
      .filter(a => a.completedAt)
      .sort((a, b) => toMs(b.completedAt) - toMs(a.completedAt))
      .slice(0, 5)
      .map(q => {
        const stu = studentMap[q.userId] || allUsers.find(u => u.id === q.userId);
        return { ...q, studentName: stu?.name || 'Unknown' };
      });

    const totalQuizzes = allQuizAttempts.length;
    const avgQuizScore = totalQuizzes === 0 ? 0
      : Math.round(allQuizAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / totalQuizzes);

    // ── Top 5 students by XP ───────────────────────────────
    const topStudents = buildStudentRanking(allUsers).slice(0, 5);

    return {
      totalStudents: allUsers.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      unverifiedCount: unverified.length,
      categoryCount: Object.keys(categories).length,
      itemCount: items.length,
      validatedCount: allProgress.length,
      totalQuizzes, avgQuizScore,
      beltCounts, expCounts, newThisWeek, newThisMonth,
      regTrend, valTrend, newInWindow, baselineCount, categoryCompleteness,
      leaderboard, topTechniques, recent, recentQuizzes,
      topStudents,
    };
  }, [data, userData, loading]);

  if (loading) return <Loading text={t('dashboard.loading')} />;

  if (userData?.role === 'admin' && adminStats) {
    return renderAdmin(adminStats);
  }
  if (studentStats) {
    return renderStudent(studentStats);
  }
  return null;

  // ═════════ ADMIN RENDER ═════════
  function renderAdmin(s) {
    const maxBelt = Math.max(...Object.values(s.beltCounts), 1);
    const maxExp = Math.max(...Object.values(s.expCounts), 1);

    return (
      <div>
        <div className={styles.welcomeBanner}>
          <h1>{t('dashboard.dojoOverview')}</h1>
          <p>{t('dashboard.welcomeAdmin', { name: userData?.name || '' })}</p>
        </div>

        <div className={styles.kpiGrid}>
          <Link to="/admin/students" className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Users size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.activeStudents')}</span>
            </div>
            <div className={styles.kpiValue}>{s.approvedCount}</div>
            <div className={styles.kpiSub}>
              {t('dashboard.registered', { count: s.totalStudents })}
            </div>
          </Link>
          <Link
            to="/admin/approvals"
            className={`${styles.kpiCard} ${s.pendingCount > 0 ? styles.kpiWarning : ''}`}
          >
            <div className={styles.kpiLabel}>
              <Clock size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.pendingApprovals')}</span>
            </div>
            <div className={styles.kpiValue}>{s.pendingCount}</div>
            <div className={styles.kpiSub}>
              {s.pendingCount > 0 ? t('dashboard.actionNeeded') : t('dashboard.allClear')}
            </div>
          </Link>
          <Link
            to="/admin/students"
            className={`${styles.kpiCard} ${s.unverifiedCount > 0 ? styles.kpiWarning : ''}`}
          >
            <div className={styles.kpiLabel}>
              <MailWarning size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.unverified')}</span>
            </div>
            <div className={styles.kpiValue}>{s.unverifiedCount}</div>
            <div className={styles.kpiSub}>{t('dashboard.emailNotConfirmed')}</div>
          </Link>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <UserPlus size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.newThisWeek')}</span>
            </div>
            <div className={styles.kpiValue}>{s.newThisWeek}</div>
            <div className={styles.kpiSub}>
              {t('dashboard.thisMonth', { count: s.newThisMonth })}
            </div>
          </div>
          <Link to="/admin/manage" className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Library size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.syllabus')}</span>
            </div>
            <div className={styles.kpiValue}>{s.itemCount}</div>
            <div className={styles.kpiSub}>
              {t('dashboard.categories', { count: s.categoryCount })}
            </div>
          </Link>
          <Link to="/admin/validations" className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <CheckCircle2 size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.validations')}</span>
            </div>
            <div className={styles.kpiValue}>{s.validatedCount}</div>
            <div className={styles.kpiSub}>{t('dashboard.allTime')}</div>
          </Link>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Sparkles size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.quizzes')}</span>
            </div>
            <div className={styles.kpiValue}>{s.totalQuizzes}</div>
            <div className={styles.kpiSub}>
              {t('dashboard.avgScore', { percent: s.avgQuizScore })}
            </div>
          </div>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <CheckCircle2 size={16} strokeWidth={2} />
              <span>{t('dashboard.validations30')}</span>
            </h2>
            <AreaChart data={s.valTrend} />
            <div className={styles.chartMeta}>
              <span>
                {t('dashboard.completions30', {
                  count: s.valTrend.reduce((acc, d) => acc + d.value, 0),
                })}
              </span>
              <span>{t('dashboard.allTimeCount', { count: s.validatedCount })}</span>
            </div>
          </div>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <TrendingUp size={16} strokeWidth={2} />
              <span>{t('dashboard.registration30')}</span>
            </h2>
            <AreaChart data={s.regTrend} />
            <div className={styles.chartMeta}>
              <span>{t('dashboard.newStudents', { count: s.newInWindow })}</span>
              <span>
                {t('dashboard.nowTotal', {
                  count: s.regTrend[s.regTrend.length - 1]?.value || 0,
                })}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Award size={16} strokeWidth={2} />
              <span>{t('dashboard.beltDistribution')}</span>
            </h2>
            {s.approvedCount === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noApprovedYet')}</p>
            ) : (
              <div className={styles.beltChart}>
                {BELT_OPTIONS.map(b => {
                  const count = s.beltCounts[b.value] || 0;
                  const pct = (count / maxBelt) * 100;
                  return (
                    <div key={b.value} className={styles.beltRow}>
                      <span className={styles.beltLabel}>{getBeltLabel(b.value)}</span>
                      <div className={styles.beltBarTrack}>
                        <div className={styles.beltBar}
                          style={{
                            width: count === 0 ? '0%' : `${pct}%`,
                            backgroundColor: BELT_COLORS[b.value],
                            minWidth: count === 0 ? 0 : 4,
                          }}
                        />
                      </div>
                      <span className={styles.beltCount}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <BarChart3 size={16} strokeWidth={2} />
              <span>{t('dashboard.experienceLevels')}</span>
            </h2>
            {s.approvedCount === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noDataYet')}</p>
            ) : (
              <div className={styles.beltChart}>
                {EXPERIENCE_ENUMS.map(exp => {
                  const count = s.expCounts[exp] || 0;
                  const pct = (count / maxExp) * 100;
                  const expKey = EXPERIENCE_KEY_MAP[exp] || 'beginner';
                  return (
                    <div key={exp} className={styles.beltRow}>
                      <span className={styles.beltLabel}>
                        {t(`experience.${expKey}`)}
                      </span>
                      <div className={styles.beltBarTrack}>
                        <div className={styles.beltBar}
                          style={{
                            width: count === 0 ? '0%' : `${pct}%`,
                            backgroundColor: 'var(--color-bengara)',
                            minWidth: count === 0 ? 0 : 4,
                          }}
                        />
                      </div>
                      <span className={styles.beltCount}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={styles.panel} style={{ marginBottom: 20 }}>
          <h2 className={styles.panelTitle}>
            <Library size={16} strokeWidth={2} />
            <span>{t('dashboard.categoryCompleteness')}</span>
          </h2>
          <p className={styles.panelHint}>{t('dashboard.categoryCompletenessHint')}</p>
          {s.categoryCompleteness.length === 0 ? (
            <p className={styles.emptyText}>{t('dashboard.noCategoriesYet')}</p>
          ) : (
            <div className={styles.beltChart}>
              {s.categoryCompleteness.map(cat => (
                <div key={cat.id} className={styles.beltRow}>
                  <span className={styles.beltLabel} title={cat.name}>{cat.name}</span>
                  <div className={styles.beltBarTrack}>
                    <div className={styles.beltBar}
                      style={{
                        width: cat.percent === 0 ? '0%' : `${cat.percent}%`,
                        background: 'linear-gradient(90deg, var(--color-bengara), var(--color-gold))',
                        minWidth: cat.percent === 0 ? 0 : 4,
                      }}
                    />
                  </div>
                  <span className={styles.beltCount}>{cat.percent}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <UserPlus size={16} strokeWidth={2} />
              <span>{t('dashboard.recentRegistrations')}</span>
            </h2>
            {s.recent.length === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noRegistrationsYet')}</p>
            ) : (
              <ul className={styles.activityList}>
                {s.recent.map(student => {
                  const date = student.createdAt?.toDate?.();
                  return (
                    <li key={student.id} className={styles.activityItem}>
                      <div className={styles.activityMain}>
                        <div className={styles.activityName}>{student.name}</div>
                        <div className={styles.activityMeta}>
                          {getBeltLabel(student.belt)} · {formatTimeAgo(date, t)}
                        </div>
                      </div>
                      {student.emailVerified === false && (
                        <span className={styles.badgeWarning}>
                          {t('dashboard.badgeUnverified')}
                        </span>
                      )}
                      {student.emailVerified !== false && !student.isApproved && (
                        <span className={styles.badgePending}>
                          {t('dashboard.badgePending')}
                        </span>
                      )}
                      {student.emailVerified !== false && student.isApproved && (
                        <span className={styles.badgeActive}>
                          {t('dashboard.badgeActive')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Trophy size={16} strokeWidth={2} />
              <span>{t('dashboard.topPerformers')}</span>
            </h2>
            {s.leaderboard.length === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noValidationsYet')}</p>
            ) : (
              <ol className={styles.leaderboard}>
                {s.leaderboard.map((entry, idx) => (
                  <li key={entry.student.id} className={styles.leaderRow}>
                    <span className={styles.leaderRank}>{idx + 1}</span>
                    <div className={styles.leaderInfo}>
                      <div className={styles.leaderName}>{entry.student.name}</div>
                      <div className={styles.leaderBelt}>
                        {getBeltLabel(entry.student.belt)}
                      </div>
                    </div>
                    <span className={styles.leaderCount}>{entry.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <BrainCircuit size={16} strokeWidth={2} />
              <span>{t('dashboard.recentQuizAttempts')}</span>
            </h2>
            {s.recentQuizzes.length === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noQuizzesYet')}</p>
            ) : (
              <ul className={styles.activityList}>
                {s.recentQuizzes.map(q => {
                  const pct = q.percentage || 0;
                  const tone = pct >= 80 ? 'great' : pct >= 60 ? 'good' : 'low';
                  return (
                    <li key={q.id} className={styles.activityItem}>
                      <div className={styles.activityMain}>
                        <div className={styles.activityName}>{q.studentName}</div>
                        <div className={styles.activityMeta}>
                          {q.quizType} · {formatTimeAgo(q.completedAt?.toDate?.(), t)}
                        </div>
                      </div>
                      <span className={`${styles.scoreBadge} ${styles[`score_${tone}`]}`}>
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Star size={16} strokeWidth={2} />
              <span>{t('dashboard.mostValidatedTechniques')}</span>
            </h2>
            {s.topTechniques.length === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noValidationsYet')}</p>
            ) : (
              <ul className={styles.techniqueList}>
                {s.topTechniques.map((entry, idx) => (
                  <li key={entry.item.id} className={styles.techniqueRow}>
                    <span className={styles.techniqueRank}>{idx + 1}</span>
                    <div className={styles.techniqueInfo}>
                      <div className={styles.techniqueName}>
                        {entry.item.names?.ja}
                        {entry.item.names?.en && (
                          <span className={styles.techniqueEn}> · {entry.item.names.en}</span>
                        )}
                      </div>
                      <div className={styles.techniqueMeta}>
                        {getBeltLabel(entry.item.minimumGrade || 'yellow')}
                      </div>
                    </div>
                    <span className={styles.techniqueCount}>{entry.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ★ Top 5 students by XP */}
        <TopStudentsPanel
          topStudents={s.topStudents}
          currentUid={currentUser?.uid}
          myRank={null}
          t={t}
        />

        <div className={styles.quickActions}>
          <h2 className={styles.panelTitle}>
            <Zap size={16} strokeWidth={2} />
            <span>{t('dashboard.quickActions')}</span>
          </h2>
          <div className={styles.actionGrid}>
            <Link to="/admin/approvals" className={styles.actionBtn}>
              <UserCheck size={16} strokeWidth={2} /> {t('dashboard.reviewApprovals')}
            </Link>
            <Link to="/admin/students" className={styles.actionBtn}>
              <Users size={16} strokeWidth={2} /> {t('dashboard.manageStudents')}
            </Link>
            <Link to="/admin/validations" className={styles.actionBtn}>
              <BadgeCheck size={16} strokeWidth={2} /> {t('dashboard.beltValidations')}
            </Link>
            <Link to="/admin/manage" className={styles.actionBtn}>
              <FolderTree size={16} strokeWidth={2} /> {t('dashboard.editCategories')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ═════════ STUDENT RENDER ═════════
  function renderStudent(s) {
    const beltColor = BELT_COLORS[s.userBelt] || BELT_COLORS.yellow;
    const beltLabel = getBeltLabel(s.userBelt);
    const textColor = s.userBelt === 'black' ? 'white' : '#333';
    const age = calcAge(userData?.birthDate);

    const timeInDojoStr = formatTimeInDojo(s.joinedDate);
    const timeInDojoText =
      !timeInDojoStr || timeInDojoStr === t('timeInDojo.joinedToday') || timeInDojoStr === t('timeInDojo.justStarted')
        ? t('dashboard.firstDay')
        : t('dashboard.timeInDojo', { time: timeInDojoStr });

    return (
      <div>
        <div className={styles.welcomeBanner}>
          <h1>{t('dashboard.welcomeStudent', { name: userData?.name || '' })}</h1>
          <p>
            {age !== null ? `${t('dashboard.ageYears', { age })} · ` : ''}
            {timeInDojoText}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 15, flexWrap: 'wrap' }}>
            <div className={styles.beltDisplay}
              style={{ backgroundColor: beltColor, color: textColor, marginTop: 0 }}>
              {beltLabel}
            </div>
            {s.streak > 0 && (
              <div className={styles.streakBadge}>
                🔥 {t('dashboard.dayStreak', { count: s.streak })}
              </div>
            )}
          </div>
        </div>

        {s.pendingRequest && (
          <div className={styles.pendingBanner}>
            <span className={styles.pendingIcon}>⏳</span>
            <div>
              <div className={styles.pendingTitle}>{t('dashboard.validationPending')}</div>
              <div className={styles.pendingMsg}>
                {t('dashboard.validationPendingMsg', {
                  belt: getBeltLabel(s.pendingRequest.belt),
                })}
              </div>
            </div>
            <Link to="/progress" className={styles.pendingLink}>{t('dashboard.view')}</Link>
          </div>
        )}

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Award size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.techniquesMastered')}</span>
            </div>
            <div className={styles.kpiValue}>{s.completedCount}</div>
            <div className={styles.kpiSub}>
              {t('dashboard.ofAvailable', { count: s.total })}
            </div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <TrendingUp size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.overallProgress')}</span>
            </div>
            <div className={styles.kpiValue}>{s.percent}%</div>
            <div className={styles.kpiSub}>
              {t('dashboard.inProgress', { count: s.learningCount })}
            </div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Medal size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.currentBelt')}</span>
            </div>
            <div className={styles.kpiValue}>{s.currentBeltPercent}%</div>
            <div className={styles.kpiSub}>
              {s.userBelt === 'dan1'
                ? t('dashboard.graduatedMaster')
                : t('dashboard.techniquesFraction', {
                    completed: s.currentBeltCompleted,
                    total: s.currentBeltItems,
                  })}
            </div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Sparkles size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.bestQuizThisWeek')}</span>
            </div>
            <div className={styles.kpiValue}>{s.bestQuizWeek}%</div>
            <div className={styles.kpiSub}>
              {s.bestQuiz > 0
                ? t('dashboard.allTimeBest', { percent: s.bestQuiz })
                : t('dashboard.noQuizzesYetShort')}
            </div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <ClipboardCheck size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.quizAttempts')}</span>
            </div>
            <div className={styles.kpiValue}>{s.quizAttempts}</div>
            <div className={styles.kpiSub}>
              <Link to="/quizzes" style={{ fontSize: '0.75rem' }}>
                {t('dashboard.takeQuiz')}
              </Link>
            </div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>
              <Clock size={13} strokeWidth={1.8} className={styles.kpiIcon} />
              <span>{t('dashboard.notStarted')}</span>
            </div>
            <div className={styles.kpiValue}>{s.noneCount}</div>
            <div className={styles.kpiSub}>{t('dashboard.readyToLearn')}</div>
          </div>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Target size={16} strokeWidth={2} />
              <span>{t('dashboard.overallProgress')}</span>
            </h2>
            <div className={styles.ringContainer}>
              <div className={styles.ringWrap}>
                <ProgressRing percent={s.percent} size={180} stroke={16} color="#8b2c24" />
                <div className={styles.ringCenter}>
                  <div className={styles.ringPct}>{s.percent}%</div>
                  <div className={styles.ringSub}>
                    {s.completedCount}/{s.total}
                  </div>
                </div>
              </div>
              <div className={styles.ringLegend}>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: '#2ecc71' }} />
                  <span className={styles.legendLabel}>{t('dashboard.legendCompleted')}</span>
                  <span className={styles.legendValue}>{s.completedCount}</span>
                </div>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: '#f39c12' }} />
                  <span className={styles.legendLabel}>{t('dashboard.legendLearning')}</span>
                  <span className={styles.legendValue}>{s.learningCount}</span>
                </div>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: '#d0d0d0' }} />
                  <span className={styles.legendLabel}>{t('dashboard.legendNotStarted')}</span>
                  <span className={styles.legendValue}>{s.noneCount}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Activity size={16} strokeWidth={2} />
              <span>{t('dashboard.recentActivity')}</span>
            </h2>
            {s.recentActivity.length === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noActivityYet')}</p>
            ) : (
              <ul className={styles.activityList}>
                {s.recentActivity.map((a, i) => (
                  <li key={i} className={styles.activityItem}>
                    <div className={styles.activityMain}>
                      <div className={styles.activityName}>
                        {a.kind === 'quiz' ? '📝 ' : '🥋 '}
                        {a.label}
                      </div>
                      <div className={styles.activityMeta}>
                        {a.kind === 'technique' && a.status === 'completed' && t('dashboard.completed')}
                        {a.kind === 'technique' && a.status === 'learning' && t('dashboard.nowLearning')}
                        {a.kind === 'quiz' && t('dashboard.quizCompleted')}
                        {' · '}
                        {formatTimeAgo(a.timestamp, t)}
                      </div>
                    </div>
                    {a.kind === 'technique' && (
                      <span className={`${styles.statusChip} ${styles[`chip_${a.status}`]}`}>
                        {t(`dashboard.status_${a.status}`, { defaultValue: a.status })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.panel} style={{ marginBottom: 20 }}>
          <h2 className={styles.panelTitle}>
            <Medal size={16} strokeWidth={2} />
            <span>{t('dashboard.beltJourney')}</span>
          </h2>
          <div className={styles.beltJourneyGrid}>
            {s.beltJourney.map(step => (
              <div
                key={step.belt}
                className={styles.beltJourneyCard}
                data-state={step.state}
                data-belt={step.belt}
                style={{ '--belt-color': BELT_COLORS[step.belt] || '#ccc' }}
              >
                <div className={styles.beltJourneyDot}
                  data-state={step.state} data-belt={step.belt}>
                  {step.state === 'completed' && '✓'}
                  {step.state === 'current' && '●'}
                  {step.state === 'locked' && '🔒'}
                </div>
                <div className={styles.beltJourneyLabel}>{step.label}</div>
                <div className={styles.beltJourneyMeta}>
                  {step.state === 'locked' && t('dashboard.locked')}
                  {step.state === 'completed' && t('dashboard.completed')}
                  {step.state === 'current' && `${step.completed}/${step.total}`}
                </div>
                {step.state !== 'locked' && (
                  <div className={styles.beltJourneyBar}>
                    <div className={styles.beltJourneyFill} style={{ width: `${step.percent}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <FolderTree size={16} strokeWidth={2} />
              <span>{t('dashboard.progressByCategory')}</span>
            </h2>
            {s.categoryProgress.length === 0 ? (
              <p className={styles.emptyText}>{t('dashboard.noCategoriesYet')}</p>
            ) : (
              <div className={styles.categoryProgressList}>
                {s.categoryProgress.map(cat => (
                  <div key={cat.id} className={styles.categoryProgressRow}>
                    <div className={styles.categoryProgressHeader}>
                      <span className={styles.categoryProgressName}>{cat.name}</span>
                      <span className={styles.categoryProgressStat}>
                        {cat.completed}/{cat.total} · {cat.percent}%
                      </span>
                    </div>
                    <div className={styles.categoryBarTrack}>
                      <div className={styles.categoryBarFill} style={{ width: `${cat.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <TrendingUp size={16} strokeWidth={2} />
              <span>{t('dashboard.quizScoreTrend')}</span>
            </h2>
            {s.quizTrend.length < 2 ? (
              <p className={styles.emptyText}>
                {s.quizTrend.length === 0
                  ? t('dashboard.noQuizzesTakeOne')
                  : t('dashboard.takeAnotherQuiz')}
              </p>
            ) : (
              <>
                <LineChart data={s.quizTrend} />
                <div className={styles.chartMeta}>
                  <span>{t('dashboard.lastXAttempts', { count: s.quizTrend.length })}</span>
                  <span>{t('dashboard.bestX', { percent: Math.max(...s.quizTrend) })}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <BookOpen size={16} strokeWidth={2} />
              <span>{t('dashboard.continueLearning')}</span>
            </h2>
            {s.focusItems.length === 0 && s.nextItems.length === 0 ? (
              <p className={styles.emptyText}>
                {s.completedCount === s.total && s.total > 0
                  ? t('dashboard.masteredAll')
                  : t('dashboard.nothingInProgress')}
              </p>
            ) : (
              <ul className={styles.techniqueList}>
                {s.focusItems.map(item => (
                  <li key={item.id} className={styles.techniqueRow}>
                    <span className={styles.focusIcon}>📖</span>
                    <div className={styles.techniqueInfo}>
                      <div className={styles.techniqueName}>
                        {item.names?.ja}
                        {item.names?.en && (
                          <span className={styles.techniqueEn}> · {item.names.en}</span>
                        )}
                      </div>
                      <div className={styles.techniqueMeta}>
                        {t('dashboard.inProgressBelt', {
                          belt: getBeltLabel(item.minimumGrade || 'yellow'),
                        })}
                      </div>
                    </div>
                    <Link to={`/syllabus/${item.categoryId}/${item.id}`} className={styles.focusLink}>
                      {t('dashboard.continue')}
                    </Link>
                  </li>
                ))}
                {s.focusItems.length === 0 && s.nextItems.map(item => (
                  <li key={item.id} className={styles.techniqueRow}>
                    <span className={styles.focusIcon}>✨</span>
                    <div className={styles.techniqueInfo}>
                      <div className={styles.techniqueName}>
                        {item.names?.ja}
                        {item.names?.en && (
                          <span className={styles.techniqueEn}> · {item.names.en}</span>
                        )}
                      </div>
                      <div className={styles.techniqueMeta}>
                        {t('dashboard.notStartedBelt', {
                          belt: getBeltLabel(item.minimumGrade || 'yellow'),
                        })}
                      </div>
                    </div>
                    <Link to={`/syllabus/${item.categoryId}/${item.id}`} className={styles.focusLink}>
                      {t('dashboard.start')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Calendar size={16} strokeWidth={2} />
              <span>{t('dashboard.activityLast28')}</span>
            </h2>
            <Heatmap data={s.heatmapData} />
            <div className={styles.chartMeta}>
              <span>
                {t('dashboard.actionsIn28', {
                  count: s.heatmapData.reduce((acc, d) => acc + d.count, 0),
                })}
              </span>
              <span>
                {s.streak > 0
                  ? t('dashboard.dayStreak', { count: s.streak }) + ' 🔥'
                  : t('dashboard.startStreak')}
              </span>
            </div>
          </div>
        </div>

        {/* ★ Top 5 students by XP */}
        <TopStudentsPanel
          topStudents={s.topStudents}
          currentUid={currentUser?.uid}
          myRank={s.myRank}
          t={t}
        />

        <div className={styles.quickActions}>
          <h2 className={styles.panelTitle}>
            <Zap size={16} strokeWidth={2} />
            <span>{t('dashboard.quickActions')}</span>
          </h2>
          <div className={styles.actionGrid}>
            <Link to="/syllabus" className={styles.actionBtn}>
              <BookOpen size={16} strokeWidth={2} /> {t('dashboard.browseSyllabus')}
            </Link>
            <Link to="/progress" className={styles.actionBtn}>
              <TrendingUp size={16} strokeWidth={2} /> {t('dashboard.trackProgress')}
            </Link>
            <Link to="/quizzes" className={styles.actionBtn}>
              <BrainCircuit size={16} strokeWidth={2} /> {t('dashboard.takeAQuiz')}
            </Link>
            <Link to="/competition" className={styles.actionBtn}>
              <Medal size={16} strokeWidth={2} /> {t('competition.heading')}
            </Link>
            <Link to="/settings" className={styles.actionBtn}>
              <SettingsIcon size={16} strokeWidth={2} /> {t('dashboard.settings')}
            </Link>
          </div>
        </div>
      </div>
    );
  }
}