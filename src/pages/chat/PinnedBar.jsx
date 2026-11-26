// src/pages/chat/PinnedBar.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, ChevronDown, ChevronUp } from 'lucide-react';
import styles from '../Chat.module.css';

export default function PinnedBar({
  pinnedMessages = [],
  roomAdmin,
  onUnpin,
  onJump,
}) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  if (!pinnedMessages.length) return null;

  const top = pinnedMessages[0];

  return (
    <div className={styles.pinnedBar}>
      <Pin size={14} strokeWidth={2} className={styles.pinnedBarIcon} />
      <span className={styles.pinnedCount}>{pinnedMessages.length}</span>

      <button
        type="button"
        className={styles.pinnedPreview}
        onClick={() => onJump(top.id)}
        title={t('pinned.jumpTo')}
      >
        <span className={styles.pinnedPreviewAuthor}>{top.userName}:</span>
        <span className={styles.pinnedPreviewText}>{top.text || '📷'}</span>
      </button>

      <button
        type="button"
        className={styles.pinnedToggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={t('pinned.title')}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className={styles.pinnedExpand}>
          {pinnedMessages.map((m) => (
            <div
              key={m.id}
              className={styles.pinnedItem}
              onClick={() => {
                onJump(m.id);
                setExpanded(false);
              }}
            >
              <div className={styles.pinnedItemAvatar}>
                {m.userPhoto ? <img src={m.userPhoto} alt="" /> : (m.userName || '?').charAt(0).toUpperCase()}
              </div>
              <div className={styles.pinnedItemBody}>
                <div className={styles.pinnedItemAuthor}>{m.userName}</div>
                <div className={styles.pinnedItemText}>{m.text || '📷'}</div>
              </div>
              {roomAdmin && (
                <button
                  type="button"
                  className={styles.pinnedUnpinBtn}
                  onClick={(e) => { e.stopPropagation(); onUnpin(m); }}
                >
                  {t('actions.unpin')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}