import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './Public.module.css';

// Using placeholders for now
const PAGES = [
  { id: 'p1', img: 'screenshot-dashboard.png' },
  { id: 'p2', img: 'screenshot-ai.png' },
  { id: 'p3', img: 'screenshot-syllabus.png' },
  { id: 'p4', img: 'screenshot-leadership.png' },
  { id: 'p5', img: 'screenshot-progress.png' },
  { id: 'p6', img: 'screenshot-rewards.png' },
  { id: 'p7', img: 'screenshot-quizzes.png' },
  { id: 'p8', img: 'screenshot-chat.png' },
  { id: 'p9', img: 'screenshot-settings.png' },
];

export default function HowItWorks() {
  const { t } = useTranslation();

  return (
    <div className={styles.howSection}>
      <div className={`${styles.sectionHeader} ${styles.fadeInUp}`}>
        <h1 className={styles.sectionTitle}>{t('public.how.title')}</h1>
        <p className={styles.sectionSub}>{t('public.how.sub')}</p>
      </div>

      <div className={styles.contentWrapper} style={{ maxWidth: '1100px' }}>
        {PAGES.map((page, index) => (
          <div key={index} className={`${styles.howRow} ${styles.fadeInUp}`}>
            <div className={styles.howText}>
              <div className={styles.howStep}>0{index + 1}</div>
              <h3 className={styles.howTitle}>{t(`public.how.${page.id}`)}</h3>
              <p className={styles.howDesc}>{t(`public.how.${page.id}d`)}</p>
            </div>
            <div className={styles.howImageWrap}>
              <img 
                src={new URL(`../../assets/${page.img}`, import.meta.url).href} 
                alt={t(`public.how.${page.id}`)} 
                className={styles.howImage}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentNode.innerHTML = `<div class="${styles.imagePlaceholder}">${page.img}</div>`;
                }} 
              />
            </div>
          </div>
        ))}
      </div>

      <div className={`${styles.fadeInUp} ${styles['delay-4']}`} style={{ textAlign: 'center', marginTop: '60px' }}>
        <Link to="/register" className={styles.btnPrimary}>{t('public.hero.cta1')}</Link>
      </div>
    </div>
  );
}