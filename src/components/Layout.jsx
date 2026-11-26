// src/components/Layout.jsx
import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';
import {
  collection, query, where, getDocs, doc, updateDoc, writeBatch, deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  LayoutDashboard, BookOpen, TrendingUp, Trophy, BrainCircuit,
  ShieldCheck, UserCheck, BadgeCheck, Users, FolderTree, Bell,
  Trash2, RotateCcw, Settings as SettingsIcon, LogOut,
  ChevronLeft, Menu, X, Medal, Sparkles, MessageSquare,
} from 'lucide-react';
import styles from './Layout.module.css';
import dojoIcon from '../assets/dojo-icon.png';
import { BELT_COLORS } from '../utils/experience';
import { countClaimableBadges } from '../utils/badges';
import { notifyMainAdminsOfAuthEvent } from '../utils/adminAuthNotifications';
import { onProgressChanged } from '../utils/progressEvents';
import { getEffectivePermissions } from '../utils/adminPermissions';
import LanguageSwitcher from './LanguageSwitcher';

const BELT_ORDER = ['yellow', 'orange', 'green', 'blue', 'brown', 'black', 'dan1'];
const NO_PREV_BELT_TRACK = '#fff';

async function fetchUserProgressPercent(uid, userBelt) {
  if (userBelt === 'dan1') return 100;
  const [itemsSnap, progSnap] = await Promise.all([
    getDocs(query(collection(db, 'items'), where('minimumGrade', '==', userBelt))),
    getDocs(query(collection(db, 'progress'), where('userId', '==', uid))),
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
  if (total === 0) return 0;
  let completed = 0;
  itemsSnap.docs.forEach(d => {
    if (progressMap[d.id] === 'completed') completed++;
  });
  return Math.round((completed / total) * 100);
}

async function fetchRewardsData(uid, userBelt) {
  const maxIdx = BELT_ORDER.indexOf(userBelt);
  const belts = maxIdx >= 0 ? BELT_ORDER.slice(0, maxIdx + 1) : ['yellow'];
  const [itemBatches, progSnap, quizSnap, reqSnap] = await Promise.all([
    Promise.all(belts.map(async (belt) => {
      const snap = await getDocs(query(collection(db, 'items'), where('minimumGrade', '==', belt)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    })),
    getDocs(query(collection(db, 'progress'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'beltRequests'), where('userId', '==', uid))),
  ]);
  return {
    items: itemBatches.flat(),
    progress: progSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    quizAttempts: quizSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    beltRequests: reqSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };
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

function translateNotification(n, t) {
  const params = { ...(n.messageParams || {}) };
  if (params.belt) params.belt = t(`belts.short.${params.belt}`, { defaultValue: params.belt });
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

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

const NOTIF_ICON = {
  belt_approved: '✓', belt_rejected: '✗', new_technique: '🥋',
  admin_promoted: '👑', admin_demoted: '📤', admin_login: '🔓',
  admin_logout: '🔒', chat_reply: '💬', chat_mention: '@',
};

const NOTIF_TINT = {
  belt_approved: 'approved', belt_rejected: 'rejected', new_technique: 'new',
  admin_promoted: 'new', admin_demoted: 'rejected', admin_login: 'approved',
  admin_logout: 'new', chat_reply: 'new', chat_mention: 'new',
};

const RING_RADIUS = 27;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SM_RING_RADIUS = 22;
const SM_RING_CIRCUMFERENCE = 2 * Math.PI * SM_RING_RADIUS;

export default function Layout() {
  const { currentUser, userData } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('menu');
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [notifSubTab, setNotifSubTab] = useState('inbox');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [claimableRewards, setClaimableRewards] = useState(0);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [ring, setRing] = useState({
    percent: 0,
    trackColor: NO_PREV_BELT_TRACK,
    fillColor: '#f1c40f',
  });
  const menuRef = useRef(null);

  const isFullPage =
    location.pathname === '/assistant' ||
    location.pathname === '/chat';

  const activeNotifs = notifications.filter(n => !n.deletedByUser);
  const trashedNotifs = notifications.filter(n => n.deletedByUser === true);
  const unreadCount = activeNotifs.filter(n => !n.read).length;

  const adminPerms = userData?.role === 'admin' ? getEffectivePermissions(userData) : null;
  const showAdminSection = !!adminPerms && (adminPerms.approvals || adminPerms.validations || adminPerms.students || adminPerms.syllabus);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        const percent = await fetchUserProgressPercent(currentUser.uid, userBelt);
        setRing(prev => ({ ...prev, percent }));
      } catch (err) { console.error(err); }
    };
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribeProgress = onProgressChanged(refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribeProgress();
    };
  }, [currentUser, userData]);

  useEffect(() => {
    if (!currentUser || !userData) { setClaimableRewards(0); return; }
    if (userData.role === 'admin') { setClaimableRewards(0); return; }
    let cancelled = false;
    const refresh = async () => {
      try {
        const userBelt = userData.belt || 'yellow';
        const data = await fetchRewardsData(currentUser.uid, userBelt);
        if (cancelled) return;
        const count = countClaimableBadges(userData, data);
        setClaimableRewards(count);
      } catch (err) { console.error(err); }
    };
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribe = onProgressChanged(refresh);
    return () => { cancelled = true; window.removeEventListener('focus', refresh); unsubscribe(); };
  }, [currentUser, userData]);

  useEffect(() => {
    if (!currentUser) { setHasUnreadChat(false); return; }
    const unsub = onSnapshot(doc(db, 'chatRooms', 'global'), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const lastMsgMs = toMs(data.lastMessageAt);
      const lastSeenMs = toMs(userData?.chatLastSeenAt);
      if (location.pathname === '/chat') { setHasUnreadChat(false); return; }
      setHasUnreadChat(lastMsgMs > 0 && lastMsgMs > lastSeenMs);
    }, (err) => { console.warn(err); });
    return () => unsub();
  }, [currentUser, userData?.chatLastSeenAt, location.pathname]);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    setLoadingNotifs(true);
    try {
      const q = query(collection(db, 'notifications'), where('userId', '==', currentUser.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const at = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const bt = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return bt - at;
      });
      setNotifications(list);
    } catch (err) { console.error(err); } finally { setLoadingNotifs(false); }
  };

  useEffect(() => { if (currentUser) fetchNotifications(); }, [currentUser]);
  useEffect(() => { if (menuOpen && menuView === 'notifications') fetchNotifications(); }, [menuOpen, menuView]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false); setMenuView('menu'); setNotifSubTab('inbox');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false); setMenuView('menu'); setNotifSubTab('inbox'); setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileMenuOpen]);

  const markAsRead = async (notifId) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
      setNotifications(prev => prev.map(n => (n.id === notifId ? { ...n, read: true } : n)));
    } catch (err) { console.error(err); }
  };

  const markAllAsRead = async () => {
    const unread = activeNotifs.filter(n => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
      await batch.commit();
      setNotifications(prev => prev.map(n => n.deletedByUser ? n : { ...n, read: true }));
    } catch (err) { console.error(err); }
  };

  const handleDeleteNotif = async (notifId) => {
    try {
      const now = new Date();
      await updateDoc(doc(db, 'notifications', notifId), { deletedByUser: true, deletedAt: now });
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, deletedByUser: true, deletedAt: now } : n));
    } catch (err) { console.error(err); }
  };

  const handleDeleteAll = async () => {
    if (activeNotifs.length === 0) return;
    try {
      const batch = writeBatch(db);
      const now = new Date();
      activeNotifs.forEach(n => batch.update(doc(db, 'notifications', n.id), { deletedByUser: true, deletedAt: now }));
      await batch.commit();
      setNotifications(prev => prev.map(n => n.deletedByUser ? n : { ...n, deletedByUser: true, deletedAt: now }));
    } catch (err) { console.error(err); }
  };

  const handleRestoreNotif = async (notifId) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { deletedByUser: false, deletedAt: null });
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, deletedByUser: false, deletedAt: null } : n));
    } catch (err) { console.error(err); }
  };

  const handlePermanentDelete = async (notifId) => {
    try {
      await deleteDoc(doc(db, 'notifications', notifId));
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) { console.error(err); }
  };

  const handleEmptyTrash = async () => {
    if (trashedNotifs.length === 0) return;
    try {
      const batch = writeBatch(db);
      trashedNotifs.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
      setNotifications(prev => prev.filter(n => !n.deletedByUser));
    } catch (err) { console.error(err); }
  };

  // ★ Deep-link: if the notification has messageId, pass it to /chat via state
  const handleNotifClick = (n) => {
    if (n.deletedByUser) return;
    if (!n.read) markAsRead(n.id);
    if (n.type === 'belt_approved' || n.type === 'belt_rejected') navigate('/progress');
    else if (n.type === 'new_technique' && n.categoryId) navigate(`/syllabus/${n.categoryId}`);
    else if (n.type === 'chat_reply' || n.type === 'chat_mention' || n.linkTo === '/chat') {
      navigate('/chat', { state: n.messageId ? { scrollToMessage: n.messageId } : undefined });
    }
    setMenuOpen(false); setMenuView('menu'); setNotifSubTab('inbox');
  };

  const toggleMenu = () => { setMenuOpen(o => !o); setMenuView('menu'); setNotifSubTab('inbox'); };

  async function handleLogout() {
    try {
      if (currentUser && userData?.role === 'admin' && userData?.isMainAdmin !== true) {
        await notifyMainAdminsOfAuthEvent({
          actor: { uid: currentUser.uid, name: userData.name, email: userData.email || currentUser.email, role: userData.role, isMainAdmin: userData.isMainAdmin === true },
          action: 'logout',
        });
      }
      await signOut(auth); navigate('/login');
    } catch (error) { console.error(error); }
  }

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const initial = userData?.name ? userData.name.charAt(0).toUpperCase() : '?';
  const profileImg = userData?.profileImageUrl;
  const ringOffset = RING_CIRCUMFERENCE * (1 - ring.percent / 100);
  const currentNotifList = notifSubTab === 'inbox' ? activeNotifs : trashedNotifs;

  return (
    <div className={styles.layoutWrapper}>
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarMobileOpen : ''}`}>
        <Link to="/" className={styles.sidebarLogo} onClick={closeMobileMenu}>
          <img src={dojoIcon} alt={t('layout.dojoIconAlt')} className={styles.logoImage} />
          <span className={styles.logoText}>合気術<br />Aiki Jutsu</span>
        </Link>

        <nav className={styles.navLinks}>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}>
            <LayoutDashboard size={18} strokeWidth={1.8} className={styles.navIcon} />
            <span className={styles.navLabel}>{t('layout.navDashboard')}</span>
          </NavLink>

          {userData?.role !== 'admin' && (
            <NavLink to="/assistant" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}>
              <Sparkles size={18} strokeWidth={1.8} className={styles.navIcon} />
              <span className={styles.navLabel}>{t('aiAgent.navLabel')}</span>
            </NavLink>
          )}

          <NavLink to="/syllabus" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}>
            <BookOpen size={18} strokeWidth={1.8} className={styles.navIcon} />
            <span className={styles.navLabel}>{t('layout.navSyllabus')}</span>
          </NavLink>

          <NavLink to="/competition" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}>
            <Medal size={18} strokeWidth={1.8} className={styles.navIcon} />
            <span className={styles.navLabel}>{t('layout.navCompetition')}</span>
          </NavLink>

          {userData?.role !== 'admin' && (
            <>
              <NavLink to="/progress" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}>
                <TrendingUp size={18} strokeWidth={1.8} className={styles.navIcon} />
                <span className={styles.navLabel}>{t('layout.navProgress')}</span>
              </NavLink>
              <NavLink to="/rewards" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink} style={{ justifyContent: 'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <Trophy size={18} strokeWidth={1.8} className={styles.navIcon} />
                  <span className={styles.navLabel}>{t('layout.navRewards')}</span>
                </div>
                {claimableRewards > 0 && <span className={styles.navRewardsBadge} aria-hidden="true" />}
              </NavLink>
              <NavLink to="/quizzes" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}>
                <BrainCircuit size={18} strokeWidth={1.8} className={styles.navIcon} />
                <span className={styles.navLabel}>{t('layout.navQuizzes')}</span>
              </NavLink>
            </>
          )}

          <NavLink to="/chat" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink} style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <MessageSquare size={18} strokeWidth={1.8} className={styles.navIcon} />
              <span className={styles.navLabel}>{t('layout.navChat')}</span>
            </div>
            {hasUnreadChat && <span className={styles.navChatBadge} aria-hidden="true" />}
          </NavLink>

          {showAdminSection && (
            <div className={styles.adminSection}>
              <h3 className={styles.adminHeader}><ShieldCheck size={14} strokeWidth={2} className={styles.adminHeaderIcon} />{t('layout.adminConsole')}</h3>
              {adminPerms.approvals && <NavLink to="/admin/approvals" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}><UserCheck size={18} strokeWidth={1.8} className={styles.navIcon} /><span className={styles.navLabel}>{t('layout.navApprovals')}</span></NavLink>}
              {adminPerms.validations && <NavLink to="/admin/validations" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}><BadgeCheck size={18} strokeWidth={1.8} className={styles.navIcon} /><span className={styles.navLabel}>{t('layout.navValidations')}</span></NavLink>}
              {adminPerms.students && <NavLink to="/admin/students" className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}><Users size={18} strokeWidth={1.8} className={styles.navIcon} /><span className={styles.navLabel}>{t('layout.navStudents')}</span></NavLink>}
              {adminPerms.syllabus && <NavLink to="/admin/manage" className={() => (location.pathname === '/admin/manage' || location.pathname.startsWith('/admin/items')) ? `${styles.navLink} ${styles.active}` : styles.navLink}><FolderTree size={18} strokeWidth={1.8} className={styles.navIcon} /><span className={styles.navLabel}>{t('layout.navManageSyllabus')}</span></NavLink>}
            </div>
          )}
        </nav>

        {isFullPage && (
          <div className={styles.sidebarBottomActions}>
            <div className={styles.sidebarDivider} />
            <NavLink 
              to="/settings" 
              className={({ isActive }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink}
              onClick={closeMobileMenu}
            >
              <SettingsIcon size={18} strokeWidth={1.8} className={styles.navIcon} />
              <span className={styles.navLabel}>{t('layout.settings')}</span>
            </NavLink>
            
            <button 
              type="button" 
              className={`${styles.navLink} ${styles.sidebarLogoutBtn}`} 
              onClick={handleLogout}
            >
              <LogOut size={18} strokeWidth={1.8} className={styles.navIcon} />
              <span className={styles.navLabel}>{t('layout.logout')}</span>
            </button>
          </div>
        )}

      </aside>

      {mobileMenuOpen && <div className={styles.mobileBackdrop} onClick={closeMobileMenu} aria-hidden="true" />}

      <div className={styles.mainContent}>
        {!isOnline && (
          <div className={styles.offlineBanner} role="status" aria-live="polite">
            📡 {t('offline.banner', { defaultValue: "You're offline — some features may be unavailable." })}
          </div>
        )}

        {!isFullPage && (
          <header className={styles.topHeader}>
            <button type="button" className={styles.burgerBtn} onClick={() => setMobileMenuOpen(o => !o)} aria-label={mobileMenuOpen ? t('layout.closeMenu') : t('layout.openMenu')} aria-expanded={mobileMenuOpen}>
              {mobileMenuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            </button>

            <div className={styles.userInfo} ref={menuRef}>
              <span className={styles.userName}>{userData?.name || currentUser?.email}</span>
              <button type="button" className={styles.profileBtn} onClick={toggleMenu} title={t('layout.accountMenu', { percent: ring.percent })} aria-haspopup="menu" aria-expanded={menuOpen}>
                <svg className={styles.profileRing} viewBox="0 0 60 60" aria-hidden="true">
                  <circle className={styles.profileRingTrack} cx="30" cy="30" r={RING_RADIUS} style={{ stroke: ring.trackColor }} />
                  <circle className={styles.profileRingFill} cx="30" cy="30" r={RING_RADIUS} style={{ stroke: ring.fillColor, strokeDasharray: `${RING_CIRCUMFERENCE}`, strokeDashoffset: `${ringOffset}` }} />
                </svg>
                <span className={styles.profileInner}>
                  {profileImg ? <img src={profileImg} alt={userData?.name || t('layout.profileAlt')} className={styles.profileImg} /> : initial}
                </span>
                {unreadCount > 0 && <span className={styles.profileBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>

              {menuOpen && menuView === 'menu' && (
                <div className={styles.dropdown} role="menu">
                  <div className={styles.dropdownHeader}>
                    <div className={styles.dropdownAvatarWrap}>
                      <svg className={styles.profileRing} viewBox="0 0 50 50" aria-hidden="true">
                        <circle className={styles.profileRingTrack} cx="25" cy="25" r={SM_RING_RADIUS} style={{ stroke: ring.trackColor }} />
                        <circle className={styles.profileRingFill} cx="25" cy="25" r={SM_RING_RADIUS} style={{ stroke: ring.fillColor, strokeDasharray: `${SM_RING_CIRCUMFERENCE}`, strokeDashoffset: `${SM_RING_CIRCUMFERENCE * (1 - ring.percent / 100)}` }} />
                      </svg>
                      <div className={styles.dropdownAvatarInner}>
                        {profileImg ? <img src={profileImg} alt="" className={styles.dropdownAvatarImg} /> : initial}
                      </div>
                    </div>
                    <div className={styles.dropdownInfo}>
                      <div className={styles.dropdownName}>{userData?.name || t('layout.studentFallback')}</div>
                      <div className={styles.dropdownEmail}>{currentUser?.email}</div>
                    </div>
                  </div>

                  <button className={styles.dropdownItem} onClick={() => setMenuView('notifications')} role="menuitem">
                    <Bell size={16} strokeWidth={1.8} className={styles.dropdownIcon} />
                    <span>{t('layout.notifications')}</span>
                    {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
                  </button>
                  <Link to="/settings" className={styles.dropdownItem} role="menuitem">
                    <SettingsIcon size={16} strokeWidth={1.8} className={styles.dropdownIcon} />
                    <span>{t('layout.settings')}</span>
                  </Link>
                  <button type="button" className={`${styles.dropdownItem} ${styles.dropdownDanger}`} onClick={handleLogout} role="menuitem">
                    <LogOut size={16} strokeWidth={1.8} className={styles.dropdownIcon} />
                    <span>{t('layout.logout')}</span>
                  </button>
                </div>
              )}

              {menuOpen && menuView === 'notifications' && (
                <div className={`${styles.dropdown} ${styles.dropdownWide}`}>
                  <div className={styles.notifHeader}>
                    <button className={styles.notifBackBtn} onClick={() => { setMenuView('menu'); setNotifSubTab('inbox'); }} aria-label={t('common.back')}>
                      <ChevronLeft size={18} strokeWidth={2} />
                    </button>
                    <h3 className={styles.notifTitle}>{t('layout.notificationsTitle')}</h3>
                  </div>
                  <div className={styles.notifTabs}>
                    <button type="button" className={`${styles.notifTab} ${notifSubTab === 'inbox' ? styles.notifTabActive : ''}`} onClick={() => setNotifSubTab('inbox')}>
                      {t('layout.inboxTab', { count: activeNotifs.length })}
                      {unreadCount > 0 && <span className={styles.notifTabBadge}>{unreadCount}</span>}
                    </button>
                    <button type="button" className={`${styles.notifTab} ${notifSubTab === 'deleted' ? styles.notifTabActive : ''}`} onClick={() => setNotifSubTab('deleted')}>
                      <Trash2 size={11} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      {t('layout.deletedTab', { count: trashedNotifs.length })}
                    </button>
                  </div>
                  {notifSubTab === 'inbox' && activeNotifs.length > 0 && (
                    <div className={styles.notifActionsBar}>
                      {unreadCount > 0 && <button type="button" className={styles.notifMarkAllBtn} onClick={markAllAsRead}>{t('layout.markAllRead')}</button>}
                      <button type="button" className={styles.notifDeleteAllBtn} onClick={handleDeleteAll} title={t('layout.deleteAllTitle')}>
                        <Trash2 size={11} strokeWidth={2} /> {t('layout.deleteAll')}
                      </button>
                    </div>
                  )}
                  {notifSubTab === 'deleted' && trashedNotifs.length > 0 && (
                    <div className={styles.notifActionsBar}>
                      <button type="button" className={styles.notifDeleteAllBtn} onClick={handleEmptyTrash} title={t('layout.emptyTrashTitle')}>
                        <Trash2 size={11} strokeWidth={2} /> {t('layout.emptyTrash')}
                      </button>
                    </div>
                  )}
                  <div className={styles.notifList}>
                    {loadingNotifs && notifications.length === 0 ? (
                      <div className={styles.notifEmpty}>{t('common.loading')}</div>
                    ) : currentNotifList.length === 0 ? (
                      <div className={styles.notifEmpty}>
                        <div className={styles.notifEmptyIconWrap}>{notifSubTab === 'deleted' ? <Trash2 size={26} strokeWidth={1.5} /> : <Bell size={26} strokeWidth={1.5} />}</div>
                        <div>{notifSubTab === 'deleted' ? t('layout.trashEmpty') : t('layout.noNotifs')}</div>
                        <div className={styles.notifEmptySub}>{notifSubTab === 'deleted' ? t('layout.trashEmptySub') : t('layout.noNotifsSub')}</div>
                      </div>
                    ) : notifSubTab === 'inbox' ? (
                      activeNotifs.map(n => {
                        const translated = translateNotification(n, t);
                        return (
                          <div key={n.id} className={`${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`}>
                            <button type="button" className={styles.notifMainBtn} onClick={() => handleNotifClick(n)}>
                              <div className={`${styles.notifIconBox} ${styles[`notifIcon_${NOTIF_TINT[n.type] || 'new'}`]}`}>{NOTIF_ICON[n.type] || '•'}</div>
                              <div className={styles.notifBody}>
                                <div className={styles.notifItemTitle}>{translated.title}</div>
                                <div className={styles.notifItemMsg}>{translated.message}</div>
                                {n.rejectionReason && <div className={styles.notifReason}>{t('layout.reason', { reason: n.rejectionReason })}</div>}
                                <div className={styles.notifTime}>{formatTimeAgo(n.createdAt, t)}</div>
                              </div>
                              {!n.read && <span className={styles.notifDot} />}
                            </button>
                            <button type="button" className={styles.notifDeleteBtn} onClick={() => handleDeleteNotif(n.id)} title={t('layout.moveToTrash')} aria-label={t('layout.moveNotifToTrashAria')}>
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      trashedNotifs.map(n => {
                        const translated = translateNotification(n, t);
                        return (
                          <div key={n.id} className={`${styles.notifItem} ${styles.notifTrashed}`}>
                            <div className={styles.notifMainBtn} style={{ cursor: 'default' }}>
                              <div className={`${styles.notifIconBox} ${styles[`notifIcon_${NOTIF_TINT[n.type] || 'new'}`]}`}>{NOTIF_ICON[n.type] || '•'}</div>
                              <div className={styles.notifBody}>
                                <div className={styles.notifItemTitle}>{translated.title}</div>
                                <div className={styles.notifItemMsg}>{translated.message}</div>
                                <div className={styles.notifTime}>{t('layout.deletedAt', { time: formatTimeAgo(n.deletedAt, t) })}</div>
                              </div>
                            </div>
                            <div className={styles.notifTrashActions}>
                              <button type="button" className={styles.notifRestoreBtn} onClick={() => handleRestoreNotif(n.id)} title={t('layout.restoreNotif')} aria-label={t('layout.restoreNotifAria')}>
                                <RotateCcw size={14} strokeWidth={2} />
                              </button>
                              <button type="button" className={styles.notifDeleteBtn} onClick={() => handlePermanentDelete(n.id)} title={t('layout.deletePermanently')} aria-label={t('layout.deleteNotifAria')}>
                                <Trash2 size={14} strokeWidth={2} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <Link to="/settings" className={styles.notifFooter} onClick={() => { setMenuOpen(false); setMenuView('menu'); setNotifSubTab('inbox'); }}>
                    {t('layout.manageNotifications')}
                  </Link>
                </div>
              )}
            </div>
          </header>
        )}

        <main className={isFullPage ? styles.fullPageContent : styles.pageContent}>
          <Outlet context={{ setMobileMenuOpen }} />
        </main>
      </div>
      <LanguageSwitcher />
    </div>
  );
}