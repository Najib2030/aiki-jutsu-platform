// src/components/StudentProfileModal.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  X, Award, Trophy, BrainCircuit, Calendar, Clock, Mail, User,
  CheckCircle2, AlertCircle, XCircle, Flame, TrendingUp, ShieldCheck,
} from 'lucide-react';
import {
  BELT_COLORS, BELT_RANK, getBeltLabel, getExperience, formatTimeInDojo,
} from '../utils/experience';
import styles from './StudentProfileModal.module.css';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

function beltTextColor(belt) {
  return belt === 'yellow' || belt === 'dan1' ? '#1a1a1a' : '#fff';
}

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

function formatDateShort(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatTimeAgo(ts, t) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  const weeks = Math.floor(days / 7);
  return t('time.weeksAgo', { count: weeks });
}

export default function StudentProfileModal({
  isOpen,
  student,
  onClose,
  footer = null,
  extraInfo = [],
  showProgress = true,
  showQuizzes = true,
  loading = false,
}) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!isOpen || !student) return;
    let mounted = true;
    setFetching(true);
    setData(null);

    async function load() {
      try {
        const promises = [
          getDocs(query(collection(db, 'progress'), where('userId', '==', student.id))),
          showQuizzes
            ? getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', student.id)))
            : Promise.resolve({ docs: [] }),
          getDocs(query(collection(db, 'beltRequests'), where('userId', '==', student.id))),
          showProgress ? getDocs(collection(db, 'items')) : Promise.resolve({ docs: [] }),
        ];

        const [progSnap, quizSnap, reqSnap, itemsSnap] = await Promise.all(promises);
        if (!mounted) return;

        const progress = progSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const quizAttempts = quizSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const beltRequests = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const allItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filter items accessible to this student based on their belt
        const userBelt = student.belt || 'yellow';
        const maxIdx = BELT_ORDER.indexOf(userBelt);
        const accessibleItems = maxIdx >= 0
          ? allItems.filter(i =>
              BELT_ORDER.indexOf(i.minimumGrade || 'yellow') <= maxIdx)
          : allItems.filter(i => (i.minimumGrade || 'yellow') === 'yellow');

        setData({ progress, quizAttempts, beltRequests, items: accessibleItems });
      } catch (err) {
        console.error('Failed to load profile data:', err);
        if (mounted) setData({ progress: [], quizAttempts: [], beltRequests: [], items: [] });
      } finally {
        if (mounted) setFetching(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [isOpen, student, showProgress, showQuizzes]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  const belt = student.belt || 'yellow';
  const beltColor = BELT_COLORS[belt] || '#ccc';
  const beltLabel = getBeltLabel(belt);
  const initial = (student.name || '?').charAt(0).toUpperCase();
  const joined = student.joinedDate
    ? new Date(student.joinedDate + 'T00:00:00')
    : student.createdAt?.toDate?.();
  const timeInDojo = formatTimeInDojo(student.joinedDate) ||
    (student.createdAt ? t('studentProfile.justStarted') : '—');

  // Status flags
  const isVerified = student.emailVerified !== false || student.adminVerified === true;
  const isDisabled = student.isDisabled === true;
  const isDeleted = student.isDeleted === true;
  const isApproved = student.isApproved === true;

  // Computed stats
  const completedCount = (data?.progress || [])
    .filter(p => p.status === 'completed' || p.status === 'validated').length;
  const totalItems = data?.items?.length || 0;
  const overallPercent = totalItems === 0 ? 0 : Math.round((completedCount / totalItems) * 100);

  const quizzes = data?.quizAttempts || [];
  const quizCount = quizzes.length;
  const bestQuiz = quizCount === 0 ? 0 : Math.max(...quizzes.map(q => q.percentage || 0));
  const avgQuiz = quizCount === 0
    ? 0
    : Math.round(quizzes.reduce((s, q) => s + (q.percentage || 0), 0) / quizCount);

  // Belt breakdown
  const beltStats = {};
  BELT_ORDER.forEach(b => { beltStats[b] = { total: 0, completed: 0 }; });
  (data?.items || []).forEach(it => {
    const b = it.minimumGrade || 'yellow';
    if (beltStats[b]) {
      beltStats[b].total++;
      const prog = (data.progress || []).find(p => p.itemId === it.id);
      if (prog && (prog.status === 'completed' || prog.status === 'validated')) {
        beltStats[b].completed++;
      }
    }
  });

  // Streak (consecutive days with activity, ending today or yesterday)
  const activityDays = new Set();
  (data?.progress || []).forEach(p => {
    const ts = p.updatedAt?.toDate?.();
    if (ts) activityDays.add(ts.toISOString().slice(0, 10));
  });
  quizzes.forEach(q => {
    const ts = q.completedAt?.toDate?.();
    if (ts) activityDays.add(ts.toISOString().slice(0, 10));
  });
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (activityDays.has(key)) streak++;
    else if (i === 0) continue; // today may be empty
    else break;
  }

  // Approved belt validations → belt history
  const beltHistory = (data?.beltRequests || [])
    .filter(r => r.status === 'approved' && !r.isDeleted)
    .map(r => ({ belt: r.belt, approvedAt: r.reviewedAt }))
    .sort((a, b) => toMs(a.approvedAt) - toMs(b.approvedAt));

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        {/* Header */}
        <div
          className={styles.modalHeader}
          style={{ background: `linear-gradient(135deg, ${beltColor}22, ${beltColor}08)` }}
        >
          <div className={styles.headerLeft}>
            <div
              className={styles.avatar}
              style={{
                backgroundColor: beltColor,
                color: beltTextColor(belt),
                borderColor: beltColor,
              }}
            >
              {student.profileImageUrl ? (
                <img src={student.profileImageUrl} alt={student.name || t('common.profileAlt')} />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className={styles.headerInfo}>
              <h2 id="profile-modal-title" className={styles.name}>
                {student.name || t('studentProfile.unnamed')}
              </h2>
              <div className={styles.email}>
                <Mail size={13} strokeWidth={2} />
                <span>{student.email || '—'}</span>
              </div>
              <div className={styles.badges}>
                <span
                  className={styles.beltBadge}
                  style={{ backgroundColor: beltColor, color: beltTextColor(belt) }}
                >
                  <Award size={11} strokeWidth={2.5} />
                  {beltLabel}
                </span>
                {isDeleted ? (
                  <span className={`${styles.statusBadge} ${styles.badgeDeleted}`}>
                    <XCircle size={11} strokeWidth={2.5} /> {t('studentProfile.badgeDeleted')}
                  </span>
                ) : isDisabled ? (
                  <span className={`${styles.statusBadge} ${styles.badgeDisabled}`}>
                    <XCircle size={11} strokeWidth={2.5} /> {t('studentProfile.badgeDisabled')}
                  </span>
                ) : !isVerified ? (
                  <span className={`${styles.statusBadge} ${styles.badgeUnverified}`}>
                    <AlertCircle size={11} strokeWidth={2.5} /> {t('studentProfile.badgeUnverified')}
                  </span>
                ) : !isApproved ? (
                  <span className={`${styles.statusBadge} ${styles.badgePending}`}>
                    <Clock size={11} strokeWidth={2.5} /> {t('studentProfile.badgePending')}
                  </span>
                ) : (
                  <span className={`${styles.statusBadge} ${styles.badgeActive}`}>
                    <CheckCircle2 size={11} strokeWidth={2.5} /> {t('studentProfile.badgeActive')}
                  </span>
                )}
                {student.role === 'admin' && (
                  <span className={`${styles.statusBadge} ${styles.badgeAdmin}`}>
                    <ShieldCheck size={11} strokeWidth={2.5} /> {t('studentProfile.badgeAdmin')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('common.close')}
            disabled={loading}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {fetching ? (
            <div className={styles.loadingState}>
              <span className={styles.spinner} />
              <p>{t('studentProfile.loadingProfile')}</p>
            </div>
          ) : (
            <>
              {/* Info grid */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  <User size={14} strokeWidth={2} /> {t('studentProfile.details')}
                </h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>{t('studentProfile.age')}</span>
                    <span className={styles.infoValue}>
                      {student.age || '—'}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>
                      <Calendar size={11} strokeWidth={2} /> {t('studentProfile.joined')}
                    </span>
                    <span className={styles.infoValue}>
                      {joined ? joined.toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                      }) : '—'}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>{t('studentProfile.timeInDojo')}</span>
                    <span className={styles.infoValue}>{timeInDojo}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>{t('studentProfile.experience')}</span>
                    <span className={styles.infoValue}>{getExperience(belt)}</span>
                  </div>
                </div>
              </section>

              {/* Extra info (from prop) */}
              {extraInfo.length > 0 && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>
                    <AlertCircle size={14} strokeWidth={2} /> {t('studentProfile.additionalInfo')}
                  </h3>
                  <div className={styles.extraList}>
                    {extraInfo.map((row, i) => (
                      <div
                        key={i}
                        className={`${styles.extraRow} ${
                          row.variant ? styles[`extra_${row.variant}`] : ''
                        }`}
                      >
                        <span className={styles.extraLabel}>{row.label}</span>
                        <span className={styles.extraValue}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Progress */}
              {showProgress && (
                <>
                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                      <TrendingUp size={14} strokeWidth={2} /> {t('studentProfile.techniqueProgress')}
                    </h3>
                    <div className={styles.statsGrid}>
                      <div className={styles.statCard}>
                        <div className={styles.statValue}>{completedCount}</div>
                        <div className={styles.statLabel}>{t('studentProfile.completed')}</div>
                        <div className={styles.statSub}>
                          {t('studentProfile.ofAccessible', { count: totalItems })}
                        </div>
                      </div>
                      <div className={styles.statCard}>
                        <div className={styles.statValue}>{overallPercent}%</div>
                        <div className={styles.statLabel}>{t('studentProfile.overall')}</div>
                        <div className={styles.statBarTrack}>
                          <div
                            className={styles.statBarFill}
                            style={{ width: `${overallPercent}%` }}
                          />
                        </div>
                      </div>
                      <div className={styles.statCard}>
                        <div className={styles.statValue}>
                          {streak > 0 ? `🔥 ${streak}` : '—'}
                        </div>
                        <div className={styles.statLabel}>{t('studentProfile.dayStreak')}</div>
                        <div className={styles.statSub}>{t('studentProfile.current')}</div>
                      </div>
                    </div>
                  </section>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                      <Award size={14} strokeWidth={2} /> {t('studentProfile.beltJourney')}
                    </h3>
                    <div className={styles.beltList}>
                      {BELT_ORDER.map(b => {
                        const s = beltStats[b];
                        if (!s || s.total === 0) return null;
                        const pct = Math.round((s.completed / s.total) * 100);
                        const isCurrent = b === belt;
                        const color = BELT_COLORS[b] || '#ccc';
                        return (
                          <div
                            key={b}
                            className={`${styles.beltRow} ${isCurrent ? styles.beltRowCurrent : ''}`}
                          >
                            <span
                              className={styles.beltDot}
                              style={{ backgroundColor: color }}
                            />
                            <span className={styles.beltName}>{getBeltLabel(b)}</span>
                            <div className={styles.beltBarTrack}>
                              <div
                                className={styles.beltBarFill}
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                            <span className={styles.beltCount}>
                              {s.completed}/{s.total}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {beltHistory.length > 0 && (
                      <div className={styles.beltHistory}>
                        <span className={styles.beltHistoryLabel}>
                          {t('studentProfile.validatedBelts')}
                        </span>
                        {beltHistory.map((h, i) => (
                          <span
                            key={i}
                            className={styles.beltHistoryChip}
                            style={{
                              backgroundColor: BELT_COLORS[h.belt] || '#ccc',
                              color: beltTextColor(h.belt),
                            }}
                            title={formatDateShort(h.approvedAt)}
                          >
                            {getBeltLabel(h.belt)}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* Quizzes */}
              {showQuizzes && quizCount > 0 && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>
                    <BrainCircuit size={14} strokeWidth={2} /> {t('studentProfile.quizPerformance')}
                  </h3>
                  <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>{quizCount}</div>
                      <div className={styles.statLabel}>{t('studentProfile.attempts')}</div>
                      <div className={styles.statSub}>{t('studentProfile.allTime')}</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>{bestQuiz}%</div>
                      <div className={styles.statLabel}>{t('studentProfile.best')}</div>
                      <div className={styles.statSub}>{t('studentProfile.allTime')}</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>{avgQuiz}%</div>
                      <div className={styles.statLabel}>{t('studentProfile.average')}</div>
                      <div className={styles.statSub}>{t('studentProfile.acrossAttempts')}</div>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          {footer || (
            <button
              type="button"
              className={styles.closeFooterBtn}
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}