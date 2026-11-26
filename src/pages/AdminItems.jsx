// src/pages/AdminItems.jsx
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import {
  collection, addDoc, getDocs, doc, updateDoc, query, where, writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft, Plus, Edit as EditIcon, Trash2, Palette, Save, GripVertical, BookOpen,
  MoreVertical, Zap, Search, X,
} from 'lucide-react';
import styles from './Admin.module.css';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
import ImageUploader from '../components/ImageUploader';
import { BELT_OPTIONS, BELT_RANK, BELT_COLORS, getBeltLabel } from '../utils/experience';
import { createPortal } from 'react-dom';

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// English belt labels here are ONLY used for the initial letter shown inside
// the radial circles (a purely visual marker on colored backgrounds).
// The translated label is used for the tooltip/aria-label below.
const QUICK_EDIT_BELTS = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'orange', label: 'Orange' },
  { id: 'green',  label: 'Green'  },
  { id: 'blue',   label: 'Blue'   },
  { id: 'brown',  label: 'Brown'  },
  { id: 'black',  label: 'Black'  },
];

// Duration must match the longest transition on .radialCircle
const RADIAL_CLOSE_MS = 400;

function beltTextColor(belt) {
  return belt === 'yellow' ? '#333' : '#fff';
}

// --- SORTABLE ROW ---
function SortableItemRow({
  item, categoryId, onEdit, onDelete, onDesign, onQuickEdit,
  isOrderChanged, isDraggingDisabled,
  menuOpen, onMenuToggle, onMenuClose,
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition,
  } = useSortable({ id: item.id, disabled: isDraggingDisabled });

  const baseStyle = { transform: CSS.Transform.toString(transform), transition };
  const belt = item.minimumGrade || 'yellow';
  const beltColor = BELT_COLORS[belt] || '#ccc';

  const style = {
    ...baseStyle,
    position: 'relative',
    zIndex: menuOpen ? 30 : 'auto',
    borderLeftColor: beltColor,
    borderBottom: `4px solid ${beltColor}`,
  };

  const handleRowClick = () => {
    if (isOrderChanged) return;
    navigate(`/syllabus/${categoryId}/${item.id}`, { state: { fromAdmin: true } });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.itemCardRow} ${isDraggingDisabled ? styles.disabledDrag : ''}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={styles.dragHandle}
          style={{ cursor: isDraggingDisabled ? 'not-allowed' : 'grab' }}
          title={isDraggingDisabled
            ? t('adminItems.dragDisabledHint')
            : t('adminItems.dragReorder')}
        >
          <GripVertical size={18} strokeWidth={2} />
        </span>
        <div
          onClick={handleRowClick}
          style={{ cursor: isOrderChanged ? 'not-allowed' : 'pointer', flex: 1 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1.2rem' }}>
              {item.order}. {item.names?.ja}
            </strong>
            <span style={{ color: 'gray' }}>({item.names?.en})</span>
            <span
              className={styles.beltChip}
              style={{ backgroundColor: beltColor, color: beltTextColor(belt) }}
            >
              {getBeltLabel(belt)}
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-sumi-light)', marginTop: 4 }}>
            {item.subGroup
              ? t('adminItems.subGroupLabel', { name: item.subGroup })
              : t('adminItems.noSubGroup')}
          </div>
        </div>
      </div>

      <div
        data-menu-container={item.id}
        style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}
      >
        <button
          onClick={(e) => onQuickEdit(e, item)}
          className={styles.quickEditBtn}
          disabled={isOrderChanged}
          title={t('adminItems.quickEditTitle')}
        >
          <Zap size={14} strokeWidth={2} /> {t('adminItems.quickEdit')}
        </button>

        <button
          onClick={() => onEdit(item)}
          className={styles.editRowBtn}
          disabled={isOrderChanged}
          title={t('adminItems.editTitle')}
        >
          <EditIcon size={14} strokeWidth={2} /> {t('adminItems.edit')}
        </button>

        <button
          onClick={() => onMenuToggle(item.id)}
          className={styles.menuBtn}
          disabled={isOrderChanged}
          title={t('adminItems.moreActions')}
          aria-label={t('adminItems.moreActions')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreVertical size={18} strokeWidth={2} />
        </button>

        {menuOpen && (
          <div className={styles.rowMenu} role="menu">
            <button
              onClick={() => { onDesign(item); onMenuClose(); }}
              className={styles.rowMenuItem}
              role="menuitem"
            >
              <Palette size={14} strokeWidth={2} /> {t('adminItems.design')}
            </button>
            <button
              onClick={() => { onDelete(item.id); onMenuClose(); }}
              className={`${styles.rowMenuItem} ${styles.rowMenuItemDanger}`}
              role="menuitem"
            >
              <Trash2 size={14} strokeWidth={2} /> {t('adminItems.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- QUICK EDIT RADIAL MENU ---
function QuickEditRadial({ rect, currentBelt, onSelect, onClose }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Start the collapse animation, then unmount once it finishes
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, RADIAL_CLOSE_MS);
  };

  const handleSelectBelt = (belt) => {
    if (closing) return;
    onSelect(belt);      // parent writes to Firestore (fire-and-forget)
    handleClose();       // animate out + unmount
  };

  const circleRadius = 23;
  const padding = 10;
  const ringRadius = 72;

  const baseCx = rect.left + rect.width / 2;
  const baseCy = rect.top + rect.height / 2;

  let ringCx = baseCx;
  let ringCy = baseCy;

  if (ringCx + ringRadius + circleRadius + padding > window.innerWidth) {
    ringCx = window.innerWidth - ringRadius - circleRadius - padding;
  }
  if (ringCx - ringRadius - circleRadius - padding < 0) {
    ringCx = ringRadius + circleRadius + padding;
  }
  if (ringCy + ringRadius + circleRadius + padding > window.innerHeight) {
    ringCy = window.innerHeight - ringRadius - circleRadius - padding;
  }
  if (ringCy - ringRadius - circleRadius - padding < 0) {
    ringCy = ringRadius + circleRadius + padding;
  }

  return createPortal(
    <div
      className={`${styles.radialOverlay} ${closing ? styles.radialOverlayClosing : ''}`}
      onClick={handleClose}
    >
      {QUICK_EDIT_BELTS.map((belt, i) => {
        const angle = (Math.PI * 2 * i) / QUICK_EDIT_BELTS.length - Math.PI / 2;
        const x = Math.cos(angle) * ringRadius;
        const y = Math.sin(angle) * ringRadius;
        const isCurrent = belt.id === currentBelt;
        const bgColor = BELT_COLORS[belt.id] || '#ccc';
        const beltName = t(`belts.short.${belt.id}`);

        const isOpen = mounted && !closing;

        return (
          <button
            key={belt.id}
            className={
              `${styles.radialCircle} ${isOpen ? styles.radialCircleOpen : ''}` +
              (isCurrent ? ` ${styles.radialCircleCurrent}` : '')
            }
            style={{
              left: `${ringCx}px`,
              top: `${ringCy}px`,
              '--x': `${x}px`,
              '--y': `${y}px`,
              '--belt-color': bgColor,
              color: beltTextColor(belt.id),
              // Stagger on open; collapse together on close
              transitionDelay: closing ? '0ms' : `${i * 35}ms`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectBelt(belt.id);
            }}
            title={isCurrent
              ? t('adminItems.currentBeltTooltip', { belt: beltName })
              : t('adminItems.setToBeltTooltip', { belt: beltName })}
            aria-label={t('adminItems.setToBeltAria', { belt: beltName })}
          >
            {belt.label.charAt(0)}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

// --- MAIN PAGE ---
export default function AdminItems() {
  const { t } = useTranslation();
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [categoryName, setCategoryName] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOrderChanged, setIsOrderChanged] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [quickEdit, setQuickEdit] = useState(null);

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');

  const [subGroup, setSubGroup] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [grade, setGrade] = useState('yellow');
  const [attack, setAttack] = useState('');
  const [defense, setDefense] = useState('');
  const [videoId, setVideoId] = useState('');
  const [images, setImages] = useState([]);
  const [descEn, setDescEn] = useState('');
  const [descFr, setDescFr] = useState('');
  const [descAr, setDescAr] = useState('');

  const [alertModal, setAlertModal] = useState({
    isOpen: false, title: '', message: '', type: 'info', onConfirmAction: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchData = async () => {
    try {
      const catSnap = await getDocs(collection(db, 'categories'));
      catSnap.forEach((d) => {
        if (d.id === categoryId) setCategoryName(d.data().names?.en);
      });

      const q = query(collection(db, 'items'), where('categoryId', '==', categoryId));
      const snap = await getDocs(q);
      const fetched = [];
      snap.forEach((d) => fetched.push({ id: d.id, ...d.data() }));
      fetched.sort((a, b) => (a.order || 0) - (b.order || 0));
      setItems(fetched);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [categoryId]);

  useEffect(() => {
    if (!openMenuId) return;
    const handle = (e) => {
      if (!e.target.closest(`[data-menu-container="${openMenuId}"]`)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [openMenuId]);

  useEffect(() => {
    const handle = (e) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
        // QuickEdit handles its own close via its own Escape handling —
        // but we still trigger it defensively
        setQuickEdit(null);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  useEffect(() => {
    if (isOrderChanged) {
      setOpenMenuId(null);
      setQuickEdit(null);
    }
  }, [isOrderChanged]);

  const showAlert = (title, message) =>
    setAlertModal({ isOpen: true, title, message, type: 'info', onConfirmAction: null });
  const showConfirm = (title, message, action) =>
    setAlertModal({ isOpen: true, title, message, type: 'confirm', onConfirmAction: action });
  const handleModalConfirm = () => {
    if (alertModal.onConfirmAction) alertModal.onConfirmAction();
    setAlertModal((p) => ({ ...p, isOpen: false }));
  };

  const extractYouTubeId = (input) => {
    if (!input) return '';
    const re = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const m = input.match(re);
    return m && m[2].length === 11 ? m[2] : input;
  };

  const resetForm = () => {
    setEditingId(null);
    setSubGroup(''); setNameJa(''); setNameEn(''); setNameFr(''); setNameAr('');
    setAttack(''); setDefense(''); setVideoId(''); setImages([]);
    setDescEn(''); setDescFr(''); setDescAr('');
    setGrade('yellow');
  };

  const openFormModal = (item = null) => {
    if (item) {
      setEditingId(item.id);
      setSubGroup(item.subGroup || '');
      setNameJa(item.names?.ja || '');
      setNameEn(item.names?.en || '');
      setNameFr(item.names?.fr || '');
      setNameAr(item.names?.ar || '');
      setGrade(item.minimumGrade || 'yellow');
      setAttack(item.attack || '');
      setDefense(item.defense || '');
      setVideoId(item.videoId || '');
      setImages(
        item.images?.length ? item.images
          : item.imageUrl ? [{ url: item.imageUrl }] : []
      );
      setDescEn(item.description?.en || '');
      setDescFr(item.description?.fr || '');
      setDescAr(item.description?.ar || '');
    } else {
      resetForm();
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!nameJa) return showAlert(t('adminItems.missingFieldTitle'), t('adminItems.missingJpName'));

    try {
      const cleanVideoId = extractYouTubeId(videoId);
      const dataToSave = {
        categoryId,
        subGroup,
        names: { ja: nameJa, en: nameEn, fr: nameFr, ar: nameAr },
        minimumGrade: grade,
        attack,
        defense,
        videoId: cleanVideoId,
        images,
        description: { en: descEn, fr: descFr, ar: descAr },
      };

      if (editingId) {
        await updateDoc(doc(db, 'items', editingId), dataToSave);
        showAlert(t('adminItems.successTitle'), t('adminItems.techniqueUpdated'));
      } else {
        const newOrder = items.length > 0
          ? Math.max(...items.map((i) => i.order || 0)) + 1
          : 1;
        const newItemRef = await addDoc(collection(db, 'items'), {
          ...dataToSave,
          order: newOrder,
        });

        try {
          const itemGradeRank = BELT_RANK[grade] || 1;
          const studentsSnap = await getDocs(
            query(collection(db, 'users'), where('role', '==', 'student'))
          );
          const eligible = studentsSnap.docs.filter(d => {
            const s = d.data();
            if (s.isDisabled || !s.isApproved || s.emailVerified === false) return false;
            return (BELT_RANK[s.belt || 'yellow'] || 1) >= itemGradeRank;
          });

          if (eligible.length > 0) {
            // English fallback + translation metadata (see adminAuthNotifications.js)
            const notifTitle = 'New Technique Available';
            const notifTitleKey = 'notifications.newTechnique.title';
            const hasEn = !!nameEn;
            const notifMessage = `A new technique "${nameJa}"${hasEn ? ` (${nameEn})` : ''} is now available in your syllabus.`;
            const notifMessageKey = hasEn
              ? 'notifications.newTechnique.messageWithEn'
              : 'notifications.newTechnique.message';
            const notifMessageParams = hasEn
              ? { ja: nameJa, en: nameEn }
              : { ja: nameJa };

            const notifBatch = writeBatch(db);
            eligible.forEach(s => {
              const notifRef = doc(collection(db, 'notifications'));
              notifBatch.set(notifRef, {
                userId: s.id,
                type: 'new_technique',
                title: notifTitle,
                message: notifMessage,
                titleKey: notifTitleKey,
                messageKey: notifMessageKey,
                messageParams: notifMessageParams,
                read: false,
                createdAt: new Date(),
                itemId: newItemRef.id,
                categoryId,
              });
            });
            await notifBatch.commit();
          }
        } catch (notifErr) {
          console.error('Failed to create notifications:', notifErr);
        }

        showAlert(t('adminItems.successTitle'), t('adminItems.techniqueAdded'));
      }

      closeForm();
      fetchData();
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('adminItems.failedSaveTechnique'));
    }
  };

  const handleDelete = (id) => {
    showConfirm(
      t('adminItems.deleteConfirmTitle'),
      t('adminItems.deleteConfirmMessage'),
      async () => {
        try {
          const deleted = items.find((i) => i.id === id);
          if (!deleted) return;

          const batch = writeBatch(db);
          batch.delete(doc(db, 'items', id));
          items.forEach((it) => {
            if (it.order > deleted.order) {
              batch.update(doc(db, 'items', it.id), { order: it.order - 1 });
            }
          });
          await batch.commit();
          fetchData();
        } catch (err) {
          console.error(err);
        }
      }
    );
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((curr) => {
      const oldIndex = curr.findIndex((i) => i.id === active.id);
      const newIndex = curr.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return curr;
      const next = arrayMove(curr, oldIndex, newIndex);
      setIsOrderChanged(true);
      return next.map((it, i) => ({ ...it, order: i + 1 }));
    });
  };

  const saveNewOrder = async () => {
    try {
      const batch = writeBatch(db);
      items.forEach((it) => batch.update(doc(db, 'items', it.id), { order: it.order }));
      await batch.commit();
      setIsOrderChanged(false);
      showAlert(t('adminItems.successTitle'), t('adminItems.orderSaved'));
    } catch (err) {
      showAlert(t('common.error'), t('adminItems.orderSaveFailed'));
    }
  };

  const handleDesign = (item) => {
    navigate(`/admin/items/${categoryId}/${item.id}/design`);
  };

  const openQuickEdit = (e, item) => {
    if (isOrderChanged) return;
    if (quickEdit?.itemId === item.id) {
      // Toggle-close: let the radial animate out gracefully.
      // (This is defensive — the overlay usually intercepts the click first.)
      setQuickEdit(null);
      return;
    }
    setOpenMenuId(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setQuickEdit({
      itemId: item.id,
      rect,
      currentBelt: item.minimumGrade || 'yellow',
    });
  };

  const handleQuickEditSelect = async (belt) => {
    if (!quickEdit) return;
    const { itemId } = quickEdit;
    try {
      await updateDoc(doc(db, 'items', itemId), { minimumGrade: belt });
      setItems(prev => prev.map(it =>
        it.id === itemId ? { ...it, minimumGrade: belt } : it
      ));
      // Do NOT unmount here — the radial animates out and calls onClose itself.
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('adminItems.beltUpdateFailed'));
    }
  };

  // ── Filters ──
  const filteredItems = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return items.filter(item => {
      if (beltFilter !== 'all' && (item.minimumGrade || 'yellow') !== beltFilter) {
        return false;
      }
      if (q) {
        const ja = (item.names?.ja || '').toLowerCase();
        const en = (item.names?.en || '').toLowerCase();
        if (!ja.includes(q) && !en.includes(q)) return false;
      }
      return true;
    });
  }, [items, nameFilter, beltFilter]);

  const hasActiveFilters = !!nameFilter.trim() || beltFilter !== 'all';
  const clearFilters = () => {
    setNameFilter('');
    setBeltFilter('all');
  };

  if (loading) return <Loading text={t('adminItems.loading')} />;

  return (
    <div>
      {isFormOpen ? (
        <>
          <button onClick={closeForm} className={styles.backButton}>
            <ArrowLeft size={16} strokeWidth={2} /> {t('adminItems.backToItems')}
          </button>

          <div className={styles.formPageCard}>
            <div className={styles.formPageHeader}>
              <h1>{editingId ? t('adminItems.editTechnique') : t('adminItems.addTechnique')}</h1>
              <p>{t('adminItems.categoryLabel', { name: categoryName })}</p>
            </div>

            <form onSubmit={handleSaveItem}>
              <div className={styles.sectionTitle}>{t('adminItems.section1')}</div>
              <div className={styles.formGrid}>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.subGroupOptional')}</label>
                  <input
                    type="text"
                    value={subGroup}
                    onChange={(e) => setSubGroup(e.target.value)}
                    placeholder={t('adminItems.subGroupPlaceholder')}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.minimumGrade')}</label>
                  <select className={styles.select} value={grade} onChange={(e) => setGrade(e.target.value)}>
                    {BELT_OPTIONS.filter(b => b.value !== 'dan1').map(b => (
                      <option key={b.value} value={b.value}>{getBeltLabel(b.value)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.sectionTitle}>{t('adminItems.section2')}</div>
              <div className={styles.formGrid}>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.jpNameRequired')}</label>
                  <input type="text" value={nameJa} onChange={(e) => setNameJa(e.target.value)} required />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.enName')}</label>
                  <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.frName')}</label>
                  <input type="text" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.arName')}</label>
                  <input type="text" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
                </div>
              </div>

              <div className={styles.sectionTitle}>{t('adminItems.section3')}</div>
              <div className={styles.formGrid}>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.attack')}</label>
                  <input type="text" value={attack} onChange={(e) => setAttack(e.target.value)} />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.defense')}</label>
                  <input type="text" value={defense} onChange={(e) => setDefense(e.target.value)} />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.youtube')}</label>
                  <input type="text" value={videoId} onChange={(e) => setVideoId(e.target.value)} />
                </div>
              </div>

              <div className={styles.sectionTitle}>{t('adminItems.section4')}</div>
              <div className={styles.imageUploadBlock}>
                <ImageUploader
                  onUploadSuccess={(url) =>
                    setImages((prev) => [...prev, { url, caption: '' }])
                  }
                />
                {images.length > 0 && (
                  <div className={styles.imagePreviewGrid}>
                    {images.map((img, idx) => (
                      <div key={idx} className={styles.imagePreviewItem}>
                        <img src={img.url} alt="" />
                        <button
                          type="button"
                          onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                          title={t('adminItems.removeImage')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.sectionTitle}>{t('adminItems.section5')}</div>
              <div className={styles.formGrid}>
                <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                  <label>{t('adminItems.enNotes')}</label>
                  <textarea className={styles.textarea} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.frNotes')}</label>
                  <textarea className={styles.textarea} value={descFr} onChange={(e) => setDescFr(e.target.value)} />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminItems.arNotes')}</label>
                  <textarea className={styles.textarea} value={descAr} onChange={(e) => setDescAr(e.target.value)} dir="rtl" />
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="submit" className={styles.actionBtn}>{t('adminItems.saveTechnique')}</button>
                <button type="button" onClick={closeForm} className={styles.cancelBtn}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </>
      ) : (
        <>
          <Link
            to="/admin/manage"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-sumi-light)', textDecoration: 'none', fontWeight: 'bold' }}
          >
            <ArrowLeft size={16} strokeWidth={2} /> {t('adminItems.backToCategories')}
          </Link>

          <div className={styles.headerWithButton}>
            <h1 style={{ color: 'var(--color-bengara)', fontSize: '2.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <BookOpen size={32} strokeWidth={2} />
              {t('adminItems.pageHeading', { name: categoryName })}
            </h1>
            <button className={styles.addItemBtn} onClick={() => openFormModal()}>
              <Plus size={18} strokeWidth={2} /> {t('adminItems.addItem')}
            </button>
          </div>

          <p style={{ color: 'var(--color-sumi-light)', marginBottom: '16px', fontSize: '0.9rem' }}>
            {t('adminItems.helperText')}
          </p>

          {/* Filter bar */}
          {items.length > 0 && (
            <div className={styles.filterBar}>
              <div className={styles.filterGroup}>
                <label>{t('adminItems.searchByName')}</label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={16}
                    strokeWidth={2}
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-sumi-light)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    type="text"
                    className={styles.filterInput}
                    value={nameFilter}
                    onChange={e => setNameFilter(e.target.value)}
                    placeholder={t('adminItems.searchPlaceholder')}
                    style={{ paddingLeft: 36 }}
                  />
                </div>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('adminItems.beltLabel')}</label>
                <select
                  className={styles.filterSelect}
                  value={beltFilter}
                  onChange={e => setBeltFilter(e.target.value)}
                >
                  <option value="all">{t('adminItems.allBelts')}</option>
                  {BELT_OPTIONS.map(b => (
                    <option key={b.value} value={b.value}>{getBeltLabel(b.value)}</option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className={styles.clearFiltersBtn}>
                  <X size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  {t('adminItems.clearFilters')}
                </button>
              )}
              <div style={{
                marginLeft: 'auto',
                alignSelf: 'flex-end',
                fontSize: '0.85rem',
                color: 'var(--color-sumi-light)',
                fontWeight: 'bold',
                paddingBottom: 10,
                whiteSpace: 'nowrap',
              }}>
                {t('adminItems.filterCount', {
                  filtered: filteredItems.length,
                  total: items.length,
                })}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <div style={{
              padding: '10px 14px',
              background: '#e3f2fd',
              borderLeft: '4px solid #3498db',
              borderRadius: '4px',
              marginBottom: '14px',
              color: '#1565a7',
              fontSize: '0.85rem',
            }}>
              {t('adminItems.filterReorderWarning')}
            </div>
          )}

          <div className={styles.categoryList}>
            {items.length === 0 ? (
              <p>{t('adminItems.noItemsYet')}</p>
            ) : filteredItems.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>{t('adminItems.noMatches')}</h3>
                <p>{t('adminItems.noMatchesSub')}</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filteredItems} strategy={verticalListSortingStrategy}>
                  {filteredItems.map((item) => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      categoryId={categoryId}
                      onEdit={openFormModal}
                      onDelete={handleDelete}
                      onDesign={handleDesign}
                      onQuickEdit={openQuickEdit}
                      isOrderChanged={isOrderChanged}
                      isDraggingDisabled={hasActiveFilters}
                      menuOpen={openMenuId === item.id}
                      onMenuToggle={(id) =>
                        setOpenMenuId(prev => (prev === id ? null : id))
                      }
                      onMenuClose={() => setOpenMenuId(null)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {isOrderChanged && createPortal(
            <div className={styles.saveOrderBar}>
              <span>{t('adminItems.orderChanged')}</span>
              <button onClick={saveNewOrder} className={styles.saveOrderBtn}>
                <Save size={16} strokeWidth={2} /> {t('adminItems.saveNewOrder')}
              </button>
            </div>,
            document.body
          )}
        </>
      )}

      {quickEdit && (
        <QuickEditRadial
          key={quickEdit.itemId}
          rect={quickEdit.rect}
          currentBelt={quickEdit.currentBelt}
          onSelect={handleQuickEditSelect}
          onClose={() => setQuickEdit(null)}
        />
      )}

      <Modal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onConfirm={handleModalConfirm}
        onCancel={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
      />
    </div>
  );
}