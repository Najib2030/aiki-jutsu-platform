// src/pages/Competition.jsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Medal, Search, X, Users, Sparkles, ShieldAlert } from 'lucide-react';
import { BELT_OPTIONS, BELT_COLORS, getBeltLabel } from '../utils/experience';
import { getStudentXP, getTier } from '../utils/badges';
import Loading from '../components/Loading';
import styles from './Competition.module.css';

function beltTextColor(belt) {
  return belt === 'yellow' || belt === 'dan1' ? '#1a1a1a' : '#fff';
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function formatXp(n) {
  return Number(n || 0).toLocaleString();
}

// ─── Podium card ────────────────────────────────────────────
function PodiumCard({ entry, rank, currentUid, t }) {
  const tier = getTier(entry.xp);
  const beltColor = BELT_COLORS[entry.belt] || '#ccc';
  const isMe = entry.id === currentUid;

  return (
    <div className={`${styles.podiumCol} ${styles[`podiumCol${rank}`]}`}>
      <div className={`${styles.podiumCard} ${isMe ? styles.podiumYou : ''}`}>
        <div className={styles.podiumMedal} aria-hidden="true">
          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
        </div>

        <div
          className={styles.podiumAvatar}
          style={{ backgroundColor: beltColor, color: beltTextColor(entry.belt) }}
        >
          {entry.profileImageUrl
            ? <img src={entry.profileImageUrl} alt="" />
            : <span>{initials(entry.name)}</span>}
        </div>

        <div className={styles.podiumName}>
          {entry.name}
          {isMe && <span className={styles.youChip}>{t('competition.you')}</span>}
        </div>

        <div
          className={styles.podiumBelt}
          style={{ backgroundColor: beltColor, color: beltTextColor(entry.belt) }}
        >
          {getBeltLabel(entry.belt)}
        </div>

        <div
          className={styles.podiumTier}
          style={{ color: tier.color, borderColor: tier.color }}
        >
          {t(`competition.tiers.${tier.key}`)}
        </div>

        <div className={styles.podiumXp}>
          {formatXp(entry.xp)}
          <span className={styles.podiumXpUnit}>XP</span>
        </div>

        <div className={styles.podiumBadges}>
          <Medal size={12} strokeWidth={2} />
          {t('competition.badges', { count: entry.claimedCount })}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────
export default function Competition() {
  const { t } = useTranslation();
  const { userData, currentUser } = useAuth();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');

  const currentUid = currentUser?.uid || null;
  const isStudent = userData?.role === 'student';

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('role', '==', 'student'))
        );

        // Global ordering (no rank field yet — ranks are computed per-view)
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
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
              name: s.name || t('competition.unknownStudent'),
              belt: s.belt || 'yellow',
              profileImageUrl: s.profileImageUrl || null,
              claimedCount: claimed.length,
              xp: getStudentXP(claimed),
            };
          })
          .sort((a, b) => {
            if (b.xp !== a.xp) return b.xp - a.xp;
            if (b.claimedCount !== a.claimedCount) return b.claimedCount - a.claimedCount;
            return (a.name || '').localeCompare(b.name || '');
          });

        if (mounted) setStudents(list);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
        if (mounted) setError(t('competition.error'));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Belt-scoped ranking ──────────────────────────────────
  // When the belt filter is active, we re-rank within that belt
  // (so yellow-belt students get their own #1, #2, #3…).
  // The name search does NOT re-rank — it only hides rows below.
  const beltFilteredStudents = useMemo(() => {
    const base =
      beltFilter === 'all'
        ? students
        : students.filter((s) => s.belt === beltFilter);
    return base.map((s, i) => ({ ...s, filteredRank: i + 1 }));
  }, [students, beltFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return beltFilteredStudents;
    return beltFilteredStudents.filter((s) =>
      (s.name || '').toLowerCase().includes(q)
    );
  }, [beltFilteredStudents, search]);

  // ── Hero stats (all reflect the current belt filter) ─────
  const totalInView = beltFilteredStudents.length;
  const topXpInView = totalInView > 0 ? beltFilteredStudents[0].xp : 0;
  const avgXpInView = totalInView > 0
    ? Math.round(beltFilteredStudents.reduce((s, st) => s + st.xp, 0) / totalInView)
    : 0;
  const topStudentInView = totalInView > 0 ? beltFilteredStudents[0] : null;

  const myRankedEntry = isStudent
    ? beltFilteredStudents.find((s) => s.id === currentUid) || null
    : null;

  const podium = beltFilteredStudents.slice(0, 3);

  // Belts that appear in the *global* list — filter never offers an empty option
  const availableBelts = useMemo(() => {
    const present = new Set(students.map((s) => s.belt));
    return BELT_OPTIONS.filter((b) => present.has(b.value)).map((b) => b.value);
  }, [students]);

  const hasFilters = !!search.trim() || beltFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setBeltFilter('all');
  };

  // ── Render guards ────────────────────────────────────────
  if (loading) return <Loading text={t('competition.loading')} />;

  if (error) {
    return (
      <div className={styles.centerState}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  const isUnapproved = isStudent && userData?.isApproved !== true;

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            <Sparkles size={26} strokeWidth={2} style={{ marginRight: 10, verticalAlign: 'middle' }} />
            {t('competition.heading')}
          </h1>
          <p className={styles.heroSubtitle}>{t('competition.subtitle')}</p>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal}>{totalInView}</div>
            <div className={styles.heroStatLabel}>{t('competition.statTotal')}</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal}>{formatXp(avgXpInView)}</div>
            <div className={styles.heroStatLabel}>{t('competition.statAvg')}</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal}>{formatXp(topXpInView)}</div>
            <div className={styles.heroStatLabel}>{t('competition.statTop')}</div>
          </div>
          <div className={styles.heroStat}>
            {isStudent ? (
              <>
                <div className={styles.heroStatVal}>
                  {myRankedEntry ? `#${myRankedEntry.filteredRank}` : '—'}
                </div>
                <div className={styles.heroStatLabel}>{t('competition.statYourRank')}</div>
              </>
            ) : (
              <>
                <div className={`${styles.heroStatVal} ${styles.heroStatValSmall}`}>
                  {topStudentInView ? topStudentInView.name : '—'}
                </div>
                <div className={styles.heroStatLabel}>{t('competition.statTopStudent')}</div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 👇 Add the Pending Approval Banner 👇 */}
      {isUnapproved && (
        <div className={styles.pendingBanner}>
          <div className={styles.pendingIcon}>
            <ShieldAlert size={28} strokeWidth={2} />
          </div>
          <div className={styles.pendingText}>
            <h3>{t('competition.pendingApprovalTitle', { defaultValue: 'Account Pending Approval' })}</h3>
            <p>{t('competition.pendingApprovalSub', { defaultValue: "Your registration is currently being reviewed by your Sensei. You will appear on the leaderboard and start earning XP once your account is approved." })}</p>
          </div>
        </div>
      )}

      {/* No students at all */}
      {students.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Users size={36} strokeWidth={1.5} />
          </div>
          <h3>{t('competition.noStudents')}</h3>
          <p>{t('competition.noStudentsSub')}</p>
        </div>
      )}

      {/* Podium — top 3 of the current belt-filtered pool */}
      {podium.length > 0 && (
        <section className={styles.podium}>
          {podium[1]
            ? <PodiumCard entry={podium[1]} rank={2} currentUid={currentUid} t={t} />
            : <div className={styles.podiumPlaceholder} aria-hidden="true" />}
          <PodiumCard entry={podium[0]} rank={1} currentUid={currentUid} t={t} />
          {podium[2]
            ? <PodiumCard entry={podium[2]} rank={3} currentUid={currentUid} t={t} />
            : <div className={styles.podiumPlaceholder} aria-hidden="true" />}
        </section>
      )}

      {/* Your position card (students only, when outside top 3 of the current view) */}
      {isStudent && myRankedEntry && myRankedEntry.filteredRank > 3 && (
        <section className={styles.yourPosition}>
          <div className={styles.yourPositionLabel}>{t('competition.yourPosition')}</div>
          <div className={styles.yourPositionRow}>
            <div className={styles.rankPill}>#{myRankedEntry.filteredRank}</div>
            <div
              className={styles.avatar}
              style={{ backgroundColor: BELT_COLORS[myRankedEntry.belt] || '#ccc' }}
            >
              {myRankedEntry.profileImageUrl
                ? <img src={myRankedEntry.profileImageUrl} alt="" />
                : <span>{initials(myRankedEntry.name)}</span>}
            </div>
            <div className={styles.yourPositionInfo}>
              <div className={styles.rowName}>
                {myRankedEntry.name}
                <span className={styles.youChip}>{t('competition.you')}</span>
              </div>
              <div className={styles.rowMeta}>
                <span
                  className={styles.beltChip}
                  style={{
                    backgroundColor: BELT_COLORS[myRankedEntry.belt] || '#ccc',
                    color: beltTextColor(myRankedEntry.belt),
                  }}
                >
                  {getBeltLabel(myRankedEntry.belt)}
                </span>
                <span
                  className={styles.tierChip}
                  style={{
                    color: getTier(myRankedEntry.xp).color,
                    borderColor: getTier(myRankedEntry.xp).color,
                  }}
                >
                  {t(`competition.tiers.${getTier(myRankedEntry.xp).key}`)}
                </span>
              </div>
            </div>
            <div className={styles.yourPositionXp}>
              {formatXp(myRankedEntry.xp)} <span>XP</span>
            </div>
          </div>
        </section>
      )}

      {/* Filter bar */}
      {students.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.filterField}>
            <Search size={16} strokeWidth={2} className={styles.filterIcon} />
            <input
              type="text"
              className={styles.filterInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('competition.searchPlaceholder')}
            />
          </div>

          <select
            className={styles.filterSelect}
            value={beltFilter}
            onChange={(e) => setBeltFilter(e.target.value)}
          >
            <option value="all">{t('competition.allBelts')}</option>
            {availableBelts.map((b) => (
              <option key={b} value={b}>{getBeltLabel(b)}</option>
            ))}
          </select>

          {hasFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              <X size={14} strokeWidth={2} />
              {t('competition.clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* List */}
      {students.length > 0 && (
        filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>{t('competition.noMatches')}</h3>
            <p>{t('competition.noMatchesSub')}</p>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map((entry) => {
              const isMe = entry.id === currentUid;
              const tier = getTier(entry.xp);
              const pct = topXpInView > 0 ? Math.min(100, (entry.xp / topXpInView) * 100) : 0;
              const beltColor = BELT_COLORS[entry.belt] || '#ccc';

              return (
                <div
                  key={entry.id}
                  className={`${styles.row} ${isMe ? styles.youRow : ''}`}
                >
                  <div className={styles.rank}>
                    {entry.filteredRank === 1 ? '🥇'
                      : entry.filteredRank === 2 ? '🥈'
                      : entry.filteredRank === 3 ? '🥉'
                      : <span>#{entry.filteredRank}</span>}
                  </div>

                  <div
                    className={styles.avatar}
                    style={{ backgroundColor: beltColor, color: beltTextColor(entry.belt) }}
                  >
                    {entry.profileImageUrl
                      ? <img src={entry.profileImageUrl} alt="" />
                      : <span>{initials(entry.name)}</span>}
                  </div>

                  <div className={styles.info}>
                    <div className={styles.rowName}>
                      {entry.name}
                      {isMe && <span className={styles.youChip}>{t('competition.you')}</span>}
                    </div>
                    <div className={styles.rowMeta}>
                      <span
                        className={styles.beltChip}
                        style={{ backgroundColor: beltColor, color: beltTextColor(entry.belt) }}
                      >
                        {getBeltLabel(entry.belt)}
                      </span>
                      <span
                        className={styles.tierChip}
                        style={{ color: tier.color, borderColor: tier.color }}
                      >
                        {t(`competition.tiers.${tier.key}`)}
                      </span>
                      <span className={styles.badgeCount}>
                        <Medal size={12} strokeWidth={2} />
                        {t('competition.badges', { count: entry.claimedCount })}
                      </span>
                    </div>
                  </div>

                  <div className={styles.xpBlock}>
                    <div className={styles.xpValue}>
                      {formatXp(entry.xp)}
                      <span className={styles.xpUnit}>XP</span>
                    </div>
                    <div className={styles.xpBar}>
                      <div
                        className={styles.xpBarFill}
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${tier.color}, var(--color-gold))`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* CTA for students */}
      {isStudent && students.length > 0 && (
        <Link to="/rewards" className={styles.ctaCard}>
          <div className={styles.ctaIcon}>🎯</div>
          <div className={styles.ctaText}>
            <strong>{t('competition.ctaTitle')}</strong>
            <span>{t('competition.ctaSub')}</span>
          </div>
          <div className={styles.ctaArrow}>→</div>
        </Link>
      )}
    </div>
  );
}