// src/pages/AdminApprovals.jsx
import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import {
  UserCheck, CheckCircle2, XCircle, RotateCcw, Trash2, Eye,
} from 'lucide-react';
import styles from './Admin.module.css';
import { BELT_OPTIONS, getBeltLabel } from '../utils/experience';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
import StudentProfileModal from '../components/StudentProfileModal';

export default function AdminApprovals() {
  const { t } = useTranslation();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBelts, setSelectedBelts] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info', onConfirmAction: null,
  });
  const [viewingUser, setViewingUser] = useState(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const q = query(collection(db, 'users'), where('isApproved', '==', false));
        const querySnapshot = await getDocs(q);
        const pending = [];
        const rejected = [];

        querySnapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() };
          if (data.emailVerified === false) return;

          if (data.rejectedByAdmin === true && data.rejectedDismissed !== true) {
            rejected.push(data);
            return;
          }

          if (data.isDisabled) return;

          pending.push(data);
        });

        pending.sort((a, b) => {
          const at = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const bt = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return bt - at;
        });
        rejected.sort((a, b) => {
          const at = a.rejectedAt?.toDate?.()?.getTime?.() || 0;
          const bt = b.rejectedAt?.toDate?.()?.getTime?.() || 0;
          return bt - at;
        });

        setPendingUsers(pending);
        setRejectedUsers(rejected);
      } catch (error) {
        console.error('Error fetching pending users:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
  const handleModalConfirm = () => {
    if (modal.onConfirmAction) modal.onConfirmAction();
    closeModal();
  };

  const showAlert = (title, message) =>
    setModal({ isOpen: true, title, message, type: 'info', onConfirmAction: null });
  const showConfirm = (title, message, action) =>
    setModal({ isOpen: true, title, message, type: 'confirm', onConfirmAction: action });

  const handleBeltChange = (userId, belt) => {
    setSelectedBelts(prev => ({ ...prev, [userId]: belt }));
  };

  const handleApprove = async (userId) => {
    setProcessingId(userId);
    const assignedBelt = selectedBelts[userId] || 'yellow';
    try {
      await updateDoc(doc(db, 'users', userId), {
        isApproved: true,
        belt: assignedBelt,
      });
      setPendingUsers(prev => prev.filter(user => user.id !== userId));
    } catch (error) {
      console.error('Error approving user:', error);
      showAlert(t('common.error'), t('adminApprovals.failedApprove'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = (user) => {
    showConfirm(
      t('adminApprovals.rejectConfirmTitle'),
      t('adminApprovals.rejectConfirmMessage', { name: user.name }),
      async () => {
        setProcessingId(user.id);
        try {
          const now = new Date();
          await updateDoc(doc(db, 'users', user.id), {
            isApproved: false,
            isDisabled: true,
            rejectedByAdmin: true,
            rejectedAt: now,
            rejectedDismissed: false,
          });
          const optimistic = {
            ...user,
            isDisabled: true,
            rejectedByAdmin: true,
            rejectedAt: { toDate: () => now },
          };
          setPendingUsers(prev => prev.filter(u => u.id !== user.id));
          setRejectedUsers(prev => [optimistic, ...prev]);
          setSelectedBelts(prev => {
            const next = { ...prev };
            delete next[user.id];
            return next;
          });
        } catch (err) {
          console.error('Error rejecting user:', err);
          showAlert(t('common.error'), t('adminApprovals.failedReject'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  const handleRestore = async (user) => {
    setProcessingId(user.id);
    try {
      await updateDoc(doc(db, 'users', user.id), {
        isDisabled: false,
        rejectedByAdmin: false,
        rejectedDismissed: false,
        rejectedAt: null,
      });
      const { rejectedByAdmin, rejectedAt, rejectedDismissed, ...rest } = user;
      setRejectedUsers(prev => prev.filter(u => u.id !== user.id));
      setPendingUsers(prev => [{ ...rest, isDisabled: false }, ...prev]);
    } catch (err) {
      console.error('Error restoring user:', err);
      showAlert(t('common.error'), t('adminApprovals.failedRestore'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = (user) => {
    showConfirm(
      t('adminApprovals.removeConfirmTitle'),
      t('adminApprovals.removeConfirmMessage', { name: user.name }),
      async () => {
        setProcessingId(user.id);
        try {
          await updateDoc(doc(db, 'users', user.id), {
            rejectedDismissed: true,
          });
          setRejectedUsers(prev => prev.filter(u => u.id !== user.id));
        } catch (err) {
          console.error('Error removing from list:', err);
          showAlert(t('common.error'), t('adminApprovals.failedRemove'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  const matchesFilters = (u) => {
    const nameQ = nameFilter.trim().toLowerCase();
    const emailQ = emailFilter.trim().toLowerCase();
    if (nameQ && !(u.name || '').toLowerCase().includes(nameQ)) return false;
    if (emailQ && !(u.email || '').toLowerCase().includes(emailQ)) return false;
    return true;
  };

  const filteredPending = pendingUsers.filter(matchesFilters);
  const filteredRejected = rejectedUsers.filter(matchesFilters);
  const hasActiveFilters = !!nameFilter.trim() || !!emailFilter.trim();
  const clearFilters = () => { setNameFilter(''); setEmailFilter(''); };

  if (loading) return <Loading text={t('adminApprovals.loading')} />;

  const isPendingView = activeTab === 'pending';
  const currentRows = isPendingView ? filteredPending : filteredRejected;
  const totalInSection = isPendingView ? pendingUsers.length : rejectedUsers.length;

  const gridStyle = { gridTemplateColumns: '1.2fr 1.8fr 0.5fr 1fr 1.8fr' };

  return (
    <div className={styles.pageRoot}>
      <h1
        className={styles.pageHeading}
        style={{
          color: 'var(--color-bengara)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <UserCheck size={32} strokeWidth={2} className={styles.headingIcon} />
        {t('adminApprovals.heading')}
      </h1>
      <p style={{ color: 'var(--color-sumi-light)', marginBottom: '20px' }}>
        {t('adminApprovals.subtitle')}
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`${isPendingView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
          onClick={() => setActiveTab('pending')}
        >
          <CheckCircle2 size={16} strokeWidth={2} />
          {t('adminApprovals.tabPending', { count: pendingUsers.length })}
        </button>
        <button
          className={`${!isPendingView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
          onClick={() => setActiveTab('rejected')}
        >
          <XCircle size={16} strokeWidth={2} />
          {t('adminApprovals.tabRejected', { count: rejectedUsers.length })}
        </button>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label>{t('adminApprovals.searchByName')}</label>
          <input
            type="text"
            className={styles.filterInput}
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder={t('adminApprovals.searchNamePlaceholder')}
          />
        </div>
        <div className={styles.filterGroup}>
          <label>{t('adminApprovals.searchByEmail')}</label>
          <input
            type="text"
            className={styles.filterInput}
            value={emailFilter}
            onChange={e => setEmailFilter(e.target.value)}
            placeholder={t('adminApprovals.searchEmailPlaceholder')}
          />
        </div>
        {hasActiveFilters && (
          <button onClick={clearFilters} className={styles.clearFiltersBtn}>
            {t('adminApprovals.clearFilters')}
          </button>
        )}
      </div>

      {!isPendingView && rejectedUsers.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            background: '#fdecea',
            borderLeft: '4px solid #e74c3c',
            borderRadius: '4px',
            marginBottom: '14px',
            color: '#8a1f17',
            fontSize: '0.9rem',
            lineHeight: 1.5,
          }}
        >
          <Trans
            i18nKey="adminApprovals.rejectedWarning"
            components={{ strong: <strong /> }}
          />
        </div>
      )}

      {totalInSection === 0 ? (
        <div className={styles.emptyState}>
          <h3>{isPendingView ? t('adminApprovals.noPending') : t('adminApprovals.noRejected')}</h3>
          <p>
            {isPendingView
              ? t('adminApprovals.allReviewed')
              : t('adminApprovals.rejectedHere')}
          </p>
        </div>
      ) : currentRows.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{t('adminApprovals.noMatches')}</h3>
          <p>
            {isPendingView
              ? t('adminApprovals.noMatchesPending')
              : t('adminApprovals.noMatchesRejected')}
          </p>
        </div>
      ) : (
        <div className={styles.scrollContainer}>
          <div className={styles.adminList}>
            <div className={styles.adminListHeader} style={gridStyle}>
              <div>{t('adminApprovals.colName')}</div>
              <div>{t('adminApprovals.colEmail')}</div>
              <div>{t('adminApprovals.colAge')}</div>
              <div>
                {isPendingView
                  ? t('adminApprovals.colAssignBelt')
                  : t('adminApprovals.colRejected')}
              </div>
              <div>{t('adminApprovals.colActions')}</div>
            </div>

            {currentRows.map(user => {
              const busy = processingId === user.id;

              if (isPendingView) {
                return (
                  <div className={styles.adminListItem} key={user.id} style={gridStyle}>
                    <button
                      type="button"
                      onClick={() => setViewingUser(user)}
                      style={{
                        fontWeight: 'bold',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--color-sumi)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                      }}
                      title={t('adminApprovals.viewProfileTitle')}
                    >
                      {user.name}
                    </button>
                    <div>{user.email}</div>
                    <div>{user.age}</div>
                    <div>
                      <select
                        className={styles.beltSelect}
                        value={selectedBelts[user.id] || 'yellow'}
                        onChange={(e) => handleBeltChange(user.id, e.target.value)}
                        disabled={busy}
                        style={{ width: '100%', maxWidth: '100%' }}
                      >
                        {BELT_OPTIONS.map(b => (
                          <option key={b.value} value={b.value}>
                            {getBeltLabel(b.value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.viewProfileBtn}
                          onClick={() => setViewingUser(user)}
                          disabled={busy}
                          title={t('adminApprovals.viewProfileTitle')}
                        >
                          <Eye size={14} strokeWidth={2} />
                          {t('adminApprovals.view')}
                        </button>
                        <button
                          className={styles.approveBtn}
                          onClick={() => handleApprove(user.id)}
                          disabled={busy}
                        >
                          <CheckCircle2 size={16} strokeWidth={2} />
                          {busy ? t('adminApprovals.approving') : t('adminApprovals.approve')}
                        </button>
                        <button
                          className={styles.rejectBtn}
                          onClick={() => handleReject(user)}
                          disabled={busy}
                          title={t('adminApprovals.rejectTitle')}
                        >
                          <XCircle size={16} strokeWidth={2} />
                          {busy ? '…' : t('adminApprovals.reject')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              const rejectedDate = user.rejectedAt?.toDate?.();
              return (
                <div className={styles.adminListItem} key={user.id} style={gridStyle}>
                  <button
                    type="button"
                    onClick={() => setViewingUser(user)}
                    style={{
                      fontWeight: 'bold',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--color-sumi)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                    }}
                    title={t('adminApprovals.viewProfileTitle')}
                  >
                    {user.name}
                  </button>
                  <div>{user.email}</div>
                  <div>{user.age}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-sumi-light)' }}>
                    {rejectedDate
                      ? rejectedDate.toLocaleDateString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })
                      : '—'}
                  </div>
                  <div>
                    <div className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.viewProfileBtn}
                        onClick={() => setViewingUser(user)}
                        disabled={busy}
                        title={t('adminApprovals.viewProfileTitle')}
                      >
                        <Eye size={14} strokeWidth={2} />
                        {t('adminApprovals.view')}
                      </button>
                      <button
                        className={styles.editBtn}
                        onClick={() => handleRestore(user)}
                        disabled={busy}
                        title={t('adminApprovals.restoreTitle')}
                      >
                        <RotateCcw size={14} strokeWidth={2} />
                        {busy ? '…' : t('adminApprovals.restore')}
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDismiss(user)}
                        disabled={busy}
                        title={t('adminApprovals.deleteTitle')}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                        {t('adminApprovals.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <StudentProfileModal
        isOpen={!!viewingUser}
        student={viewingUser}
        onClose={() => setViewingUser(null)}
        footer={
          viewingUser && isPendingView && (
            <>
              <select
                className={styles.beltSelect}
                value={selectedBelts[viewingUser.id] || 'yellow'}
                onChange={(e) => handleBeltChange(viewingUser.id, e.target.value)}
                disabled={processingId === viewingUser.id}
                style={{ marginRight: 'auto', minWidth: 160 }}
              >
                {BELT_OPTIONS.map(b => (
                  <option key={b.value} value={b.value}>
                    {getBeltLabel(b.value)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.rejectBtn}
                onClick={() => {
                  const u = viewingUser;
                  setViewingUser(null);
                  handleReject(u);
                }}
                disabled={processingId === viewingUser.id}
              >
                <XCircle size={14} strokeWidth={2} />
                {t('adminApprovals.reject')}
              </button>
              <button
                type="button"
                className={styles.approveBtn}
                onClick={() => {
                  handleApprove(viewingUser.id);
                  setViewingUser(null);
                }}
                disabled={processingId === viewingUser.id}
              >
                <CheckCircle2 size={14} strokeWidth={2} />
                {t('adminApprovals.approve')}
              </button>
            </>
          )
        }
      />

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />
    </div>
  );
}