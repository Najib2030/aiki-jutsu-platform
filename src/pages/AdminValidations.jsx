// src/pages/AdminValidations.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteDoc,
  addDoc, writeBatch, query, where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
  BadgeCheck, Clock, History, Trash2, RotateCcw, Eye,
  CheckCircle2, XCircle, Undo2, Trash,
} from 'lucide-react';
import styles from './Admin.module.css';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
import ReasonModal from '../components/ReasonModal';
import StudentProfileModal from '../components/StudentProfileModal';
import { getBeltLabel, BELT_OPTIONS } from '../utils/experience';

export default function AdminValidations() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history' | 'trash'

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info', onConfirmAction: null,
  });
  const [rejectModal, setRejectModal] = useState({ isOpen: false, request: null });
  const [viewingRequest, setViewingRequest] = useState(null);

  const fetchRequests = async () => {
    try {
      const snap = await getDocs(collection(db, 'beltRequests'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        const at = a.requestedAt?.toDate?.()?.getTime?.() || 0;
        const bt = b.requestedAt?.toDate?.()?.getTime?.() || 0;
        return bt - at;
      });
      setRequests(data);
    } catch (err) {
      console.error('Error fetching belt requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const showAlert = (title, message) =>
    setModal({ isOpen: true, title, message, type: 'info', onConfirmAction: null });
  const showConfirm = (title, message, action) =>
    setModal({ isOpen: true, title, message, type: 'confirm', onConfirmAction: action });
  const closeModal = () => setModal(p => ({ ...p, isOpen: false }));
  const handleModalConfirm = () => {
    if (modal.onConfirmAction) modal.onConfirmAction();
    closeModal();
  };

  // ─── Approve ───────────────────────────────────────────────
  const handleApprove = (req) => {
    const isBlackBelt = req.belt === 'black';
    const beltLabel = getBeltLabel(req.belt);

    showConfirm(
      t('adminValidations.approveConfirmTitle'),
      isBlackBelt
        ? t('adminValidations.approveConfirmBlack', { name: req.userName })
        : t('adminValidations.approveConfirmRegular', { name: req.userName, belt: beltLabel }),
      async () => {
        setProcessingId(req.id);
        try {
          await updateDoc(doc(db, 'beltRequests', req.id), {
            status: 'approved',
            reviewedAt: new Date(),
            reviewedBy: currentUser.uid,
            rejectionReason: null,
          });

          if (isBlackBelt) {
            await updateDoc(doc(db, 'users', req.userId), { belt: 'dan1' });
          }

          // English fallback + i18n metadata
          const notifTitle = 'Belt Validation Approved';
          const notifTitleKey = 'notifications.beltApproved.title';
          const notifMessage = isBlackBelt
            ? 'Your Black Belt validation has been approved! You have been promoted to Dan 1 (Master).'
            : `Your ${beltLabel} validation has been approved. Your Sensei will update your belt soon.`;
          const notifMessageKey = isBlackBelt
            ? 'notifications.beltApproved.messageBlack'
            : 'notifications.beltApproved.message';
          // NOTE: `belt` param is stored as the raw code. Reader should
          // translate it via `t('belts.short.' + belt)` before use.
          const notifMessageParams = isBlackBelt ? {} : { belt: req.belt };

          await addDoc(collection(db, 'notifications'), {
            userId: req.userId,
            type: 'belt_approved',
            title: notifTitle,
            message: notifMessage,
            titleKey: notifTitleKey,
            messageKey: notifMessageKey,
            messageParams: notifMessageParams,
            read: false,
            createdAt: new Date(),
            requestId: req.id,
            belt: req.belt,
          });

          await fetchRequests();
        } catch (err) {
          console.error(err);
          showAlert(t('common.error'), t('adminValidations.failedApprove'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  // ─── Reject ────────────────────────────────────────────────
  const openRejectModal = (req) => setRejectModal({ isOpen: true, request: req });

  const handleRejectConfirm = async (reason) => {
    const req = rejectModal.request;
    if (!req) return;
    setProcessingId(req.id);
    try {
      await updateDoc(doc(db, 'beltRequests', req.id), {
        status: 'rejected',
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedBy: currentUser.uid,
      });

      const beltLabel = getBeltLabel(req.belt);
      await addDoc(collection(db, 'notifications'), {
        userId: req.userId,
        type: 'belt_rejected',
        title: 'Belt Validation Rejected',
        message: `Your ${beltLabel} validation was not approved.`,
        titleKey: 'notifications.beltRejected.title',
        messageKey: 'notifications.beltRejected.message',
        // Reader translates `belt` via `t('belts.short.' + belt)`
        messageParams: { belt: req.belt },
        rejectionReason: reason,
        read: false,
        createdAt: new Date(),
        requestId: req.id,
        belt: req.belt,
      });

      setRejectModal({ isOpen: false, request: null });
      await fetchRequests();
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('adminValidations.failedReject'));
    } finally {
      setProcessingId(null);
    }
  };

  // ─── Cancel decision ───────────────────────────────────────
  const handleCancelDecision = (req) => {
    const wasApprovedBlackBelt = req.belt === 'black' && req.status === 'approved';

    showConfirm(
      t('adminValidations.cancelConfirmTitle'),
      wasApprovedBlackBelt
        ? t('adminValidations.cancelConfirmBlack', { name: req.userName })
        : t('adminValidations.cancelConfirmRegular', { status: req.status }),
      async () => {
        setProcessingId(req.id);
        try {
          await updateDoc(doc(db, 'beltRequests', req.id), {
            status: 'pending',
            reviewedAt: null,
            reviewedBy: null,
            rejectionReason: null,
          });

          if (wasApprovedBlackBelt) {
            const userSnap = await getDoc(doc(db, 'users', req.userId));
            if (userSnap.exists() && userSnap.data().belt === 'dan1') {
              await updateDoc(doc(db, 'users', req.userId), { belt: 'black' });
            }
          }

          const notifSnap = await getDocs(
            query(collection(db, 'notifications'), where('requestId', '==', req.id))
          );
          if (!notifSnap.empty) {
            const notifBatch = writeBatch(db);
            notifSnap.forEach(d => notifBatch.delete(d.ref));
            await notifBatch.commit();
          }

          await fetchRequests();
        } catch (err) {
          console.error(err);
          showAlert(t('common.error'), t('adminValidations.failedCancel'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  // ─── Trash Actions ─────────────────────────────────────────
  const handleMoveToTrash = (req) => {
    showConfirm(
      t('adminValidations.trashConfirmTitle'),
      t('adminValidations.trashConfirmMessage', { status: req.status, name: req.userName }),
      async () => {
        setProcessingId(req.id);
        try {
          await updateDoc(doc(db, 'beltRequests', req.id), {
            isDeleted: true,
            deletedAt: new Date(),
          });
          await fetchRequests();
        } catch (err) {
          console.error(err);
          showAlert(t('common.error'), t('adminValidations.failedTrash'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  const handleRestoreFromTrash = (req) => {
    showConfirm(
      t('adminValidations.restoreConfirmTitle'),
      t('adminValidations.restoreConfirmMessage', { name: req.userName }),
      async () => {
        setProcessingId(req.id);
        try {
          await updateDoc(doc(db, 'beltRequests', req.id), {
            isDeleted: false,
            deletedAt: null,
          });
          await fetchRequests();
        } catch (err) {
          console.error(err);
          showAlert(t('common.error'), t('adminValidations.failedRestore'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  const handleDeleteForever = (req) => {
    showConfirm(
      t('adminValidations.deleteForeverConfirmTitle'),
      t('adminValidations.deleteForeverConfirmMessage', { name: req.userName }),
      async () => {
        setProcessingId(req.id);
        try {
          await deleteDoc(doc(db, 'beltRequests', req.id));
          await fetchRequests();
        } catch (err) {
          console.error(err);
          showAlert(t('common.error'), t('adminValidations.failedDeleteForever'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  // ─── Filters & Buckets ─────────────────────────────────────
  const matchesFilters = (r) => {
    if (nameFilter.trim() && !(r.userName || '').toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
    if (beltFilter !== 'all' && r.belt !== beltFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  };

  const pending = requests.filter(r => r.status === 'pending' && !r.isDeleted);
  const history = requests.filter(r => r.status !== 'pending' && !r.isDeleted);
  const trash = requests.filter(r => r.isDeleted);

  const displayed =
    activeTab === 'pending' ? pending.filter(matchesFilters) :
    activeTab === 'history' ? history.filter(matchesFilters) :
    trash.filter(matchesFilters);

  const hasActiveFilters = !!nameFilter.trim() || beltFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setNameFilter('');
    setBeltFilter('all');
    setStatusFilter('all');
  };

  if (loading) return <Loading text={t('adminValidations.loading')} />;

  const gridStyle = { gridTemplateColumns: '1fr 1.4fr 0.7fr 1fr 0.8fr 2fr' };

  return (
    <div className={styles.pageRoot}>
      <h1
        className={styles.pageHeading}
        style={{ color: 'var(--color-bengara)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
      >
        <BadgeCheck size={32} strokeWidth={2} className={styles.headingIcon} />
        {t('adminValidations.heading')}
      </h1>
      <p style={{ color: 'var(--color-sumi-light)', marginBottom: '20px' }}>
        {t('adminValidations.subtitle')}
      </p>

      {/* Tab switcher with Trash pushed to the right */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className={`${activeTab === 'pending' ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
            onClick={() => setActiveTab('pending')}
          >
            <Clock size={16} strokeWidth={2} />
            {t('adminValidations.tabPending', { count: pending.length })}
          </button>
          <button
            className={`${activeTab === 'history' ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} strokeWidth={2} />
            {t('adminValidations.tabHistory', { count: history.length })}
          </button>
        </div>

        <button
          className={`${activeTab === 'trash' ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
          onClick={() => setActiveTab('trash')}
        >
          <Trash2 size={16} strokeWidth={2} />
          {t('adminValidations.tabTrash', { count: trash.length })}
        </button>
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label>{t('adminValidations.searchByName')}</label>
          <input
            type="text"
            className={styles.filterInput}
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder={t('adminValidations.searchPlaceholder')}
          />
        </div>
        <div className={styles.filterGroup}>
          <label>{t('adminValidations.belt')}</label>
          <select
            className={styles.filterSelect}
            value={beltFilter}
            onChange={e => setBeltFilter(e.target.value)}
          >
            <option value="all">{t('adminValidations.allBelts')}</option>
            {BELT_OPTIONS.map(b => (
              <option key={b.value} value={b.value}>{getBeltLabel(b.value)}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>{t('adminValidations.status')}</label>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            disabled={activeTab === 'pending'}
          >
            <option value="all">{t('adminValidations.allStatuses')}</option>
            <option value="pending">{t('adminValidations.statusPending')}</option>
            <option value="approved">{t('adminValidations.statusApproved')}</option>
            <option value="rejected">{t('adminValidations.statusRejected')}</option>
          </select>
        </div>
        {hasActiveFilters && (
          <button onClick={clearFilters} className={styles.clearFiltersBtn}>
            {t('adminValidations.clearFilters')}
          </button>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>
            {activeTab === 'pending' ? t('adminValidations.noPending') :
             activeTab === 'history' ? t('adminValidations.noHistory') :
             t('adminValidations.trashEmpty')}
          </h3>
          <p>
            {hasActiveFilters ? t('adminValidations.noMatches') :
             activeTab === 'pending' ? t('adminValidations.allCaughtUp') :
             activeTab === 'history' ? t('adminValidations.historyWillAppear') :
             t('adminValidations.trashWillAppear')}
          </p>
        </div>
      ) : (
        <div className={styles.scrollContainer}>
          <div className={styles.adminList}>
            <div className={styles.adminListHeader} style={gridStyle}>
              <div>{t('adminValidations.colStudent')}</div>
              <div>{t('adminValidations.colEmail')}</div>
              <div>{t('adminValidations.colBelt')}</div>
              <div>
                {activeTab === 'trash'
                  ? t('adminValidations.colDeletedAt')
                  : t('adminValidations.colRequested')}
              </div>
              <div>{t('adminValidations.colStatus')}</div>
              <div>{t('adminValidations.colActions')}</div>
            </div>

            {displayed.map(req => {
              const d = activeTab === 'trash' ? req.deletedAt?.toDate?.() : req.requestedAt?.toDate?.();
              const busy = processingId === req.id;
              return (
                <div key={req.id} className={styles.adminListItem} style={gridStyle}>
                  <button
                    type="button"
                    onClick={() => setViewingRequest(req)}
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
                    title={t('adminValidations.viewProfileTitle')}
                  >
                    {req.userName}
                  </button>
                  <div>{req.userEmail}</div>
                  <div>{getBeltLabel(req.belt)}</div>
                  <div>
                    {d
                      ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : '—'}
                  </div>
                  <div style={{ textTransform: 'capitalize' }}>
                    {t(`adminValidations.statusLabel_${req.status}`, { defaultValue: req.status })}
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: '#c0392b',
                          fontStyle: 'italic',
                          marginTop: 4,
                        }}
                      >
                        "{req.rejectionReason}"
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={styles.actionsCell}>
                      {activeTab === 'pending' && (
                        <>
                          <button
                            type="button"
                            className={styles.viewProfileBtn}
                            onClick={() => setViewingRequest(req)}
                            disabled={busy}
                            title={t('adminValidations.viewProfileTitle')}
                          >
                            <Eye size={14} strokeWidth={2} />
                            {t('adminValidations.view')}
                          </button>
                          <button
                            onClick={() => handleApprove(req)}
                            className={styles.approveBtn}
                            disabled={busy}
                          >
                            <CheckCircle2 size={16} strokeWidth={2} />
                            {busy ? '…' : t('adminValidations.approve')}
                          </button>
                          <button
                            onClick={() => openRejectModal(req)}
                            className={styles.rejectBtn}
                            disabled={busy}
                          >
                            <XCircle size={16} strokeWidth={2} />
                            {busy ? '…' : t('adminValidations.reject')}
                          </button>
                        </>
                      )}

                      {activeTab === 'history' && (
                        <>
                          <button
                            type="button"
                            className={styles.viewProfileBtn}
                            onClick={() => setViewingRequest(req)}
                            disabled={busy}
                            title={t('adminValidations.viewProfileTitle')}
                          >
                            <Eye size={14} strokeWidth={2} />
                            {t('adminValidations.view')}
                          </button>
                          <button
                            onClick={() => handleCancelDecision(req)}
                            className={styles.editBtn}
                            disabled={busy}
                          >
                            <Undo2 size={16} strokeWidth={2} />
                            {busy ? '…' : t('adminValidations.cancel')}
                          </button>
                          <button
                            onClick={() => handleMoveToTrash(req)}
                            className={styles.deleteBtn}
                            disabled={busy}
                          >
                            <Trash size={16} strokeWidth={2} />
                            {busy ? '…' : t('adminValidations.trash')}
                          </button>
                        </>
                      )}

                      {activeTab === 'trash' && (
                        <>
                          <button
                            type="button"
                            className={styles.viewProfileBtn}
                            onClick={() => setViewingRequest(req)}
                            disabled={busy}
                            title={t('adminValidations.viewProfileTitle')}
                          >
                            <Eye size={14} strokeWidth={2} />
                            {t('adminValidations.view')}
                          </button>
                          <button
                            onClick={() => handleRestoreFromTrash(req)}
                            className={styles.editBtn}
                            disabled={busy}
                          >
                            <RotateCcw size={16} strokeWidth={2} />
                            {busy ? '…' : t('adminValidations.restore')}
                          </button>
                          <button
                            onClick={() => handleDeleteForever(req)}
                            className={styles.deleteBtn}
                            disabled={busy}
                          >
                            <Trash2 size={16} strokeWidth={2} />
                            {busy ? '…' : t('adminValidations.deleteForever')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <StudentProfileModal
        isOpen={!!viewingRequest}
        student={
          viewingRequest
            ? {
                id: viewingRequest.userId,
                name: viewingRequest.userName,
                email: viewingRequest.userEmail,
                belt: viewingRequest.belt,
              }
            : null
        }
        onClose={() => setViewingRequest(null)}
        extraInfo={
          viewingRequest
            ? [
                {
                  label: t('adminValidations.extraRequestedBelt'),
                  value: getBeltLabel(viewingRequest.belt),
                },
                {
                  label: t('adminValidations.extraStatus'),
                  value: t(
                    `adminValidations.statusLabel_${viewingRequest.status}`,
                    { defaultValue: viewingRequest.status }
                  ),
                  variant:
                    viewingRequest.status === 'approved' ? 'success' :
                    viewingRequest.status === 'rejected' ? 'danger' : undefined,
                },
                {
                  label: t('adminValidations.extraRequestedOn'),
                  value: viewingRequest.requestedAt?.toDate?.()?.toLocaleString() || '—',
                },
                ...(viewingRequest.reviewedAt
                  ? [{
                      label: t('adminValidations.extraReviewedOn'),
                      value: viewingRequest.reviewedAt.toDate?.()?.toLocaleString() || '—',
                    }]
                  : []),
                ...(viewingRequest.rejectionReason
                  ? [{
                      label: t('adminValidations.extraReason'),
                      value: viewingRequest.rejectionReason,
                      variant: 'danger',
                    }]
                  : []),
              ]
            : []
        }
        footer={
          viewingRequest && (
            <>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setViewingRequest(null)}
              >
                {t('common.close')}
              </button>
              {viewingRequest.status === 'pending' && (
                <>
                  <button
                    type="button"
                    className={styles.rejectBtn}
                    onClick={() => {
                      const r = viewingRequest;
                      setViewingRequest(null);
                      openRejectModal(r);
                    }}
                    disabled={processingId === viewingRequest.id}
                  >
                    <XCircle size={14} strokeWidth={2} />
                    {t('adminValidations.reject')}
                  </button>
                  <button
                    type="button"
                    className={styles.approveBtn}
                    onClick={() => {
                      const r = viewingRequest;
                      setViewingRequest(null);
                      handleApprove(r);
                    }}
                    disabled={processingId === viewingRequest.id}
                  >
                    <CheckCircle2 size={14} strokeWidth={2} />
                    {t('adminValidations.approve')}
                  </button>
                </>
              )}
            </>
          )
        }
      />

      <ReasonModal
        isOpen={rejectModal.isOpen}
        title={t('adminValidations.rejectModalTitle')}
        message={t('adminValidations.rejectModalMessage', {
          name: rejectModal.request?.userName || t('adminValidations.thisStudent'),
          belt: getBeltLabel(rejectModal.request?.belt || 'yellow'),
        })}
        placeholder={t('adminValidations.rejectModalPlaceholder')}
        confirmLabel={t('adminValidations.rejectModalConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectModal({ isOpen: false, request: null })}
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