// src/pages/AdminManage.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import {
  collection, addDoc, getDocs, doc, deleteDoc, updateDoc, writeBatch,
  query, where,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
  FolderTree, Save, Edit as EditIcon, Trash2, GripVertical,
  RotateCcw, Trash,
} from 'lucide-react';
import styles from './Admin.module.css';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
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

// --- SORTABLE CATEGORY CARD ---
function SortableCategory({ cat, onEdit, onDelete, isOrderChanged, isDraggingDisabled, onSelect }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
    id: cat.id,
    disabled: isDraggingDisabled,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style}
      className={`${styles.categoryCard} ${isDraggingDisabled ? styles.disabledDrag : ''}`}>
      <div
        className={styles.categoryNames}
        onClick={(e) => {
          if (isOrderChanged) { e.preventDefault(); e.stopPropagation(); return; }
          onSelect();
        }}
        style={{ cursor: isOrderChanged ? 'not-allowed' : 'pointer', flex: 1 }}
      >
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={styles.dragHandle}
          style={{ cursor: isDraggingDisabled ? 'not-allowed' : 'grab' }}
          onClick={(e) => e.stopPropagation()}
          title={t('adminManage.dragToReorder')}
        >
          <GripVertical size={18} strokeWidth={2} />
        </span>

        <span className={styles.mainName}>
          {cat.order}. {cat.names?.en}
        </span>

        {(cat.names?.fr || cat.names?.ar) && (
          <span className={styles.subNames}>
            {cat.names?.fr && `FR: ${cat.names.fr}`}
            {cat.names?.ar && ` | AR: ${cat.names.ar}`}
          </span>
        )}
      </div>
      <div>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(cat); }}
          className={styles.editBtn}
          disabled={isOrderChanged}
        >
          <EditIcon size={14} strokeWidth={2} /> {t('adminManage.edit')}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(cat.id); }}
          className={styles.deleteBtn}
          disabled={isOrderChanged}
        >
          <Trash2 size={14} strokeWidth={2} /> {t('adminManage.delete')}
        </button>
      </div>
    </div>
  );
}

// --- DELETED CATEGORY ROW ---
function DeletedCategory({ cat, onRestore, onDeleteForever, isBusy }) {
  const { t } = useTranslation();
  return (
    <div
      className={styles.categoryCard}
      style={{ borderLeftColor: '#e74c3c', opacity: 0.92 }}
    >
      <div className={styles.categoryNames} style={{ flex: 1 }}>
        <span className={styles.mainName}>
          {cat.names?.en}
        </span>
        {(cat.names?.fr || cat.names?.ar) && (
          <span className={styles.subNames}>
            {cat.names?.fr && `FR: ${cat.names.fr}`}
            {cat.names?.ar && ` | AR: ${cat.names.ar}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onRestore(cat)}
          className={styles.editBtn}
          disabled={isBusy}
        >
          <RotateCcw size={14} strokeWidth={2} /> {t('adminManage.restore')}
        </button>
        <button
          onClick={() => onDeleteForever(cat)}
          className={styles.deleteBtn}
          disabled={isBusy}
        >
          <Trash size={14} strokeWidth={2} /> {t('adminManage.deleteForever')}
        </button>
      </div>
    </div>
  );
}

// --- MAIN PAGE COMPONENT ---
export default function AdminManage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOrderChanged, setIsOrderChanged] = useState(false);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'deleted'
  const [processingId, setProcessingId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [nameAr, setNameAr] = useState('');

  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info', onConfirmAction: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchCategories = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'categories'));
      const cats = [];
      querySnapshot.forEach((doc) => cats.push({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const showAlert = (title, message) =>
    setModal({ isOpen: true, title, message, type: 'info', onConfirmAction: null });
  const showConfirm = (title, message, action) =>
    setModal({ isOpen: true, title, message, type: 'confirm', onConfirmAction: action });
  const handleModalConfirm = () => {
    if (modal.onConfirmAction) modal.onConfirmAction();
    setModal(prev => ({ ...prev, isOpen: false }));
  };

  const resetForm = () => {
    setEditingId(null);
    setNameEn('');
    setNameFr('');
    setNameAr('');
  };

  // ── Derived lists ──
  const activeCategories = categories
    .filter(c => !c.isDeleted)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const deletedCategories = categories
    .filter(c => c.isDeleted)
    .sort((a, b) => {
      const at = a.deletedAt?.toDate?.()?.getTime?.() || 0;
      const bt = b.deletedAt?.toDate?.()?.getTime?.() || 0;
      return bt - at;
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nameEn) return showAlert(t('adminManage.missingFieldTitle'), t('adminManage.missingName'));

    try {
      if (editingId) {
        await updateDoc(doc(db, 'categories', editingId), {
          names: { en: nameEn, fr: nameFr, ar: nameAr },
        });
      } else {
        // New categories always go to the end of the active list
        const maxOrder = categories.reduce((m, c) => Math.max(m, c.order || 0), 0);
        await addDoc(collection(db, 'categories'), {
          names: { en: nameEn, fr: nameFr, ar: nameAr },
          order: maxOrder + 1,
          isDeleted: false,
        });
      }
      resetForm();
      fetchCategories();
    } catch (error) {
      showAlert(t('common.error'), t('adminManage.failedSave'));
    }
  };

  // ── Soft delete (move to trash) — closes the order gap ──
  const handleDelete = (id) => {
    const deletedCat = activeCategories.find(c => c.id === id);
    if (!deletedCat) return;

    showConfirm(
      t('adminManage.trashConfirmTitle'),
      t('adminManage.trashConfirmMessage'),
      async () => {
        setProcessingId(id);
        try {
          const batch = writeBatch(db);

          // 1. Mark as deleted (keep its old order — it's re-assigned on restore)
          batch.update(doc(db, 'categories', id), {
            isDeleted: true,
            deletedAt: new Date(),
          });

          // 2. Decrement every active category that sat below it by 1
          activeCategories.forEach(cat => {
            if (cat.id !== id && (cat.order || 0) > (deletedCat.order || 0)) {
              batch.update(doc(db, 'categories', cat.id), {
                order: (cat.order || 0) - 1,
              });
            }
          });

          await batch.commit();
          if (editingId === id) resetForm();
          fetchCategories();
        } catch (error) {
          console.error(error);
          showAlert(t('common.error'), t('adminManage.failedTrash'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  // ── Restore from trash — always placed at the end ──
  const handleRestore = (cat) => {
    showConfirm(
      t('adminManage.restoreConfirmTitle'),
      t('adminManage.restoreConfirmMessage', { name: cat.names?.en }),
      async () => {
        setProcessingId(cat.id);
        try {
          // Highest order among current active categories (0 if none)
          const maxActiveOrder = activeCategories.length > 0
            ? Math.max(...activeCategories.map(c => c.order || 0))
            : 0;

          await updateDoc(doc(db, 'categories', cat.id), {
            isDeleted: false,
            deletedAt: null,
            order: maxActiveOrder + 1,   // ← always last
          });

          fetchCategories();
        } catch (error) {
          console.error(error);
          showAlert(t('common.error'), t('adminManage.failedRestore'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  // ── Permanent delete (category + its items + related progress) ──
  const handleDeleteForever = (cat) => {
    showConfirm(
      t('adminManage.deleteForeverConfirmTitle'),
      t('adminManage.deleteForeverConfirmMessage', { name: cat.names?.en }),
      async () => {
        setProcessingId(cat.id);
        try {
          // 1. Find every item belonging to this category
          const itemsSnap = await getDocs(
            query(collection(db, 'items'), where('categoryId', '==', cat.id))
          );

          const batch = writeBatch(db);

          // 2. Delete items
          itemsSnap.forEach((d) => batch.delete(d.ref));

          // 3. Delete any progress docs pointing to those items
          //    (Firestore `in` operator caps at 10 values → chunk them)
          if (itemsSnap.size > 0) {
            const itemIds = itemsSnap.docs.map((d) => d.id);
            for (let i = 0; i < itemIds.length; i += 10) {
              const chunk = itemIds.slice(i, i + 10);
              const progSnap = await getDocs(
                query(collection(db, 'progress'), where('itemId', 'in', chunk))
              );
              progSnap.forEach((p) => batch.delete(p.ref));
            }
          }

          // 4. Delete the category itself
          batch.delete(doc(db, 'categories', cat.id));

          await batch.commit();
          fetchCategories();
        } catch (error) {
          console.error(error);
          showAlert(t('common.error'), t('adminManage.failedDeleteForever'));
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  // ── Drag-and-drop reorder (active only) ──
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeCategories.findIndex(item => item.id === active.id);
    const newIndex = activeCategories.findIndex(item => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activeCategories, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));

    setCategories([...reordered, ...deletedCategories]);
    setIsOrderChanged(true);
  };

  const saveNewOrder = async () => {
    try {
      const batch = writeBatch(db);
      activeCategories.forEach((cat) =>
        batch.update(doc(db, 'categories', cat.id), { order: cat.order })
      );
      await batch.commit();
      setIsOrderChanged(false);
      showAlert(t('adminManage.successTitle'), t('adminManage.orderSaved'));
    } catch (error) {
      showAlert(t('common.error'), t('adminManage.orderSaveFailed'));
    }
  };

  if (loading) return <Loading text={t('adminManage.loading')} />;

  const isActiveView = activeTab === 'active';

  return (
    <div>
      <h1
        style={{
          color: 'var(--color-bengara)',
          fontSize: '2.5rem',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <FolderTree size={32} strokeWidth={2} />
        {t('adminManage.heading')}
      </h1>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`${isActiveView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
          onClick={() => setActiveTab('active')}
        >
          <FolderTree size={16} strokeWidth={2} />
          {t('adminManage.tabCategories', { count: activeCategories.length })}
        </button>
        <button
          className={`${!isActiveView ? styles.actionBtn : styles.cancelBtn} ${styles.tabBtn}`}
          onClick={() => setActiveTab('deleted')}
        >
          <Trash2 size={16} strokeWidth={2} />
          {t('adminManage.tabDeleted', { count: deletedCategories.length })}
        </button>
      </div>

      {/* ── ACTIVE TAB ── */}
      {isActiveView && (
        <>
          <div className={styles.tableContainer} style={{ marginBottom: '40px' }}>
            <h3 style={{ marginBottom: '15px' }}>
              {editingId ? t('adminManage.editCategory') : t('adminManage.addCategory')}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <div className={styles.inputGroup}>
                  <label>{t('adminManage.name')}</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={e => setNameEn(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminManage.frName')}</label>
                  <input
                    type="text"
                    value={nameFr}
                    onChange={e => setNameFr(e.target.value)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t('adminManage.arName')}</label>
                  <input
                    type="text"
                    value={nameAr}
                    onChange={e => setNameAr(e.target.value)}
                    dir="rtl"
                  />
                </div>
              </div>
              <button type="submit" className={styles.actionBtn}>
                {editingId ? t('adminManage.updateCategory') : t('adminManage.addCategoryBtn')}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                  {t('adminManage.cancelEdit')}
                </button>
              )}
            </form>
          </div>

          <h3>{t('adminManage.existingCategories')}</h3>
          <div className={styles.categoryList}>
            {activeCategories.length === 0 ? (
              <p className={styles.emptyState}>{t('adminManage.noCategories')}</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={activeCategories}
                  strategy={verticalListSortingStrategy}
                >
                  {activeCategories.map((cat) => (
                    <SortableCategory
                      key={cat.id}
                      cat={cat}
                      onEdit={(c) => {
                        setEditingId(c.id);
                        setNameEn(c.names?.en || '');
                        setNameFr(c.names?.fr || '');
                        setNameAr(c.names?.ar || '');
                      }}
                      onDelete={handleDelete}
                      isOrderChanged={isOrderChanged}
                      isDraggingDisabled={!!editingId}
                      onSelect={() => navigate(`/admin/items/${cat.id}`)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      )}

      {/* ── DELETED TAB ── */}
      {!isActiveView && (
        <>
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
            {t('adminManage.deletedWarning')}
          </div>

          <div className={styles.categoryList}>
            {deletedCategories.length === 0 ? (
              <p className={styles.emptyState}>{t('adminManage.trashEmpty')}</p>
            ) : (
              deletedCategories.map((cat) => (
                <DeletedCategory
                  key={cat.id}
                  cat={cat}
                  onRestore={handleRestore}
                  onDeleteForever={handleDeleteForever}
                  isBusy={processingId === cat.id}
                />
              ))
            )}
          </div>
        </>
      )}

      {isOrderChanged && createPortal(
        <div className={styles.saveOrderBar}>
          <span>{t('adminManage.orderChanged')}</span>
          <button onClick={saveNewOrder} className={styles.saveOrderBtn}>
            <Save size={16} strokeWidth={2} /> {t('adminManage.saveNewOrder')}
          </button>
        </div>,
        document.body
      )}

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={handleModalConfirm}
        onCancel={() => setModal(p => ({ ...p, isOpen: false }))}
      />
    </div>
  );
}