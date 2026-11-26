import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import styles from './Public.module.css';

const BELTS = ['yellow', 'orange', 'green', 'blue', 'brown', 'black'];

export default function Pricing() {
  const { t } = useTranslation();
  const [prices, setPrices] = useState({ yellow: 0, orange: 0, green: 0, blue: 0, brown: 0, black: 0 });
  const [beltData, setBeltData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const priceSnap = await getDoc(doc(db, 'settings', 'pricing'));
        if (priceSnap.exists()) setPrices(priceSnap.data());

        const [itemsSnap, catsSnap] = await Promise.all([
          getDocs(collection(db, 'items')),
          getDocs(collection(db, 'categories'))
        ]);

        const catsMap = {};
        catsSnap.forEach(d => { catsMap[d.id] = d.data().names?.en || 'Unknown'; });

        const grouped = {};
        BELTS.forEach(b => { grouped[b] = { total: 0, categories: {}, cumulative: 0, cumulativeCategories: {} }; });

        // 1. Populate exact counts for each belt
        itemsSnap.forEach(d => {
          const item = d.data();
          const belt = item.minimumGrade || 'yellow';
          const catName = catsMap[item.categoryId] || 'Uncategorized';
          
          if (grouped[belt]) {
            grouped[belt].total += 1;
            grouped[belt].categories[catName] = (grouped[belt].categories[catName] || 0) + 1;
          }
        });

        // 2. Calculate cumulative totals and cumulative categories
        let cumulativeTotal = 0;
        const cumulativeCategories = {};

        BELTS.forEach(b => {
          cumulativeTotal += grouped[b].total;
          grouped[b].cumulative = cumulativeTotal;
          
          // Add the current belt's categories to the running total
          Object.entries(grouped[b].categories).forEach(([cat, count]) => {
            cumulativeCategories[cat] = (cumulativeCategories[cat] || 0) + count;
          });
          
          // Save a snapshot of the cumulative categories at this belt level
          grouped[b].cumulativeCategories = { ...cumulativeCategories };
        });

        setBeltData(grouped);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUnlock = (belt, price) => {
    const msg = `Hello Sensei! I am interested in unlocking the ${belt.toUpperCase()} Belt tier (${price} DH). Please let me know how to proceed.`;
    window.open(`https://wa.me/212767331419?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className={styles.pricingSection}>
      <div className={`${styles.sectionHeader} ${styles.fadeInUp}`}>
        <h1 className={styles.sectionTitle}>{t('public.pricing.title')}</h1>
        <p className={styles.sectionSub}>{t('public.pricing.sub')}</p>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center' }}>Loading...</p>
      ) : (
        <div className={styles.pricingGrid}>
          {BELTS.map((belt, index) => {
            const isFree = belt === 'yellow';
            const price = prices[belt] || 0;
            const data = beltData[belt] || { cumulative: 0, cumulativeCategories: {} };
            
            // Use cumulativeCategories here
            const categories = data.cumulativeCategories;

            return (
              <div key={belt} className={`${styles.priceCard} ${styles.fadeInUp} ${styles['delay-' + ((index % 3) + 1)]}`} data-belt={belt}>
                <h3 className={styles.priceName}>{t(`belts.label.${belt}`)}</h3>
                
                <div className={styles.priceAmount}>
                  {isFree ? (
                    t('public.pricing.free')
                  ) : (
                    <>
                      {price}
                      <span className={styles.priceCurrency}>{t('public.pricing.currency')}</span>
                    </>
                  )}
                </div>

                <div className={styles.priceTotalAccess}>
                  {t('public.pricing.totalAccess', { count: data.cumulative })}
                </div>

                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, marginBottom: 12, color: '#666', fontSize: '0.9rem' }}>{t('public.pricing.includes')}</p>
                  <ul className={styles.priceFeatures}>
                    {Object.keys(categories).length === 0 ? (
                      <li className={styles.priceFeature} style={{ color: '#999', fontStyle: 'italic' }}>
                        {t('public.pricing.noTech')}
                      </li>
                    ) : (
                      Object.entries(categories).map(([cat, count]) => (
                        <li key={cat} className={styles.priceFeature}>
                          <span>{cat}</span>
                          <span style={{ fontWeight: 'bold', color: '#8b2c24' }}>{count}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                {isFree ? (
                  <Link to="/register" className={styles.priceBtn} style={{ background: '#c0a062' }}>
                    {t('public.pricing.start')}
                  </Link>
                ) : (
                  <button onClick={() => handleUnlock(belt, price)} className={styles.priceBtn}>
                    {t('public.pricing.unlock')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}