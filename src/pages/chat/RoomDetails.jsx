// src/pages/chat/RoomDetails.jsx
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { db } from '../../firebase/config';
import {
  doc, deleteDoc, updateDoc, collection, getDocs, query, where,
} from 'firebase/firestore';
import {
  Users, Shield, Ban, Flag, Settings as SettingsIcon, Activity, X,
  Crown, UserMinus, UserCheck, Unlock,
} from 'lucide-react';
import styles from '../Chat.module.css';

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

export default function RoomDetails({
  isOpen,
  onClose,
  room,
  members,
  blocked,
  reports,
  currentUid,
  currentUser,
  roomAdmin,
  mainAdmin,
  onBlockUser,
  onJumpToMessage,
}) {
  const { t } = useTranslation('chat');
  const [tab, setTab] = useState('members');
  const [memberSearch, setMemberSearch] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [busyUid, setBusyUid] = useState(null);
  const [togglingClose, setTogglingClose] = useState(false);

  // ── Derived lists ──────────────────────────────────────
  const mainAdminMember = useMemo(
    () => members.find((m) => m.isMainAdmin === true),
    [members]
  );
  const roomAdmins = useMemo(
    () =>
      members
        .filter((m) => m.roomAdmin === true && m.isMainAdmin !== true)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [members]
  );
  const eligibleForPromotion = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    return members
      .filter(
        (m) =>
          m.roomAdmin !== true
          && m.isMainAdmin !== true
          && m.id !== currentUid
          && !m.isDisabled
          && !m.isDeleted
          && (m.isApproved === true)
      )
      .filter((m) => {
        if (!q) return true;
        return (
          (m.name || '').toLowerCase().includes(q)
          || (m.email || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 15);
  }, [members, adminSearch, currentUid]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return members
      .filter((m) => {
        if (!q) return true;
        return (
          (m.name || '').toLowerCase().includes(q)
          || (m.email || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Main admin first, then room admins, then alphabetical
        const rank = (u) =>
          u.isMainAdmin ? 0 : u.roomAdmin ? 1 : 2;
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [members, memberSearch]);

  const pendingReports = reports || [];

  const activeBlocked = useMemo(() => {
    const now = Date.now();
    return (blocked || []).filter((b) => {
      if (!b.expiresAt) return true;
      const exp = toMs(b.expiresAt);
      return exp === 0 || exp > now;
    });
  }, [blocked]);

  // ── Actions ────────────────────────────────────────────
  const handlePromote = async (member) => {
    if (!mainAdmin || !member) return;
    setBusyUid(member.id);
    try {
      await updateDoc(doc(db, 'users', member.id), { roomAdmin: true });
    } catch (err) {
      console.error('Promote failed:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleDemote = async (member) => {
    if (!mainAdmin || !member) return;
    if (member.isMainAdmin) return;
    setBusyUid(member.id);
    try {
      await updateDoc(doc(db, 'users', member.id), { roomAdmin: false });
    } catch (err) {
      console.error('Demote failed:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleUnblock = async (ban) => {
    if (!roomAdmin) return;
    setBusyUid(ban.id);
    try {
      await deleteDoc(doc(db, 'chatBans', ban.id));
    } catch (err) {
      console.error('Unblock failed:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleDismissReport = async (report) => {
    if (!roomAdmin) return;
    setBusyUid(report.id);
    try {
      await updateDoc(doc(db, 'chatReports', report.id), {
        status: 'dismissed',
        reviewedBy: currentUid,
        reviewedAt: new Date(),
      });
    } catch (err) {
      console.error('Dismiss report failed:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleBlockFromReport = async (report) => {
    // Find the target user
    const target = members.find((m) => m.id === report.messageSnapshot?.userId);
    if (!target) return;
    // Mark the report as blocked, then open BlockModal
    try {
      await updateDoc(doc(db, 'chatReports', report.id), {
        status: 'blocked',
        reviewedBy: currentUid,
        reviewedAt: new Date(),
      });
    } catch (err) {
      console.error('Mark report blocked failed:', err);
    }
    if (onBlockUser) onBlockUser(target);
  };

  const toggleCloseRoom = async () => {
    if (!roomAdmin || togglingClose) return;
    setTogglingClose(true);
    try {
      await updateDoc(doc(db, 'chatRooms', 'global'), {
        isClosed: !room?.isClosed,
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error('Toggle close failed:', err);
    } finally {
      setTogglingClose(false);
    }
  };

  const handleJumpToReport = (report) => {
    if (onJumpToMessage && report.messageId) {
      onJumpToMessage(report.messageId);
      onClose();
    }
  };

  // ── Render helpers ─────────────────────────────────────
  const renderMemberBadges = (m) => (
    <>
      {m.isMainAdmin === true && (
        <span className={`${styles.memberBadge} ${styles.memberBadgeMain}`}>
          {t('room.members.mainRoomAdmin')}
        </span>
      )}
      {m.roomAdmin === true && m.isMainAdmin !== true && (
        <span className={`${styles.memberBadge} ${styles.memberBadgeRoom}`}>
          {t('room.members.roomAdmin')}
        </span>
      )}
      {m.id === currentUid && (
        <span className={`${styles.memberBadge} ${styles.memberBadgeYou}`}>
          {t('room.members.you')}
        </span>
      )}
    </>
  );

  const totalMessages = room?.messageCount || 0;
  const deletedMessages = room?.deletedCount || 0;
  const pinnedCount = room?.pinnedMessageIds?.length || 0;

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-details-title"
      >
        <div className={styles.modalHeader}>
          <div>
            <h3 id="room-details-title" className={styles.modalTitle}>
              {t('room.title')}
            </h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-sumi-light)' }}>
              {t('room.subtitle')}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label={t('composer.cancel')}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Tabs */}
          <div className={styles.roomTabs}>
            <button
              type="button"
              className={`${styles.roomTab} ${tab === 'members' ? styles.roomTabActive : ''}`}
              onClick={() => setTab('members')}
            >
              <Users size={12} strokeWidth={2} /> {t('room.tabs.members')}
            </button>
            <button
              type="button"
              className={`${styles.roomTab} ${tab === 'admins' ? styles.roomTabActive : ''}`}
              onClick={() => setTab('admins')}
            >
              <Crown size={12} strokeWidth={2} /> {t('room.tabs.admins')}
            </button>
            {roomAdmin && (
              <button
                type="button"
                className={`${styles.roomTab} ${tab === 'blocked' ? styles.roomTabActive : ''}`}
                onClick={() => setTab('blocked')}
              >
                <Ban size={12} strokeWidth={2} /> {t('room.tabs.blocked')}
                {activeBlocked.length > 0 && (
                  <span className={styles.roomTabBadge}>{activeBlocked.length}</span>
                )}
              </button>
            )}
            {roomAdmin && (
              <button
                type="button"
                className={`${styles.roomTab} ${tab === 'reports' ? styles.roomTabActive : ''}`}
                onClick={() => setTab('reports')}
              >
                <Flag size={12} strokeWidth={2} /> {t('room.tabs.reports')}
                {pendingReports.length > 0 && (
                  <span className={styles.roomTabBadge}>{pendingReports.length}</span>
                )}
              </button>
            )}
            {roomAdmin && (
              <button
                type="button"
                className={`${styles.roomTab} ${tab === 'settings' ? styles.roomTabActive : ''}`}
                onClick={() => setTab('settings')}
              >
                <SettingsIcon size={12} strokeWidth={2} /> {t('room.tabs.settings')}
              </button>
            )}
            <button
              type="button"
              className={`${styles.roomTab} ${tab === 'health' ? styles.roomTabActive : ''}`}
              onClick={() => setTab('health')}
            >
              <Activity size={12} strokeWidth={2} /> {t('room.tabs.health')}
            </button>
          </div>

          {/* ─── Members ─────────────────────────────────── */}
          {tab === 'members' && (
            <>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t('room.members.searchPlaceholder')}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
              {filteredMembers.length === 0 ? (
                <div className={styles.emptyTab}>{t('room.members.noMatches')}</div>
              ) : (
                <div className={styles.memberList}>
                  {filteredMembers.map((m) => {
                    const canBlockHere =
                      roomAdmin
                      && m.id !== currentUid
                      && m.isMainAdmin !== true
                      && m.roomAdmin !== true;
                    return (
                      <div key={m.id} className={styles.memberRow}>
                        <div className={styles.memberAvatar}>
                          {m.profileImageUrl
                            ? <img src={m.profileImageUrl} alt="" />
                            : initials(m.name)}
                        </div>
                        <div className={styles.memberInfo}>
                          <div className={styles.memberName}>
                            {m.name || m.email}
                            {renderMemberBadges(m)}
                          </div>
                          <div className={styles.memberEmail}>{m.email}</div>
                        </div>
                        {canBlockHere && (
                          <div className={styles.memberActions}>
                            <button
                              type="button"
                              className={`${styles.memberActionBtn} ${styles.memberActionBtnDanger}`}
                              onClick={() => onBlockUser(m)}
                            >
                              <Ban size={11} strokeWidth={2} /> {t('actions.block')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ─── Admins ──────────────────────────────────── */}
          {tab === 'admins' && (
            <>
              <div className={styles.hint}>{t('room.admins.hint')}</div>

              {/* Main admin row */}
              {mainAdminMember && (
                <div className={styles.memberRow} style={{ marginBottom: 10 }}>
                  <div className={styles.memberAvatar}>
                    {mainAdminMember.profileImageUrl
                      ? <img src={mainAdminMember.profileImageUrl} alt="" />
                      : initials(mainAdminMember.name)}
                  </div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>
                      {mainAdminMember.name}
                      <span className={`${styles.memberBadge} ${styles.memberBadgeMain}`}>
                        {t('room.members.mainRoomAdmin')}
                      </span>
                    </div>
                    <div className={styles.memberEmail}>{mainAdminMember.email}</div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-sumi-light)' }}>
                    🔒 {t('room.admins.mainAdminCantBeDemoted')}
                  </div>
                </div>
              )}

              {/* Regular room admins */}
              <h4
                style={{
                  margin: '14px 0 8px',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'var(--color-sumi-light)',
                }}
              >
                {t('room.admins.title')} ({roomAdmins.length})
              </h4>
              {roomAdmins.length === 0 ? (
                <div className={styles.emptyTab}>
                  {t('room.admins.noRegularAdmins')}
                </div>
              ) : (
                <div className={styles.memberList} style={{ marginBottom: 16 }}>
                  {roomAdmins.map((m) => (
                    <div key={m.id} className={styles.memberRow}>
                      <div className={styles.memberAvatar}>
                        {m.profileImageUrl
                          ? <img src={m.profileImageUrl} alt="" />
                          : initials(m.name)}
                      </div>
                      <div className={styles.memberInfo}>
                        <div className={styles.memberName}>
                          {m.name}
                          <span className={`${styles.memberBadge} ${styles.memberBadgeRoom}`}>
                            {t('room.members.roomAdmin')}
                          </span>
                        </div>
                        <div className={styles.memberEmail}>{m.email}</div>
                      </div>
                      {mainAdmin && (
                        <div className={styles.memberActions}>
                          <button
                            type="button"
                            className={`${styles.memberActionBtn} ${styles.memberActionBtnDanger}`}
                            disabled={busyUid === m.id}
                            onClick={() => handleDemote(m)}
                          >
                            <UserMinus size={11} strokeWidth={2} /> {t('room.admins.demote')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Promote section — main admin only */}
              {mainAdmin && (
                <>
                  <h4
                    style={{
                      margin: '6px 0 8px',
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      color: 'var(--color-sumi-light)',
                    }}
                  >
                    {t('room.admins.promote')}
                  </h4>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={t('room.admins.searchPlaceholder')}
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                  />
                  {eligibleForPromotion.length === 0 ? (
                    <div className={styles.emptyTab}>
                      {t('room.members.noMatches')}
                    </div>
                  ) : (
                    <div className={styles.memberList}>
                      {eligibleForPromotion.map((m) => (
                        <div key={m.id} className={styles.memberRow}>
                          <div className={styles.memberAvatar}>
                            {m.profileImageUrl
                              ? <img src={m.profileImageUrl} alt="" />
                              : initials(m.name)}
                          </div>
                          <div className={styles.memberInfo}>
                            <div className={styles.memberName}>{m.name}</div>
                            <div className={styles.memberEmail}>{m.email}</div>
                          </div>
                          <div className={styles.memberActions}>
                            <button
                              type="button"
                              className={`${styles.memberActionBtn} ${styles.memberActionBtnPrimary}`}
                              disabled={busyUid === m.id}
                              onClick={() => handlePromote(m)}
                            >
                              <Crown size={11} strokeWidth={2} /> {t('room.admins.promote')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ─── Blocked ─────────────────────────────────── */}
          {tab === 'blocked' && roomAdmin && (
            <>
              <div className={styles.hint}>{t('room.blocked.hint')}</div>
              {activeBlocked.length === 0 ? (
                <div className={styles.emptyTab}>{t('room.blocked.none')}</div>
              ) : (
                <div className={styles.memberList}>
                  {activeBlocked.map((b) => {
                    const target = members.find((m) => m.id === b.blockedUserId);
                    const expMs = toMs(b.expiresAt);
                    return (
                      <div key={b.id} className={styles.blockedRow}>
                        <div className={styles.memberAvatar}>
                          {target?.profileImageUrl
                            ? <img src={target.profileImageUrl} alt="" />
                            : initials(b.blockedUserName || target?.name)}
                        </div>
                        <div className={styles.blockedRowContent}>
                          <div className={styles.blockedRowName}>
                            {b.blockedUserName || target?.name || b.blockedUserId}
                          </div>
                          <div className={styles.blockedRowMeta}>
                            {expMs > 0
                              ? t('room.blocked.blockedUntil', {
                                  date: new Date(expMs).toLocaleString(),
                                })
                              : t('room.blocked.blockedForever')}
                            {b.blockedByName && (
                              <>
                                {' · '}
                                {t('room.blocked.blockedBy', { name: b.blockedByName })}
                              </>
                            )}
                            {b.reason && (
                              <>
                                {' · '}
                                {t('room.blocked.reason', { reason: b.reason })}
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`${styles.memberActionBtn} ${styles.memberActionBtnPrimary}`}
                          disabled={busyUid === b.id}
                          onClick={() => handleUnblock(b)}
                        >
                          <Unlock size={11} strokeWidth={2} /> {t('room.blocked.unblock')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ─── Reports ─────────────────────────────────── */}
          {tab === 'reports' && roomAdmin && (
            <>
              {pendingReports.length === 0 ? (
                <div className={styles.emptyTab}>
                  {t('room.reports.none', { defaultValue: 'No pending reports.' })}
                </div>
              ) : (
                pendingReports.map((r) => (
                  <div key={r.id} className={styles.reportCard}>
                    <div className={styles.reportHeader}>
                      <strong>{r.reporterName || 'Anonymous'}</strong>
                      <span>·</span>
                      <span>
                        {new Date(toMs(r.createdAt)).toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={styles.reportMessage}
                      onClick={() => handleJumpToReport(r)}
                      role="button"
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleJumpToReport(r);
                      }}
                    >
                      <strong>{r.messageSnapshot?.userName}:</strong>{' '}
                      {r.messageSnapshot?.text
                        || (r.messageSnapshot?.imageUrls?.length > 0 ? '📷 image' : '—')}
                    </div>
                    {r.reason && (
                      <div className={styles.reportReason}>
                        {t('report.reason')}: "{r.reason}"
                      </div>
                    )}
                    <div className={styles.reportActions}>
                      <button
                        type="button"
                        className={`${styles.reportActionBtn} ${styles.reportActionDismiss}`}
                        disabled={busyUid === r.id}
                        onClick={() => handleDismissReport(r)}
                      >
                        <UserCheck size={11} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {t('report.dismiss', { defaultValue: 'Dismiss' })}
                      </button>
                      <button
                        type="button"
                        className={`${styles.reportActionBtn} ${styles.reportActionBlock}`}
                        disabled={busyUid === r.id}
                        onClick={() => handleBlockFromReport(r)}
                      >
                        <Ban size={11} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {t('actions.block')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ─── Settings ────────────────────────────────── */}
          {tab === 'settings' && roomAdmin && (
            <>
              <div className={styles.settingRow}>
                <div className={styles.settingRowInfo}>
                  <div className={styles.settingRowLabel}>
                    {room?.isClosed ? t('room.settings.openChat') : t('room.settings.closeChat')}
                  </div>
                  <div className={styles.settingRowDesc}>
                    {room?.isClosed
                      ? t('room.settings.openChatHint')
                      : t('room.settings.closeChatHint')}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.settingToggle} ${
                    !room?.isClosed ? styles.settingToggleOn : ''
                  }`}
                  onClick={toggleCloseRoom}
                  disabled={togglingClose}
                  role="switch"
                  aria-checked={!room?.isClosed}
                  aria-label={t('room.settings.closeChat')}
                >
                  <span className={styles.settingToggleKnob} />
                </button>
              </div>
              <div className={styles.hint}>
                {room?.isClosed
                  ? t('room.settings.closedStatus')
                  : t('room.settings.openStatus')}
              </div>
              <div className={styles.hint} style={{ background: '#fdfaf5', borderColor: 'var(--color-gold)' }}>
                {t('room.settings.cleanupInfo')}
              </div>
            </>
          )}

          {/* ─── Health ──────────────────────────────────── */}
          {tab === 'health' && (
            <div className={styles.healthGrid}>
              <div className={styles.healthStat}>
                <div className={styles.healthValue}>{totalMessages}</div>
                <div className={styles.healthLabel}>{t('room.health.totalMessages')}</div>
              </div>
              <div className={styles.healthStat}>
                <div className={styles.healthValue}>{deletedMessages}</div>
                <div className={styles.healthLabel}>{t('room.health.deletedMessages')}</div>
              </div>
              <div className={styles.healthStat}>
                <div className={styles.healthValue}>{members.length}</div>
                <div className={styles.healthLabel}>{t('room.health.activeMembers')}</div>
              </div>
              <div className={styles.healthStat}>
                <div className={styles.healthValue}>{activeBlocked.length}</div>
                <div className={styles.healthLabel}>{t('room.health.blockedUsers')}</div>
              </div>
              <div className={styles.healthStat}>
                <div className={styles.healthValue}>{pinnedCount}</div>
                <div className={styles.healthLabel}>{t('room.health.pinnedCount')}</div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
            onClick={onClose}
          >
            {t('composer.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}