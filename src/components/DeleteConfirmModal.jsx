// src/components/DeleteConfirmModal.jsx
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import baseStyles from './Modal.module.css';
import styles from './DeleteConfirmModal.module.css';

export default function DeleteConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  // Defaults are resolved here (not in parameter destructuring) because
  // `t()` is only available after the `useTranslation()` hook call.
  const resolvedTitle = title ?? t('deleteConfirm.title');
  const resolvedConfirm = confirmLabel ?? t('deleteConfirm.confirm');
  const resolvedCancel = cancelLabel ?? t('common.cancel');

  return createPortal(
    <div className={baseStyles.overlay} onClick={onCancel}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={styles.iconWrap}>
          <Trash2 size={28} strokeWidth={2} />
        </div>
        <h3 className={styles.title}>{resolvedTitle}</h3>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={loading}
            autoFocus
          >
            {resolvedCancel}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t('deleteConfirm.deleting') : resolvedConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}