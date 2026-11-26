import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, X } from 'lucide-react';
import styles from '../../pages/AIAgent.module.css';

export default function ToolConfirmCard({ tool, onConfirm, onCancel, disabled }) {
  const { t } = useTranslation();

  const human = tool.name === 'update_technique_status'
    ? t('aiAgent.toolDesc.updateTechnique', {
        status: t(`aiAgent.statusLabels.${tool.args.status}`, tool.args.status),
      })
    : tool.name === 'update_profile'
    ? t('aiAgent.toolDesc.updateProfile', {
        fields: Object.keys(tool.args).filter(k => tool.args[k]).join(', '),
      })
    : t('aiAgent.toolDesc.generic');

  return (
    <div className={styles.confirmCard} role="alertdialog" aria-live="assertive">
      <div className={styles.confirmHeader}>
        <AlertTriangle size={16} strokeWidth={2.2} />
        <span>{t('aiAgent.confirmTitle')}</span>
      </div>
      <p className={styles.confirmDesc}>{human}</p>
      <div className={styles.confirmActions}>
        <button type="button" className={styles.confirmCancel} onClick={onCancel} disabled={disabled}>
          <X size={14} strokeWidth={2} /> {t('aiAgent.cancel')}
        </button>
        <button type="button" className={styles.confirmOk} onClick={onConfirm} disabled={disabled}>
          <Check size={14} strokeWidth={2} /> {t('aiAgent.confirm')}
        </button>
      </div>
    </div>
  );
}