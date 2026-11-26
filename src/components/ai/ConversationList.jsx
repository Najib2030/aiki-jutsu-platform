import { useTranslation } from 'react-i18next';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import styles from '../../pages/AIAgent.module.css';

export default function ConversationList({
  conversations, activeId, onSelect, onNew, onDelete, open, onClose,
}) {
  const { t } = useTranslation();
  return (
    <>
      {open && <div className={styles.sideBackdrop} onClick={onClose} aria-hidden="true" />}
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <button type="button" className={styles.newChatBtn} onClick={() => { onNew(); onClose(); }}>
          <Plus size={15} strokeWidth={2.2} /> {t('aiAgent.newChat')}
        </button>

        <div className={styles.sideLabel}>{t('aiAgent.history')}</div>
        <div className={styles.sideList}>
          {conversations.length === 0 && (
            <p className={styles.sideEmpty}>{t('aiAgent.noHistory')}</p>
          )}
          {conversations.map(c => (
            <div key={c.id} className={`${styles.sideItem} ${c.id === activeId ? styles.sideItemActive : ''}`}>
              <button
                type="button"
                className={styles.sideItemBtn}
                onClick={() => { onSelect(c.id); onClose(); }}
              >
                <MessageSquare size={13} strokeWidth={2} />
                <span className={styles.sideItemText}>{c.title || t('aiAgent.untitled')}</span>
              </button>
              <button
                type="button"
                className={styles.sideItemDelete}
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                title={t('aiAgent.deleteChat')}
                aria-label={t('aiAgent.deleteChat')}
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}