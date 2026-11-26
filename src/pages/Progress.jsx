// src/pages/Progress.jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import {
  collection, query, where, getDocs, doc, setDoc, addDoc,
} from 'firebase/firestore';
import {
  Award, BookOpen, Clock, Play, Check, RotateCcw, X,
  Medal, FolderTree, ListChecks, TrendingUp,
} from 'lucide-react';
import { getBeltLabel, BELT_COLORS, formatTimeInDojo } from '../utils/experience';
import { emitProgressChanged } from '../utils/progressEvents';
import styles from './Progress.module.css';
import Loading from '../components/Loading';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

const STATUS_META = {
  completed: { shortKey: 'progress.statusCompleted',   color: '#2ecc71' },
  learning:  { shortKey: 'progress.statusLearning',    color: '#f39c12' },
  none:      { shortKey: 'progress.statusNotStarted',  color: '#b8b8b8' },
};

const STATUS_ACTIONS = {
  none: [
    { labelKey: 'progress.startLearning', next: 'learning', primary: true, Icon: Play },
  ],
  learning: [
    { labelKey: 'progress.completeAction', next: 'completed', primary: true, Icon: Check },
    { labelKey: 'progress.reset',          next: 'none',      primary: false, Icon: RotateCcw },
  ],
  completed: [
    { labelKey: 'progress.cancelAction', next: 'learning', primary: false, Icon: RotateCcw },
  ],
};

function getRingColor(belt) {
  if (!belt) return '#ffffff';
  if (belt === 'black') return '#4a4a4a';
  return BELT_COLORS[belt] || '#ffffff';
}

function getLocalizedName(item, lang) {
  if (lang === 'ar') return item.names?.ar || item.names?.en;
  if (lang === 'fr') return item.names?.fr || item.names?.en;
  return item.names?.en;
}

async function fetchAccessibleItems(userData) {
  if (userData?.role === 'admin') {
    const snap = await getDocs(collection(db, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const userBelt = userData?.belt || 'yellow';

  if (userBelt === 'dan1') {
    const batches = await Promise.all(
      BELT_ORDER.map(async (belt) => {
        const snap = await getDocs(
          query(collection(db, 'items'), where('minimumGrade', '==', belt))
        );
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      })
    );
    return batches.flat();
  }

  const snap = await getDocs(
    query(collection(db, 'items'), where('minimumGrade', '==', userBelt))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ═══════════════════════════════════════════════════════════════════════
// DAN 1 — SENSEI GRADUATION VIEW
// ═══════════════════════════════════════════════════════════════════════
function Dan1View({ items, categories, userData }) {
  const { t } = useTranslation();
  const totalMastered = items.length;

  const categoryStats = {};
  items.forEach(item => {
    const cid = item.categoryId;
    if (!cid) return;
    if (!categoryStats[cid]) categoryStats[cid] = { total: 0 };
    categoryStats[cid].total++;
  });

  const categoriesList = Object.entries(categoryStats)
    .map(([cid, g]) => ({
      id: cid,
      name: categories[cid]?.names?.en || t('progress.unknownCategory'),
      ja: categories[cid]?.names?.ja || '',
      total: g.total,
      completed: g.total,
      order: categories[cid]?.order || 999,
    }))
    .sort((a, b) => a.order - b.order);

  const beltStats = {};
  ['yellow', 'orange', 'green', 'blue', 'brown', 'black'].forEach(belt => {
    beltStats[belt] = { total: 0 };
  });
  items.forEach(item => {
    const belt = item.minimumGrade || 'yellow';
    if (beltStats[belt]) beltStats[belt].total++;
  });

  const startDate = userData?.joinedDate
    ? new Date(userData.joinedDate + 'T00:00:00')
    : userData?.createdAt?.toDate?.();
  const timeInDojo = formatTimeInDojo(startDate) || '—';

  return (
    <div className={styles.dan1Page}>
      <section className={styles.senseiHero}>
        <div className={styles.senseiArtName}>合気術</div>
        <div className={styles.senseiSeal}>免許皆伝</div>
        <h1 className={styles.senseiTitle}>{t('progress.dan1Title')}</h1>
        <p className={styles.senseiSubtitle}>{t('progress.dan1Subtitle')}</p>
        <div className={styles.senseiName}>{userData.name}</div>
        {startDate && (
          <p className={styles.senseiDate}>
            {t('progress.dan1Since', { date: startDate.toLocaleDateString() })}
          </p>
        )}
      </section>

      <section className={styles.senseiStatsGrid}>
        <div className={styles.senseiStatCard}>
          <div className={styles.senseiStatValue}>{totalMastered}</div>
          <div className={styles.senseiStatLabel}>{t('progress.dan1StatMastered')}</div>
        </div>
        <div className={styles.senseiStatCard}>
          <div className={styles.senseiStatValue}>{categoriesList.length}</div>
          <div className={styles.senseiStatLabel}>{t('progress.dan1StatCategories')}</div>
        </div>
        <div className={styles.senseiStatCard}>
          <div className={styles.senseiStatValue}>6</div>
          <div className={styles.senseiStatLabel}>{t('progress.dan1StatBelts')}</div>
        </div>
        <div className={styles.senseiStatCard}>
          <div className={`${styles.senseiStatValue} ${styles.senseiStatValueSmall}`}>
            {timeInDojo}
          </div>
          <div className={styles.senseiStatLabel}>{t('progress.dan1StatTime')}</div>
        </div>
      </section>

      <section className={styles.congratsLetter}>
        <div className={styles.letterSeal}>祝</div>
        <h2 className={styles.letterTitle}>{t('progress.dan1CongratsTitle')}</h2>
        <div className={styles.letterBody}>
          <p>
            <Trans
              i18nKey="progress.dan1LetterDear"
              values={{ name: userData.name }}
              components={{ strong: <strong /> }}
            />
          </p>
          <p>
            <Trans
              i18nKey="progress.dan1LetterBody1"
              values={{ total: totalMastered, categories: categoriesList.length }}
              components={{ strong: <strong /> }}
            />
          </p>
          <p>
            <Trans
              i18nKey="progress.dan1LetterBody2"
              components={{ strong: <strong /> }}
            />
          </p>
          <p>{t('progress.dan1LetterClosing')}</p>
          <p className={styles.letterSign}>
            <Trans
              i18nKey="progress.dan1LetterSignature"
              components={{ br: <br />, em: <em /> }}
            />
          </p>
        </div>
      </section>

      <section className={styles.senseiPanel}>
        <h2 className={styles.senseiPanelTitle}>{t('progress.beltJourney')}</h2>
        <div className={styles.senseiBeltList}>
          {['yellow', 'orange', 'green', 'blue', 'brown', 'black'].map(belt => {
            const s = beltStats[belt];
            return (
              <div key={belt} className={styles.senseiBeltRow}>
                <div className={styles.senseiBeltBadge} data-belt={belt} />
                <div className={styles.senseiBeltInfo}>
                  <div className={styles.senseiBeltName}>
                    {getBeltLabel(belt)}
                  </div>
                  <div className={styles.senseiBeltMeta}>
                    {t('progress.dan1TechniquesOf', { total: s.total })}
                  </div>
                </div>
                <div className={styles.senseiBeltCheck}>✓</div>
              </div>
            );
          })}
        </div>
      </section>

      {categoriesList.length > 0 && (
        <section className={styles.senseiPanel}>
          <h2 className={styles.senseiPanelTitle}>{t('progress.dan1StatCategories')}</h2>
          <div className={styles.senseiCategoryGrid}>
            {categoriesList.map(cat => (
              <div key={cat.id} className={styles.senseiCategoryCard}>
                <div className={styles.senseiCategoryName}>{cat.name}</div>
                {cat.ja && <div className={styles.senseiCategoryJa}>{cat.ja}</div>}
                <div className={styles.senseiCategoryCount}>
                  {cat.completed} / {cat.total}
                  <span className={styles.senseiCategoryCheck}> ✓</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Progress() {
  const { t, i18n } = useTranslation();
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();

  const activeLang = (i18n.language || 'en').split('-')[0];

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState({});
  const [items, setItems] = useState([]);
  const [beltRequest, setBeltRequest] = useState(null);
  const [approvedBelts, setApprovedBelts] = useState(new Set());
  const [updating, setUpdating] = useState({});
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    async function fetchData() {
      if (!userData || !currentUser) return;
      try {
        setError('');
        const currentBelt = userData.belt || 'yellow';

        const [catSnap, accessibleItems, progSnap, reqSnap] = await Promise.all([
          getDocs(collection(db, 'categories')),
          fetchAccessibleItems(userData),
          getDocs(query(collection(db, 'progress'), where('userId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'beltRequests'), where('userId', '==', currentUser.uid))),
        ]);

        const catMap = {};
        catSnap.forEach(d => { catMap[d.id] = { id: d.id, ...d.data() }; });

        const progressMap = {};
        progSnap.forEach(d => {
          const data = d.data();
          if (data.itemId) progressMap[data.itemId] = data.status;
        });

        const merged = accessibleItems.map(it => {
          let st = progressMap[it.id] || 'none';
          if (st === 'validated') st = 'completed';
          if (st === 'review')    st = 'learning';
          return { ...it, currentStatus: st };
        });

        const reqDocs = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const matching = reqDocs
          .filter(r => r.belt === currentBelt)
          .sort((a, b) => {
            const at = a.requestedAt?.toDate?.()?.getTime?.() || 0;
            const bt = b.requestedAt?.toDate?.()?.getTime?.() || 0;
            return bt - at;
          });

        // Collect all belts that have been officially approved by an admin
        const approvedSet = new Set(
          reqDocs.filter(r => r.status === 'approved').map(r => r.belt)
        );

        setCategories(catMap);
        setItems(merged);
        setBeltRequest(matching[0] || null);
        setApprovedBelts(approvedSet);
      } catch (err) {
        console.error('Error fetching progress data:', err);
        setError('progress.fetchError');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [userData, currentUser]);

  const stats = useMemo(() => {
    const s = { total: items.length, completed: 0, learning: 0, none: 0 };
    const valid = ['completed', 'learning', 'none'];
    items.forEach(i => {
      const st = valid.includes(i.currentStatus) ? i.currentStatus : 'none';
      s[st]++;
    });
    s.percent = s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100);
    return s;
  }, [items]);

  const allCompleted = stats.total > 0 && stats.completed === stats.total;
  const requestStatus = beltRequest?.status || null;
  const actionsDisabled = requestStatus === 'pending' || requestStatus === 'approved';
  const canRequest = allCompleted && !actionsDisabled &&
    (!beltRequest || beltRequest.status === 'rejected');

  // Memoized belt journey — checks approvedBelts to mark as completed
  const beltJourney = useMemo(() => {
    const userBelt = userData?.belt || 'yellow';
    const userIdx = BELT_ORDER.indexOf(userBelt);
    return BELT_ORDER.map((belt, idx) => {
      const beltItems = items.filter(i => (i.minimumGrade || 'yellow') === belt);
      const total = beltItems.length;
      const completed = beltItems.filter(i => i.currentStatus === 'completed').length;
      
      let state = 'locked';
      // If the belt is validated by admin OR it's a past belt, mark as completed
      if (approvedBelts.has(belt) || idx < userIdx) {
        state = 'completed';
      } else if (idx === userIdx) {
        state = 'current';
      }
      
      return { belt, total, completed, state };
    });
  }, [items, userData, approvedBelts]);

  const categoryProgress = useMemo(() => {
    const grouped = {};
    items.forEach(item => {
      const cid = item.categoryId;
      if (!cid) return;
      if (!grouped[cid]) grouped[cid] = { total: 0, completed: 0 };
      grouped[cid].total++;
      if (item.currentStatus === 'completed') grouped[cid].completed++;
    });
    return Object.entries(grouped)
      .map(([cid, g]) => {
        const cat = categories[cid];
        return {
          id: cid,
          name: cat?.names?.en || t('progress.unknownCategory'),
          ja: cat?.names?.ja || '',
          order: cat?.order || 999,
          total: g.total,
          completed: g.completed,
          percent: g.total === 0 ? 0 : Math.round((g.completed / g.total) * 100),
        };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => a.order - b.order);
  }, [items, categories, t]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(item => {
        if (q) {
          const ja = (item.names?.ja || '').toLowerCase();
          const en = (item.names?.en || '').toLowerCase();
          if (!ja.includes(q) && !en.includes(q)) return false;
        }
        if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
        if (statusFilter !== 'all' && item.currentStatus !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const ca = categories[a.categoryId]?.order || 999;
        const cb = categories[b.categoryId]?.order || 999;
        if (ca !== cb) return ca - cb;
        return (a.order || 0) - (b.order || 0);
      });
  }, [items, search, categoryFilter, statusFilter, categories]);

  const hasActiveFilters =
    !!search.trim() || categoryFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch(''); setCategoryFilter('all'); setStatusFilter('all');
  };

  const handleStatusChange = async (itemId, newStatus) => {
    if (!currentUser || actionsDisabled) return;
    const item = items.find(i => i.id === itemId);
    if (!item || updating[itemId]) return;
    const oldStatus = item.currentStatus;

    setUpdating(prev => ({ ...prev, [itemId]: true }));
    setItems(prev =>
      prev.map(i => (i.id === itemId ? { ...i, currentStatus: newStatus } : i))
    );

    try {
      await setDoc(
        doc(db, 'progress', `${currentUser.uid}_${itemId}`),
        { userId: currentUser.uid, itemId, status: newStatus, updatedAt: new Date() },
        { merge: true }
      );
      emitProgressChanged({ itemId, status: newStatus });
    } catch (err) {
      console.error('Error saving progress:', err);
      setItems(prev =>
        prev.map(i => (i.id === itemId ? { ...i, currentStatus: oldStatus } : i))
      );
      alert(t('progress.saveFailed'));
    } finally {
      setUpdating(prev => {
        const n = { ...prev }; delete n[itemId]; return n;
      });
    }
  };

  const handleRequestValidation = async () => {
    if (!currentUser || !userData || requesting || !canRequest) return;
    setRequesting(true);
    try {
      const docRef = await addDoc(collection(db, 'beltRequests'), {
        userId: currentUser.uid,
        userName: userData.name || '',
        userEmail: userData.email || '',
        belt: userData.belt || 'yellow',
        status: 'pending',
        requestedAt: new Date(),
        reviewedAt: null,
        rejectionReason: null,
        reviewedBy: null,
      });
      setBeltRequest({
        id: docRef.id,
        userId: currentUser.uid,
        userName: userData.name || '',
        userEmail: userData.email || '',
        belt: userData.belt || 'yellow',
        status: 'pending',
        requestedAt: new Date(),
        reviewedAt: null,
        rejectionReason: null,
        reviewedBy: null,
      });
    } catch (err) {
      console.error('Error requesting belt validation:', err);
      alert(t('progress.requestFailed'));
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return <Loading text={t('progress.loading')} />;
  if (error) return <p style={{ color: 'var(--color-bengara)', fontWeight: 'bold' }}>{t(error, { defaultValue: error })}</p>;

  if (userData?.belt === 'dan1' && userData?.role !== 'admin') {
    return <Dan1View items={items} categories={categories} userData={userData} />;
  }

  const userBelt = userData?.belt || 'yellow';
  const beltLabel = getBeltLabel(userBelt);

  const userBeltIdx = BELT_ORDER.indexOf(userBelt);
  const prevBelt = userBeltIdx > 0 ? BELT_ORDER[userBeltIdx - 1] : null;
  const ringTrackColor = prevBelt ? getRingColor(prevBelt) : '#ffffff';
  const ringFillColor = getRingColor(userBelt);

  let banner = null;
  if (requestStatus === 'pending') {
    banner = {
      kind: 'pending', icon: '⏳',
      title: t('progress.bannerPendingTitle'),
      message: t('progress.bannerPendingMessage', { belt: beltLabel }),
      showRequest: false,
    };
  } else if (requestStatus === 'approved') {
    banner = {
      kind: 'approved', icon: '🎉',
      title: t('progress.bannerApprovedTitle'),
      message: t('progress.bannerApprovedMessage', { belt: beltLabel }),
      showRequest: false,
    };
  } else if (requestStatus === 'rejected') {
    banner = {
      kind: 'rejected', icon: '❌',
      title: t('progress.bannerRejectedTitle'),
      message: t('progress.bannerRejectedMessage', {
        belt: beltLabel,
        reason: beltRequest?.rejectionReason || t('progress.notSpecified'),
      }),
      showRequest: canRequest,
    };
  } else if (canRequest) {
    banner = {
      kind: 'ready', icon: '🎯',
      title: t('progress.bannerReadyTitle'),
      message: t('progress.bannerReadyMessage', { belt: beltLabel }),
      showRequest: true,
    };
  }

  return (
    <div className={styles.progressPage}>
      <section className={styles.hero} data-belt={userBelt}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            <TrendingUp size={28} strokeWidth={2} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
            {t('progress.heroTitle')}
          </h1>
          <div className={styles.heroBelt}>
            <span className={styles.beltPill} data-belt={userBelt}>{beltLabel}</span>
            <span className={styles.heroSub}>
              {t('progress.heroSub', { completed: stats.completed, total: stats.total })}
            </span>
          </div>
        </div>
        <div className={styles.heroRing} aria-label={t('progress.heroRingAria', { percent: stats.percent })}>
          <svg viewBox="0 0 120 120" className={styles.ringSvg}>
            <circle
              cx="60" cy="60" r="52"
              className={styles.ringTrack}
              style={{ stroke: ringTrackColor }}
            />
            <circle
              cx="60" cy="60" r="52"
              className={styles.ringFill}
              style={{
                stroke: ringFillColor,
                strokeDasharray: `${2 * Math.PI * 52}`,
                strokeDashoffset: `${2 * Math.PI * 52 * (1 - stats.percent / 100)}`,
              }}
            />
          </svg>
          <div className={styles.ringLabel}>
            <span className={styles.ringValue}>{stats.percent}%</span>
            <span className={styles.ringCaption}>{t('progress.complete')}</span>
          </div>
        </div>
      </section>

      {banner && (
        <div className={`${styles.banner} ${styles[`banner_${banner.kind}`]}`}>
          <div className={styles.bannerContent}>
            <span className={styles.bannerIcon}>{banner.icon}</span>
            <div>
              <div className={styles.bannerTitle}>{banner.title}</div>
              <div className={styles.bannerMessage}>{banner.message}</div>
            </div>
          </div>
          {banner.showRequest && (
            <button className={styles.requestBtn} onClick={handleRequestValidation} disabled={requesting}>
              {requesting ? t('progress.sending') : t('progress.requestValidation')}
            </button>
          )}
        </div>
      )}

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard} data-status="completed">
          <Award size={20} strokeWidth={1.8} className={styles.kpiIcon} />
          <div className={styles.kpiValue}>{stats.completed}</div>
          <div className={styles.kpiLabel}>{t('progress.statusCompleted')}</div>
          <div className={styles.kpiHint}>{t('progress.techniquesMasteredHint')}</div>
        </div>
        <div className={styles.kpiCard} data-status="learning">
          <BookOpen size={20} strokeWidth={1.8} className={styles.kpiIcon} />
          <div className={styles.kpiValue}>{stats.learning}</div>
          <div className={styles.kpiLabel}>{t('progress.statusLearning')}</div>
          <div className={styles.kpiHint}>{t('progress.inActivePractice')}</div>
        </div>
        <div className={styles.kpiCard} data-status="none">
          <Clock size={20} strokeWidth={1.8} className={styles.kpiIcon} />
          <div className={styles.kpiValue}>{stats.none}</div>
          <div className={styles.kpiLabel}>{t('progress.statusNotStarted')}</div>
          <div className={styles.kpiHint}>{t('progress.readyWhenYouAre')}</div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          <Medal size={16} strokeWidth={2} /> {t('progress.beltJourney')}
        </h2>
        <div className={styles.beltSteps}>
          {beltJourney.map(step => (
            <div
              key={step.belt}
              className={styles.beltStep}
              data-state={step.state}
              data-belt={step.belt}
              style={{ '--belt-color': BELT_COLORS[step.belt] || '#ccc' }}
            >
              <div className={styles.beltDot}>
                {step.state === 'completed' && '✓'}
                {step.state === 'current' && '●'}
                {step.state === 'locked' && '🔒'}
              </div>
              <div className={styles.beltStepLabel}>{t(`belts.short.${step.belt}`)}</div>
              <div className={styles.beltStepMeta}>
                {step.state === 'locked'    && t('progress.locked')}
                {step.state === 'completed' && t('progress.completedStep')}
                {step.state === 'current'   && `${step.completed}/${step.total}`}
              </div>
            </div>
          ))}
        </div>
      </section>

      {categoryProgress.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            <FolderTree size={16} strokeWidth={2} /> {t('progress.progressByCategory')}
          </h2>
          <div className={styles.categoryList}>
            {categoryProgress.map(cat => (
              <div key={cat.id} className={styles.categoryRow}>
                <div className={styles.categoryHeader}>
                  <div>
                    <span className={styles.categoryName}>{cat.name}</span>
                    {cat.ja && <span className={styles.categoryJa}>{cat.ja}</span>}
                  </div>
                  <span className={styles.categoryStat}>
                    {cat.completed}/{cat.total} · {cat.percent}%
                  </span>
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${cat.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.listHeader}>
          <h2 className={styles.panelTitle}>
            <ListChecks size={16} strokeWidth={2} /> {t('progress.techniquesTitle')}
          </h2>
          <span className={styles.listCount}>
            {t('progress.filteredOf', { filtered: filteredItems.length, total: items.length })}
          </span>
        </div>

        <div className={styles.filterBar}>
          <input
            type="text"
            className={styles.filterInput}
            placeholder={t('progress.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className={styles.filterSelect} value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">{t('progress.allCategories')}</option>
            {Object.values(categories)
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map(c => (
                <option key={c.id} value={c.id}>{c.names?.en || c.id}</option>
              ))}
          </select>
          <select className={styles.filterSelect} value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">{t('progress.allStatuses')}</option>
            <option value="completed">{t('progress.statusCompleted')}</option>
            <option value="learning">{t('progress.statusLearning')}</option>
            <option value="none">{t('progress.statusNotStarted')}</option>
          </select>
          {hasActiveFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              <X size={14} strokeWidth={2} /> {t('progress.clear')}
            </button>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className={styles.emptyState}>
            {items.length === 0
              ? t('progress.noTechniquesYet')
              : t('progress.noMatches')}
          </div>
        ) : (
          <div className={styles.techniqueList}>
            {filteredItems.map(item => {
              const cat = categories[item.categoryId];
              const status = item.currentStatus;
              const actions = STATUS_ACTIONS[status] || [];
              const isUpdating = !!updating[item.id];
              const secondaryName = getLocalizedName(item, activeLang);

              const goToDetail = () => {
                navigate(`/syllabus/${item.categoryId}/${item.id}`, {
                  state: { fromPage: 'progress' },
                });
              };

              return (
                <div
                  key={item.id}
                  className={styles.techniqueRow}
                  data-status={status}
                  onClick={goToDetail}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToDetail();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title={t('progress.viewTechniqueTitle')}
                >
                  <div className={styles.techniqueOrder}>{item.order || '·'}</div>

                  <div className={styles.techniqueMain}>
                    <div className={styles.techniqueName}>
                      <span className={styles.techniqueJa}>{item.names?.ja || '—'}</span>
                      {secondaryName && (
                        <span className={styles.techniqueEn} dir="auto">{secondaryName}</span>
                      )}
                    </div>
                    <div className={styles.techniqueMeta}>
                      {cat && <span className={styles.categoryChip}>{cat.names?.en}</span>}
                      <span className={styles.beltChip} data-belt={item.minimumGrade || 'yellow'}>
                        {getBeltLabel(item.minimumGrade || 'yellow')}
                      </span>
                    </div>
                  </div>

                  <div className={styles.techniqueStatus}>
                    <span className={styles.statusPill} data-status={status}>
                      {STATUS_META[status]
                        ? t(STATUS_META[status].shortKey)
                        : t('progress.unknownStatus')}
                    </span>
                  </div>

                  <div
                    className={styles.techniqueActions}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {actions.map(action => {
                      const ActionIcon = action.Icon;
                      return (
                        <button
                          key={action.next}
                          className={action.primary ? styles.actionPrimary : styles.actionSecondary}
                          onClick={() => handleStatusChange(item.id, action.next)}
                          disabled={isUpdating || actionsDisabled}
                          title={actionsDisabled ? t('progress.lockedTooltip') : undefined}
                        >
                          {isUpdating ? '…' : (
                            <>
                              <ActionIcon size={14} strokeWidth={2} />
                              <span>{t(action.labelKey)}</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}