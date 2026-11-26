// src/pages/Syllabus.jsx
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Layers, ChevronRight, Search, X } from 'lucide-react';
import styles from './Syllabus.module.css';
import Loading from '../components/Loading';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

async function fetchAccessibleItemCounts(userData) {
  const counts = {};

  if (userData?.role === 'admin') {
    const snap = await getDocs(collection(db, 'items'));
    snap.forEach(d => {
      const cat = d.data().categoryId;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }

  const studentBelt = userData?.belt || 'yellow';
  const maxIdx = BELT_ORDER.indexOf(studentBelt);
  const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];

  await Promise.all(
    belts.map(async (belt) => {
      const q = query(
        collection(db, 'items'),
        where('minimumGrade', '==', belt)
      );
      const snap = await getDocs(q);
      snap.forEach(d => {
        const cat = d.data().categoryId;
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
      });
    })
  );

  return counts;
}

export default function Syllabus() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const catSnap = await getDocs(collection(db, 'categories'));
        const cats = catSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => !c.isDeleted)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        let counts = {};
        try {
          counts = await fetchAccessibleItemCounts(userData);
        } catch (countErr) {
          console.warn('Could not load item counts:', countErr);
        }

        setCategories(cats.map(c => ({ ...c, itemCount: counts[c.id] || 0 })));
      } catch (err) {
        console.error('Error fetching syllabus:', err);
      } finally {
        setLoading(false);
      }
    }
    if (userData) fetchData();
  }, [userData]);

  // Categories with at least one accessible technique + matching search
  const visibleCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories
      .filter(c => (c.itemCount || 0) > 0)
      .filter(c => {
        if (!q) return true;
        const names = c.names || {};
        return (
          (names.en || '').toLowerCase().includes(q) ||
          (names.ja || '').toLowerCase().includes(q) ||
          (names.fr || '').toLowerCase().includes(q) ||
          (names.ar || '').toLowerCase().includes(q)
        );
      });
  }, [categories, searchQuery]);

  const visibleItemTotal = useMemo(
    () => visibleCategories.reduce((sum, c) => sum + (c.itemCount || 0), 0),
    [visibleCategories]
  );

  const hasActiveFilters = !!searchQuery.trim();
  const clearFilters = () => setSearchQuery('');

  if (loading) return <Loading text={t('syllabus.loading')} />;

  const isAdmin = userData?.role === 'admin';
  const hasAnyCategorizedItems = categories.some(c => (c.itemCount || 0) > 0);

  return (
    <div className={styles.syllabusPage}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderText}>
          <h1 className={styles.pageTitle}>
            <BookOpen size={32} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 12 }} />
            {t('syllabus.heading')}
          </h1>
          <p className={styles.pageSubtitle}>
            {isAdmin
              ? t('syllabus.subtitleAdmin')
              : t('syllabus.subtitleStudent')}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.metaStat}>
            <Layers size={13} strokeWidth={2} />
            {t('syllabus.categoriesCount', { count: visibleCategories.length })}
          </span>
          <span className={styles.metaStat}>
            <BookOpen size={13} strokeWidth={2} />
            {t('syllabus.techniquesCount', { count: visibleItemTotal })}
          </span>
        </div>
      </div>

      {hasAnyCategorizedItems && (
        <div className={styles.filterBar}>
          <div className={styles.filterField}>
            <Search size={16} strokeWidth={2} className={styles.filterIcon} />
            <input
              type="text"
              className={styles.filterInput}
              placeholder={t('syllabus.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {hasActiveFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              <X size={14} strokeWidth={2} /> {t('syllabus.clear')}
            </button>
          )}
        </div>
      )}

      {visibleCategories.length === 0 ? (
        <div className={styles.emptyState}>
          {categories.length === 0 ? (
            <>
              <h3>{t('syllabus.noCategoriesTitle')}</h3>
              <p>{t('syllabus.noCategoriesSub')}</p>
            </>
          ) : hasActiveFilters ? (
            <>
              <h3>{t('syllabus.noMatchesTitle')}</h3>
              <p>{t('syllabus.noMatchesSub')}</p>
            </>
          ) : (
            <>
              <h3>{t('syllabus.nothingToStudyTitle')}</h3>
              <p>{t('syllabus.nothingToStudySub')}</p>
            </>
          )}
        </div>
      ) : (
        <div className={styles.categoryGrid}>
          {visibleCategories.map((cat, index) => (
            <Link
              key={cat.id}
              to={`/syllabus/${cat.id}`}
              className={styles.categoryCard}
              style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
            >
              <div className={styles.cardOrder}>{cat.order}</div>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>{cat.names?.en}</h2>
                {cat.names?.ja && <div className={styles.cardJa}>{cat.names.ja}</div>}
                <div className={styles.cardTranslations}>
                  {cat.names?.fr && <span>FR&nbsp;·&nbsp;{cat.names.fr}</span>}
                  {cat.names?.ar && <span dir="rtl">AR&nbsp;·&nbsp;{cat.names.ar}</span>}
                </div>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.itemCount}>
                  {t('syllabus.itemCount', { count: cat.itemCount })}
                </span>
                <ChevronRight size={22} strokeWidth={2} className={styles.viewArrowIcon} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}