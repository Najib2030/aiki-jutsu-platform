// src/pages/chat/BlockModal.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { db } from '../../firebase/config';
import {
  doc, setDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Ban, Clock, Calendar, X } from 'lucide-react';
import styles from '../Chat.module.css';

const DURATION_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  'forever': null,
};

export default function BlockModal({ target, onClose, onBlocked }) {
  const { t } = useTranslation('chat');
  const { currentUser, userData } = useAuth();

  const [duration, setDuration] = useState('24h');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!target) return null;

  const handleSubmit = async () => {
    if (!currentUser || !userData || submitting) return;

    // Client-side guards (mirror the Firestore rules)
    if (target.id === currentUser.uid) {
      setError(t('block.cannotBlockSelf'));
      return;
    }
    if (target.isMainAdmin === true || target.roomAdmin === true) {
      setError(t('block.cannotBlockAdmin'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const ms = DURATION_MS[duration];
      const expiresAt = ms == null ? null : Timestamp.fromDate(new Date(Date.now() + ms));

      await setDoc(doc(db, 'chatBans', target.id), {
        blockedUserId: target.id,
        blockedUserName: target.name || '',
        blockedBy: currentUser.uid,
        blockedByName: userData.name || '',
        reason: reason.trim(),
        expiresAt,
        createdAt: serverTimestamp(),
      });

      onBlocked?.();
      onClose?.();
    } catch (err) {
      console.error('Block failed:', err);
      setError(t('errors.blockFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t('block.title')}</h3>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label={t('block.cancel')}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.modalText}>
            {t('block.message', { name: target.name || 'this user' })}
          </p>

          <div className={styles.durationGrid}>
            <button
              type="button"
              className={`${styles.durationOption} ${
                duration === '24h' ? styles.durationOptionActive : ''
              }`}
              onClick={() => setDuration('24h')}
            >
              <Clock size={20} strokeWidth={2} className={styles.durationOptionIcon} />
              {t('block.duration24h')}
            </button>
            <button
              type="button"
              className={`${styles.durationOption} ${
                duration === '7d' ? styles.durationOptionActive : ''
              }`}
              onClick={() => setDuration('7d')}
            >
              <Calendar size={20} strokeWidth={2} className={styles.durationOptionIcon} />
              {t('block.duration7d')}
            </button>
            <button
              type="button"
              className={`${styles.durationOption} ${
                duration === 'forever' ? styles.durationOptionActive : ''
              }`}
              onClick={() => setDuration('forever')}
            >
              <Ban size={20} strokeWidth={2} className={styles.durationOptionIcon} />
              {t('block.durationForever')}
            </button>
          </div>

          <textarea
            className={styles.reasonTextarea}
            placeholder={t('block.reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />

          {error && <div className={styles.composerError}>{error}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
            onClick={onClose}
            disabled={submitting}
          >
            {t('block.cancel')}
          </button>
          <button
            type="button"
            className={`${styles.modalBtn} ${styles.modalBtnDanger}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '…' : t('block.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}