// src/pages/chat/MessageComposer.jsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import EmojiPicker from 'emoji-picker-react';
import { db } from '../../firebase/config';
import {
  collection, getDocs, query, where,
  doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  Paperclip, Send, X, Bold, Italic, Code,
  Image as ImageIcon, BookOpen, Smile,
} from 'lucide-react';
import {
  MAX_MESSAGE_LENGTH, detectMentionPrefix, resolveMentions,
  isMessageEmpty, isOverLimit,
} from '../../utils/chat';
import { validateMessageText } from '../../utils/profanity';
import styles from '../Chat.module.css';

const TYPING_WRITE_INTERVAL_MS = 1500;
const TYPING_CLEAR_MS = 5000;
const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];

export default function MessageComposer({
  canPost, disabledReason, currentUser, currentUid, members,
  onSend, onEdit, replyTo, onCancelReply, editingMsg, onCancelEdit,
}) {
  const { t } = useTranslation('chat');

  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [syllabusRef, setSyllabusRef] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showAttach, setShowAttach] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSyllabusPicker, setShowSyllabusPicker] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mentionListRef = useRef(null);
  const typingClearRef = useRef(null);
  const lastTypingWriteRef = useRef(0);
  const prevEditingRef = useRef(null);

  useEffect(() => {
    if (editingMsg) {
      setText(editingMsg.text || '');
      setTimeout(() => {
        textareaRef.current?.focus();
        const len = (editingMsg.text || '').length;
        textareaRef.current?.setSelectionRange(len, len);
      }, 0);
    }
  }, [editingMsg]);

  useEffect(() => {
    if (prevEditingRef.current && !editingMsg) {
      setText('');
      setMentionQuery(null);
      setHasSelection(false);
    }
    prevEditingRef.current = editingMsg?.id || null;
  }, [editingMsg]);

  useEffect(() => { if (replyTo) textareaRef.current?.focus(); }, [replyTo]);

  const autoGrow = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };
  useEffect(autoGrow, [text]);

  // ── Typing indicator — writes both server + client timestamps ──
  useEffect(() => {
    if (!currentUid || !currentUser || disabledReason || !text) return;
    const now = Date.now();
    if (now - lastTypingWriteRef.current > TYPING_WRITE_INTERVAL_MS) {
      lastTypingWriteRef.current = now;
      setDoc(doc(db, 'typing', currentUid), {
        name: currentUser.name || 'Member',
        ts: serverTimestamp(),
        clientTs: now,
      }).catch((err) => console.warn('Typing write failed:', err));
    }
    clearTimeout(typingClearRef.current);
    typingClearRef.current = setTimeout(() => {
      deleteDoc(doc(db, 'typing', currentUid)).catch(() => {});
      lastTypingWriteRef.current = 0;
    }, TYPING_CLEAR_MS);
  }, [text, currentUid, currentUser, disabledReason]);

  useEffect(() => {
    return () => {
      if (currentUid) deleteDoc(doc(db, 'typing', currentUid)).catch(() => {});
    };
  }, [currentUid]);

  // ── Auto-focus on any typing (when not in an input) ──
  useEffect(() => {
    const handler = (e) => {
      if (disabledReason || sending) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const active = document.activeElement;
      if (active && active !== document.body) {
        const tag = active.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
        if (active.isContentEditable) return;
      }
      textareaRef.current?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [disabledReason, sending]);

  const clearTyping = () => {
    if (currentUid) deleteDoc(doc(db, 'typing', currentUid)).catch(() => {});
    lastTypingWriteRef.current = 0;
    clearTimeout(typingClearRef.current);
  };

  const updateSelection = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setHasSelection(ta.selectionStart !== ta.selectionEnd);
  };

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    if (val.length > MAX_MESSAGE_LENGTH + 200) return;
    setText(val);
    setError('');
    setShowEmoji(false);
    const caret = e.target.selectionStart;
    const frag = detectMentionPrefix(val, caret);
    if (frag) { setMentionQuery(frag); setMentionIndex(0); }
    else setMentionQuery(null);
  };

  // Mention candidates — approved users only
  const mentionCandidates = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return members
      .filter((m) => m.id !== currentUid)
      .filter((m) => m.isApproved === true || m.role === 'admin')
      .filter((m) => (m.name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, members, currentUid]);

  // Auto-scroll highlighted mention into view
  useEffect(() => {
    if (!mentionListRef.current) return;
    const active = mentionListRef.current.querySelector('[data-active="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [mentionIndex, mentionCandidates.length]);

  const insertMention = (member) => {
    if (!mentionQuery) return;
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(caret);
    const insertion = `@${member.name} `;
    setText(before + insertion + after);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + insertion.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const wrapSelection = (prefix, suffix = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    setText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
      updateSelection();
    }, 0);
  };

  const insertEmoji = (emoji) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const newText = text.slice(0, pos) + emoji + text.slice(pos);
    setText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(pos + emoji.length, pos + emoji.length);
    }, 0);
  };

  const handleSubmit = async () => {
    if (sending || disabledReason) return;
    const trimmed = text.trim();
    const hasAttachments = images.length > 0 || !!syllabusRef;
    if (isMessageEmpty(trimmed, hasAttachments)) { setError(t('composer.empty')); return; }
    if (isOverLimit(text)) { setError(t('composer.overLimit')); return; }
    if (trimmed.length > 0) {
      const validation = validateMessageText(trimmed);
      if (!validation.ok) {
        setError(validation.reason === 'profanity' ? t('composer.profanity') : t('composer.badUrl'));
        return;
      }
    }
    const mentionedUids = trimmed.length ? resolveMentions(trimmed, members) : [];
    setSending(true);
    setError('');
    try {
      if (editingMsg) {
        await onEdit(editingMsg.id, { text: trimmed });
        setText('');
        onCancelEdit?.();
      } else {
        await onSend({ text: trimmed, images, syllabusRef, mentions: mentionedUids });
        setText('');
        setImages([]);
        setSyllabusRef(null);
        setMentionQuery(null);
      }
      clearTyping();
    } catch (err) {
      console.error('Composer submit failed:', err);
      setError(t('errors.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (mentionQuery && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionCandidates.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionCandidates[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const isDesktop = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
      if (isDesktop) { e.preventDefault(); handleSubmit(); }
    }
  };

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 32 * 1024 * 1024) { setError(t('composer.uploadFailed')); continue; }
        const fd = new FormData();
        fd.append('image', file);
        fd.append('key', import.meta.env.VITE_IMGBB_API_KEY);
        const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!json.success) throw new Error('upload failed');
        setImages((prev) => [...prev, json.data.url]);
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      setError(t('composer.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const charsLeft = MAX_MESSAGE_LENGTH - text.length;
  const overLimit = charsLeft < 0;
  const disabled = !canPost || disabledReason !== null;
  const canSend = !disabled && !sending && !uploading && !overLimit
    && (text.trim().length > 0 || images.length > 0 || !!syllabusRef);

  if (disabled) {
    return (
      <div className={styles.composer}>
        <div className={styles.composerBox} style={{ opacity: 0.65, alignItems: 'center' }}>
          <div className={styles.composerTextarea} style={{ padding: '10px 12px', fontStyle: 'italic', color: 'var(--color-sumi-light)', fontSize: '0.88rem' }}>
            {disabledReason === 'blocked' ? t('composer.placeholderBlocked') : t('composer.placeholderClosed')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.composer}>
      {(replyTo || editingMsg) && (
        <div className={styles.composerPreview}>
          <span className={styles.composerPreviewLabel}>
            {editingMsg ? t('composer.editing') : t('composer.replyingTo')}
          </span>
          <span className={styles.composerPreviewContent}>
            {editingMsg
              ? (editingMsg.text || '').slice(0, 100)
              : `${replyTo?.userName || ''}: ${(replyTo?.text || '').slice(0, 100)}`}
          </span>
          <button
            type="button"
            className={styles.composerPreviewClear}
            onClick={editingMsg ? onCancelEdit : onCancelReply}
            aria-label={editingMsg ? t('composer.cancelEdit') : t('composer.cancelReply')}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {(images.length > 0 || syllabusRef) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {images.map((url, i) => (
            <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          ))}
          {syllabusRef && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#fdfaf5', border: '1px solid var(--color-gold)', borderRadius: 6, fontSize: '0.78rem', maxWidth: 240 }}>
              <span>{syllabusRef.type === 'category' ? '📚' : '🥋'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{syllabusRef.name}</span>
              <button type="button" onClick={() => setSyllabusRef(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-sumi-light)' }} aria-label={t('composer.cancel')}>✕</button>
            </div>
          )}
        </div>
      )}

      {mentionQuery && (
        <div style={{ position: 'relative' }}>
          <div className={styles.mentionDropdown} ref={mentionListRef}>
            {mentionCandidates.length === 0 ? (
              <div className={styles.mentionEmpty}>{t('mention.noMatches')}</div>
            ) : (
              mentionCandidates.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  data-active={i === mentionIndex ? 'true' : 'false'}
                  className={`${styles.mentionItem} ${i === mentionIndex ? styles.mentionItemActive : ''}`}
                  onClick={() => insertMention(m)}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <div className={styles.mentionItemAvatar}>
                    {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" /> : (m.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className={styles.mentionItemName}>{m.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ★ Emoji library picker */}
      {showEmoji && (
        <div className={styles.emojiSection}>
          <EmojiPicker
            onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
            theme="light"
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            height={380}
            width="100%"
            searchPlaceHolder={t('composer.emojiPicker')}
          />
        </div>
      )}

      {hasSelection && (
        <div className={styles.formatBar}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('**')} title={t('composer.bold')}>
            <Bold size={14} strokeWidth={2} />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('*')} title={t('composer.italic')}>
            <Italic size={14} strokeWidth={2} />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('`')} title={t('composer.code')}>
            <Code size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <div className={styles.composerBox}>
        <div className={styles.composerToolbar}>
          <button
            type="button"
            className={styles.composerToolBtn}
            onClick={() => setShowEmoji((v) => !v)}
            title={t('composer.openEmoji')}
            disabled={sending}
          >
            <Smile size={16} strokeWidth={2} />
          </button>
          <div className={styles.attachMenuWrap}>
            <button
              type="button"
              className={styles.composerToolBtn}
              onClick={() => setShowAttach((v) => !v)}
              title={t('composer.attach')}
              disabled={uploading || sending}
            >
              {uploading ? <span className={styles.composerUploadSpinner} /> : <Paperclip size={16} strokeWidth={2} />}
            </button>
            {showAttach && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 250 }} onClick={() => setShowAttach(false)} />
                <div className={styles.attachMenu} style={{ zIndex: 300 }}>
                  <button type="button" className={styles.attachMenuItem} onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}>
                    <ImageIcon size={16} strokeWidth={2} className={styles.attachMenuIcon} />
                    {t('composer.image')}
                  </button>
                  <button type="button" className={styles.attachMenuItem} onClick={() => { setShowAttach(false); setShowSyllabusPicker(true); }}>
                    <BookOpen size={16} strokeWidth={2} className={styles.attachMenuIcon} />
                    {t('composer.syllabus')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          value={text}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          onSelect={updateSelection}
          onKeyUp={updateSelection}
          onMouseUp={updateSelection}
          onBlur={() => setTimeout(() => setHasSelection(false), 150)}
          onFocus={() => setShowEmoji(false)}
          placeholder={t('composer.placeholder')}
          rows={1}
          disabled={sending}
          dir="auto"
        />

        <div className={styles.composerActions}>
          <button
            type="button"
            className={styles.composerSendBtn}
            onClick={handleSubmit}
            disabled={!canSend}
            title={t('composer.send')}
            aria-label={t('composer.send')}
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFilePick} style={{ display: 'none' }} />

      <div className={styles.composerMeta}>
        <span className={styles.composerMetaHint}>
          {uploading ? t('composer.uploading') : error ? '' : text.length === 0 ? t('composer.mentionHint') : ''}
        </span>
        {charsLeft < 300 && (
          <span className={`${styles.charCounter} ${overLimit ? styles.charCounterOver : charsLeft < 100 ? styles.charCounterWarn : ''}`}>
            {charsLeft}
          </span>
        )}
      </div>

      {error && <div className={styles.composerError}>{error}</div>}

      {showSyllabusPicker && (
        <SyllabusPicker
          currentUser={currentUser}
          onClose={() => setShowSyllabusPicker(false)}
          onPick={(ref) => { setSyllabusRef(ref); setShowSyllabusPicker(false); }}
        />
      )}
    </div>
  );
}

function SyllabusPicker({ currentUser, onClose, onPick }) {
  const { t } = useTranslation('chat');
  const [tab, setTab] = useState('category');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [itemsLoading, setItemsLoading] = useState(false);

  const allowedBelts = useMemo(() => {
    if (currentUser?.role === 'admin') return null;
    const idx = BELT_ORDER.indexOf(currentUser?.belt || 'yellow');
    return idx >= 0 ? BELT_ORDER.slice(0, idx + 1) : ['yellow'];
  }, [currentUser]);

  useEffect(() => {
    (async () => {
      try {
        const itemsQuery = allowedBelts
          ? query(collection(db, 'items'), where('minimumGrade', 'in', allowedBelts))
          : collection(db, 'items');
        const [itemsSnap, catsSnap] = await Promise.all([
          getDocs(itemsQuery),
          getDocs(collection(db, 'categories')),
        ]);
        const itemCounts = {};
        itemsSnap.forEach((d) => {
          const cid = d.data().categoryId;
          if (cid) itemCounts[cid] = (itemCounts[cid] || 0) + 1;
        });
        const cats = catsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => !c.isDeleted && (itemCounts[c.id] || 0) > 0)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setCategories(cats);
        if (cats[0]) setSelectedCatId(cats[0].id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [allowedBelts]);

  useEffect(() => {
    if (tab !== 'item' || !selectedCatId) return;
    setItemsLoading(true);
    (async () => {
      try {
        const baseRef = collection(db, 'items');
        const q = allowedBelts
          ? query(baseRef, where('categoryId', '==', selectedCatId), where('minimumGrade', 'in', allowedBelts))
          : query(baseRef, where('categoryId', '==', selectedCatId));
        const snap = await getDocs(q);
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      } finally {
        setItemsLoading(false);
      }
    })();
  }, [selectedCatId, tab, allowedBelts]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t('composer.pickSyllabus')}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.roomTabs}>
            <button type="button" className={`${styles.roomTab} ${tab === 'category' ? styles.roomTabActive : ''}`} onClick={() => setTab('category')}>
              {t('composer.pickCategory')}
            </button>
            <button type="button" className={`${styles.roomTab} ${tab === 'item' ? styles.roomTabActive : ''}`} onClick={() => setTab('item')}>
              {t('composer.pickItem')}
            </button>
          </div>
          {loading ? (
            <div className={styles.emptyTab}>{t('loading')}</div>
          ) : tab === 'category' ? (
            <div className={styles.memberList}>
              {categories.length === 0 ? (
                <div className={styles.emptyTab}>{t('syllabusRef.categoryUnavailable')}</div>
              ) : categories.map((c) => (
                <button key={c.id} type="button" className={styles.memberRow}
                  style={{ cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => onPick({ type: 'category', id: c.id, name: c.names?.en || c.names?.ja || 'Category', ja: c.names?.ja || '' })}
                >
                  <div className={styles.memberAvatar}>📚</div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{c.names?.en || c.names?.ja}</div>
                    {c.names?.ja && <div className={styles.memberEmail}>{c.names.ja}</div>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <select className={styles.searchInput} value={selectedCatId} onChange={(e) => setSelectedCatId(e.target.value)} style={{ marginBottom: 12 }}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.names?.en || c.names?.ja}</option>)}
              </select>
              <div className={styles.memberList}>
                {itemsLoading ? (
                  <div className={styles.emptyTab}>{t('loading')}</div>
                ) : items.length === 0 ? (
                  <div className={styles.emptyTab}>{t('syllabusRef.itemUnavailable')}</div>
                ) : items.map((it) => (
                  <button key={it.id} type="button" className={styles.memberRow}
                    style={{ cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => onPick({ type: 'item', id: it.id, categoryId: it.categoryId, name: it.names?.en || it.names?.ja || 'Technique', ja: it.names?.ja || '' })}
                  >
                    <div className={styles.memberAvatar}>🥋</div>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberName}>{it.names?.ja || it.names?.en}</div>
                      {it.names?.en && <div className={styles.memberEmail}>{it.names.en}</div>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}