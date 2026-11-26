import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { BookOpen, TrendingUp, Sparkles, ShieldCheck, Download, Check } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import heroImg from '../../assets/screenshot-dashboard.png';
import styles from './Public.module.css';

export default function Home() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ students: 0, techniques: 0, categories: 0 });
  const { canInstall, isInstalled, isIos, install } = useInstallPrompt();

  useEffect(() => {
    async function fetchStats() {
      try {
        const [usersSnap, itemsSnap, catsSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('isApproved', '==', true))),
          getDocs(collection(db, 'items')),
          getDocs(collection(db, 'categories'))
        ]);
        setStats({
          students: usersSnap.size,
          techniques: itemsSnap.size,
          categories: catsSnap.size
        });
      } catch (err) {
        console.error(err);
      }
    }
    fetchStats();
  }, []);

  const handleDownload = () => {
    if (isInstalled) return;           // Already installed
    if (canInstall) {
      install();
    } else if (isIos) {
      alert(t('offline.installIosHint', { defaultValue: 'Tap Share → Add to Home Screen' }));
    } else {
      alert(t('offline.installUnavailable', { defaultValue: 'Installation is not available — use your browser menu.' }));
    }
  };

  return (
    <>
      <section className={styles.hero}>
        <div className={`${styles.heroContent} ${styles.fadeInUp}`}>
          <h1 className={styles.heroTitle}>
            {t('public.hero.title1')} <br />
            <span>{t('public.hero.title2')}</span>
          </h1>
          <p className={styles.heroSubtitle}>{t('public.hero.sub')}</p>
          <div className={styles.heroActions}>
            <Link to="/register" className={styles.btnPrimary}>{t('public.hero.cta1')}</Link>
            <Link to="/how-it-works" className={styles.btnSecondary}>{t('public.hero.cta2')}</Link>
            <button
              className={styles.btnDownloadHero}
              onClick={handleDownload}
              disabled={isInstalled}
              style={{ cursor: isInstalled ? 'default' : 'pointer', opacity: isInstalled ? 0.7 : 1 }}
            >
              {isInstalled ? <Check size={18} /> : <Download size={18} />}
              {isInstalled
                ? t('offline.installed', { defaultValue: 'Installed ✓' })
                : t('public.nav.download')}
            </button>
          </div>
        </div>

        <div className={`${styles.heroImageWrap} ${styles.fadeInUp} ${styles['delay-2']}`}>
          <img
            src={heroImg}
            alt="Dashboard Screenshot"
            className={styles.heroImage}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = `<div class="${styles.imagePlaceholder}">Dashboard Screenshot<br/>(src/assets/screenshot-dashboard.png)</div>`;
            }}
          />
        </div>
      </section>

      <section className={styles.statsSection}>
        <div className={`${styles.statItem} ${styles.fadeInUp} ${styles['delay-1']}`}>
          <div className={styles.statValue}>{stats.students}+</div>
          <div className={styles.statLabel}>{t('public.stats.students')}</div>
        </div>
        <div className={`${styles.statItem} ${styles.fadeInUp} ${styles['delay-2']}`}>
          <div className={styles.statValue}>{stats.techniques}</div>
          <div className={styles.statLabel}>{t('public.stats.techniques')}</div>
        </div>
        <div className={`${styles.statItem} ${styles.fadeInUp} ${styles['delay-3']}`}>
          <div className={styles.statValue}>{stats.categories}</div>
          <div className={styles.statLabel}>{t('public.stats.categories')}</div>
        </div>
      </section>

      <section className={styles.features}>
        <div className={`${styles.sectionHeader} ${styles.fadeInUp}`}>
          <h2 className={styles.sectionTitle}>{t('public.features.title')}</h2>
          <p className={styles.sectionSub}>{t('public.features.sub')}</p>
        </div>
        <div className={styles.featureGrid}>
          <div className={`${styles.featureCard} ${styles.fadeInUp} ${styles['delay-1']}`}>
            <div className={styles.featureIcon}><BookOpen size={28} /></div>
            <h3 className={styles.featureTitle}>{t('public.features.f1')}</h3>
            <p className={styles.featureDesc}>{t('public.features.f1d')}</p>
          </div>
          <div className={`${styles.featureCard} ${styles.fadeInUp} ${styles['delay-2']}`}>
            <div className={styles.featureIcon}><TrendingUp size={28} /></div>
            <h3 className={styles.featureTitle}>{t('public.features.f2')}</h3>
            <p className={styles.featureDesc}>{t('public.features.f2d')}</p>
          </div>
          <div className={`${styles.featureCard} ${styles.fadeInUp} ${styles['delay-3']}`}>
            <div className={styles.featureIcon}><Sparkles size={28} /></div>
            <h3 className={styles.featureTitle}>{t('public.features.f3')}</h3>
            <p className={styles.featureDesc}>{t('public.features.f3d')}</p>
          </div>
          <div className={`${styles.featureCard} ${styles.fadeInUp} ${styles['delay-4']}`}>
            <div className={styles.featureIcon}><ShieldCheck size={28} /></div>
            <h3 className={styles.featureTitle}>{t('public.features.f4')}</h3>
            <p className={styles.featureDesc}>{t('public.features.f4d')}</p>
          </div>
        </div>
      </section>
    </>
  );
}