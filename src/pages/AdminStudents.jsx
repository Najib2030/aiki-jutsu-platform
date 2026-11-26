// src/pages/AdminStudents.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { db } from '../firebase/config';
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc, setDoc,
} from 'firebase/firestore';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  Users, MailWarning, Trash2, RotateCcw, UserX,
  UserCheck, Edit as EditIcon, Save, X,
  UserPlus, Mail, Lock, Calendar, Eye, EyeOff, CheckCircle2,
} from 'lucide-react';
import styles from './Admin.module.css';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import StudentProfileModal from '../components/StudentProfileModal';
import {
  BELT_RANK, BELT_OPTIONS, EXPERIENCE_OPTIONS,
  getExperience, getExperienceLabel, getBeltLabel,
} from '../utils/experience';

const TODAY_ISO = new Date().toISOString().split('T')[0];

// Map English experience enums (from EXPERIENCE_OPTIONS) → translation keys.
// EXPERIENCE_OPTIONS itself stays English; only the *displayed* label is
// translated, while the option `value` keeps the English enum so filters
// keep working regardless of active language.
const EXPERIENCE_KEY_MAP = {
  'Beginner': 'beginner',
  'Some Experience': 'some',
  'Advanced': 'advanced',
  'Master': 'master',
};

function calcAgeFromBirthDate(str) {
  if (!str) return null;
  const parts = str.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

export default function AdminStudents() {
  const { t } = useTranslation();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('approved');

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');
  const [experienceFilter, setExperienceFilter] = useState('all');

  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({ age: '', belt: 'yellow' });
  const [saving, setSaving] = useState(false);
  const [viewingStudent, setViewingStudent] = useState(null);

  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info', onConfirmAction: null,
  });

  // ── Add Student modal ──
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState({ type: '', text: '' });
  const [addSuccess, setAddSuccess] = useState(null); // { email, password }
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    birthDate: '',
    belt: 'yellow',
    joinedDate: TODAY_ISO,
  });

  const fetchStudents = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      const snapshot = await getDocs(q);

      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      data.sort((a, b) => {
        const aRank = BELT_RANK[a.belt || 'yellow'] || 0;
        const bRank = BELT_RANK[b.belt || 'yellow'] || 0;
        if (aRank !== bRank) return bRank - aRank;
        return (a.name || '').localeCompare(b.name || '');
      });

      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  // ---------- BUCKETS ----------
  const activeStudents = students.filter(s => !s.isDeleted);
  const deletedStudents = students.filter(s => s.isDeleted);

  const isVerifiedStudent = (s) =>
    s.emailVerified !== false || s.adminVerified === true;

  const isRejectedStudent = (s) =>
    s.rejectedByAdmin === true && s.rejectedDismissed !== true;

  const unverifiedStudents = activeStudents.filter(s => !isVerifiedStudent(s));
  const approvedStudents   = activeStudents.filter(s => isVerifiedStudent(s) && s.isApproved === true);

  // Mirrors AdminApprovals "Pending" tab exactly.
  const pendingApprovalCount = activeStudents.filter(s =>
    isVerifiedStudent(s) &&
    s.isApproved !== true &&
    !s.isDisabled &&
    !isRejectedStudent(s)
  ).length;

  const deletedUnverified = deletedStudents.filter(s => !isVerifiedStudent(s));
  const deletedApproved   = deletedStudents.filter(s => isVerifiedStudent(s));

  // ---------- FILTERS ----------
  // Filter comparisons use the English enum from `getExperience()` so the
  // filter keeps working regardless of the current language.
  const filterFn = (s) => {
    if (
      nameFilter.trim() &&
      !(s.name || '').toLowerCase().includes(nameFilter.trim().toLowerCase())
    ) return false;
    if (beltFilter !== 'all' && (s.belt || 'yellow') !== beltFilter) return false;
    if (experienceFilter !== 'all' && getExperience(s.belt) !== experienceFilter) return false;
    return true;
  };

  const displayedApproved   = approvedStudents.filter(filterFn);
  const displayedUnverified = unverifiedStudents.filter(filterFn);
  const displayedDeletedApproved = deletedApproved.filter(filterFn);
  const displayedDeletedUnverified = deletedUnverified.filter(filterFn);

  const hasActiveFilters =
    !!nameFilter.trim() || beltFilter !== 'all' || experienceFilter !== 'all';

  const clearFilters = () => {
    setNameFilter('');
    setBeltFilter('all');
    setExperienceFilter('all');
  };

  // ---------- EXISTING ACTIONS ----------
  const handleDelete = (userId, name) => {
    setModal({
      isOpen: true,
      title: t('adminStudents.trashTitle'),
      message: t('adminStudents.trashMessage', { name }),
      type: 'confirm',
      onConfirmAction: async () => {
        try {
          await updateDoc(doc(db, 'users', userId), {
            isDeleted: true,
            isDisabled: true,
            isApproved: false,
          });
          await fetchStudents();
        } catch (error) {
          console.error('Error deleting student:', error);
        }
      },
    });
  };

  const handleRestore = (userId, name) => {
    setModal({
      isOpen: true,
      title: t('adminStudents.restoreTitle'),
      message: t('adminStudents.restoreMessage', { name }),
      type: 'confirm',
      onConfirmAction: async () => {
        try {
          await updateDoc(doc(db, 'users', userId), {
            isDeleted: false,
            isDisabled: false,
            isApproved: true,
          });
          await fetchStudents();
        } catch (error) {
          console.error('Error restoring student:', error);
        }
      },
    });
  };

  const handleDeleteForever = (userId, name) => {
    setModal({
      isOpen: true,
      title: t('adminStudents.deleteForeverTitle'),
      message: t('adminStudents.deleteForeverMessage', { name }),
      type: 'confirm',
      onConfirmAction: async () => {
        try {
          await deleteDoc(doc(db, 'users', userId));
          await fetchStudents();
        } catch (error) {
          console.error('Error permanently deleting student:', error);
        }
      },
    });
  };

  const handleOpenEdit = (student) => {
    setEditingStudent(student);
    setEditForm({
      age: student.age ?? '',
      belt: student.belt || 'yellow',
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', editingStudent.id), {
        age: editForm.age === '' ? null : Number(editForm.age),
        belt: editForm.belt,
      });
      await fetchStudents();
      setEditingStudent(null);
    } catch (error) {
      console.error('Error updating student:', error);
      setModal({
        isOpen: true, title: t('common.error'),
        message: t('adminStudents.failedUpdate'),
        type: 'info', onConfirmAction: null,
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------- ADD STUDENT HANDLERS ----------
  const handleOpenAdd = () => {
    setAddForm({
      name: '',
      email: '',
      password: '',
      birthDate: '',
      belt: 'yellow',
      joinedDate: TODAY_ISO,
    });
    setAddMsg({ type: '', text: '' });
    setAddSuccess(null);
    setShowAddPassword(false);
    setCopiedCreds(false);
    setAddModalOpen(true);
  };

  const handleCloseAdd = () => {
    if (adding) return;
    setAddModalOpen(false);
    setAddSuccess(null);
    setAddMsg({ type: '', text: '' });
    setCopiedCreds(false);
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (adding) return;

    const { name, email, password, birthDate, belt, joinedDate } = addForm;

    // Client-side validation
    if (!name.trim()) return setAddMsg({ type: 'error', text: t('adminStudents.errNameRequired') });
    if (!email.trim()) return setAddMsg({ type: 'error', text: t('adminStudents.errEmailRequired') });
    if (!password || password.length < 8) {
      return setAddMsg({ type: 'error', text: t('adminStudents.errPasswordLength') });
    }
    if (!birthDate) return setAddMsg({ type: 'error', text: t('adminStudents.errBirthDateRequired') });

    const age = calcAgeFromBirthDate(birthDate);
    if (age === null || age < 5) {
      return setAddMsg({ type: 'error', text: t('adminStudents.errBirthDateInvalid') });
    }
    if (joinedDate && joinedDate > TODAY_ISO) {
      return setAddMsg({ type: 'error', text: t('adminStudents.errJoinedFuture') });
    }

    setAdding(true);
    setAddMsg({ type: '', text: '' });

    let secondaryApp = null;
    try {
      // 1. Create the Auth user in a *secondary* app so the admin's
      //    own session is never touched.
      const mainApp = getApp();
      secondaryApp = initializeApp(
        mainApp.options,
        `admin-create-user-${Date.now()}`
      );
      const secondaryAuth = getAuth(secondaryApp);

      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email.trim(),
        password
      );
      const newUser = cred.user;

      // 2. Write the Firestore profile using the MAIN app's db
      await setDoc(doc(db, 'users', newUser.uid), {
        name: name.trim(),
        email: email.trim(),
        age,
        birthDate,
        joinedDate: joinedDate || TODAY_ISO,
        role: 'student',
        belt,
        isApproved: true,
        emailVerified: true,
        adminVerified: true,
        createdAt: new Date(),
      });

      // 3. Clean up the secondary auth session
      try { await firebaseSignOut(secondaryAuth); } catch (_) { /* ignore */ }

      // 4. Show success with credentials
      setAddSuccess({ email: email.trim(), password });
      await fetchStudents();
    } catch (err) {
      console.error('Failed to create student:', err);
      let msg = t('adminStudents.errCreateGeneric');
      if (err.code === 'auth/email-already-in-use') {
        msg = t('adminStudents.errEmailInUse');
      } else if (err.code === 'auth/invalid-email') {
        msg = t('adminStudents.errInvalidEmail');
      } else if (err.code === 'auth/weak-password') {
        msg = t('adminStudents.errWeakPassword');
      } else if (err.code === 'permission-denied') {
        msg = t('adminStudents.errPermissionDenied');
      }
      setAddMsg({ type: 'error', text: msg });
    } finally {
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); } catch (_) { /* ignore */ }
      }
      setAdding(false);
    }
  };

  const handleCopyCreds = async () => {
    if (!addSuccess) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${addSuccess.email}\nPassword: ${addSuccess.password}`
      );
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2000);
    } catch (_) { /* ignore */ }
  };

  if (loading) return <Loading text={t('adminStudents.loading')} />;

  // ---------- EDIT SUB-PAGE ----------
  if (editingStudent) {
    return (
      <div className={styles.pageRoot}>
        <button onClick={() => setEditingStudent(null)} className={styles.backButton}>
          {t('adminStudents.backToStudents')}
        </button>

        <div className={styles.formPageCard}>
          <div className={styles.formPageHeader}>
            <h1>{t('adminStudents.editStudent')}</h1>
            <p>{editingStudent.name} — {editingStudent.email}</p>
          </div>

          <form onSubmit={handleSaveEdit}>
            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label>{t('adminStudents.age')}</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.age}
                  onChange={e => setEditForm({ ...editForm, age: e.target.value })}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>{t('adminStudents.belt')}</label>
                <select
                  className={styles.select}
                  value={editForm.belt}
                  onChange={e => setEditForm({ ...editForm, belt: e.target.value })}
                >
                  {BELT_OPTIONS.map(b => (
                    <option key={b.value} value={b.value}>{getBeltLabel(b.value)}</option>
                  ))}
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label>{t('adminStudents.experienceAuto')}</label>
                <input
                  type="text"
                  value={getExperienceLabel(editForm.belt)}
                  disabled
                  style={{
                    background: '#f4f1ea',
                    cursor: 'not-allowed',
                    color: 'var(--color-sumi-light)',
                  }}
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="submit" className={styles.actionBtn} disabled={saving}>
                <Save size={18} strokeWidth={2} />
                {saving ? t('adminStudents.saving') : t('adminStudents.saveChanges')}
              </button>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className={styles.cancelBtn}
              >
                <X size={18} strokeWidth={2} />
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ---------- ROW RENDERER ----------
  const renderRow = (student, { isDeletedView = false } = {}) => {
    const gridStyle = { gridTemplateColumns: '1.2fr 1.8fr 0.8fr 0.5fr 1fr 2fr' };

    return (
      <div key={student.id} className={styles.adminListItem} style={gridStyle}>
        <button
          type="button"
          onClick={() => setViewingStudent(student)}
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
          title={t('adminStudents.viewProfileTitle')}
        >
          {student.name}
        </button>
        <div>{student.email}</div>
        <div>
          {student.belt === 'dan1'
            ? t('belts.short.dan1')
            : getBeltLabel(student.belt || 'yellow')}
        </div>
        <div>{student.age || '—'}</div>
        <div>{getExperienceLabel(student.belt)}</div>
        <div>
          <div className={styles.actionsCell}>
            {isDeletedView ? (
              <>
                <button
                  onClick={() => handleRestore(student.id, student.name)}
                  className={styles.editBtn}
                >
                  <RotateCcw size={14} strokeWidth={2} />
                  {t('adminStudents.restore')}
                </button>
                <button
                  onClick={() => handleDeleteForever(student.id, student.name)}
                  className={styles.deleteBtn}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  {t('adminStudents.deleteForever')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setViewingStudent(student)}
                  className={styles.viewProfileBtn}
                  title={t('adminStudents.viewProfileTitle')}
                >
                  <Eye size={14} strokeWidth={2} />
                  {t('adminStudents.view')}
                </button>
                <button
                  onClick={() => handleOpenEdit(student)}
                  className={styles.editBtn}
                >
                  <EditIcon size={14} strokeWidth={2} />
                  {t('adminStudents.edit')}
                </button>
                <button
                  onClick={() => handleDelete(student.id, student.name)}
                  className={styles.deleteBtn}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  {t('adminStudents.trash')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---------- LIST VIEW ----------
  const isApprovedView = activeSection === 'approved';
  const isUnverifiedView = activeSection === 'unverified';
  const isDeletedApprovedView = activeSection === 'deleted_approved';
  const isDeletedUnverifiedView = activeSection === 'deleted_unverified';
  const isDeletedView = isDeletedApprovedView || isDeletedUnverifiedView;

  let currentRows = [];
  let totalInSection = 0;
  let emptySectionKey = 'adminStudents.emptyApproved';

  if (isApprovedView) {
    currentRows = displayedApproved;
    totalInSection = approvedStudents.length;
    emptySectionKey = 'adminStudents.emptyApproved';
  } else if (isUnverifiedView) {
    currentRows = displayedUnverified;
    totalInSection = unverifiedStudents.length;
    emptySectionKey = 'adminStudents.emptyUnverified';
  } else if (isDeletedApprovedView) {
    currentRows = displayedDeletedApproved;
    totalInSection = deletedApproved.length;
    emptySectionKey = 'adminStudents.emptyDeletedApproved';
  } else if (isDeletedUnverifiedView) {
    currentRows = displayedDeletedUnverified;
    totalInSection = deletedUnverified.length;
    emptySectionKey = 'adminStudents.emptyDeletedUnverified';
  }

  const gridStyle = { gridTemplateColumns: '1.2fr 1.8fr 0.8fr 0.5fr 1fr 2fr' };
  const agePreview = calcAgeFromBirthDate(addForm.birthDate);

  return (
    <div className={styles.pageRoot}>
      {/* Header + Add Student button */}
      <div className={styles.headerWithButton}>
        <h1
          className={styles.pageHeading}
          style={{
            color: 'var(--color-bengara)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: 0,
          }}
        >
          <Users size={32} strokeWidth={2} className={styles.headingIcon} />
          {t('adminStudents.heading')}
        </h1>
        <button
          type="button"
          className={styles.addItemBtn}
          onClick={handleOpenAdd}
        >
          <UserPlus size={18} strokeWidth={2} />
          {t('adminStudents.addStudent')}
        </button>
      </div>

      {/* Section switcher (Tabs) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className={`${isApprovedView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
            onClick={() => setActiveSection('approved')}
          >
            <UserCheck size={16} strokeWidth={2} />
            {t('adminStudents.tabApproved', { count: approvedStudents.length })}
          </button>
          <button
            className={`${isUnverifiedView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
            onClick={() => setActiveSection('unverified')}
          >
            <MailWarning size={16} strokeWidth={2} />
            {t('adminStudents.tabUnverified', { count: unverifiedStudents.length })}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className={`${isDeletedApprovedView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
            onClick={() => setActiveSection('deleted_approved')}
          >
            <Trash2 size={16} strokeWidth={2} />
            {t('adminStudents.tabDeletedApproved', { count: deletedApproved.length })}
          </button>
          <button
            className={`${isDeletedUnverifiedView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
            onClick={() => setActiveSection('deleted_unverified')}
          >
            <UserX size={16} strokeWidth={2} />
            {t('adminStudents.tabDeletedUnverified', { count: deletedUnverified.length })}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label>{t('adminStudents.searchByName')}</label>
          <input
            type="text"
            className={styles.filterInput}
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder={t('adminStudents.searchPlaceholder')}
          />
        </div>
        <div className={styles.filterGroup}>
          <label>{t('adminStudents.belt')}</label>
          <select
            className={styles.filterSelect}
            value={beltFilter}
            onChange={e => setBeltFilter(e.target.value)}
          >
            <option value="all">{t('adminStudents.allBelts')}</option>
            {BELT_OPTIONS.map(b => (
              <option key={b.value} value={b.value}>{getBeltLabel(b.value)}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>{t('adminStudents.experience')}</label>
          <select
            className={styles.filterSelect}
            value={experienceFilter}
            onChange={e => setExperienceFilter(e.target.value)}
          >
            <option value="all">{t('adminStudents.allLevels')}</option>
            {EXPERIENCE_OPTIONS.map(exp => (
              <option key={exp} value={exp}>
                {t(`experience.${EXPERIENCE_KEY_MAP[exp] || 'beginner'}`)}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters && (
          <button onClick={clearFilters} className={styles.clearFiltersBtn}>
            <X size={14} strokeWidth={2} />
            {t('adminStudents.clearFilters')}
          </button>
        )}
      </div>

      {/* Banners */}
      {isApprovedView && pendingApprovalCount > 0 && (
        <div style={{
          padding: '12px 16px',
          background: '#e3f2fd',
          borderLeft: '4px solid #3498db',
          borderRadius: '4px',
          marginBottom: '14px',
          color: '#1a5f8a',
          fontSize: '0.9rem',
        }}>
          {t('adminStudents.pendingBanner', { count: pendingApprovalCount })}{' '}
          <Link to="/admin/approvals" style={{ color: '#1a5f8a', fontWeight: 'bold' }}>
            {t('adminStudents.pendingBannerLink')}
          </Link>
        </div>
      )}

      {isUnverifiedView && (
        <div style={{
          padding: '12px 16px',
          background: '#fff3cd',
          borderLeft: '4px solid #f39c12',
          borderRadius: '4px',
          marginBottom: '14px',
          color: '#856404',
          fontSize: '0.9rem',
        }}>
          {t('adminStudents.unverifiedBanner')}
        </div>
      )}

      {isDeletedView && (
        <div style={{
          padding: '12px 16px',
          background: '#fdecea',
          borderLeft: '4px solid #e74c3c',
          borderRadius: '4px',
          marginBottom: '14px',
          color: '#8a1f17',
          fontSize: '0.9rem',
        }}>
          <Trans
            i18nKey="adminStudents.deletedBanner"
            components={{ strong: <strong /> }}
          />
        </div>
      )}

      {currentRows.length === 0 ? (
        <div className={styles.emptyState}>
          {totalInSection === 0
            ? t(emptySectionKey)
            : t('adminStudents.noMatches')}
        </div>
      ) : (
        <div className={styles.scrollContainer}>
          <div className={styles.adminList}>
            <div className={styles.adminListHeader} style={gridStyle}>
              <div>{t('adminStudents.colName')}</div>
              <div>{t('adminStudents.colEmail')}</div>
              <div>{t('adminStudents.colBelt')}</div>
              <div>{t('adminStudents.colAge')}</div>
              <div>{t('adminStudents.colExperience')}</div>
              <div>{t('adminStudents.colActions')}</div>
            </div>
            {currentRows.map(s => renderRow(s, { isDeletedView }))}
          </div>
        </div>
      )}

      {/* ── ADD STUDENT MODAL ── */}
      {addModalOpen && createPortal(
        <div className={styles.addModalOverlay} onClick={handleCloseAdd}>
          <div
            className={styles.addModalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.addModalHeader}>
              <h2 className={styles.addModalTitle}>
                <UserPlus size={22} strokeWidth={2} />
                {addSuccess
                  ? t('adminStudents.addModalTitleSuccess')
                  : t('adminStudents.addModalTitle')}
              </h2>
              <button
                type="button"
                className={styles.addModalClose}
                onClick={handleCloseAdd}
                disabled={adding}
                aria-label={t('common.close')}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className={styles.addModalBody}>
              {addMsg.text && !addSuccess && (
                <div className={styles.addErrorMsg}>{addMsg.text}</div>
              )}

              {addSuccess ? (
                <div className={styles.addSuccessView}>
                  <div className={styles.addSuccessIcon}>
                    <CheckCircle2 size={40} strokeWidth={1.8} />
                  </div>
                  <h3 className={styles.addSuccessTitle}>{t('adminStudents.accountCreated')}</h3>
                  <p className={styles.addSuccessText}>
                    {t('adminStudents.accountCreatedSub')}
                  </p>

                  <div className={styles.addCredentials}>
                    <div className={styles.addCredentialRow}>
                      <span className={styles.addCredentialLabel}>{t('adminStudents.credEmail')}</span>
                      <span className={styles.addCredentialValue}>{addSuccess.email}</span>
                    </div>
                    <div className={styles.addCredentialRow}>
                      <span className={styles.addCredentialLabel}>{t('adminStudents.credPassword')}</span>
                      <span className={styles.addCredentialValue}>{addSuccess.password}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`${styles.addModalBtn} ${styles.addModalBtnSecondary}`}
                    onClick={handleCopyCreds}
                    style={{ marginBottom: 16 }}
                  >
                    {copiedCreds ? t('adminStudents.copied') : t('adminStudents.copyCredentials')}
                  </button>

                  <div className={styles.addSuccessHint}>
                    <Trans
                      i18nKey="adminStudents.addSuccessHint"
                      components={{ strong: <strong /> }}
                    />
                  </div>
                </div>
              ) : (
                <form id="add-student-form" onSubmit={handleAddStudent}>
                  <div className={styles.addFormGrid}>
                    <div className={`${styles.addInputGroup} ${styles.addFormFull}`}>
                      <label>{t('adminStudents.fullName')}</label>
                      <div className={styles.addInputWrap}>
                        <Users size={16} strokeWidth={2} className={styles.addInputIcon} />
                        <input
                          type="text"
                          className={styles.addInput}
                          value={addForm.name}
                          onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                          placeholder={t('adminStudents.fullNamePlaceholder')}
                          required
                          disabled={adding}
                        />
                      </div>
                    </div>

                    <div className={styles.addInputGroup}>
                      <label>{t('adminStudents.emailLabel')}</label>
                      <div className={styles.addInputWrap}>
                        <Mail size={16} strokeWidth={2} className={styles.addInputIcon} />
                        <input
                          type="email"
                          className={styles.addInput}
                          value={addForm.email}
                          onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                          placeholder={t('adminStudents.emailPlaceholder')}
                          required
                          disabled={adding}
                        />
                      </div>
                    </div>

                    <div className={styles.addInputGroup}>
                      <label>{t('adminStudents.tempPassword')}</label>
                      <div className={styles.addInputWrap}>
                        <Lock size={16} strokeWidth={2} className={styles.addInputIcon} />
                        <input
                          type={showAddPassword ? 'text' : 'password'}
                          className={`${styles.addInput} ${styles.addInputWithToggle}`}
                          value={addForm.password}
                          onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                          placeholder={t('adminStudents.tempPasswordPlaceholder')}
                          required
                          minLength={8}
                          disabled={adding}
                        />
                        <button
                          type="button"
                          className={styles.addPwToggle}
                          onClick={() => setShowAddPassword(v => !v)}
                          aria-label={showAddPassword
                            ? t('adminStudents.hidePassword')
                            : t('adminStudents.showPassword')}
                          tabIndex={-1}
                        >
                          {showAddPassword
                            ? <EyeOff size={14} strokeWidth={2} />
                            : <Eye size={14} strokeWidth={2} />}
                        </button>
                      </div>
                      <small className={styles.addHelper}>{t('adminStudents.tempPasswordHelper')}</small>
                    </div>

                    <div className={styles.addInputGroup}>
                      <label>{t('adminStudents.birthDate')}</label>
                      <div className={styles.addInputWrap}>
                        <Calendar size={16} strokeWidth={2} className={styles.addInputIcon} />
                        <input
                          type="date"
                          className={styles.addInput}
                          value={addForm.birthDate}
                          onChange={(e) => setAddForm({ ...addForm, birthDate: e.target.value })}
                          max={TODAY_ISO}
                          required
                          disabled={adding}
                        />
                      </div>
                      {agePreview !== null ? (
                        <small className={styles.addHelper}>
                          <Trans
                            i18nKey="adminStudents.agePreview"
                            values={{ age: agePreview }}
                            components={{ strong: <strong /> }}
                          />
                        </small>
                      ) : addForm.birthDate ? (
                        <small className={styles.addHelper} style={{ color: '#c0392b' }}>
                          {t('adminStudents.birthDateInvalid')}
                        </small>
                      ) : (
                        <small className={styles.addHelper}>
                          {t('adminStudents.birthDateMinAge')}
                        </small>
                      )}
                    </div>

                    <div className={styles.addInputGroup}>
                      <label>{t('adminStudents.startingBelt')}</label>
                      <select
                        className={styles.addInput}
                        value={addForm.belt}
                        onChange={(e) => setAddForm({ ...addForm, belt: e.target.value })}
                        disabled={adding}
                        style={{ paddingLeft: 12 }}
                      >
                        {BELT_OPTIONS.filter(b => b.value !== 'dan1').map(b => (
                          <option key={b.value} value={b.value}>{getBeltLabel(b.value)}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.addInputGroup}>
                      <label>{t('adminStudents.joinedDate')}</label>
                      <div className={styles.addInputWrap}>
                        <Calendar size={16} strokeWidth={2} className={styles.addInputIcon} />
                        <input
                          type="date"
                          className={styles.addInput}
                          value={addForm.joinedDate}
                          onChange={(e) => setAddForm({ ...addForm, joinedDate: e.target.value })}
                          max={TODAY_ISO}
                          disabled={adding}
                        />
                      </div>
                      <small className={styles.addHelper}>{t('adminStudents.joinedDateHelper')}</small>
                    </div>
                  </div>
                </form>
              )}
            </div>

            <div className={styles.addModalFooter}>
              {addSuccess ? (
                <button
                  type="button"
                  className={`${styles.addModalBtn} ${styles.addModalBtnPrimary}`}
                  onClick={handleCloseAdd}
                >
                  <CheckCircle2 size={16} strokeWidth={2} />
                  {t('adminStudents.done')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`${styles.addModalBtn} ${styles.addModalBtnSecondary}`}
                    onClick={handleCloseAdd}
                    disabled={adding}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    form="add-student-form"
                    className={`${styles.addModalBtn} ${styles.addModalBtnPrimary}`}
                    disabled={adding}
                  >
                    <UserPlus size={16} strokeWidth={2} />
                    {adding ? t('adminStudents.creating') : t('adminStudents.createStudent')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={() => {
          if (modal.onConfirmAction) modal.onConfirmAction();
          setModal(p => ({ ...p, isOpen: false }));
        }}
        onCancel={() => setModal(p => ({ ...p, isOpen: false }))}
      />
      <StudentProfileModal
        isOpen={!!viewingStudent}
        student={viewingStudent}
        onClose={() => setViewingStudent(null)}
        footer={
          viewingStudent && (
            <>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setViewingStudent(null)}
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => {
                  const s = viewingStudent;
                  setViewingStudent(null);
                  handleOpenEdit(s);
                }}
              >
                <EditIcon size={14} strokeWidth={2} />
                {t('adminStudents.editStudent')}
              </button>
            </>
          )
        }
      />
    </div>
  );
}