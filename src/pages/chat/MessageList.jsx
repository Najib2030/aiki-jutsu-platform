// src/pages/chat/MessageList.jsx
import { useTranslation } from 'react-i18next';
import MessageRow from './MessageRow';
import { groupMessagesWithDates, formatDateSeparator } from '../../utils/chat';
import styles from '../Chat.module.css';

export default function MessageList({
  messages, pendingMessages = [], members, currentUid, currentUser,
  roomAdmin, mainAdmin, typing, hasMore, loadingMore, onLoadOlder,
  firstUnreadMsgId, onReply, onEdit, onDelete, onBlock, onUnblock, onReport,
  onInfo, onPinToggle, onJumpToReply, onRead, onCopy, onDownload, onReaction,
  blocked,
}) {
  const { t } = useTranslation('chat');

  const combined = [...messages, ...pendingMessages].slice().sort((a, b) => {
    const aT = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
    const bT = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
    return aT - bT;
  });

  const grouped = groupMessagesWithDates(combined);
  const typingList = Object.values(typing || {});

  if (combined.length === 0 && typingList.length === 0) {
    return (
      <div className={styles.emptyState}>
        {t('emptyState', { defaultValue: 'No messages yet — be the first to say hello!' })}
      </div>
    );
  }

  return (
    <div className={styles.messageList}>
      {hasMore && messages.length > 0 && (
        <div>
          {loadingMore ? (
            <div className={styles.loadMoreLoading}>
              {t('loadMoreLoading', { defaultValue: 'Loading older messages…' })}
            </div>
          ) : (
            <button type="button" className={styles.loadMoreBtn} onClick={onLoadOlder}>
              {t('loadMore', { defaultValue: 'Load older messages' })}
            </button>
          )}
        </div>
      )}

      {grouped.map((entry, i) => {
        if (entry.type === 'date') {
          return (
            <div key={`date-${entry.key}-${i}`} className={styles.dateSep}>
              <div className={styles.dateSepLine} />
              <div className={styles.dateSepLabel}>{formatDateSeparator(entry.ts, t)}</div>
              <div className={styles.dateSepLine} />
            </div>
          );
        }
        const msg = entry.msg;
        const showUnreadDivider = firstUnreadMsgId === msg.id;

        return (
          <div key={msg.id}>
            {showUnreadDivider && (
              <div className={styles.newDivider}>
                <div className={styles.newDividerLine} />
                <div className={styles.newDividerLabel}>{t('newMessages.divider')}</div>
                <div className={styles.newDividerLine} />
              </div>
            )}
            <MessageRow
              msg={msg}
              members={members}
              currentUid={currentUid}
              currentUser={currentUser}
              roomAdmin={roomAdmin}
              mainAdmin={mainAdmin}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onBlock={onBlock}
              onUnblock={onUnblock}
              onReport={onReport}
              onInfo={onInfo}
              onPinToggle={onPinToggle}
              onJumpToReply={onJumpToReply}
              onRead={onRead}
              onCopy={onCopy}
              onDownload={onDownload}
              onReaction={onReaction}
              blocked={blocked}
            />
          </div>
        );
      })}

      {typingList.length > 0 && (
        <div className={styles.typingRow}>
          <div className={styles.typingDots}><span /><span /><span /></div>
          <span>
            {typingList.length === 1
              ? t('typing.one', { name: typingList[0].name })
              : typingList.length === 2
                ? t('typing.two', { name: typingList[0].name, other: typingList[1].name })
                : t('typing.many', { count: typingList.length })}
          </span>
        </div>
      )}
    </div>
  );
}