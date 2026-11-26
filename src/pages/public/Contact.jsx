import { useState } from 'react'; // 👈 Add this
import { createPortal } from 'react-dom'; // 👈 Add this
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react'; 
import styles from './Public.module.css';
import whatsappQR from '../../assets/whatsappQR.png';

export default function Contact() {
  const { t } = useTranslation();
  const [isQrOpen, setIsQrOpen] = useState(false); // 👈 Add state

  return (
    <div className={styles.pagePadding}>
      <div className={`${styles.sectionHeader} ${styles.fadeInUp}`}>
        <h1 className={styles.sectionTitle}>{t('public.contact.title')}</h1>
        <p className={styles.sectionSub}>{t('public.contact.sub')}</p>
      </div>

      <div className={styles.contactGrid}>
        <div className={`${styles.contactCard} ${styles.fadeInUp} ${styles['delay-1']}`}>
          
          {/* 👇 Make it clickable 👇 */}
          <div className={styles.qrIconWrapper} onClick={() => setIsQrOpen(true)} title="Click to enlarge">
            <img src={whatsappQR} alt="Scan to chat on WhatsApp" className={styles.qrImage} />
          </div>

          <h3 className={styles.contactTitle}>{t('public.contact.whatsapp')}</h3>
          <p className={styles.contactDesc}>{t('public.contact.whatsappDesc')}</p>
          <a href="https://wa.me/212767331419" target="_blank" rel="noreferrer" className={styles.contactBtn}>
            {t('public.contact.whatsappBtn')}
          </a>
        </div>

        <div className={`${styles.contactCard} ${styles.fadeInUp} ${styles['delay-2']}`}>
          <div className={styles.contactIcon}>
            <MapPin size={32} />
          </div>
          <h3 className={styles.contactTitle}>{t('public.contact.location')}</h3>
          <p className={styles.contactDesc}>
            {t('public.contact.address')}<br />
            {t('public.contact.map')}
          </p>
          <a href="https://maps.google.com/?q=F4FQ%2BQGQ,+Taroudant" target="_blank" rel="noreferrer" className={styles.contactBtn}>
            {t('public.contact.mapBtn')}
          </a>
        </div>
      </div>

      {/* 👇 The QR Modal 👇 */}
      {isQrOpen && createPortal(
        <div className={styles.qrModalOverlay} onClick={() => setIsQrOpen(false)}>
          <div className={styles.qrModalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.qrModalClose} onClick={() => setIsQrOpen(false)}>
              ×
            </button>
            <img src={whatsappQR} alt="WhatsApp QR Code" className={styles.qrModalImage} />
            <p className={styles.qrModalCaption}>Scan to chat on WhatsApp</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}