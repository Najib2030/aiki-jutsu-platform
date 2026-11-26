// src/components/Modal.jsx
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './Modal.module.css';

export default function Modal({ isOpen, title, message, type, onConfirm, onCancel }) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modalCard}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          {type === 'confirm' && (
            <button onClick={onCancel} className={styles.cancelBtn}>
              {t('common.cancel')}
            </button>
          )}

          <button
            onClick={onConfirm}
            className={type === 'confirm' ? styles.confirmBtn : styles.infoBtn}
          >
            {type === 'confirm' ? t('common.confirm') : t('common.ok')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}