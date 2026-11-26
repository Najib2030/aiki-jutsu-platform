// src/components/ReasonModal.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import baseStyles from './Modal.module.css';
import styles from './ReasonModal.module.css';

export default function ReasonModal({
  isOpen,
  title,
  message,
  placeholder,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen) return null;

  // Resolve defaults inside the component — t() is only available
  // after the useTranslation() hook.
  const resolvedConfirm = confirmLabel ?? t('common.confirm');
  const resolvedCancel = cancelLabel ?? t('common.cancel');

  const trimmed = reason.trim();

  return createPortal(
    <div className={baseStyles.overlay}>
      <div className={baseStyles.modalCard}>
        <h3 className={baseStyles.title}>{title}</h3>
        {message && <p className={baseStyles.message}>{message}</p>}

        <textarea
          className={styles.textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          rows={4}
          autoFocus
        />

        <div className={baseStyles.actions}>
          <button onClick={onCancel} className={baseStyles.cancelBtn}>
            {resolvedCancel}
          </button>
          <button
            onClick={() => onConfirm(trimmed)}
            className={baseStyles.confirmBtn}
            disabled={!trimmed}
          >
            {resolvedConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}