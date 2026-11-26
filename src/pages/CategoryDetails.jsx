// src/pages/CategoryDetails.jsx
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, ChevronRight, Play, Check, RotateCcw, Search, X,
} from 'lucide-react';
import { BELT_OPTIONS, getBeltLabel } from '../utils/experience';
import { emitProgressChanged } from '../utils/progressEvents';
import styles from './Syllabus.module.css';
import Loading from '../components/Loading';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

const STATUS_ACTIONS = {
  none: [
    { labelKey: 'categoryDetails.startLearning', next: 'learning', primary: true, Icon: Play },
  ],
  learning: [
    { labelKey: 'categoryDetails.complete', next: 'completed', primary: true, Icon: Check },
    { labelKey: 'categoryDetails.reset', next: 'none', primary: false, Icon: RotateCcw },
  ],
  completed: [
    { labelKey: 'categoryDetails.cancelAction', next: 'learning', primary: false, Icon: RotateCcw },
  ],
};

async function fetchAccessibleItems(categoryId, userData) {
  if (userData?.role === 'admin') {
    const q = query(
      collection(db, 'items'),
      where('categoryId', '==', categoryId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const userBelt = userData?.belt || 'yellow';
  const maxIdx = BELT_ORDER.indexOf(userBelt);
  const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];

  const results = await Promise.all(
    belts.map(async (belt) => {
      const q = query(
        collection(db, 'items'),
        where('categoryId', '==', categoryId),
        where('minimumGrade', '==', belt)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    })
  );

  return results.flat();
}

export default function CategoryDetails() {
  const { t, i18n } = useTranslation();
  const { categoryId } = useParams();
  const { userData, currentUser } = useAuth();

  const [items, setItems] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');

  const [progressMap, setProgressMap] = useState({});
  const [updating, setUpdating] = useState({});
  const [actionsLocked, setActionsLocked] = useState(false);

  const [unavailable, setUnavailable] = useState(false);

  // Admins are viewing this page in a read-only preview capacity —
  // they should not see the per-item progress buttons.
  const isAdmin = userData?.role === 'admin';

  // ── Active language (drops any region suffix like 'en-US' → 'en') ──
  const activeLang = (i18n.language || 'en').split('-')[0];

  // Secondary label to display next to the Japanese name.
  // Falls back to English when the selected language has no translation
  // for this particular item — otherwise the row would look empty.
  const getLocalizedName = (item) => {
    if (activeLang === 'ar') return item.names?.ar || item.names?.en;
    if (activeLang === 'fr') return item.names?.fr || item.names?.en;
    return item.names?.en;
  };

  useEffect(() => {
    async function fetchData() {
      if (!userData || !currentUser) return;
      try {
        const catSnap = await getDoc(doc(db, 'categories', categoryId));
        if (catSnap.exists()) {
          const catData = catSnap.data();
          if (catData.isDeleted && userData?.role !== 'admin') {
            setCategory(null);
            setItems([]);
            setUnavailable(true);
            setLoading(false);
            return;
          }
          setCategory(catData);
        }

        const [fetched, progSnap, reqSnap] = await Promise.all([
          fetchAccessibleItems(categoryId, userData),
          getDocs(query(collection(db, 'progress'), where('userId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'beltRequests'), where('userId', '==', currentUser.uid))),
        ]);

        fetched.sort((a, b) => (a.order || 0) - (b.order || 0));
        setItems(fetched);

        const pm = {};
        progSnap.forEach(d => {
          const data = d.data();
          if (!data.itemId) return;
          let st = data.status;
          if (st === 'validated') st = 'completed';
          if (st === 'review')    st = 'learning';
          pm[data.itemId] = st;
        });
        setProgressMap(pm);

        const currentBelt = userData.belt || 'yellow';
        const latest = reqSnap.docs
          .map(d => d.data())
          .filter(r => r.belt === currentBelt)
          .sort((a, b) => {
            const at = a.requestedAt?.toDate?.()?.getTime?.() || 0;
            const bt = b.requestedAt?.toDate?.()?.getTime?.() || 0;
            return bt - at;
          })[0];
        setActionsLocked(latest?.status === 'pending' || latest?.status === 'approved');
      } catch (err) {
        console.error('Error fetching category data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [categoryId, userData, currentUser]);

  const handleStatusChange = async (itemId, newStatus) => {
    if (!currentUser || actionsLocked || updating[itemId]) return;
    const oldStatus = progressMap[itemId] || 'none';

    setUpdating(prev => ({ ...prev, [itemId]: true }));
    setProgressMap(prev => ({ ...prev, [itemId]: newStatus }));

    try {
      await setDoc(
        doc(db, 'progress', `${currentUser.uid}_${itemId}`),
        { userId: currentUser.uid, itemId, status: newStatus, updatedAt: new Date() },
        { merge: true }
      );
      emitProgressChanged({ itemId, status: newStatus });
    } catch (err) {
      console.error('Error saving progress:', err);
      setProgressMap(prev => ({ ...prev, [itemId]: oldStatus }));
      alert(t('categoryDetails.progressSaveFailed'));
    } finally {
      setUpdating(prev => {
        const n = { ...prev };
        delete n[itemId];
        return n;
      });
    }
  };

  const availableBeltValues = useMemo(() => {
    const belts = new Set(items.map(i => i.minimumGrade || 'yellow'));
    return BELT_OPTIONS.filter(b => belts.has(b.value)).map(b => b.value);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      if (beltFilter !== 'all' && (item.minimumGrade || 'yellow') !== beltFilter) {
        return false;
      }
      if (q) {
        const ja = (item.names?.ja || '').toLowerCase();
        const en = (item.names?.en || '').toLowerCase();
        if (!ja.includes(q) && !en.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, beltFilter]);

  const hasActiveFilters = !!searchQuery.trim() || beltFilter !== 'all';
  const clearFilters = () => {
    setSearchQuery('');
    setBeltFilter('all');
  };

  if (loading) return <Loading text={t('categoryDetails.loading')} />;

  if (unavailable) {
    return (
      <div>
        <Link to="/syllabus" className={styles.backLink}>
          <ArrowLeft size={16} strokeWidth={2} /> {t('categoryDetails.backToSyllabus')}
        </Link>
        <div className={styles.emptyState}>
          <h3>{t('categoryDetails.unavailableTitle')}</h3>
          <p>{t('categoryDetails.unavailableMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/syllabus" className={styles.backLink}>
        <ArrowLeft size={16} strokeWidth={2} /> {t('categoryDetails.backToSyllabus')}
      </Link>

      <div className={styles.categoryHeader}>
        <h1 className={styles.pageTitle}>
          {category?.names?.en || t('categoryDetails.fallbackTitle')}
        </h1>
        {category?.names?.ja && (
          <div className={styles.categoryJa}>{category.names.ja}</div>
        )}
        <div className={styles.categoryMeta}>
          <span>
            {hasActiveFilters
              ? t('categoryDetails.techniqueCountFiltered', {
                  count: filteredItems.length,
                  total: items.length,
                })
              : t('categoryDetails.techniqueCount', { count: filteredItems.length })}
          </span>
          {category?.names?.fr && <span>FR · {category.names.fr}</span>}
          {category?.names?.ar && <span dir="rtl">AR · {category.names.ar}</span>}
        </div>
      </div>

      {items.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.filterField}>
            <Search size={16} strokeWidth={2} className={styles.filterIcon} />
            <input
              type="text"
              className={styles.filterInput}
              placeholder={t('categoryDetails.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={beltFilter}
            onChange={e => setBeltFilter(e.target.value)}
          >
            <option value="all">{t('categoryDetails.allBelts')}</option>
            {availableBeltValues.map(v => (
              <option key={v} value={v}>{getBeltLabel(v)}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              <X size={14} strokeWidth={2} /> {t('categoryDetails.clear')}
            </button>
          )}
        </div>
      )}

      {/* Only show the "locked" banner to students — actions are hidden for admins. */}
      {actionsLocked && !isAdmin && (
        <div className={styles.lockedBanner}>
          {t('categoryDetails.lockedBanner')}
        </div>
      )}

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{t('categoryDetails.noItemsTitle')}</h3>
          <p>
            {category
              ? t('categoryDetails.noItemsForCategory', { name: category.names?.en })
              : t('categoryDetails.emptyCategory')}
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{t('categoryDetails.noMatchesTitle')}</h3>
          <p>{t('categoryDetails.noMatchesMessage')}</p>
        </div>
      ) : (
        <div className={styles.itemList}>
          {filteredItems.map(item => {
            const status = progressMap[item.id] || 'none';
            const actions = STATUS_ACTIONS[status] || [];
            const isUpdating = !!updating[item.id];
            const secondaryName = getLocalizedName(item);

            return (
              <div
                key={item.id}
                className={styles.itemCard}
                data-status={status}
              >
                <Link
                  to={`/syllabus/${categoryId}/${item.id}`}
                  className={styles.itemMain}
                >
                  <div className={styles.itemOrder}>{item.order}</div>

                  <div className={styles.itemInfo}>
                    <div className={styles.itemNames}>
                      <h3 className={styles.japaneseName}>{item.names?.ja}</h3>
                      {secondaryName && (
                        <p className={styles.englishName} dir="auto">
                          — {secondaryName}
                        </p>
                      )}
                    </div>

                    <div className={styles.itemMetaRow}>
                      <span
                        className={styles.beltBadge}
                        data-belt={item.minimumGrade || 'yellow'}
                      >
                        {getBeltLabel(item.minimumGrade || 'yellow')}
                      </span>
                      {item.subGroup && (
                        <span className={styles.metaChip}>{item.subGroup}</span>
                      )}
                      {item.attack && (
                        <span className={styles.metaChip}>
                          {t('categoryDetails.attackShort')} · {item.attack}
                        </span>
                      )}
                      {item.defense && (
                        <span className={styles.metaChip}>
                          {t('categoryDetails.defenseShort')} · {item.defense}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight
                    size={22}
                    strokeWidth={2}
                    className={styles.itemArrowIcon}
                  />
                </Link>

                {/* Progress action buttons — students only */}
                {!isAdmin && (
                  <div className={styles.itemActions}>
                    {actions.map(action => {
                      const ActionIcon = action.Icon;
                      return (
                        <button
                          key={action.next}
                          className={
                            action.primary
                              ? styles.actionPrimary
                              : styles.actionSecondary
                          }
                          onClick={() => handleStatusChange(item.id, action.next)}
                          disabled={isUpdating || actionsLocked}
                          title={
                            actionsLocked
                              ? t('categoryDetails.lockedTooltip')
                              : undefined
                          }
                        >
                          {isUpdating ? (
                            '…'
                          ) : (
                            <>
                              <ActionIcon size={14} strokeWidth={2} />
                              <span>{t(action.labelKey)}</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}