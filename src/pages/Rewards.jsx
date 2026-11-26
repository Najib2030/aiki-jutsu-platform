// src/pages/Rewards.jsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import Loading from '../components/Loading';
import {
  collection, query, where, getDocs, doc, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { RARITY, BADGES, TOTAL_XP, computeBadgeStats } from '../utils/badges';
import styles from './Rewards.module.css';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

const CATEGORIES = [
  { id: 'all',         icon: '🏆' },
  { id: 'progression', icon: '🥋' },
  { id: 'dedication',  icon: '🔥' },
  { id: 'performance', icon: '🎯' },
  { id: 'mastery',     icon: '📚' },
  { id: 'special',     icon: '✨' },
];

// ══════════════════════════════════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════════════════════════════════
function generateConfetti(accentColor) {
  const palette = ['#d4af37', '#8b2c24', '#f4f1ea', accentColor, '#ffffff', '#e74c3c'];
  return Array.from({ length: 56 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 56 + (Math.random() - 0.5) * 0.35;
    const distance = 240 + Math.random() * 400;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 6 + Math.random() * 9,
      delay: Math.random() * 0.35,
      duration: 1.5 + Math.random() * 1.0,
      rotation: Math.random() * 1080 - 540,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape:
        Math.random() > 0.65 ? 'streamer' :
        Math.random() > 0.5  ? 'circle'   : 'square',
    };
  });
}

// ══════════════════════════════════════════════════════════════════
// CELEBRATION OVERLAY
// ══════════════════════════════════════════════════════════════════
function ClaimCelebration({ badge, onClose, current, total }) {
  const { t } = useTranslation();
  const rarity = RARITY[badge.rarity];
  const isLast = !total || total <= 1 || current >= total;

  const [leaving, setLeaving] = useState(false);
  const [xpDisplay, setXpDisplay] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [confetti] = useState(() => generateConfetti(rarity.color));

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 400);
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const start = performance.now();
    let raf;
    const animate = (now) => {
      const elapsed = now - start - 800;
      if (elapsed < 0) { raf = requestAnimationFrame(animate); return; }
      const progress = Math.min(elapsed / 800, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setXpDisplay(Math.round(rarity.xp * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const hintTimer = setTimeout(() => setShowHint(true), 1800);

    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      clearTimeout(hintTimer);
      window.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={`${styles.celebrationOverlay} ${leaving ? styles.celebrationLeaving : ''}`}
      onClick={dismiss}
    >
      <div className={styles.confettiLayer} aria-hidden="true">
        {confetti.map(p => {
          const baseStyle = {
            '--tx': `${p.x}px`,
            '--ty': `${p.y}px`,
            '--rot': `${p.rotation}deg`,
            '--delay': `${p.delay}s`,
            '--duration': `${p.duration}s`,
            '--color': p.color,
          };
          const shapeStyle =
            p.shape === 'streamer'
              ? { width: '4px', height: '18px', borderRadius: '2px' }
              : { width: `${p.size}px`, height: `${p.size}px`, borderRadius: p.shape === 'circle' ? '50%' : '2px' };
          return (
            <span
              key={p.id}
              className={styles.confettiParticle}
              style={{ ...baseStyle, ...shapeStyle }}
            />
          );
        })}
      </div>

      <div className={styles.celebrationRings} aria-hidden="true">
        <div className={styles.shockRing} style={{ '--color': rarity.color }} />
        <div className={styles.shockRing} style={{ '--color': rarity.color, animationDelay: '0.18s' }} />
        <div className={styles.shockRing} style={{ '--color': rarity.color, animationDelay: '0.36s' }} />
      </div>

      <div className={styles.celebrationCenter}>
        <div
          className={`${styles.celebrationMedal} ${
            badge.rarity === 'legendary' ? styles.celebrationLegendary : ''
          }`}
          style={{ '--rarity': rarity.color }}
        >
          <div className={styles.medalGlow} />
          <div className={styles.medalRays} />
          <div className={styles.medalDisc}>
            <span className={styles.medalEmoji}>{badge.icon}</span>
          </div>
        </div>

        <div className={styles.celebrationText}>
          <div className={styles.celebrationEyebrow}>
            {t('rewards.celebration.eyebrow')}
          </div>
          <h2 className={styles.celebrationName}>{badge.name}</h2>
          <div className={styles.celebrationXP} style={{ color: rarity.color }}>
            {t('rewards.celebration.xp', { xp: xpDisplay })}
          </div>
          <div
            className={styles.celebrationRarity}
            style={{ borderColor: rarity.color, color: rarity.color }}
          >
            {t(`rewards.rarity.${badge.rarity}`)}
          </div>
        </div>
      </div>

      <div className={`${styles.celebrationHint} ${showHint ? styles.celebrationHintVisible : ''}`}>
        {isLast
          ? t('rewards.celebration.tapClose')
          : t('rewards.celebration.tapContinue')}
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function Rewards() {
  const { t } = useTranslation();
  const { userData, currentUser, setUserData } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ items: [], progress: [], quizAttempts: [], beltRequests: [] });
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [claiming, setClaiming] = useState({});
  const [celebration, setCelebration] = useState(null);
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [claimingAll, setClaimingAll] = useState(false);
  const [toast, setToast] = useState(null);

  const claimedBadges = userData?.claimedBadges || [];

  useEffect(() => {
    async function load() {
      if (!userData || !currentUser) return;
      try {
        const userBelt = userData.belt || 'yellow';
        const maxIdx = BELT_ORDER.indexOf(userBelt);
        const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];

        const [itemBatches, progSnap, quizSnap, reqSnap] = await Promise.all([
          Promise.all(
            belts.map(async (belt) => {
              const snap = await getDocs(
                query(collection(db, 'items'), where('minimumGrade', '==', belt))
              );
              return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            })
          ),
          getDocs(query(collection(db, 'progress'), where('userId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'beltRequests'), where('userId', '==', currentUser.uid))),
        ]);

        setData({
          items: itemBatches.flat(),
          progress: progSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          quizAttempts: quizSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          beltRequests: reqSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (err) {
        console.error('Failed to load rewards data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userData, currentUser]);

  // ★ Stats now come from the shared helper so this page, the sidebar
  // dot (Layout.jsx), and Competition.jsx all use the exact same numbers.
  const stats = useMemo(
    () => computeBadgeStats(userData, data),
    [data, userData]
  );

  const badges = useMemo(() => {
    return BADGES.map(badge => {
      const result = badge.compute(stats);
      return {
        ...badge,
        ...result,
        name: t(`rewards.badges.${badge.id}.name`),
        description: t(`rewards.badges.${badge.id}.description`),
        hint: t(`rewards.badges.${badge.id}.hint`),
        claimed: claimedBadges.includes(badge.id),
      };
    });
  }, [stats, claimedBadges, t]);

  const claimedCount = badges.filter(b => b.claimed).length;
  const unclaimed = badges.filter(b => b.earned && !b.claimed);
  const unclaimedCount = unclaimed.length;
  const claimedXP = badges.filter(b => b.claimed).reduce((s, b) => s + RARITY[b.rarity].xp, 0);
  const overallPercent = Math.round((claimedCount / BADGES.length) * 100);

  const nextToUnlock = useMemo(() => {
    return badges
      .filter(b => !b.earned && b.target > 1 && b.current > 0 && !b.awaitingValidation)
      .sort((a, b) => (b.current / b.target) - (a.current / a.target))
      .slice(0, 3);
  }, [badges]);

  const getStatus = (b) => {
    if (b.earned && !b.claimed) return 0;
    if (b.claimed) return 1;
    return 2;
  };

  const filtered = useMemo(() => {
    return badges
      .filter(b => categoryFilter === 'all' || b.category === categoryFilter)
      .filter(b => rarityFilter === 'all' || b.rarity === rarityFilter)
      .filter(b => {
        if (statusFilter === 'unclaimed') return b.earned && !b.claimed;
        if (statusFilter === 'claimed') return b.claimed;
        if (statusFilter === 'locked') return !b.earned;
        return true;
      })
      .sort((a, b) => {
        const sa = getStatus(a);
        const sb = getStatus(b);
        if (sa !== sb) return sa - sb;
        if (sa === 2) return (b.current / b.target) - (a.current / a.target);
        return RARITY[b.rarity].weight - RARITY[a.rarity].weight;
      });
  }, [badges, categoryFilter, rarityFilter, statusFilter]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const claimBadge = async (badge) => {
    if (!currentUser || badge.claimed || !badge.earned) return;
    if (claiming[badge.id] || celebration) return;
    setClaiming(prev => ({ ...prev, [badge.id]: true }));

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        claimedBadges: arrayUnion(badge.id),
      });
      setUserData({
        ...userData,
        claimedBadges: [...(userData.claimedBadges || []), badge.id],
      });
      setCelebrationQueue([]);
      setBatchTotal(0);
      setCelebration(badge);
      setSelectedId(null);
    } catch (err) {
      console.error('Failed to claim badge:', err);
    } finally {
      setClaiming(prev => ({ ...prev, [badge.id]: false }));
    }
  };

  const claimAll = async () => {
    if (!currentUser || unclaimed.length === 0) return;
    if (claimingAll || celebration) return;

    const badgesToClaim = [...unclaimed];
    setClaimingAll(true);

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        claimedBadges: arrayUnion(...badgesToClaim.map(b => b.id)),
      });
      setUserData({
        ...userData,
        claimedBadges: [...(userData.claimedBadges || []), ...badgesToClaim.map(b => b.id)],
      });

      setBatchTotal(badgesToClaim.length);
      setCelebrationQueue(badgesToClaim.slice(1));
      setCelebration(badgesToClaim[0]);
    } catch (err) {
      console.error('Failed to claim all badges:', err);
    } finally {
      setClaimingAll(false);
    }
  };

  const handleCelebrationClose = () => {
    if (celebrationQueue.length > 0) {
      const [next, ...rest] = celebrationQueue;
      setCelebrationQueue(rest);
      setCelebration(next);
    } else {
      setCelebration(null);
      if (batchTotal >= 2) {
        showToast(t('rewards.claim.toast', { count: batchTotal }));
      }
      setBatchTotal(0);
    }
  };

  const selectedBadge = selectedId ? badges.find(b => b.id === selectedId) : null;

  if (loading) return <Loading text={t('rewards.loading')} />;

  const batchSize = batchTotal > 1 ? batchTotal : undefined;
  const heroName =
    userData?.name?.split(' ')[0] || t('rewards.hero.studentFallback');

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroEyebrow}>{t('rewards.hero.eyebrow')}</div>
          <h1 className={styles.heroTitle}>{t('rewards.hero.title')}</h1>
          <p className={styles.heroSubtitle}>
            {t('rewards.hero.subtitle', { name: heroName })}
          </p>

          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <div className={styles.heroStatVal}>{claimedCount}</div>
              <div className={styles.heroStatLabel}>
                {t('rewards.hero.statClaimed', { total: BADGES.length })}
              </div>
            </div>
            <div className={`${styles.heroStat} ${unclaimedCount > 0 ? styles.heroStatHighlight : ''}`}>
              <div className={styles.heroStatVal}>
                {unclaimedCount > 0 ? unclaimedCount : '—'}
              </div>
              <div className={styles.heroStatLabel}>{t('rewards.hero.statToClaim')}</div>
            </div>
            <div className={styles.heroStat}>
              <div className={styles.heroStatVal}>{claimedXP}</div>
              <div className={styles.heroStatLabel}>
                {t('rewards.hero.statXp', { total: TOTAL_XP })}
              </div>
            </div>
            <div className={styles.heroStat}>
              <div className={styles.heroStatVal}>
                {stats.currentStreak > 0 ? `🔥 ${stats.currentStreak}` : '—'}
              </div>
              <div className={styles.heroStatLabel}>{t('rewards.hero.statStreak')}</div>
            </div>
          </div>
        </div>

        <div className={styles.heroRight}>
          <svg viewBox="0 0 160 160" className={styles.heroRing}>
            <circle cx="80" cy="80" r="66" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="14" />
            <circle
              cx="80" cy="80" r="66" fill="none"
              stroke="url(#ringGrad)" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 66}
              strokeDashoffset={2 * Math.PI * 66 * (1 - overallPercent / 100)}
              transform="rotate(-90 80 80)"
              style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#d4af37" />
                <stop offset="100%" stopColor="#8b2c24" />
              </linearGradient>
            </defs>
          </svg>
          <div className={styles.heroRingCenter}>
            <div className={styles.heroPct}>{overallPercent}%</div>
            <div className={styles.heroPctLabel}>{t('rewards.hero.pctLabel')}</div>
          </div>
        </div>
      </section>

      {unclaimedCount > 0 && (
        <div className={styles.claimBanner}>
          <div className={styles.claimBannerIcon}>🎁</div>
          <div className={styles.claimBannerText}>
            <strong>
              {t('rewards.claim.banner', { count: unclaimedCount })}
            </strong>
            <span>{t('rewards.claim.subtitle')}</span>
          </div>
          <button
            className={styles.claimAllBtn}
            onClick={claimAll}
            disabled={claimingAll || !!celebration}
          >
            {claimingAll ? t('rewards.claim.claiming') : t('rewards.claim.claimAll')}
          </button>
        </div>
      )}

      {nextToUnlock.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t('rewards.next.title')}</h2>
            <p className={styles.sectionSub}>{t('rewards.next.subtitle')}</p>
          </div>
          <div className={styles.nextGrid}>
            {nextToUnlock.map(b => {
              const pct = Math.round((b.current / b.target) * 100);
              return (
                <button
                  key={b.id}
                  className={styles.nextCard}
                  onClick={() => setSelectedId(b.id)}
                  style={{ '--rarity': RARITY[b.rarity].color }}
                >
                  <div className={styles.nextBadge}>
                    <span className={styles.nextIcon}>{b.icon}</span>
                  </div>
                  <div className={styles.nextBody}>
                    <div className={styles.nextName}>{b.name}</div>
                    <div className={styles.nextMeta}>{b.current} / {b.target}</div>
                    <div className={styles.nextBarTrack}>
                      <div className={styles.nextBarFill} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className={styles.nextPct}>{pct}%</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              className={`${styles.filterPill} ${
                categoryFilter === c.id ? styles.filterPillActive : ''
              }`}
              onClick={() => setCategoryFilter(c.id)}
            >
              <span className={styles.filterIcon}>{c.icon}</span>
              {t(`rewards.categories.${c.id}`)}
            </button>
          ))}
        </div>

        <div className={styles.filterDropdowns}>
          <select
            className={styles.raritySelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t('rewards.filter.allStatuses')}</option>
            <option value="unclaimed">
              {t('rewards.filter.readyToClaim', { count: unclaimedCount })}
            </option>
            <option value="claimed">
              {t('rewards.filter.claimed', { count: claimedCount })}
            </option>
            <option value="locked">
              {t('rewards.filter.locked', {
                count: BADGES.length - claimedCount - unclaimedCount,
              })}
            </option>
          </select>

          <select
            className={styles.raritySelect}
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
          >
            <option value="all">{t('rewards.filter.allRarities')}</option>
            {Object.keys(RARITY).map(key => (
              <option key={key} value={key}>{t(`rewards.rarity.${key}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔍</div>
          <p>{t('rewards.noMatches')}</p>
        </div>
      ) : (
        <div className={styles.badgeGrid}>
          {filtered.map((b, idx) => {
            const status = getStatus(b);
            const isUnclaimed = status === 0;
            const isClaimed = status === 1;

            let cardClass = styles.badgeCard;
            if (isUnclaimed) cardClass += ` ${styles.badgeUnclaimed}`;
            if (isClaimed) cardClass += ` ${styles.badgeClaimed}`;
            if (status === 2) cardClass += ` ${styles.badgeLocked}`;
            if (b.awaitingValidation) cardClass += ` ${styles.badgeAwaitingState}`;
            if (b.rarity === 'legendary' && isClaimed) cardClass += ` ${styles.badgeLegendary}`;

            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                className={cardClass}
                style={{
                  '--rarity': RARITY[b.rarity].color,
                  animationDelay: `${Math.min(idx * 25, 400)}ms`,
                }}
                onClick={() => setSelectedId(b.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(b.id);
                  }
                }}
              >
                {isClaimed && (
                  <div className={styles.claimedRibbon}>
                    {t('rewards.card.ribbonClaimed')}
                  </div>
                )}
                {isUnclaimed && (
                  <div className={styles.readyRibbon}>
                    {t('rewards.card.ribbonReady')}
                  </div>
                )}

                <div className={styles.badgeMedal}>
                  <div className={styles.badgeRingOuter} />
                  <div className={styles.badgeRingInner}>
                    <span className={styles.badgeEmoji}>{b.icon}</span>
                  </div>
                  {b.rarity === 'legendary' && isClaimed && (
                    <div className={styles.legendaryShine} />
                  )}
                </div>

                <div className={styles.badgeBody}>
                  <div className={styles.badgeName}>{b.name}</div>
                  <div
                    className={styles.badgeRarity}
                    style={{ color: RARITY[b.rarity].color }}
                  >
                    {t(`rewards.rarity.${b.rarity}`)}
                  </div>
                </div>

                {isUnclaimed ? (
                  <button
                    className={styles.claimBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      claimBadge(b);
                    }}
                    disabled={claiming[b.id]}
                  >
                    {claiming[b.id]
                      ? t('rewards.card.claiming')
                      : t('rewards.card.claim', { xp: RARITY[b.rarity].xp })}
                  </button>
                ) : isClaimed ? (
                  <div className={styles.claimedCheck}>
                    <span>✓</span> {t('rewards.card.claimed')}
                  </div>
                ) : b.awaitingValidation ? (
                  <div className={styles.badgeAwaiting}>
                    <span className={styles.awaitingIcon}>⏳</span>
                    {t('rewards.card.awaitingSensei')}
                  </div>
                ) : b.target > 1 ? (
                  <div className={styles.badgeProgress}>
                    <div className={styles.badgeProgressTrack}>
                      <div
                        className={styles.badgeProgressFill}
                        style={{ width: `${Math.min((b.current / b.target) * 100, 100)}%` }}
                      />
                    </div>
                    <div className={styles.badgeProgressText}>
                      {b.current} / {b.target}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {selectedBadge && createPortal(
        <div className={styles.modalOverlay} onClick={() => setSelectedId(null)}>
          <div
            className={`${styles.modal} ${
              selectedBadge.claimed ? styles.modalClaimed : ''
            } ${selectedBadge.earned && !selectedBadge.claimed ? styles.modalUnclaimed : styles.modalLocked}`}
            style={{ '--rarity': RARITY[selectedBadge.rarity].color }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.modalClose}
              onClick={() => setSelectedId(null)}
              aria-label={t('common.close')}
            >
              ✕
            </button>

            <div className={styles.modalMedalWrap}>
              <div className={`${styles.modalMedal} ${
                selectedBadge.rarity === 'legendary' ? styles.modalMedalLegendary : ''
              }`}>
                <span className={styles.modalEmoji}>{selectedBadge.icon}</span>
                {selectedBadge.rarity === 'legendary' && selectedBadge.claimed && (
                  <div className={styles.modalShine} />
                )}
              </div>
            </div>

            <div
              className={styles.modalRarity}
              style={{ color: RARITY[selectedBadge.rarity].color }}
            >
              {t('rewards.modal.rarityXp', {
                rarity: t(`rewards.rarity.${selectedBadge.rarity}`),
                xp: RARITY[selectedBadge.rarity].xp,
              })}
            </div>

            <h3 className={styles.modalTitle}>{selectedBadge.name}</h3>
            <p className={styles.modalDesc}>{selectedBadge.description}</p>

            {selectedBadge.claimed ? (
              <div className={styles.modalClaimedBadge}>
                <span>✓</span> {t('rewards.modal.claimed')}
              </div>
            ) : selectedBadge.earned ? (
              <>
                <div className={styles.modalReadyBadge}>
                  {t('rewards.modal.ready')}
                </div>
                <button
                  className={styles.modalClaimBtn}
                  onClick={() => claimBadge(selectedBadge)}
                  disabled={claiming[selectedBadge.id]}
                >
                  {claiming[selectedBadge.id]
                    ? t('rewards.modal.claiming')
                    : t('rewards.modal.claimReward', {
                        xp: RARITY[selectedBadge.rarity].xp,
                      })}
                </button>
              </>
            ) : (
              <>
                <div className={styles.modalHint}>
                  {selectedBadge.awaitingValidation ? (
                    <Trans
                      i18nKey="rewards.modal.awaitingHint"
                      components={{ strong: <strong /> }}
                    />
                  ) : (
                    <Trans
                      i18nKey="rewards.modal.unlockHint"
                      values={{ hint: selectedBadge.hint }}
                      components={{ strong: <strong /> }}
                    />
                  )}
                </div>

                {!selectedBadge.awaitingValidation && selectedBadge.target > 1 && (
                  <div className={styles.modalProgressWrap}>
                    <div className={styles.modalProgressTrack}>
                      <div
                        className={styles.modalProgressFill}
                        style={{
                          width: `${Math.min((selectedBadge.current / selectedBadge.target) * 100, 100)}%`,
                          background: RARITY[selectedBadge.rarity].color,
                        }}
                      />
                    </div>
                    <div className={styles.modalProgressText}>
                      {selectedBadge.current} / {selectedBadge.target}
                      <span className={styles.modalProgressPct}>
                        ({Math.round((selectedBadge.current / selectedBadge.target) * 100)}%)
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {celebration && (
        <ClaimCelebration
          key={celebration.id}
          badge={celebration}
          onClose={handleCelebrationClose}
          total={batchSize}
        />
      )}

      {toast && createPortal(
        <div className={styles.toast}>{toast}</div>,
        document.body
      )}
    </div>
  );
}