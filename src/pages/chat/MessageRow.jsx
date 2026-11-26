// src/pages/chat/MessageRow.jsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  Reply, Copy, Info, Pencil, Trash2, Ban, Flag, Download,
  Pin, PinOff, MoreHorizontal, Unlock,
} from 'lucide-react';
import { renderMessageHtml, toDate } from '../../utils/chat';
import { getMessageActions } from '../../utils/chatPermissions';
import { previewFirstLink } from '../../utils/linkPreview';
import styles from '../Chat.module.css';

const LONG_PRESS_MS = 500;
const SWIPE_THRESHOLD = 60;
const READ_DELAY_MS = 800;
const TRUNCATE_CHARS = 800;
const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '👏'];

// ★ Stable per-user color for authorName
const USER_COLORS = [
  '#8b2c24', '#2c5f8b', '#2c8b4a', '#8b6f2c', '#5c2c8b', '#8b2c5c',
  '#2c8b8b', '#8b4a2c', '#4a2c8b', '#2c8b74', '#6a2c8b', '#8b2c2c',
];
function getUserColor(uid) {
  if (!uid) return 'var(--color-bengara)';
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function ImageTile({ url, onClick, moreCount = 0, loadingLabel }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button type="button" className={styles.imageTile} onClick={onClick}>
      {!loaded && (
        <div className={styles.imageLoading} aria-label={loadingLabel}>
          <span className={styles.imageLoadingSpinner} />
        </div>
      )}
      <img
        src={url}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }}
      />
      {moreCount > 0 && <div className={styles.imageTileMore}>+{moreCount}</div>}
    </button>
  );
}

export default function MessageRow({
  msg, members, currentUid, currentUser, roomAdmin, mainAdmin,
  onReply, onEdit, onDelete, onBlock, onUnblock, onReport, onInfo,
  onPinToggle, onJumpToReply, onRead, onCopy, onDownload, onReaction,
  blocked,
}) {
  const { t } = useTranslation('chat');

  const [showActions, setShowActions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [showSheet, setShowSheet] = useState(false);
  const [linkPreview, setLinkPreview] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [swipeX, setSwipeX] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const longPressTimer = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const triggerRef = useRef(null);
  const readSent = useRef(false);

  useEffect(() => {
    if (readSent.current) return;
    if (msg.isDeleted || msg._pending) return;
    if (msg.userId === currentUid) { readSent.current = true; return; }
    const timer = setTimeout(() => { onRead?.(msg.id); readSent.current = true; }, READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [msg.id, msg.isDeleted, msg._pending, msg.userId, currentUid, onRead]);

  useEffect(() => {
    if (msg.isDeleted || !msg.text || msg._pending) return;
    if (!/https?:\/\//i.test(msg.text)) return;
    let cancelled = false;
    previewFirstLink(msg.text).then((p) => { if (!cancelled && p) setLinkPreview(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [msg.id, msg.text, msg.isDeleted, msg._pending]);

  useEffect(() => {
    if (!showActions || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const DROPDOWN_W = 200;
    const DROPDOWN_H = 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= DROPDOWN_H
      ? rect.bottom - 28
      : Math.max(8, rect.top - DROPDOWN_H - 4) + 173;
    const centerX = rect.left + rect.width / 2;
    let left = centerX > window.innerWidth / 2
      ? Math.max(8, rect.left - DROPDOWN_W - 4)
      : Math.min(window.innerWidth - DROPDOWN_W - 8, rect.right + 4);
    setDropdownPos({ top, left });
  }, [showActions]);

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipeX(0);
    longPressTimer.current = setTimeout(() => {
      setShowSheet(true);
      try { navigator.vibrate?.(15); } catch (_) {}
    }, LONG_PRESS_MS);
  };

  const onTouchMove = (e) => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(longPressTimer.current);
    if (dx > 0 && Math.abs(dx) > Math.abs(dy) && !msg.isDeleted) {
      setSwipeX(Math.min(dx, SWIPE_THRESHOLD + 20));
    }
  };

  const onTouchEnd = () => {
    clearTimeout(longPressTimer.current);
    if (swipeX >= SWIPE_THRESHOLD) {
      onReply?.(msg);
      try { navigator.vibrate?.(10); } catch (_) {}
    }
    setSwipeX(0);
  };

  // Check if the author of this message is currently blocked
  const isBlocked = blocked?.some((b) => b.id === msg.userId || b.blockedUserId === msg.userId);
  
  const actions = getMessageActions(currentUser, msg, currentUid, isBlocked);
  const isMine = msg.userId === currentUid;
  const isImage = Array.isArray(msg.imageUrls) && msg.imageUrls.length > 0;
  const authorMember = members.find((m) => m.id === msg.userId);
  const authorName = msg.userName || authorMember?.name || 'Member';
  const avatarUrl = authorMember?.profileImageUrl || msg.userPhoto;
  const initial = (authorName || '?').charAt(0).toUpperCase();
  const authorColor = getUserColor(msg.userId);
  const role = msg.userRole;
  const createdDate = toDate(msg.createdAt) || new Date();
  const timeLabel = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const editedTitle = msg.editedAt
    ? t('message.editedAt', { time: (toDate(msg.editedAt) || new Date()).toLocaleString() })
    : undefined;

  const isLong = !!(msg.text && msg.text.length > TRUNCATE_CHARS && !msg.isDeleted);
  const showTruncated = isLong && !expanded;

  const imageGridCount =
    msg.imageUrls?.length === 1 ? '1'
    : msg.imageUrls?.length === 2 ? '2'
    : msg.imageUrls?.length === 3 ? '3'
    : msg.imageUrls?.length === 4 ? '4'
    : 'many';

  const renderActionIcon = (key) => {
    const props = { size: 14, strokeWidth: 2, className: styles.actionItemIcon };
    switch (key) {
      case 'reply': return <Reply {...props} />;
      case 'copy': return <Copy {...props} />;
      case 'info': return <Info {...props} />;
      case 'edit': return <Pencil {...props} />;
      case 'delete': return <Trash2 {...props} />;
      case 'block': return <Ban {...props} />;
      case 'unblock': return <Unlock {...props} />;
      case 'report': return <Flag {...props} />;
      case 'download': return <Download {...props} />;
      case 'pin': return <Pin {...props} />;
      case 'unpin': return <PinOff {...props} />;
      default: return null;
    }
  };

  const handleAction = (key) => {
    switch (key) {
      case 'reply': onReply?.(msg); break;
      case 'copy': onCopy?.(msg.text || ''); break;
      case 'info': onInfo?.(msg); break;
      case 'edit': onEdit?.(msg); break;
      case 'delete': onDelete?.(msg); break;
      case 'block': onBlock?.(msg); break;
      case 'unblock': onUnblock?.(msg); break;
      case 'report': onReport?.(msg); break;
      case 'download': onDownload?.(msg.imageUrls?.[0]); break;
      case 'pin':
      case 'unpin': onPinToggle?.(msg); break;
      default: break;
    }
  };

  const handleReaction = (emoji) => {
    const uids = Array.isArray(msg.reactions?.[emoji]) ? msg.reactions[emoji] : [];
    const isRemove = uids.includes(currentUid);
    onReaction?.(msg.id, emoji, isRemove);
  };

  const dropdownPortal = showActions
    ? createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setShowActions(false)} />
          <div className={styles.actionsDropdown} style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 300 }}>
            {onReaction && !msg._error && !msg.isDeleted && (
              <div style={{ display: 'flex', gap: 2, padding: '4px 6px', borderBottom: '1px solid var(--color-border)', marginBottom: 4 }}>
                {QUICK_REACTIONS.map((emoji) => {
                  const uids = Array.isArray(msg.reactions?.[emoji]) ? msg.reactions[emoji] : [];
                  const mine = uids.includes(currentUid);
                  return (
                    <button key={emoji} type="button"
                      onClick={() => { handleReaction(emoji); setShowActions(false); }}
                      style={{
                        background: mine ? 'rgba(192,160,98,0.2)' : 'transparent',
                        border: 'none', fontSize: '1rem', cursor: 'pointer',
                        borderRadius: 4, padding: '2px 4px', lineHeight: 1,
                      }}
                      title={emoji}
                    >{emoji}</button>
                  );
                })}
              </div>
            )}
            {actions.map((actionKey) => (
              <button key={actionKey} type="button"
                className={`${styles.actionItem} ${['delete', 'block', 'report'].includes(actionKey) ? styles.actionItemDanger : ''}`}
                onClick={() => { setShowActions(false); handleAction(actionKey); }}
              >
                {renderActionIcon(actionKey)}
                <span>{t(`actions.${actionKey}`)}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <div className={styles.swipeContainer}>
      {swipeX > 0 && (
        <div className={`${styles.swipeIndicatorBack} ${swipeX >= SWIPE_THRESHOLD ? styles.swipeIndicatorActive : ''}`}>
          <Reply size={16} strokeWidth={2.5} />
        </div>
      )}

      <div
        id={`msg-${msg.id}`}
        className={`${styles.messageRow} ${isMine ? styles.messageRowMine : ''} ${msg.isDeleted ? styles.messageRowDeleted : ''}`}
        style={{
          transform: swipeX > 0 ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX ? 'none' : 'transform 0.2s ease',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className={styles.messageAvatar}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
        </div>

        <div className={styles.messageBody}>
          <div className={styles.messageHeader}>
            <span
              className={`${styles.authorName} ${isMine ? styles.authorNameMine : ''}`}
              style={{ color: authorColor }}
            >
              {authorName}
            </span>
            {role === 'mainAdmin' && (
              <span className={`${styles.roleBadge} ${styles.roleBadgeMainAdmin}`}>{t('mainRoomAdminBadge')}</span>
            )}
            {role === 'roomAdmin' && (
              <span className={`${styles.roleBadge} ${styles.roleBadgeRoomAdmin}`}>{t('roomAdminBadge')}</span>
            )}
            <span className={styles.messageTime}>{timeLabel}</span>
            {msg.pinned && !msg.isDeleted && (
              <span className={styles.pinnedIndicator} title={t('pinned.messagePinned', 'Pinned message')}>
                <Pin size={12} strokeWidth={2.5} />
              </span>
            )}
            {msg.editedAt && !msg.isDeleted && !msg._pending && (
              <span className={styles.editedTag} title={editedTitle}>· {t('message.edited')}</span>
            )}
            {msg._pending && <span className={styles.editedTag}>· {t('message.sending')}</span>}
            {msg._error && (
              <span className={styles.editedTag} style={{ color: '#c0392b' }}>
                · {t('message.failed')} —{' '}
                <button type="button"
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 'inherit' }}
                  onClick={() => onEdit?.(msg)}
                >{t('message.retry')}</button>
              </span>
            )}
          </div>

          <div className={styles.messageBubble}>
            {msg.replyTo && !msg.isDeleted && (
              <div
                className={styles.replyQuote}
                onClick={(e) => { e.stopPropagation(); onJumpToReply?.(msg.replyTo.messageId); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onJumpToReply?.(msg.replyTo.messageId); }}
              >
                <div className={styles.replyQuoteBody}>
                  <div className={styles.replyQuoteAuthor}>↩ {msg.replyTo.userName}</div>
                  <div className={`${styles.replyQuoteText} ${msg.replyTo.isDeleted ? styles.replyQuoteDeleted : ''}`}>
                    {msg.replyTo.isDeleted ? t('message.deletedReply') : msg.replyTo.textSnippet || (msg.replyTo.imageUrl ? '📷' : '')}
                  </div>
                </div>
              </div>
            )}

            {msg.isDeleted ? (
              <div className={`${styles.messageText} ${styles.messageTextDeleted}`}>{t('message.deleted')}</div>
            ) : (
              <>
                {msg.text && (
                  <>
                    <div
                      className={`${styles.messageText} ${showTruncated ? styles.messageTextCollapsed : ''}`}
                      dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.text, members) }}
                    />
                    {isLong && (
                      <button type="button" className={styles.readMoreBtn} onClick={() => setExpanded((v) => !v)}>
                        {expanded ? t('message.showLess') : t('message.readMore')}
                      </button>
                    )}
                  </>
                )}

                {linkPreview && (
                  <a href={linkPreview.url} target="_blank" rel="noopener noreferrer"
                    className={styles.linkPreview} onClick={(e) => e.stopPropagation()}>
                    {linkPreview.favicon && (
                      <img src={linkPreview.favicon} alt="" className={styles.linkPreviewFavicon}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <div className={styles.linkPreviewBody}>
                      <div className={styles.linkPreviewDomain}>{linkPreview.domain}</div>
                      <div className={styles.linkPreviewTitle}>{linkPreview.title}</div>
                      {linkPreview.description && <div className={styles.linkPreviewDesc}>{linkPreview.description}</div>}
                    </div>
                  </a>
                )}

                {isImage && (
                  <div className={styles.imageGrid} data-count={imageGridCount}>
                    {msg.imageUrls.slice(0, 4).map((url, i) => (
                      <ImageTile
                        key={i}
                        url={url}
                        onClick={() => setLightboxIdx(i)}
                        moreCount={i === 3 && msg.imageUrls.length > 4 ? msg.imageUrls.length - 4 : 0}
                        loadingLabel={t('message.loadingImage')}
                      />
                    ))}
                  </div>
                )}

                {msg.syllabusRef && (
                  <a
                    href={
                      msg.syllabusRef.type === 'category'
                        ? `/syllabus/${msg.syllabusRef.id}`
                        : `/syllabus/${msg.syllabusRef.categoryId}/${msg.syllabusRef.id}`
                    }
                    className={styles.syllabusRef}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={styles.syllabusRefIcon}>
                      {msg.syllabusRef.type === 'category' ? '📚' : '🥋'}
                    </div>
                    <div className={styles.syllabusRefBody}>
                      <div className={styles.syllabusRefType}>
                        {msg.syllabusRef.type === 'category' ? t('syllabusRef.category') : t('syllabusRef.item')}
                      </div>
                      {msg.syllabusRef.ja && <div className={styles.syllabusRefJa}>{msg.syllabusRef.ja}</div>}
                      <div className={styles.syllabusRefName}>{msg.syllabusRef.name}</div>
                    </div>
                  </a>
                )}
              </>
            )}
          </div>

          {msg.reactions && Object.keys(msg.reactions).length > 0 && !msg.isDeleted && (
            <div className={styles.reactions}>
              {Object.entries(msg.reactions).map(([emoji, uids]) => {
                if (!Array.isArray(uids) || uids.length === 0) return null;
                const isMineReaction = uids.includes(currentUid);
                return (
                  <button key={emoji} type="button"
                    className={`${styles.reactionChip} ${isMineReaction ? styles.reactionChipMine : ''}`}
                    onClick={() => handleReaction(emoji)}
                  >
                    <span className={styles.reactionEmoji}>{emoji}</span>
                    <span className={styles.reactionCount}>{uids.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!msg._pending && !msg.isDeleted && actions.length > 0 && (
            <div className={`${styles.messageActions} ${showActions ? styles.messageActionsVisible : ''}`}>
              <button
                ref={triggerRef}
                type="button"
                className={styles.actionsTrigger}
                onClick={(e) => { e.stopPropagation(); setShowActions((v) => !v); }}
                aria-label={t('actions.sheetTitle')}
              >
                <MoreHorizontal size={16} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

      {dropdownPortal}

      {lightboxIdx !== null && msg.imageUrls?.length > 0 && createPortal(
        <div className={styles.lightboxOverlay} onClick={() => setLightboxIdx(null)}>
          <button type="button" className={styles.lightboxClose} onClick={() => setLightboxIdx(null)} aria-label="Close">✕</button>
          {lightboxIdx > 0 && (
            <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}>‹</button>
          )}
          <img src={msg.imageUrls[lightboxIdx]} alt="" className={styles.lightboxImage} onClick={(e) => e.stopPropagation()} />
          {lightboxIdx < msg.imageUrls.length - 1 && (
            <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}>›</button>
          )}
        </div>,
        document.body
      )}

      {showSheet && createPortal(
        <div className={styles.actionSheetBackdrop} onClick={() => setShowSheet(false)}>
          <div className={styles.actionSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.actionSheetHandle} />
            <div className={styles.actionSheetTitle}>{t('actions.sheetTitle')}</div>
            {onReaction && !msg._error && !msg.isDeleted && (
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 8px', borderBottom: '1px solid var(--color-border)', marginBottom: 6 }}>
                {QUICK_REACTIONS.map((emoji) => {
                  const uids = Array.isArray(msg.reactions?.[emoji]) ? msg.reactions[emoji] : [];
                  const mine = uids.includes(currentUid);
                  return (
                    <button key={emoji} type="button"
                      onClick={() => { handleReaction(emoji); setShowSheet(false); }}
                      style={{
                        background: mine ? 'rgba(192,160,98,0.2)' : 'transparent',
                        border: 'none', fontSize: '1.5rem', cursor: 'pointer',
                        padding: '4px 8px', borderRadius: 8, lineHeight: 1,
                      }}
                    >{emoji}</button>
                  );
                })}
              </div>
            )}
            <div className={styles.actionSheetList}>
              {actions.map((actionKey) => (
                <button key={actionKey} type="button"
                  className={`${styles.actionSheetItem} ${['delete', 'block', 'report'].includes(actionKey) ? styles.actionSheetItemDanger : ''}`}
                  onClick={() => { setShowSheet(false); handleAction(actionKey); }}
                >
                  {renderActionIcon(actionKey)}
                  <span>{t(`actions.${actionKey}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}