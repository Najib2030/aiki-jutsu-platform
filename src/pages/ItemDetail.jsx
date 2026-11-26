// src/pages/ItemDetail.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import ItemRenderer from '../components/ItemRenderer';
import Loading from '../components/Loading';
import styles from './ItemDetail.module.css';

export default function ItemDetail() {
  const { t } = useTranslation();
  const { categoryId, itemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const fromAdmin = !!location.state?.fromAdmin;
  const fromPage = location.state?.fromPage || null;

  const [item, setItem] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const itemSnap = await getDoc(doc(db, 'items', itemId));
        if (!itemSnap.exists()) {
          setError(t('itemDetail.techniqueNotFound'));
          return;
        }
        setItem({ id: itemSnap.id, ...itemSnap.data() });

        const catSnap = await getDoc(doc(db, 'categories', categoryId));
        if (catSnap.exists()) {
          setCategoryName(catSnap.data().names?.en || '');
        }
      } catch (err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          setError(t('itemDetail.noAccess'));
        } else {
          setError(t('itemDetail.failedLoad'));
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [categoryId, itemId, t]);

  // Context-aware label based on where the user came from
  const backLabel = fromAdmin
    ? t('itemDetail.backToItems')
    : fromPage === 'progress'
      ? t('itemDetail.backToProgress')
      : t('itemDetail.backToCategory', { name: categoryName || t('itemDetail.categoryFallback') });

  const handleBack = () => {
    // If we arrived here through in-app navigation, go back to the previous page
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    // Direct load (bookmark, refresh) — no history to go back to
    if (fromAdmin) {
      navigate(`/admin/items/${categoryId}`);
    } else if (fromPage === 'progress') {
      navigate('/progress');
    } else {
      navigate(`/syllabus/${categoryId}`);
    }
  };

  if (loading) return <Loading text={t('itemDetail.loading')} />;
  if (error) return <p className={styles.error}>{error}</p>;

  return (
    <div>
      <button onClick={handleBack} className={styles.backLink}>
        ← {backLabel}
      </button>
      <ItemRenderer item={item} />
    </div>
  );
}