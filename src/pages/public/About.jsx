import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from './Public.module.css';

export default function About() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);

  const faqs = [
    { q: t('public.about.q1'), a: t('public.about.a1') },
    { q: t('public.about.q2'), a: t('public.about.a2') },
    { q: t('public.about.q3'), a: t('public.about.a3') },
    { q: t('public.about.q4'), a: t('public.about.a4') },
    { q: t('public.about.q5'), a: t('public.about.a5') },
    { q: t('public.about.q6'), a: t('public.about.a6') },
    { q: t('public.about.q7'), a: t('public.about.a7') },
    { q: t('public.about.q8'), a: t('public.about.a8') },
    { q: t('public.about.q9'), a: t('public.about.a9') },
    { q: t('public.about.q10'), a: t('public.about.a10') },
  ];

  return (
    <div className={styles.pagePadding}>
      <div className={styles.contentWrapper}>
        <h1 className={`${styles.sectionTitle} ${styles.fadeInUp}`} style={{ textAlign: 'left', marginBottom: '24px' }}>{t('public.about.title')}</h1>
        <p className={`${styles.fadeInUp} ${styles['delay-1']}`} style={{ fontSize: '1.2rem', lineHeight: 1.8, color: '#444', marginBottom: '40px' }}>
          {t('public.about.p1')}
        </p>
        <div className={styles.fadeInUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '60px' }}>
          <div className={`${styles['delay-2']}`} style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontFamily: 'Cinzel', fontSize: '1.4rem', marginBottom: '16px', color: '#8b2c24' }}>{t('public.about.t1')}</h3>
            <p style={{ color: '#666', lineHeight: 1.6 }}>{t('public.about.p2')}</p>
          </div>
          <div className={`${styles['delay-3']}`} style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontFamily: 'Cinzel', fontSize: '1.4rem', marginBottom: '16px', color: '#8b2c24' }}>{t('public.about.t2')}</h3>
            <p style={{ color: '#666', lineHeight: 1.6 }}>{t('public.about.p3')}</p>
          </div>
        </div>

        <h2 className={`${styles.sectionTitle} ${styles.fadeInUp}`} style={{ textAlign: 'left', fontSize: '2rem', marginBottom: '24px' }}>{t('public.about.faqTitle')}</h2>
        <div className={styles.fadeInUp}>
          {faqs.map((faq, i) => (
            <div key={i} className={styles.faqItem}>
              <button className={styles.faqQuestion} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {faq.q}
                {openFaq === i ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              {openFaq === i && <div className={styles.faqAnswer}>{faq.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}