// src/pages/Settings.jsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase/config';
import {
  doc, updateDoc, collection, query, where, getDocs, writeBatch, deleteDoc, addDoc, getDoc, setDoc,
} from 'firebase/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from 'firebase/auth';
import {
  User, Shield, Bell, Lock, AlertTriangle, CheckCheck, Camera,
  Trash2, RotateCcw, Search, X, Crown, UserMinus, DollarSign,
} from 'lucide-react';
import { getBeltLabel, BELT_COLORS } from '../utils/experience';
import { onProgressChanged } from '../utils/progressEvents';
import {
  isMainAdminAccount, getEffectivePermissions, getAdminPermissions,
} from '../utils/adminPermissions';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import Modal from '../components/Modal';
import styles from './Settings.module.css';

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const parts = birthDateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

function formatTimeAgo(ts, t) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  const weeks = Math.floor(days / 7);
  return t('time.weeksAgo', { count: weeks });
}

function isProtectedAdmin(admin, currentUserId) {
  if (!admin) return false;
  if (isMainAdminAccount(admin)) return true;
  if (admin.id === currentUserId) return true;
  return false;
}

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];
const NO_PREV_BELT_TRACK = '#fff';
const AVATAR_RING_RADIUS = 55;
const AVATAR_RING_CIRCUMFERENCE = 2 * Math.PI * AVATAR_RING_RADIUS;

const SECTIONS = [
  { id: 'profile',       Icon: User },
  { id: 'account',       Icon: Shield },
  { id: 'notifications', Icon: Bell },
  { id: 'security',      Icon: Lock },
  { id: 'admins',        Icon: Crown },
  { id: 'danger',        Icon: AlertTriangle },
];

const NOTIF_ICON = {
  belt_approved: '✓',
  belt_rejected: '✗',
  new_technique: '🥋',
  admin_promoted: '👑',
  admin_demoted: '📤',
  admin_login: '🔓',
  admin_logout: '🔒',
  chat_reply: '💬',
  chat_mention: '@',
};

const NOTIF_TINT = {
  belt_approved: 'approved',
  belt_rejected: 'rejected',
  new_technique: 'new',
  admin_promoted: 'new',
  admin_demoted: 'rejected',
  admin_login: 'approved',
  admin_logout: 'new',
  chat_reply: 'new',
  chat_mention: 'new',
};

const TODAY_ISO = new Date().toISOString().split('T')[0];

function beltTextColor(belt) {
  return belt === 'yellow' ? '#333' : '#fff';
}

function translateNotification(n, t) {
  const params = { ...(n.messageParams || {}) };
  if (params.belt) {
    params.belt = t(`belts.short.${params.belt}`, { defaultValue: params.belt });
  }

  if (n.titleKey && n.titleKey.startsWith('chat.')) {
    return {
      title: t(n.titleKey.replace('chat.', ''), { ns: 'chat' }),
      message: t(n.messageKey.replace('chat.', ''), { ns: 'chat', ...params }),
    };
  }

  return {
    title: n.titleKey ? t(n.titleKey) : n.title,
    message: n.messageKey ? t(n.messageKey, params) : n.message,
  };
}

export default function Settings() {
  const { t } = useTranslation();
  const { currentUser, userData, setUserData } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [active, setActive] = useState('profile');

  // Profile
  const [name, setName] = useState(userData?.name || '');
  const [birthDate, setBirthDate] = useState(userData?.birthDate || '');
  const [joinedDate, setJoinedDate] = useState(userData?.joinedDate || '');
  const [profileImageUrl, setProfileImageUrl] = useState(userData?.profileImageUrl || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });

  // Danger
  const [confirmText, setConfirmText] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // Notifications
  const [notifs, setNotifs] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [notifFilter, setNotifFilter] = useState('all');
  const [ring, setRing] = useState({
    percent: 0,
    trackColor: NO_PREV_BELT_TRACK,
    fillColor: '#f1c40f',
  });

  // Delete confirmation modal
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false, title: '', message: '', onConfirmAction: null,
  });
  const [deleting, setDeleting] = useState(false);

  // ── Admin Access section ───────────────────────────────
  const [adminSubTab, setAdminSubTab] = useState('promote');
  const [availableStudents, setAvailableStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [currentAdmins, setCurrentAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSearchFocused, setAdminSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedForPromotion, setSelectedForPromotion] = useState([]);
  const [promoting, setPromoting] = useState(false);
  const [promotionMsg, setPromotionMsg] = useState({ type: '', text: '' });
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);
  const adminSearchRef = useRef(null);

  // Demote state
  const [demoteTarget, setDemoteTarget] = useState(null);
  const [demoting, setDemoting] = useState(false);
  const [demoteMsg, setDemoteMsg] = useState({ type: '', text: '' });

  // Permissions state
  const [permissionsMsg, setPermissionsMsg] = useState({ type: '', text: '' });

  // Pricing state
  const [pricing, setPricing] = useState({ yellow: 0, orange: 0, green: 0, blue: 0, brown: 0, black: 0 });
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMsg, setPricingMsg] = useState({ type: '', text: '' });

  const isAdmin = userData?.role === 'admin';
  const isMainAdmin = isMainAdminAccount(userData);
  const myPermissions = getEffectivePermissions(userData);
  const canSeeAdminAccess = isAdmin && (isMainAdmin || myPermissions.admins === true);

  const otherAdmins = useMemo(
    () => currentAdmins.filter(a => !isMainAdminAccount(a)),
    [currentAdmins]
  );

  const memberSince = userData?.joinedDate
    ? new Date(userData.joinedDate + 'T00:00:00')
    : userData?.createdAt?.toDate?.();
  const computedAge = calcAge(birthDate);
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  // ── Notifications fetch ────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setLoadingNotifs(true);
      try {
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', currentUser.uid)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const at = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const bt = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return bt - at;
        });
        setNotifs(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingNotifs(false);
      }
    })();
  }, [currentUser]);

  // ── Profile ring ───────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !userData) return;

    const userBelt = userData.belt || 'yellow';
    const beltIdx = BELT_ORDER.indexOf(userBelt);
    const prevBelt = beltIdx > 0 ? BELT_ORDER[beltIdx - 1] : null;

    setRing(prev => ({
      ...prev,
      trackColor: prevBelt ? (BELT_COLORS[prevBelt] || NO_PREV_BELT_TRACK) : NO_PREV_BELT_TRACK,
      fillColor: BELT_COLORS[userBelt] || '#f1c40f',
    }));

    const refresh = async () => {
      try {
        if (userBelt === 'dan1') {
          setRing(prev => ({ ...prev, percent: 100 }));
          return;
        }
        const [itemsSnap, progSnap] = await Promise.all([
          getDocs(query(collection(db, 'items'), where('minimumGrade', '==', userBelt))),
          getDocs(query(collection(db, 'progress'), where('userId', '==', currentUser.uid))),
        ]);

        const progressMap = {};
        progSnap.forEach(d => {
          const data = d.data();
          if (!data.itemId) return;
          let st = data.status;
          if (st === 'validated') st = 'completed';
          if (st === 'review') st = 'learning';
          progressMap[data.itemId] = st;
        });

        const total = itemsSnap.size;
        if (total === 0) {
          setRing(prev => ({ ...prev, percent: 0 }));
          return;
        }

        let completed = 0;
        itemsSnap.docs.forEach(d => {
          if (progressMap[d.id] === 'completed') completed++;
        });

        setRing(prev => ({ ...prev, percent: Math.round((completed / total) * 100) }));
      } catch (err) {
        console.error('Failed to fetch ring progress:', err);
      }
    };

    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribeProgress = onProgressChanged(refresh);

    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribeProgress();
    };
  }, [currentUser, userData]);

  // ── Fetch eligible students, current admins & pricing ───────────
  useEffect(() => {
    if (!canSeeAdminAccess || !currentUser) {
      setLoadingStudents(false);
      setLoadingAdmins(false);
      return;
    }
    let mounted = true;
    (async () => {
      setLoadingStudents(true);
      setLoadingAdmins(true);
      try {
        const [studentsSnap, adminsSnap, pricingSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'users'), where('role', '==', 'admin'))),
          getDoc(doc(db, 'settings', 'pricing'))
        ]);
        if (!mounted) return;

        if (pricingSnap.exists()) {
          setPricing(pricingSnap.data());
        }

        const students = studentsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s =>
            !s.isDisabled
            && !s.isDeleted
            && s.isApproved === true
            && (s.emailVerified !== false || s.adminVerified === true)
            && s.id !== currentUser.uid
          )
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAvailableStudents(students);

        const admins = adminsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aMain = isMainAdminAccount(a) ? 0 : 1;
            const bMain = isMainAdminAccount(b) ? 0 : 1;
            if (aMain !== bMain) return aMain - bMain;
            return (a.name || '').localeCompare(b.name || '');
          });
        setCurrentAdmins(admins);
      } catch (err) {
        console.error('Failed to load admin data:', err);
      } finally {
        if (mounted) {
          setLoadingStudents(false);
          setLoadingAdmins(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [canSeeAdminAccess, currentUser]);

  // ── Close search dropdown on outside click ────────
  useEffect(() => {
    if (!adminSearchFocused) return;
    const handle = (e) => {
      if (adminSearchRef.current && !adminSearchRef.current.contains(e.target)) {
        setAdminSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [adminSearchFocused]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [adminSearchQuery]);

  // ── Filtered candidates ────────────────────────────────
  const filteredCandidates = useMemo(() => {
    const q = adminSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const selectedIds = new Set(selectedForPromotion.map(s => s.id));
    return availableStudents
      .filter(s => !selectedIds.has(s.id))
      .filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [availableStudents, selectedForPromotion, adminSearchQuery]);

  // ── Derived notification lists ─────────────────────────
  const activeNotifs = notifs.filter(n => !n.deletedByUser);
  const trashedNotifs = notifs.filter(n => n.deletedByUser === true);
  const unreadCount = activeNotifs.filter(n => !n.read).length;

  const filteredNotifs =
    notifFilter === 'unread'
      ? activeNotifs.filter(n => !n.read)
      : notifFilter === 'trash'
        ? trashedNotifs
        : activeNotifs;

  // ── Notification handlers ──────────────────────────────
  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      setNotifs(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) { console.error(err); }
  };

  const markAllAsRead = async () => {
    const unread = notifs.filter(n => !n.read && !n.deletedByUser);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
      await batch.commit();
      setNotifs(prev => prev.map(n =>
        n.deletedByUser ? n : { ...n, read: true }
      ));
    } catch (err) { console.error(err); }
  };

  const handleNotifClick = (n) => {
    if (n.deletedByUser) return;
    if (!n.read) markAsRead(n.id);
    if (n.type === 'belt_approved' || n.type === 'belt_rejected') {
      navigate('/progress');
    } else if (n.type === 'new_technique' && n.categoryId) {
      navigate(`/syllabus/${n.categoryId}`);
    } else if (n.type === 'chat_reply' || n.type === 'chat_mention' || n.linkTo === '/chat') {
      navigate('/chat');
    }
  };

  const handleDeleteNotif = async (id) => {
    try {
      const deletedAt = new Date();
      await updateDoc(doc(db, 'notifications', id), {
        deletedByUser: true,
        deletedAt,
      });
      setNotifs(prev =>
        prev.map(n => (n.id === id ? { ...n, deletedByUser: true, deletedAt } : n))
      );
    } catch (err) { console.error(err); }
  };

  const handleRestoreNotif = async (id) => {
    try {
      await updateDoc(doc(db, 'notifications', id), {
        deletedByUser: false,
        deletedAt: null,
      });
      setNotifs(prev =>
        prev.map(n => (n.id === id ? { ...n, deletedByUser: false, deletedAt: null } : n))
      );
    } catch (err) { console.error(err); }
  };

  const handlePermanentDelete = (id) => {
    setDeleteModal({
      isOpen: true,
      title: t('settings.notifications.permanentDeleteTitle'),
      message: t('settings.notifications.permanentDeleteMessage'),
      onConfirmAction: async () => {
        await deleteDoc(doc(db, 'notifications', id));
        setNotifs(prev => prev.filter(n => n.id !== id));
      },
    });
  };

  const handleEmptyTrash = () => {
    if (trashedNotifs.length === 0) return;
    setDeleteModal({
      isOpen: true,
      title: t('settings.notifications.emptyTrashTitle'),
      message: t('settings.notifications.emptyTrashMessage', { count: trashedNotifs.length }),
      onConfirmAction: async () => {
        const batch = writeBatch(db);
        trashedNotifs.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
        await batch.commit();
        setNotifs(prev => prev.filter(n => !n.deletedByUser));
      },
    });
  };

  const handleDeleteAllNotifs = () => {
    const inbox = activeNotifs;
    if (inbox.length === 0) return;
    setDeleteModal({
      isOpen: true,
      title: t('settings.notifications.deleteAllTitle'),
      message: t('settings.notifications.deleteAllMessage', { count: inbox.length }),
      onConfirmAction: async () => {
        const batch = writeBatch(db);
        const now = new Date();
        inbox.forEach(n => batch.update(doc(db, 'notifications', n.id), {
          deletedByUser: true,
          deletedAt: now,
        }));
        await batch.commit();
        setNotifs(prev => prev.map(n =>
          n.deletedByUser ? n : { ...n, deletedByUser: true, deletedAt: now }
        ));
      },
    });
  };

  const handleModalConfirm = async () => {
    if (!deleteModal.onConfirmAction || deleting) return;
    setDeleting(true);
    try {
      await deleteModal.onConfirmAction();
      setDeleteModal(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Profile handlers ───────────────────────────────────
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return setProfileMsg({ type: 'error', text: t('settings.profile.errNotImage') });
    }
    if (file.size > MAX_PHOTO_SIZE) {
      return setProfileMsg({ type: 'error', text: t('settings.profile.errPhotoTooLarge') });
    }

    setUploadingPhoto(true);
    setProfileMsg({ type: '', text: '' });

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('key', import.meta.env.VITE_IMGBB_API_KEY);

      const res = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error('Upload failed');

      const url = json.data.url;
      await updateDoc(doc(db, 'users', currentUser.uid), { profileImageUrl: url });
      setProfileImageUrl(url);
      setUserData({ ...userData, profileImageUrl: url });
      setProfileMsg({ type: 'success', text: t('settings.profile.photoUpdated') });
    } catch (err) {
      console.error(err);
      setProfileMsg({ type: 'error', text: t('settings.profile.errPhotoUpload') });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!window.confirm(t('settings.profile.confirmRemovePhoto'))) return;
    setRemovingPhoto(true);
    setProfileMsg({ type: '', text: '' });
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { profileImageUrl: null });
      setProfileImageUrl(null);
      setUserData({ ...userData, profileImageUrl: null });
      setProfileMsg({ type: 'success', text: t('settings.profile.photoRemoved') });
    } catch (err) {
      console.error(err);
      setProfileMsg({ type: 'error', text: t('settings.profile.errPhotoRemove') });
    } finally {
      setRemovingPhoto(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });

    if (!name.trim()) {
      return setProfileMsg({ type: 'error', text: t('settings.profile.errNameEmpty') });
    }
    if (birthDate) {
      const age = calcAge(birthDate);
      if (age === null || age < 5) {
        return setProfileMsg({
          type: 'error',
          text: t('settings.profile.errBirthDateInvalid'),
        });
      }
    }
    if (joinedDate && joinedDate > TODAY_ISO) {
      return setProfileMsg({
        type: 'error',
        text: t('settings.profile.errJoinedFuture'),
      });
    }

    setSavingProfile(true);
    try {
      const payload = { name: name.trim() };
      if (birthDate) {
        payload.birthDate = birthDate;
        payload.age = calcAge(birthDate);
      }
      payload.joinedDate = joinedDate || null;

      await updateDoc(doc(db, 'users', currentUser.uid), payload);
      setUserData({ ...userData, ...payload });
      setProfileMsg({ type: 'success', text: t('settings.profile.saved') });
    } catch (err) {
      console.error(err);
      setProfileMsg({ type: 'error', text: t('settings.profile.errSave') });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMsg({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      return setPwMsg({ type: 'error', text: t('settings.security.errPasswordMismatch') });
    }
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!regex.test(newPassword)) {
      return setPwMsg({
        type: 'error',
        text: t('settings.security.errPasswordRules'),
      });
    }

    setSavingPw(true);
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, cred);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMsg({ type: 'success', text: t('settings.security.passwordChanged') });
    } catch (err) {
      console.error(err);
      let text = t('settings.security.errPasswordChange');
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        text = t('settings.security.errCurrentPasswordWrong');
      } else if (err.code === 'auth/requires-recent-login') {
        text = t('settings.security.errRecentLogin');
      }
      setPwMsg({ type: 'error', text });
    } finally {
      setSavingPw(false);
    }
  };

  const handleDeactivate = async () => {
    if (confirmText !== 'DELETE') return;
    setDeactivating(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { isDisabled: true });
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error(err);
      alert(t('settings.danger.errDeactivate'));
      setDeactivating(false);
    }
  };

  // ── Admin Access: promote handlers ─────────────────────
  const addCandidate = (student) => {
    if (selectedForPromotion.some(s => s.id === student.id)) return;
    setSelectedForPromotion(prev => [...prev, student]);
    setAdminSearchQuery('');
    setAdminSearchFocused(false);
    setHighlightedIndex(0);
  };

  const removeCandidate = (id) => {
    setSelectedForPromotion(prev => prev.filter(s => s.id !== id));
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i =>
        Math.min(i + 1, Math.max(0, filteredCandidates.length - 1))
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const candidate = filteredCandidates[highlightedIndex];
      if (candidate) addCandidate(candidate);
    } else if (e.key === 'Escape') {
      setAdminSearchQuery('');
      setAdminSearchFocused(false);
    }
  };

  const handlePromoteSelected = async () => {
    if (selectedForPromotion.length === 0 || promoting) return;
    setPromoting(true);
    setPromotionMsg({ type: '', text: '' });

    const targets = [...selectedForPromotion];
    const promotedIds = new Set();
    const failures = [];

    for (const s of targets) {
      try {
        await updateDoc(doc(db, 'users', s.id), { role: 'admin' });
        promotedIds.add(s.id);
      } catch (err) {
        console.error(`Failed to promote ${s.email}:`, err);
        failures.push({ student: s, err });
      }
    }

    for (const s of targets) {
      if (!promotedIds.has(s.id)) continue;
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: s.id,
          type: 'admin_promoted',
          title: 'Promoted to Administrator',
          message: 'You have been granted administrator access to the dojo. Refresh the page or sign in again to access the admin dashboard.',
          titleKey: 'notifications.adminPromoted.title',
          messageKey: 'notifications.adminPromoted.message',
          messageParams: {},
          read: false,
          createdAt: new Date(),
        });
      } catch (notifErr) {
        console.error(`Failed to create promotion notification for ${s.email}:`, notifErr);
      }
    }

    if (promotedIds.size > 0) {
      const promotedList = targets
        .filter(s => promotedIds.has(s.id))
        .map(s => ({ ...s, role: 'admin' }));
      setAvailableStudents(prev => prev.filter(s => !promotedIds.has(s.id)));
      setCurrentAdmins(prev => [...prev, ...promotedList]);
    }
    setSelectedForPromotion([]);
    setAdminSearchQuery('');
    setPromoteConfirmOpen(false);

    if (failures.length === 0) {
      setPromotionMsg({
        type: 'success',
        text: t('settings.admins.promoteSuccess', { count: promotedIds.size }),
      });
    } else if (promotedIds.size === 0) {
      const denied = failures.every(f => f.err.code === 'permission-denied');
      setPromotionMsg({
        type: 'error',
        text: denied
          ? t('settings.admins.promoteDenied')
          : t('settings.admins.promoteFailed'),
      });
    } else {
      setPromotionMsg({
        type: 'error',
        text: t('settings.admins.promotePartial', {
          promoted: promotedIds.size,
          failed: failures.length,
        }),
      });
    }

    setPromoting(false);
  };

  // ── Admin Access: demote handlers ──────────────────────
  const handleDemote = async () => {
    if (!demoteTarget || demoting) return;

    if (isProtectedAdmin(demoteTarget, currentUser.uid)) {
      setDemoteTarget(null);
      setDemoteMsg({ type: 'error', text: t('settings.admins.demoteProtected') });
      return;
    }

    setDemoting(true);
    setDemoteMsg({ type: '', text: '' });

    const targetId = demoteTarget.id;
    const targetName = demoteTarget.name;
    const targetSnapshot = { ...demoteTarget };

    try {
      await updateDoc(doc(db, 'users', targetId), { role: 'student' });
    } catch (err) {
      console.error('Failed to demote admin:', err);
      let text = t('settings.admins.demoteFailed');
      if (err.code === 'permission-denied') {
        text = t('settings.admins.demoteDenied');
      }
      setDemoteMsg({ type: 'error', text });
      setDemoteTarget(null);
      setDemoting(false);
      return;
    }

    try {
      await addDoc(collection(db, 'notifications'), {
        userId: targetId,
        type: 'admin_demoted',
        title: 'Administrator Access Removed',
        message: 'Your administrator access has been removed. You now have student access to the dojo.',
        titleKey: 'notifications.adminDemoted.title',
        messageKey: 'notifications.adminDemoted.message',
        messageParams: {},
        read: false,
        createdAt: new Date(),
      });
    } catch (notifErr) {
      console.error('Failed to create demote notification:', notifErr);
    }

    const demoted = { ...targetSnapshot, role: 'student' };
    setCurrentAdmins(prev => prev.filter(a => a.id !== targetId));
    setAvailableStudents(prev => {
      const alreadyExists = prev.some(s => s.id === demoted.id);
      if (alreadyExists) return prev;
      return [...prev, demoted].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
    });

    setDemoteTarget(null);
    setDemoteMsg({
      type: 'success',
      text: t('settings.admins.demoteSuccess', { name: targetName }),
    });
    setDemoting(false);
  };

  // ── Permissions: toggle one permission for one admin ───
  const handleTogglePermission = async (admin, permissionKey) => {
    if (!isMainAdmin) return;
    if (isMainAdminAccount(admin)) return;

    const current = getEffectivePermissions(admin);
    const newValue = !current[permissionKey];

    setCurrentAdmins(prev => prev.map(a =>
      a.id === admin.id
        ? { ...a, permissions: { ...(a.permissions || {}), [permissionKey]: newValue } }
        : a
    ));
    setPermissionsMsg({ type: '', text: '' });

    try {
      await updateDoc(doc(db, 'users', admin.id), {
        [`permissions.${permissionKey}`]: newValue,
      });
    } catch (err) {
      console.error('Failed to update permission:', err);
      setCurrentAdmins(prev => prev.map(a =>
        a.id === admin.id
          ? { ...a, permissions: { ...(a.permissions || {}), [permissionKey]: !newValue } }
          : a
      ));
      setPermissionsMsg({
        type: 'error',
        text: t('settings.admins.errPermissionUpdate'),
      });
    }
  };

  // ── Pricing: Save handler ──────────────────────────────
  const handleSavePricing = async () => {
    if (!isMainAdmin) return;
    setSavingPricing(true);
    setPricingMsg({ type: '', text: '' });
    try {
      await setDoc(doc(db, 'settings', 'pricing'), pricing);
      setPricingMsg({ type: 'success', text: t('settings.admins.pricingSaved') });
    } catch (err) {
      console.error(err);
      setPricingMsg({ type: 'error', text: t('settings.admins.pricingFailed') });
    } finally {
      setSavingPricing(false);
    }
  };

  const renderAvatar = (s, size = 32) => {
    const style = {
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'var(--color-sumi)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-heading)',
      fontWeight: 'bold',
      fontSize: size * 0.42,
      flexShrink: 0,
      overflow: 'hidden',
    };
    if (s.profileImageUrl) {
      return (
        <div style={style}>
          <img
            src={s.profileImageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      );
    }
    return (
      <div style={style}>
        {(s.name || '?').charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <div className={styles.settingsPage}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('settings.title')}</h1>
        <p className={styles.pageSubtitle}>{t('settings.subtitle')}</p>
      </div>

      <div className={styles.layout}>
        <nav className={styles.sideNav}>
          {SECTIONS.filter(s => {
            if (s.id === 'danger') return !isAdmin;
            if (s.id === 'admins') return canSeeAdminAccess;
            return true;
          }).map(s => {
            const Icon = s.Icon;
            return (
              <button
                key={s.id}
                className={`${styles.navItem} ${
                  active === s.id ? styles.navItemActive : ''
                } ${s.id === 'danger' ? styles.navItemDanger : ''}`}
                onClick={() => setActive(s.id)}
              >
                <Icon size={16} strokeWidth={1.8} className={styles.navItemIcon} />
                <span>{t(`settings.sections.${s.id}`)}</span>
                {s.id === 'notifications' && unreadCount > 0 && (
                  <span className={styles.navBadge}>{unreadCount}</span>
                )}
                {s.id === 'admins' && selectedForPromotion.length > 0 && (
                  <span className={styles.navBadge}>{selectedForPromotion.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={styles.content}>
          {active === 'profile' && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('settings.profile.title')}</h2>
                <p className={styles.cardHint}>{t('settings.profile.hint')}</p>
              </div>

              <div className={styles.avatarRow}>
                <div className={styles.avatarColumn}>
                  <div className={styles.avatarWrap}>
                    <svg className={styles.avatarRing} viewBox="0 0 120 120" aria-hidden="true">
                      <circle
                        className={styles.avatarRingTrack}
                        cx="60" cy="60" r={AVATAR_RING_RADIUS}
                        style={{ stroke: ring.trackColor }}
                      />
                      <circle
                        className={styles.avatarRingFill}
                        cx="60" cy="60" r={AVATAR_RING_RADIUS}
                        style={{
                          stroke: ring.fillColor,
                          strokeDasharray: `${AVATAR_RING_CIRCUMFERENCE}`,
                          strokeDashoffset: `${AVATAR_RING_CIRCUMFERENCE * (1 - ring.percent / 100)}`,
                        }}
                      />
                    </svg>
                    <div className={styles.avatarInner}>
                      {profileImageUrl ? (
                        <img
                          src={profileImageUrl}
                          alt={name || t('common.profileAlt')}
                          className={styles.avatarImg}
                        />
                      ) : (
                        <span className={styles.avatarInitial}>{initial}</span>
                      )}
                      {uploadingPhoto && (
                        <div className={styles.avatarOverlay}>
                          <span className={styles.avatarSpinner} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.avatarActions}>
                    <button
                      type="button"
                      className={styles.avatarUploadBtn}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      <Camera size={14} strokeWidth={2} />
                      {uploadingPhoto
                        ? t('settings.profile.uploading')
                        : profileImageUrl
                          ? t('settings.profile.changePhoto')
                          : t('settings.profile.uploadPhoto')}
                    </button>

                    {profileImageUrl && !uploadingPhoto && (
                      <button
                        type="button"
                        className={styles.avatarRemoveBtn}
                        onClick={handleRemovePhoto}
                        disabled={removingPhoto}
                      >
                        {removingPhoto ? t('settings.profile.removing') : t('settings.profile.remove')}
                      </button>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                <div className={styles.avatarInfo}>
                  <div className={styles.avatarName}>
                    {userData?.name || t('settings.profile.studentFallback')}
                  </div>
                  <div className={styles.avatarBelt}>{getBeltLabel(userData?.belt)}</div>
                  <p className={styles.avatarHint}>{t('settings.profile.photoHint')}</p>
                </div>
              </div>

              {profileMsg.text && (
                <div className={`${styles.msg} ${styles[`msg_${profileMsg.type}`]}`}>
                  {profileMsg.text}
                </div>
              )}

              <form onSubmit={handleSaveProfile}>
                <div className={styles.formGrid}>
                  <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                    <label>{t('settings.profile.fullName')}</label>
                    <input type="text" value={name}
                      onChange={(e) => setName(e.target.value)} required />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>{t('settings.profile.birthDate')}</label>
                    <input type="date" value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      max={TODAY_ISO} />
                    {computedAge !== null ? (
                      <small className={styles.helper}>
                        <Trans
                          i18nKey="settings.profile.ageHelper"
                          values={{ age: computedAge }}
                          components={{ strong: <strong /> }}
                        />
                      </small>
                    ) : birthDate ? (
                      <small className={styles.helperError}>
                        {t('settings.profile.birthDateInvalid')}
                      </small>
                    ) : (
                      <small className={styles.helper}>
                        {t('settings.profile.birthDateHint')}
                      </small>
                    )}
                  </div>

                  <div className={styles.inputGroup}>
                    <label>{t('settings.profile.joinedDate')}</label>
                    <input type="date" value={joinedDate}
                      onChange={(e) => setJoinedDate(e.target.value)}
                      max={TODAY_ISO} />
                    <small className={styles.helper}>{t('settings.profile.joinedDateHint')}</small>
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryBtn} disabled={savingProfile}>
                    {savingProfile ? t('settings.profile.saving') : t('settings.profile.saveChanges')}
                  </button>
                </div>
              </form>
            </section>
          )}

          {active === 'account' && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('settings.account.title')}</h2>
                <p className={styles.cardHint}>{t('settings.account.hint')}</p>
              </div>

              <dl className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>{t('settings.account.email')}</dt>
                  <dd className={styles.infoValue}>{currentUser?.email}</dd>
                </div>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>{t('settings.account.role')}</dt>
                  <dd className={styles.infoValue} style={{ textTransform: 'capitalize' }}>
                    {userData?.role === 'admin'
                      ? t('settings.account.roleAdmin')
                      : t('settings.account.roleStudent')}
                    {isMainAdmin && (
                      <span className={styles.adminMainBadge} style={{ marginLeft: 8 }}>
                        <Crown size={11} strokeWidth={2.5} />
                        {t('settings.account.mainAdmin')}
                      </span>
                    )}
                  </dd>
                </div>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>{t('settings.account.belt')}</dt>
                  <dd className={styles.infoValue}>{getBeltLabel(userData?.belt)}</dd>
                </div>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>{t('settings.account.status')}</dt>
                  <dd className={styles.infoValue}>
                    <span className={userData?.isApproved ? styles.statusActive : styles.statusPending}>
                      {userData?.isApproved
                        ? t('settings.account.statusActive')
                        : t('settings.account.statusPending')}
                    </span>
                  </dd>
                </div>
                {memberSince && (
                  <div className={styles.infoItem}>
                    <dt className={styles.infoLabel}>{t('settings.account.memberSince')}</dt>
                    <dd className={styles.infoValue}>
                      {memberSince.toLocaleDateString(undefined, {
                        year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {active === 'notifications' && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('settings.notifications.title')}</h2>
                <p className={styles.cardHint}>{t('settings.notifications.hint')}</p>
              </div>

              <div className={styles.notifToolbar}>
                <div className={styles.notifFilterTabs}>
                  <button
                    className={`${styles.notifFilterTab} ${
                      notifFilter === 'all' ? styles.notifFilterActive : ''
                    }`}
                    onClick={() => setNotifFilter('all')}
                  >
                    {t('settings.notifications.tabInbox', { count: activeNotifs.length })}
                  </button>
                  <button
                    className={`${styles.notifFilterTab} ${
                      notifFilter === 'unread' ? styles.notifFilterActive : ''
                    }`}
                    onClick={() => setNotifFilter('unread')}
                  >
                    {t('settings.notifications.tabUnread', { count: unreadCount })}
                  </button>
                  <button
                    className={`${styles.notifFilterTab} ${
                      notifFilter === 'trash' ? styles.notifFilterActive : ''
                    }`}
                    onClick={() => setNotifFilter('trash')}
                  >
                    <Trash2 size={12} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {t('settings.notifications.tabTrash', { count: trashedNotifs.length })}
                  </button>
                </div>

                <div className={styles.notifToolbarActions}>
                  {notifFilter !== 'trash' && unreadCount > 0 && (
                    <button className={styles.markAllBtn} onClick={markAllAsRead}>
                      <CheckCheck size={14} strokeWidth={2} />
                      {t('settings.notifications.markAllRead')}
                    </button>
                  )}
                  {notifFilter !== 'trash' && activeNotifs.length > 0 && (
                    <button className={styles.deleteAllBtn} onClick={handleDeleteAllNotifs}>
                      <Trash2 size={14} strokeWidth={2} />
                      {t('settings.notifications.deleteAll')}
                    </button>
                  )}
                  {notifFilter === 'trash' && trashedNotifs.length > 0 && (
                    <button className={styles.emptyTrashBtn} onClick={handleEmptyTrash}>
                      <Trash2 size={14} strokeWidth={2} />
                      {t('settings.notifications.emptyTrash')}
                    </button>
                  )}
                </div>
              </div>

              {loadingNotifs ? (
                <p className={styles.emptyText}>{t('settings.notifications.loading')}</p>
              ) : filteredNotifs.length === 0 ? (
                <div className={styles.notifEmpty}>
                  <div className={styles.notifEmptyIcon}>
                    {notifFilter === 'trash' ? (
                      <Trash2 size={32} strokeWidth={1.5} />
                    ) : (
                      <span>🔔</span>
                    )}
                  </div>
                  <p style={{ fontWeight: 'bold', color: 'var(--color-sumi)' }}>
                    {notifFilter === 'unread'
                      ? t('settings.notifications.emptyUnread')
                      : notifFilter === 'trash'
                        ? t('settings.notifications.emptyTrashTitle')
                        : t('settings.notifications.emptyInbox')}
                  </p>
                  <p style={{ fontSize: '0.85rem' }}>
                    {notifFilter === 'unread'
                      ? t('settings.notifications.emptyUnreadSub')
                      : notifFilter === 'trash'
                        ? t('settings.notifications.emptyTrashSub')
                        : t('settings.notifications.emptyInboxSub')}
                  </p>
                </div>
              ) : (
                <div className={styles.notifList}>
                  {filteredNotifs.map(n => {
                    const isTrashed = n.deletedByUser === true;
                    const translated = translateNotification(n, t);
                    return (
                      <div
                        key={n.id}
                        className={`${styles.notifItem} ${
                          !n.read && !isTrashed ? styles.notifUnread : ''
                        } ${isTrashed ? styles.notifTrashed : ''}`}
                      >
                        <button
                          type="button"
                          className={styles.notifMainBtn}
                          onClick={() => handleNotifClick(n)}
                          disabled={isTrashed}
                        >
                          <div className={`${styles.notifIconBox} ${styles[`notifIcon_${NOTIF_TINT[n.type] || 'new'}`]}`}>
                            {NOTIF_ICON[n.type] || '•'}
                          </div>
                          <div className={styles.notifBody}>
                            <div className={styles.notifItemTitle}>{translated.title}</div>
                            <div className={styles.notifItemMsg}>{translated.message}</div>
                            {n.rejectionReason && (
                              <div className={styles.notifReason}>
                                {t('layout.reason', { reason: n.rejectionReason })}
                              </div>
                            )}
                            <div className={styles.notifTime}>
                              {isTrashed && n.deletedAt
                                ? t('settings.notifications.deletedAndCreated', {
                                    deleted: formatTimeAgo(n.deletedAt, t),
                                    created: formatTimeAgo(n.createdAt, t),
                                  })
                                : formatTimeAgo(n.createdAt, t)}
                            </div>
                          </div>
                          {!n.read && !isTrashed && <span className={styles.notifDot} />}
                        </button>

                        <div className={styles.notifItemActions}>
                          {!isTrashed ? (
                            <button
                              type="button"
                              className={styles.notifDeleteBtn}
                              onClick={() => handleDeleteNotif(n.id)}
                              title={t('layout.moveToTrash')}
                              aria-label={t('layout.moveNotifToTrashAria')}
                            >
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={styles.notifRestoreBtn}
                                onClick={() => handleRestoreNotif(n.id)}
                                title={t('layout.restoreNotif')}
                                aria-label={t('layout.restoreNotifAria')}
                              >
                                <RotateCcw size={14} strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                className={styles.notifDeleteBtn}
                                onClick={() => handlePermanentDelete(n.id)}
                                title={t('layout.deletePermanently')}
                                aria-label={t('layout.deleteNotifAria')}
                              >
                                <Trash2 size={14} strokeWidth={2} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {active === 'security' && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('settings.security.title')}</h2>
                <p className={styles.cardHint}>{t('settings.security.hint')}</p>
              </div>

              {pwMsg.text && (
                <div className={`${styles.msg} ${styles[`msg_${pwMsg.type}`]}`}>
                  {pwMsg.text}
                </div>
              )}

              <form onSubmit={handleChangePassword}>
                <div className={styles.formGrid}>
                  <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                    <label>{t('settings.security.currentPassword')}</label>
                    <input type="password" value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)} required />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{t('settings.security.newPassword')}</label>
                    <input type="password" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} required />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{t('settings.security.confirmPassword')}</label>
                    <input type="password" value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryBtn} disabled={savingPw}>
                    {savingPw ? t('settings.security.updating') : t('settings.security.updatePassword')}
                  </button>
                </div>
              </form>
            </section>
          )}

          {active === 'admins' && canSeeAdminAccess && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('settings.admins.title')}</h2>
                <p className={styles.cardHint}>{t('settings.admins.hint')}</p>
              </div>

              <div className={styles.adminTabs}>
                <button
                  type="button"
                  className={`${styles.adminTab} ${
                    adminSubTab === 'promote' ? styles.adminTabActive : ''
                  }`}
                  onClick={() => setAdminSubTab('promote')}
                >
                  <Crown size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {t('settings.admins.tabPromote')}
                </button>
                <button
                  type="button"
                  className={`${styles.adminTab} ${
                    adminSubTab === 'manage' ? styles.adminTabActive : ''
                  }`}
                  onClick={() => setAdminSubTab('manage')}
                >
                  <User size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {t('settings.admins.tabManage', { count: currentAdmins.length })}
                </button>
                {isMainAdmin && (
                  <button
                    type="button"
                    className={`${styles.adminTab} ${
                      adminSubTab === 'permissions' ? styles.adminTabActive : ''
                    }`}
                    onClick={() => setAdminSubTab('permissions')}
                  >
                    <Shield size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('settings.admins.tabPermissions')}
                  </button>
                )}
                {isMainAdmin && (
                  <button
                    type="button"
                    className={`${styles.adminTab} ${
                      adminSubTab === 'pricing' ? styles.adminTabActive : ''
                    }`}
                    onClick={() => setAdminSubTab('pricing')}
                  >
                    <DollarSign size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('settings.admins.tabPricing')}
                  </button>
                )}
              </div>

              {/* ── PROMOTE TAB ── */}
              {adminSubTab === 'promote' && (
                <>
                  {promotionMsg.text && (
                    <div className={`${styles.msg} ${styles[`msg_${promotionMsg.type}`]}`}>
                      {promotionMsg.text}
                    </div>
                  )}

                  {loadingStudents ? (
                    <p className={styles.adminLoadingText}>{t('settings.admins.loadingStudents')}</p>
                  ) : availableStudents.length === 0 ? (
                    <div className={styles.adminEmptyState}>
                      <div className={styles.adminEmptyIcon}>
                        <Crown size={28} strokeWidth={1.5} />
                      </div>
                      <p>{t('settings.admins.noEligible')}</p>
                      <p style={{ fontSize: '0.82rem', marginTop: 6, opacity: 0.8 }}>
                        {t('settings.admins.noEligibleSub')}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.adminSearchWrap} ref={adminSearchRef}>
                        <div className={styles.adminSearchField}>
                          <Search size={16} strokeWidth={2} className={styles.adminSearchIcon} />
                          <input
                            type="text"
                            className={styles.adminSearchInput}
                            value={adminSearchQuery}
                            onChange={(e) => setAdminSearchQuery(e.target.value)}
                            onFocus={() => setAdminSearchFocused(true)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder={t('settings.admins.searchPlaceholder')}
                            autoComplete="off"
                            spellCheck="false"
                          />
                          {adminSearchQuery && (
                            <button
                              type="button"
                              className={styles.adminSearchClear}
                              onClick={() => {
                                setAdminSearchQuery('');
                                setAdminSearchFocused(false);
                              }}
                              aria-label={t('settings.admins.clearSearch')}
                            >
                              <X size={14} strokeWidth={2} />
                            </button>
                          )}
                        </div>

                        {adminSearchFocused && adminSearchQuery.trim() && (
                          <div className={styles.adminSearchDropdown} role="listbox">
                            {filteredCandidates.length === 0 ? (
                              <div className={styles.adminSearchEmpty}>
                                {t('settings.admins.noMatches', { query: adminSearchQuery.trim() })}
                              </div>
                            ) : (
                              filteredCandidates.map((s, idx) => {
                                const belt = s.belt || 'yellow';
                                const beltColor = BELT_COLORS[belt] || '#ccc';
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className={`${styles.adminSearchOption} ${
                                      idx === highlightedIndex
                                        ? styles.adminSearchOptionHighlighted
                                        : ''
                                    }`}
                                    onClick={() => addCandidate(s)}
                                    onMouseEnter={() => setHighlightedIndex(idx)}
                                    role="option"
                                    aria-selected={idx === highlightedIndex}
                                  >
                                    {renderAvatar(s, 38)}
                                    <div className={styles.adminSearchOptionInfo}>
                                      <div className={styles.adminSearchOptionName}>{s.name}</div>
                                      <div className={styles.adminSearchOptionEmail}>{s.email}</div>
                                    </div>
                                    <span
                                      className={styles.adminSearchOptionBelt}
                                      style={{
                                        backgroundColor: beltColor,
                                        color: beltTextColor(belt),
                                      }}
                                    >
                                      {getBeltLabel(belt)}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>

                      {selectedForPromotion.length > 0 ? (
                        <div className={styles.adminSelectedSection}>
                          <div className={styles.adminSelectedHeader}>
                            <span className={styles.adminSelectedTitle}>
                              {t('settings.admins.selectedTitle')}
                            </span>
                            <span className={styles.adminSelectedCount}>
                              {t('settings.admins.selectedCount', {
                                count: selectedForPromotion.length,
                              })}
                            </span>
                          </div>
                          <div className={styles.adminSelectedList}>
                            {selectedForPromotion.map(s => (
                              <div key={s.id} className={styles.adminSelectedItem}>
                                {renderAvatar(s, 34)}
                                <div className={styles.adminSelectedInfo}>
                                  <div className={styles.adminSelectedName}>{s.name}</div>
                                  <div className={styles.adminSelectedEmail}>{s.email}</div>
                                </div>
                                <button
                                  type="button"
                                  className={styles.adminSelectedRemove}
                                  onClick={() => removeCandidate(s.id)}
                                  aria-label={t('settings.admins.removeAria', { name: s.name })}
                                  title={t('settings.admins.remove')}
                                >
                                  <X size={14} strokeWidth={2} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.adminEmptyState} style={{ marginTop: 20 }}>
                          <div className={styles.adminEmptyIcon}>
                            <Crown size={28} strokeWidth={1.5} />
                          </div>
                          <p>{t('settings.admins.searchHint')}</p>
                        </div>
                      )}

                      <div className={styles.adminPromoteActions}>
                        <span className={styles.adminPromoteHint}>
                          {t('settings.admins.promoteHint')}
                        </span>
                        <button
                          type="button"
                          className={styles.adminPromoteBtn}
                          onClick={() => setPromoteConfirmOpen(true)}
                          disabled={selectedForPromotion.length === 0 || promoting}
                        >
                          <Crown size={16} strokeWidth={2} />
                          {promoting
                            ? t('settings.admins.promoting')
                            : selectedForPromotion.length === 0
                              ? t('settings.admins.makeAdmin')
                              : t('settings.admins.makeNAdmins', {
                                  count: selectedForPromotion.length,
                                })}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── MANAGE ADMINS TAB ── */}
              {adminSubTab === 'manage' && (
                <>
                  {demoteMsg.text && (
                    <div className={`${styles.msg} ${styles[`msg_${demoteMsg.type}`]}`}>
                      {demoteMsg.text}
                    </div>
                  )}

                  <div
                    style={{
                      padding: '12px 16px',
                      background: '#fff8e1',
                      borderLeft: '4px solid #f39c12',
                      borderRadius: '4px',
                      marginBottom: '18px',
                      color: '#856404',
                      fontSize: '0.88rem',
                      lineHeight: 1.5,
                    }}
                  >
                    <Trans
                      i18nKey="settings.admins.protectedNotice"
                      components={{
                        strong: <strong />,
                        code: <code style={{
                          margin: '0 4px',
                          padding: '1px 6px',
                          background: 'rgba(0,0,0,0.06)',
                          borderRadius: 3,
                          fontSize: '0.85em',
                        }} />,
                      }}
                    />
                  </div>

                  {loadingAdmins ? (
                    <p className={styles.adminLoadingText}>{t('settings.admins.loadingAdmins')}</p>
                  ) : currentAdmins.length === 0 ? (
                    <div className={styles.adminEmptyState}>
                      <div className={styles.adminEmptyIcon}>
                        <User size={28} strokeWidth={1.5} />
                      </div>
                      <p>{t('settings.admins.noAdmins')}</p>
                    </div>
                  ) : (
                    <div className={styles.adminManageList}>
                      {currentAdmins.map(admin => {
                        const isSelf = admin.id === currentUser.uid;
                        const isMain = isMainAdminAccount(admin);
                        const isProtected = isProtectedAdmin(admin, currentUser.uid);
                        const canDemote =
                          isMainAdmin || myPermissions.admins === true;
                        const belt = admin.belt || 'yellow';
                        const beltColor = BELT_COLORS[belt] || '#ccc';

                        return (
                          <div key={admin.id} className={styles.adminManageItem}>
                            {renderAvatar(admin, 42)}
                            <div className={styles.adminManageInfo}>
                              <div className={styles.adminManageName}>
                                {admin.name || t('settings.admins.unnamed')}
                                {isMain && (
                                  <span className={styles.adminMainBadge} title={t('settings.admins.mainAdminTitle')}>
                                    <Crown size={11} strokeWidth={2.5} />
                                    {t('settings.admins.mainAdminBadge')}
                                  </span>
                                )}
                                {isSelf && !isMain && (
                                  <span className={styles.adminSelfBadge}>
                                    {t('settings.admins.youBadge')}
                                  </span>
                                )}
                              </div>
                              <div className={styles.adminManageEmail}>{admin.email}</div>
                            </div>
                            <span
                              className={styles.adminManageBelt}
                              style={{ backgroundColor: beltColor, color: beltTextColor(belt) }}
                            >
                              {getBeltLabel(belt)}
                            </span>
                            <div className={styles.adminManageActions}>
                              {isProtected ? (
                                <span className={styles.adminProtectedNote}>
                                  <Lock size={12} strokeWidth={2} />
                                  {t('settings.admins.protectedBadge')}
                                </span>
                              ) : !canDemote ? (
                                <span className={styles.adminProtectedNote}>
                                  <Lock size={12} strokeWidth={2} />
                                  {t('settings.admins.noPermissionBadge')}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.adminDemoteBtn}
                                  onClick={() => {
                                    setDemoteMsg({ type: '', text: '' });
                                    setDemoteTarget(admin);
                                  }}
                                  disabled={demoting}
                                  title={t('settings.admins.demoteTitle')}
                                >
                                  <UserMinus size={14} strokeWidth={2} />
                                  {t('settings.admins.makeStudent')}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── PERMISSIONS TAB ── */}
              {adminSubTab === 'permissions' && isMainAdmin && (
                <>
                  {permissionsMsg.text && (
                    <div className={`${styles.msg} ${styles[`msg_${permissionsMsg.type}`]}`}>
                      {permissionsMsg.text}
                    </div>
                  )}

                  <div className={styles.permInfoBanner}>
                    <Shield size={16} strokeWidth={2} className={styles.permInfoIcon} />
                    <div>
                      <Trans
                        i18nKey="settings.admins.permissionsNotice"
                        components={{ strong: <strong /> }}
                      />
                    </div>
                  </div>

                  {loadingAdmins ? (
                    <p className={styles.adminLoadingText}>{t('settings.admins.loadingAdmins')}</p>
                  ) : otherAdmins.length === 0 ? (
                    <div className={styles.adminEmptyState}>
                      <div className={styles.adminEmptyIcon}>
                        <Shield size={28} strokeWidth={1.5} />
                      </div>
                      <p>{t('settings.admins.noOtherAdmins')}</p>
                      <p style={{ fontSize: '0.82rem', marginTop: 6, opacity: 0.8 }}>
                        {t('settings.admins.noOtherAdminsSub')}
                      </p>
                    </div>
                  ) : (
                    <div className={styles.permList}>
                      {otherAdmins.map(admin => {
                        const perms = getEffectivePermissions(admin);
                        return (
                          <div key={admin.id} className={styles.permCard}>
                            <div className={styles.permCardHeader}>
                              {renderAvatar(admin, 44)}
                              <div className={styles.permCardInfo}>
                                <div className={styles.permCardName}>
                                  {admin.name || t('settings.admins.unnamed')}
                                </div>
                                <div className={styles.permCardEmail}>{admin.email}</div>
                              </div>
                            </div>

                            <div className={styles.permToggles}>
                              {getAdminPermissions().map(p => (
                                <div key={p.key} className={styles.permRow}>
                                  <div className={styles.permRowInfo}>
                                    <div className={styles.permRowLabel}>{p.label}</div>
                                    <div className={styles.permRowDesc}>{p.description}</div>
                                  </div>
                                  <button
                                    type="button"
                                    className={`${styles.permToggle} ${
                                      perms[p.key] ? styles.permToggleOn : ''
                                    }`}
                                    onClick={() => handleTogglePermission(admin, p.key)}
                                    role="switch"
                                    aria-checked={perms[p.key]}
                                    aria-label={t(
                                      perms[p.key]
                                        ? 'settings.admins.permToggleDisableAria'
                                        : 'settings.admins.permToggleEnableAria',
                                      { label: p.label }
                                    )}
                                    title={t(
                                      perms[p.key]
                                        ? 'settings.admins.permToggleDisable'
                                        : 'settings.admins.permToggleEnable'
                                    )}
                                  >
                                    <span className={styles.permToggleKnob} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── PRICING TAB ── */}
              {adminSubTab === 'pricing' && isMainAdmin && (
                <>
                  {pricingMsg.text && (
                    <div className={`${styles.msg} ${styles[`msg_${pricingMsg.type}`]}`}>
                      {pricingMsg.text}
                    </div>
                  )}
                  <div className={styles.permInfoBanner} style={{ background: '#e8f6ec', borderColor: '#2ecc71' }}>
                    <DollarSign size={16} strokeWidth={2} className={styles.permInfoIcon} style={{ color: '#1e7a3f' }} />
                    <div>
                      <Trans i18nKey="settings.admins.pricingNotice" components={{ strong: <strong /> }} />
                    </div>
                  </div>

                  <div className={styles.permList}>
                    {['yellow', 'orange', 'green', 'blue', 'brown', 'black'].map(b => (
                      <div key={b} className={styles.permRow} style={{ borderBottom: '1px solid #eee' }}>
                        <div className={styles.permRowInfo}>
                          <div className={styles.permRowLabel} style={{ textTransform: 'capitalize' }}>{b} Belt</div>
                          <div className={styles.permRowDesc}>{t('settings.admins.monthlyPrice')}</div>
                        </div>
                        <input 
                          type="number" 
                          value={pricing[b] || 0}
                          onChange={e => setPricing(prev => ({ ...prev, [b]: Number(e.target.value) }))}
                          style={{ width: 100, padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', textAlign: 'center', fontWeight: 'bold' }}
                          min="0"
                        />
                      </div>
                    ))}
                  </div>

                  <div className={styles.adminPromoteActions}>
                    <button
                      type="button"
                      className={styles.adminPromoteBtn}
                      onClick={handleSavePricing}
                      disabled={savingPricing}
                    >
                      {savingPricing ? t('settings.admins.savingPrices') : t('settings.admins.savePrices')}
                    </button>
                  </div>
                </>
              )}

              {/* Promote confirmation */}
              <Modal
                isOpen={promoteConfirmOpen}
                title={t('settings.admins.promoteConfirmTitle')}
                message={t('settings.admins.promoteConfirmMessage', {
                  count: selectedForPromotion.length,
                })}
                type="confirm"
                onConfirm={handlePromoteSelected}
                onCancel={() => setPromoteConfirmOpen(false)}
              />

              {/* Demote confirmation */}
              <Modal
                isOpen={!!demoteTarget}
                title={t('settings.admins.demoteConfirmTitle')}
                message={
                  demoteTarget
                    ? t('settings.admins.demoteConfirmMessage', { name: demoteTarget.name })
                    : ''
                }
                type="confirm"
                onConfirm={handleDemote}
                onCancel={() => { if (!demoting) setDemoteTarget(null); }}
              />
            </section>
          )}

          {active === 'danger' && !isAdmin && (
            <section className={`${styles.card} ${styles.dangerCard}`}>
              <div className={styles.cardHeader}>
                <h2 className={`${styles.cardTitle} ${styles.dangerTitle}`}>
                  {t('settings.danger.title')}
                </h2>
                <p className={styles.cardHint}>{t('settings.danger.hint')}</p>
              </div>

              <div className={styles.dangerBlock}>
                <div className={styles.dangerBlockHead}>
                  <h3 className={styles.dangerBlockTitle}>{t('settings.danger.deactivateTitle')}</h3>
                  <p className={styles.dangerBlockText}>{t('settings.danger.deactivateText')}</p>
                </div>

                <div className={styles.dangerConfirmRow}>
                  <label className={styles.dangerConfirmLabel}>
                    <Trans
                      i18nKey="settings.danger.confirmLabel"
                      components={{ strong: <strong /> }}
                    />
                  </label>
                  <input
                    type="text"
                    className={styles.dangerInput}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={t('settings.danger.confirmPlaceholder')}
                  />
                </div>

                <button
                  type="button"
                  className={styles.dangerBtn}
                  disabled={confirmText !== 'DELETE' || deactivating}
                  onClick={handleDeactivate}
                >
                  {deactivating ? t('settings.danger.deactivating') : t('settings.danger.deactivateBtn')}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        loading={deleting}
        onConfirm={handleModalConfirm}
        onCancel={() => {
          if (!deleting) setDeleteModal(prev => ({ ...prev, isOpen: false }));
        }}
      />
    </div>
  );
}