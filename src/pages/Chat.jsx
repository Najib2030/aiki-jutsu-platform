// src/pages/Chat.jsx
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import {
  collection, doc, query, where, orderBy, limit,
  getDocs, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp,
  increment, writeBatch,
} from 'firebase/firestore';
import { AlertTriangle, RotateCcw, ArrowDown, Menu, ShieldOff } from 'lucide-react';
import { isRoomAdmin, isMainRoomAdmin } from '../utils/chatPermissions';
import { cleanupOldMessages } from '../utils/chatCleanup';
import { isNearBottom, toDate } from '../utils/chat';
import Loading from '../components/Loading';
import MessageList from './chat/MessageList';
import MessageComposer from './chat/MessageComposer';
import PinnedBar from './chat/PinnedBar';
import RoomDetails from './chat/RoomDetails';
import BlockModal from './chat/BlockModal';
import styles from './Chat.module.css';

const PAGE_SIZE = 30;
const TYPING_FRESH_MS = 30000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RANGE_BATCH = 250;
const RANGE_MAX = 3000;

function generateMessageId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchMessagesFromDateToNow(startDate) {
  const out = [];
  let lastTs = null;
  while (out.length < RANGE_MAX) {
    const constraints = [orderBy('createdAt', 'asc')];
    if (lastTs) {
      constraints.push(where('createdAt', '>', lastTs));
    } else {
      constraints.push(where('createdAt', '>=', Timestamp.fromDate(startDate)));
    }
    constraints.push(limit(RANGE_BATCH));
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDocs(query(collection(db, 'messages'), ...constraints));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (docs.length === 0) break;
    out.push(...docs);
    if (docs.length < RANGE_BATCH) break;
    lastTs = docs[docs.length - 1].createdAt;
    if (!lastTs) break;
  }
  return out;
}

export default function Chat() {
  const { t } = useTranslation('chat');
  const { userData, currentUser, setUserData } = useAuth();
  const outletCtx = useOutletContext();
  const openMobileMenu = outletCtx?.setMobileMenuOpen;
  const location = useLocation();
  const navigate = useNavigate();

  const roomAdmin = isRoomAdmin(userData);
  const mainAdmin = isMainRoomAdmin(userData);
  const isApproved = userData?.role === 'admin' || userData?.isApproved === true;

  const [loading, setLoading] = useState(true);
  const [quotaError, setQuotaError] = useState(false);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingRange, setLoadingRange] = useState(false);
  const [members, setMembers] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [typing, setTyping] = useState({});
  const [reports, setReports] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);

  const [roomDetailsOpen, setRoomDetailsOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [infoTarget, setInfoTarget] = useState(null);
  const [newMessagesMarker, setNewMessagesMarker] = useState(null);
  const [pendingScrollTo, setPendingScrollTo] = useState(null);

  const scrollRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const hasSetInitialHasMoreRef = useRef(false);
  const pendingReadsRef = useRef(new Set());
  const flushTimerRef = useRef(null);
  const scrollAnchorRef = useRef(null);

  const messagesRef = useRef([]);
  const pendingScrollToRef = useRef(null);
  
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pendingScrollToRef.current = pendingScrollTo; }, [pendingScrollTo]);

  useEffect(() => {
    if (!userData) return;
    const lastSeen = toDateSafe(userData.chatLastSeenAt);
    setNewMessagesMarker(lastSeen);
  }, [userData]);

  const formatReadTime = useCallback((date) => {
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return t('message.timeNow', 'now');
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return t('message.minutesAgo', { n: mins, defaultValue: '{{n}} min ago' });
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 24) return t('message.hoursAgo', { n: hours, defaultValue: '{{n}} h ago' });
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleString(undefined, {
      ...(sameYear ? {} : { year: 'numeric' }),
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [t]);

  // Bootstrap
  useEffect(() => {
    // 1. Wait for Auth AND UserData to fully load
    if (!currentUser || !userData) return;

    // 2. If the user is not approved, stop the loading spinner immediately
    if (!isApproved) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const roomRef = doc(db, 'chatRooms', 'global');
        const snap = await getDoc(roomRef);
        if (!snap.exists()) {
          await setDoc(roomRef, {
            isClosed: false, pinnedMessageIds: [], lastMessageAt: null,
            lastMessagePreview: '', messageCount: 0, updatedAt: serverTimestamp(),
          });
        }
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), { chatLastSeenAt: serverTimestamp() });
          if (setUserData) setUserData({ ...userData, chatLastSeenAt: new Date() });
        } catch (_) {}
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error('Chat bootstrap failed:', err);
        if (!cancelled) {
          if (err.code === 'resource-exhausted' || /quota/i.test(err.message)) setQuotaError(true);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, userData, isApproved]); // 👈 Added userData to dependencies

  // Room meta
  useEffect(() => {
    if (!currentUser || !isApproved) return;
    const unsub = onSnapshot(doc(db, 'chatRooms', 'global'), (snap) => {
      if (snap.exists()) setRoom(snap.data());
    }, (err) => {
      if (err.code === 'resource-exhausted' || /quota/i.test(err.message)) setQuotaError(true);
    });
    return () => unsub();
  }, [currentUser, isApproved]);

  // Messages Listener
  useEffect(() => {
    if (!currentUser || !isApproved) return;
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    const unsub = onSnapshot(q, (snap) => {
      const latest = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();

      setMessages((prev) => {
        if (prev.length === 0) return latest;
        const byId = new Map();
        prev.forEach((m) => byId.set(m.id, m));
        latest.forEach((m) => byId.set(m.id, m));
        return Array.from(byId.values()).sort((a, b) => {
          const ta = toDateSafe(a.createdAt)?.getTime() || 0;
          const tb = toDateSafe(b.createdAt)?.getTime() || 0;
          return ta - tb;
        });
      });

      if (!hasSetInitialHasMoreRef.current) {
        setHasMore(snap.size === PAGE_SIZE);
        hasSetInitialHasMoreRef.current = true;
      }
    }, (err) => {
      if (err.code === 'resource-exhausted' || /quota/i.test(err.message)) setQuotaError(true);
    });
    return () => unsub();
  }, [currentUser, isApproved]);

  // Initial Scroll to Bottom
  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (loading) return;
    if (messages.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    initialScrollDoneRef.current = true;
  }, [messages, loading]);

  // Scroll Anchoring for Load Older
  useLayoutEffect(() => {
    if (!scrollAnchorRef.current) return;
    const el = scrollRef.current;
    if (el) {
      const { scrollTop: oldTop, scrollHeight: oldHeight } = scrollAnchorRef.current;
      const diff = el.scrollHeight - oldHeight;
      if (diff > 0) {
        el.scrollTop = oldTop + diff;
      }
    }
    scrollAnchorRef.current = null;
  }, [messages]);

  // Sticky to Bottom (ResizeObserver)
  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    const listEl = el.firstElementChild;
    if (!listEl) return;

    const ro = new ResizeObserver(() => {
      if (!atBottomRef.current) return;
      if (pendingScrollToRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(listEl);
    return () => ro.disconnect();
  }, [loading]);

  // Members
  useEffect(() => {
    if (!currentUser || !isApproved) return;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn('Members listener error:', err));
    return () => unsub();
  }, [currentUser, isApproved]);

  // Bans
  useEffect(() => {
    if (!currentUser || !isApproved) return;
    const unsub = onSnapshot(collection(db, 'chatBans'), (snap) => {
      const now = Date.now();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((b) => {
          if (!b.expiresAt) return true;
          const exp = toDateSafe(b.expiresAt);
          return !exp || exp.getTime() > now;
        });
      setBlocked(list);
    }, (err) => console.warn('Bans listener error:', err));
    return () => unsub();
  }, [currentUser, isApproved]);

  // Reports
  useEffect(() => {
    if (!roomAdmin || !isApproved) { setReports([]); return; }
    const q = query(collection(db, 'chatReports'), where('status', '==', 'pending'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn('Reports listener error:', err));
    return () => unsub();
  }, [roomAdmin, isApproved]);

  // Typing
  useEffect(() => {
    if (!currentUser || !isApproved) return;
    const unsub = onSnapshot(collection(db, 'typing'), (snap) => {
      const now = Date.now();
      const map = {};
      snap.docs.forEach((d) => {
        if (d.id === currentUser.uid) return;
        const data = d.data();
        const clientTs = typeof data.clientTs === 'number' ? data.clientTs : null;
        const serverTs = toDateSafe(data.ts);
        let age;
        if (clientTs != null) age = now - clientTs;
        else if (serverTs) age = now - serverTs.getTime();
        else age = 0;
        if (age < TYPING_FRESH_MS) {
          map[d.id] = { name: data.name || 'Member', ts: serverTs || new Date(clientTs || now) };
        }
      });
      setTyping(map);
    }, (err) => console.warn('Typing listener error:', err));
    return () => unsub();
  }, [currentUser, isApproved]);

  // Cleanup (room admin only)
  useEffect(() => {
    if (!roomAdmin) return;
    cleanupOldMessages()
      .then((n) => { if (n > 0) console.info(`Cleaned up ${n} old messages.`); })
      .catch((err) => console.warn('Cleanup failed:', err));
  }, [roomAdmin]);

  // Fetch pinned message docs
  useEffect(() => {
    const ids = room?.pinnedMessageIds || [];
    if (ids.length === 0) { setPinnedMessages([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const docs = await Promise.all(ids.slice(0, 5).map((id) => getDoc(doc(db, 'messages', id))));
        const msgs = docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }));
        if (!cancelled) setPinnedMessages(msgs);
      } catch (err) {
        console.warn('Failed to fetch pinned messages:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [room?.pinnedMessageIds]);

  const scrollToBottom = (behavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const handleScroll = useCallback(() => {
    const atBottom = isNearBottom(scrollRef.current);
    setIsAtBottom(atBottom);
    atBottomRef.current = atBottom;
  }, []);

  // Deep-load a message that isn't in the current window
  const loadRangeAndScroll = useCallback(async (targetId) => {
    if (!targetId) return;

    if (messagesRef.current.some((m) => m.id === targetId)) {
      setPendingScrollTo(targetId);
      return;
    }

    let targetSnap;
    try {
      targetSnap = await getDoc(doc(db, 'messages', targetId));
    } catch (err) {
      console.warn('Could not fetch target message:', err);
      return;
    }
    if (!targetSnap.exists()) return;

    const targetDate = toDateSafe(targetSnap.data().createdAt);
    if (!targetDate) return;

    if (Date.now() - targetDate.getTime() > THIRTY_DAYS_MS) {
      return;
    }

    setLoadingRange(true);
    try {
      const range = await fetchMessagesFromDateToNow(targetDate);
      if (range.length === 0) return;

      setMessages((prev) => {
        const byId = new Map();
        prev.forEach((m) => byId.set(m.id, m));
        range.forEach((m) => byId.set(m.id, m));
        return Array.from(byId.values()).sort((a, b) => {
          const ta = toDateSafe(a.createdAt)?.getTime() || 0;
          const tb = toDateSafe(b.createdAt)?.getTime() || 0;
          return ta - tb;
        });
      });
      setHasMore(true);
      setPendingScrollTo(targetId);
    } catch (err) {
      console.error('Range load failed:', err);
    } finally {
      setLoadingRange(false);
    }
  }, []);

  // Notification deep-link
  useEffect(() => {
    const targetId = location.state?.scrollToMessage;
    if (!targetId) return;
    loadRangeAndScroll(targetId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, loadRangeAndScroll]);

  // Retry scroll for pendingScrollTo
  useEffect(() => {
    if (!pendingScrollTo) return;
    let cancelled = false;
    const tryScroll = () => {
      const el = document.getElementById(`msg-${pendingScrollTo}`);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add(styles.highlightFlash);
      setTimeout(() => el.classList.remove(styles.highlightFlash), 1500);
      if (!cancelled) setPendingScrollTo(null);
      return true;
    };
    if (tryScroll()) return;
    const interval = setInterval(() => { if (tryScroll()) clearInterval(interval); }, 400);
    const giveUp = setTimeout(() => {
      clearInterval(interval);
      if (!cancelled) setPendingScrollTo(null);
    }, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(giveUp);
    };
  }, [pendingScrollTo, messages]);

  const loadOlder = async () => {
    if (loadingMore || !hasMore) return;
    const oldest = messages[0];
    if (!oldest?.createdAt) return;
    
    setLoadingMore(true);

    const el = scrollRef.current;
    if (el) {
      scrollAnchorRef.current = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
      };
      atBottomRef.current = false;
    }

    try {
      const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'desc'),
        where('createdAt', '<', oldest.createdAt),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const older = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      
      setMessages((prev) => {
        const byId = new Map();
        prev.forEach((m) => byId.set(m.id, m));
        older.forEach((m) => byId.set(m.id, m));
        return Array.from(byId.values()).sort((a, b) => {
          const ta = toDateSafe(a.createdAt)?.getTime() || 0;
          const tb = toDateSafe(b.createdAt)?.getTime() || 0;
          return ta - tb;
        });
      });
      setHasMore(snap.size === PAGE_SIZE);
    } catch (err) {
      console.error('Load older failed:', err);
      scrollAnchorRef.current = null;
    } finally {
      setLoadingMore(false);
    }
  };

  // Read receipts
  const queueRead = (msgId) => {
    if (!currentUser) return;
    pendingReadsRef.current.add(msgId);
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(async () => {
      const ids = [...pendingReadsRef.current];
      pendingReadsRef.current.clear();
      flushTimerRef.current = null;
      if (ids.length === 0) return;
      try {
        const batch = writeBatch(db);
        ids.forEach((id) => {
          batch.update(doc(db, 'messages', id), {
            readBy: arrayUnion(currentUser.uid),
            [`readByAt.${currentUser.uid}`]: serverTimestamp(),
          });
        });
        await batch.commit();
      } catch (err) { console.warn('Mark reads failed:', err); }
    }, 1500);
  };

  const handleSendOptimistic = (payload) => {
    if (!currentUser || !userData) return;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = {
      id: tempId, _pending: true, _tempId: tempId, _error: false,
      userId: currentUser.uid, userName: userData.name || 'Unknown',
      userPhoto: userData.profileImageUrl || null,
      userRole: mainAdmin ? 'mainAdmin' : roomAdmin ? 'roomAdmin' : 'student',
      text: payload.text || '', imageUrls: payload.images || [],
      syllabusRef: payload.syllabusRef || null, mentions: payload.mentions || [],
      replyTo: replyTo ? {
        messageId: replyTo.id, userId: replyTo.userId, userName: replyTo.userName,
        textSnippet: (replyTo.text || '').slice(0, 120),
        imageUrl: replyTo.imageUrls?.[0] || null, isDeleted: !!replyTo.isDeleted,
      } : null,
      readBy: [], readByAt: {}, reactions: {}, pinned: false,
      createdAt: new Date(), editedAt: null, isDeleted: false,
    };
    setPendingMessages((prev) => [...prev, optimistic]);
    sendMessage({ ...payload, tempId }).catch(() => {});
  };

  const sendMessage = async ({ text, images = [], syllabusRef = null, mentions = [], tempId }) => {
    if (!currentUser || !userData) throw new Error('No user');
    const id = generateMessageId();
    const now = Timestamp.now();
    const roleLabel = mainAdmin ? 'mainAdmin' : roomAdmin ? 'roomAdmin' : 'student';
    const msgDoc = {
      userId: currentUser.uid, userName: userData.name || 'Unknown',
      userPhoto: userData.profileImageUrl || null, userRole: roleLabel,
      text: text || '', imageUrls: images, syllabusRef: syllabusRef || null, mentions,
      replyTo: replyTo ? {
        messageId: replyTo.id, userId: replyTo.userId, userName: replyTo.userName,
        textSnippet: (replyTo.text || '').slice(0, 120),
        imageUrl: replyTo.imageUrls?.[0] || null, isDeleted: !!replyTo.isDeleted,
      } : null,
      readBy: [currentUser.uid], readByAt: { [currentUser.uid]: now },
      reactions: {}, pinned: false,
      createdAt: now, editedAt: null, isDeleted: false, deletedAt: null, deletedBy: null,
    };
    try {
      await setDoc(doc(db, 'messages', id), msgDoc);
      if (tempId) setPendingMessages((prev) => prev.filter((p) => p._tempId !== tempId));
    } catch (err) {
      if (tempId) {
        setPendingMessages((prev) => prev.map((p) => p._tempId === tempId ? { ...p, _pending: false, _error: true } : p));
      }
      throw err;
    }
    try {
      await updateDoc(doc(db, 'chatRooms', 'global'), {
        lastMessageAt: now,
        lastMessagePreview: (text || '📷').slice(0, 80),
        messageCount: increment(1), updatedAt: now,
      });
    } catch (err) { console.warn('Room meta update failed:', err); }

    const recipients = new Set();
    if (replyTo && replyTo.userId !== currentUser.uid) recipients.add(replyTo.userId);
    mentions.forEach((uid) => { if (uid !== currentUser.uid) recipients.add(uid); });
    if (recipients.size > 0) {
      try {
        const batch = writeBatch(db);
        recipients.forEach((uid) => {
          const isReply = replyTo && replyTo.userId === uid;
          const ref = doc(collection(db, 'notifications'));
          batch.set(ref, {
            userId: uid,
            type: isReply ? 'chat_reply' : 'chat_mention',
            title: isReply ? 'New reply in the Dojo Room' : 'You were mentioned in the Dojo Room',
            message: isReply ? `${userData.name} replied to your message.` : `${userData.name} mentioned you.`,
            titleKey: isReply ? 'chat.notifications.reply.title' : 'chat.notifications.mention.title',
            messageKey: isReply ? 'chat.notifications.reply.message' : 'chat.notifications.mention.message',
            messageParams: { name: userData.name },
            messageId: id,
            read: false,
            createdAt: serverTimestamp(),
            linkTo: '/chat',
          });
        });
        await batch.commit();
      } catch (err) { console.warn('Notifications failed:', err); }
    }
    setReplyTo(null);
  };

  const editMessage = async (msgId, { text }) => {
    await updateDoc(doc(db, 'messages', msgId), { text, editedAt: serverTimestamp() });
    setEditingMsg(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const msg = deleteTarget;
    setDeleteTarget(null);
    try {
      await updateDoc(doc(db, 'messages', msg.id), {
        isDeleted: true, deletedAt: serverTimestamp(), deletedBy: currentUser.uid,
        text: '', imageUrls: [], syllabusRef: null, replyTo: null,
      });
      try {
        await updateDoc(doc(db, 'chatRooms', 'global'), { deletedCount: increment(1) });
      } catch (_) {}
    } catch (err) { console.error('Delete failed:', err); }
  };

  const togglePin = async (msg) => {
    if (!roomAdmin) return;
    try {
      const roomRef = doc(db, 'chatRooms', 'global');
      if (msg.pinned) {
        await updateDoc(roomRef, { pinnedMessageIds: arrayRemove(msg.id) });
        await updateDoc(doc(db, 'messages', msg.id), { pinned: false });
      } else {
        const pins = room?.pinnedMessageIds || [];
        if (pins.length >= 5) { alert(t('pinned.tooMany')); return; }
        await updateDoc(roomRef, { pinnedMessageIds: arrayUnion(msg.id) });
        await updateDoc(doc(db, 'messages', msg.id), { pinned: true });
      }
    } catch (err) { console.error('Pin toggle failed:', err); }
  };

  const unblockUser = async (msg) => {
    if (!roomAdmin || !msg?.userId) return;
    try {
      await deleteDoc(doc(db, 'chatBans', msg.userId));
    } catch (err) {
      console.error('Unblock failed:', err);
      alert(t('errors.unblockFailed', 'Could not unblock the user.'));
    }
  };

  const handleReaction = async (msgId, emoji, isRemove) => {
    if (!currentUser) return;
    try {
      const msgRef = doc(db, 'messages', msgId);
      const snap = await getDoc(msgRef);
      if (!snap.exists()) return;
      const current = snap.data().reactions || {};
      const newReactions = {};
      for (const [e, uids] of Object.entries(current)) {
        const filtered = (Array.isArray(uids) ? uids : []).filter((u) => u !== currentUser.uid);
        if (filtered.length > 0) newReactions[e] = filtered;
      }
      if (!isRemove) {
        const existing = newReactions[emoji] || (current[emoji] || []).filter((u) => u !== currentUser.uid);
        newReactions[emoji] = [...new Set([...existing, currentUser.uid])];
      }
      await updateDoc(msgRef, { reactions: newReactions });
    } catch (err) { console.error('Reaction failed:', err); }
  };

  const jumpToMessage = useCallback((msgId) => {
    if (!msgId) return;
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add(styles.highlightFlash);
      setTimeout(() => el.classList.remove(styles.highlightFlash), 1500);
      return;
    }
    loadRangeAndScroll(msgId);
  }, [loadRangeAndScroll]);

  const myBan = useMemo(() => {
    if (!currentUser) return null;
    return blocked.find((b) => b.id === currentUser.uid) || null;
  }, [blocked, currentUser]);

  const isClosed = !!room?.isClosed;
  const canPost = useMemo(() => {
    if (!currentUser || !userData) return false;
    if (myBan) return false;
    if (isClosed && !roomAdmin) return false;
    return true;
  }, [currentUser, userData, myBan, isClosed, roomAdmin]);

  const firstUnreadMsgId = useMemo(() => {
    if (!newMessagesMarker) return null;
    const found = messages.find((m) => {
      const ts = toDateSafe(m.createdAt);
      return ts && ts > newMessagesMarker;
    });
    return found?.id || null;
  }, [messages, newMessagesMarker]);

  const submitReport = async (reason) => {
    if (!reportTarget || !currentUser) return;
    try {
      const existing = await getDocs(
        query(collection(db, 'chatReports'),
          where('messageId', '==', reportTarget.id),
          where('reporterId', '==', currentUser.uid))
      );
      if (!existing.empty) { alert(t('report.rateLimited')); setReportTarget(null); return; }
      await setDoc(doc(collection(db, 'chatReports')), {
        messageId: reportTarget.id,
        messageSnapshot: {
          text: reportTarget.text || '', imageUrls: reportTarget.imageUrls || [],
          userId: reportTarget.userId, userName: reportTarget.userName,
        },
        reporterId: currentUser.uid, reporterName: userData?.name || '',
        reason: reason || '', status: 'pending',
        reviewedBy: null, reviewedAt: null, createdAt: serverTimestamp(),
      });
      setReportTarget(null);
    } catch (err) { console.error('Report failed:', err); alert(t('errors.reportFailed')); }
  };

  const downloadImage = useCallback(async (url) => {
    if (!url) return;
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `image-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Download failed:', err);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `image-${Date.now()}.jpg`;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (_) {}
    }
  }, []);

  // Render guards
  if (quotaError) {
    return (
      <div className={styles.centerState}>
        <div className={styles.maintenanceCard}>
          <div className={styles.maintenanceIcon}><AlertTriangle size={48} strokeWidth={1.8} /></div>
          <h2 className={styles.maintenanceTitle}>{t('maintenanceTitle')}</h2>
          <p className={styles.maintenanceText}>{t('maintenance')}</p>
          <button className={styles.retryBtn} onClick={() => { setQuotaError(false); window.location.reload(); }}>
            <RotateCcw size={16} strokeWidth={2} /> {t('retry')}
          </button>
        </div>
      </div>
    );
  }
  if (loading) return <Loading text={t('loading')} />;
  if (!isApproved) {
    return (
      <div className={styles.centerState}>
        <div className={styles.maintenanceCard}>
          <div className={styles.maintenanceIcon}><ShieldOff size={48} strokeWidth={1.8} /></div>
          <h2 className={styles.maintenanceTitle}>{t('notApproved.title')}</h2>
          <p className={styles.maintenanceText}>{t('notApproved.message')}</p>
        </div>
      </div>
    );
  }

  const visibleMembers = members.filter((m) => m.role === 'admin' || m.isApproved === true);

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatContainer}>
        {editingMsg && <div className={styles.editBackdrop} />}

        <header className={styles.chatHeader}>
          {openMobileMenu && (
            <button type="button" className={styles.chatBurgerBtn} onClick={() => openMobileMenu(true)} aria-label={t('openMenu')}>
              <Menu size={20} strokeWidth={2} />
            </button>
          )}
          <div className={styles.chatHeaderLeft}>
            <h1 className={styles.chatHeaderTitle}>{t('heading')}</h1>
            <p className={styles.chatHeaderSubtitle}>{t('subtitle')}</p>
          </div>
          <div className={styles.chatHeaderActions}>
            <button type="button" className={styles.iconBtn} onClick={() => setRoomDetailsOpen(true)} title={t('room.title')} aria-label={t('room.title')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>

        {isClosed && <div className={styles.roomClosedBanner}>{t('roomClosed')}</div>}

        {pinnedMessages.length > 0 && (
          <PinnedBar pinnedMessages={pinnedMessages} roomAdmin={roomAdmin} onUnpin={togglePin} onJump={jumpToMessage} />
        )}

        <div className={styles.messagesScroll} ref={scrollRef} onScroll={handleScroll}>
          <MessageList
            messages={messages}
            pendingMessages={pendingMessages}
            onReaction={handleReaction}
            members={members}
            currentUid={currentUser?.uid}
            currentUser={userData}
            roomAdmin={roomAdmin}
            mainAdmin={mainAdmin}
            typing={typing}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadOlder={loadOlder}
            firstUnreadMsgId={firstUnreadMsgId}
            onReply={(msg) => { setReplyTo(msg); setEditingMsg(null); }}
            onEdit={(msg) => { setEditingMsg(msg); setReplyTo(null); }}
            onDelete={(msg) => setDeleteTarget(msg)}
            onBlock={(msg) => {
              const target = members.find((m) => m.id === msg.userId);
              if (target) setBlockTarget(target);
            }}
            onUnblock={unblockUser}
            onReport={(msg) => setReportTarget(msg)}
            onInfo={(msg) => setInfoTarget(msg)}
            onPinToggle={togglePin}
            onJumpToReply={jumpToMessage}
            onRead={queueRead}
            onCopy={(text) => { navigator.clipboard?.writeText(text).catch(() => {}); }}
            onDownload={downloadImage}
            blocked={blocked}
          />
        </div>

        {!isAtBottom && !editingMsg && (
          <button className={styles.scrollToBottomBtn} onClick={() => scrollToBottom('smooth')} aria-label={t('newMessages.scrollDown')}>
            <ArrowDown size={20} strokeWidth={2} />
          </button>
        )}

        {loadingRange && (
          <div className={styles.loadMoreLoading} style={{ position: 'absolute', top: 60, left: 0, right: 0 }}>
            {t('loading')}
          </div>
        )}

        {myBan && (
          <div className={styles.blockedBanner}>
            <div className={styles.blockedBannerIcon}>🚫</div>
            <div className={styles.blockedBannerText}>
              <strong>{t('blockedBanner')}</strong>
              <span>
                {myBan.expiresAt
                  ? t('blockedExpiresIn', { date: new Date(toDateSafe(myBan.expiresAt) || Date.now()).toLocaleString() })
                  : t('blockedForever')}
                {myBan.reason ? ' · ' + t('blockedReason', { reason: myBan.reason }) : ''}
              </span>
            </div>
          </div>
        )}

        <MessageComposer
          canPost={canPost}
          disabledReason={myBan ? 'blocked' : (isClosed && !roomAdmin) ? 'closed' : null}
          currentUser={userData}
          currentUid={currentUser?.uid}
          members={members}
          onSend={handleSendOptimistic}
          onEdit={editMessage}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          editingMsg={editingMsg}
          onCancelEdit={() => setEditingMsg(null)}
        />

        {roomDetailsOpen && (
          <RoomDetails
            isOpen={roomDetailsOpen}
            onClose={() => setRoomDetailsOpen(false)}
            room={room}
            members={visibleMembers}
            messages={messages}
            blocked={blocked}
            reports={reports}
            currentUid={currentUser?.uid}
            currentUser={userData}
            roomAdmin={roomAdmin}
            mainAdmin={mainAdmin}
            onBlockUser={(target) => { setRoomDetailsOpen(false); setBlockTarget(target); }}
            onJumpToMessage={jumpToMessage}
          />
        )}

        {blockTarget && (
          <BlockModal target={blockTarget} onClose={() => setBlockTarget(null)} onBlocked={() => setBlockTarget(null)} />
        )}

        {deleteTarget && (
          <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>{t('deleteConfirm.title')}</h3>
                <button type="button" className={styles.modalClose} onClick={() => setDeleteTarget(null)} aria-label={t('deleteConfirm.cancel')}>✕</button>
              </div>
              <div className={styles.modalBody}><p className={styles.modalText}>{t('deleteConfirm.message')}</p></div>
              <div className={styles.modalFooter}>
                <button className={`${styles.modalBtn} ${styles.modalBtnSecondary}`} onClick={() => setDeleteTarget(null)}>{t('deleteConfirm.cancel')}</button>
                <button className={`${styles.modalBtn} ${styles.modalBtnDanger}`} onClick={confirmDelete}>{t('deleteConfirm.confirm')}</button>
              </div>
            </div>
          </div>
        )}

        {reportTarget && (
          <div className={styles.modalOverlay} onClick={() => setReportTarget(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>{t('report.title')}</h3>
                <button type="button" className={styles.modalClose} onClick={() => setReportTarget(null)} aria-label={t('report.cancel')}>✕</button>
              </div>
              <div className={styles.modalBody}>
                <p className={styles.modalText}>{t('report.message')}</p>
                <textarea className={styles.reasonTextarea} placeholder={t('report.reasonPlaceholder')} id="report-reason-input" />
              </div>
              <div className={styles.modalFooter}>
                <button className={`${styles.modalBtn} ${styles.modalBtnSecondary}`} onClick={() => setReportTarget(null)}>{t('report.cancel')}</button>
                <button
                  className={`${styles.modalBtn} ${styles.modalBtnPrimary}`}
                  onClick={() => {
                    const input = document.getElementById('report-reason-input');
                    submitReport(input?.value || '');
                  }}
                >{t('report.submit')}</button>
              </div>
            </div>
          </div>
        )}

        {infoTarget && (
          <div className={styles.modalOverlay} onClick={() => setInfoTarget(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>{t('message.readByTitle', { count: (infoTarget.readBy || []).length })}</h3>
                <button type="button" className={styles.modalClose} onClick={() => setInfoTarget(null)} aria-label="Close">✕</button>
              </div>
              <div className={styles.modalBody}>
                {(infoTarget.readBy || []).length === 0 ? (
                  <p className={styles.modalText}>{t('message.readByEmpty')}</p>
                ) : (
                  <div className={styles.readReceiptsList}>
                    {(infoTarget.readBy || []).map((uid) => {
                      const m = members.find((mm) => mm.id === uid);
                      if (!m) return null;
                      const readAt = infoTarget.readByAt?.[uid];
                      const readAtDate = readAt ? toDateSafe(readAt) : null;
                      return (
                        <div key={uid} className={styles.readReceiptRow}>
                          <div className={styles.readReceiptAvatar}>
                            {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" /> : (m.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className={styles.readReceiptName}>
                            {m.name}
                            {uid === currentUser?.uid && <span style={{ opacity: 0.6, marginLeft: 6 }}>({t('message.you')})</span>}
                          </div>
                          {readAtDate && (
                            <div className={styles.readReceiptTime}>{formatReadTime(readAtDate)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}