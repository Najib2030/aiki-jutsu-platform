// src/pages/AdminItemLayout.jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase/config';
import {
  doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import ItemRenderer from '../components/ItemRenderer';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
import {
  DEFAULT_LAYOUT, SECTION_TYPES, getEffectiveLayout, makeSectionId,
  getSectionTypeLabel, getBorders,
} from '../utils/defaultLayout';
import styles from './AdminItemLayout.module.css';

// dnd-kit
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- SORTABLE SECTION ROW ---
function SortableSectionRow({ sec, idx, total, item, onMoveUp, onMoveDown, onUpdate, onRemove }) {
  const { t } = useTranslation();
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: sec.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasData = SECTION_TYPES[sec.type]?.hasData(item);
  const label = getSectionTypeLabel(sec.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sectionRow} ${isDragging ? styles.sectionRowDragging : ''}`}
    >
      <div className={styles.rowTop}>
        <div className={styles.sectionTitleRow}>
          <span
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className={styles.dragHandle}
            title={t('adminItemLayout.dragToReorder')}
          >
            ⋮⋮
          </span>
          <span className={styles.sectionTypeLabel}>{label}</span>
          {!hasData && (
            <span className={styles.noDataBadge}>
              {t('adminItemLayout.noDataYet')}
            </span>
          )}
          {sec.visible === false && (
            <span className={styles.hiddenBadge}>
              {t('adminItemLayout.hidden')}
            </span>
          )}
        </div>
        <div className={styles.rowActions}>
          <button
            className={styles.moveBtn}
            onClick={() => onMoveUp(sec.id)}
            disabled={idx === 0}
            title={t('adminItemLayout.moveUp')}
          >
            ↑
          </button>
          <button
            className={styles.moveBtn}
            onClick={() => onMoveDown(sec.id)}
            disabled={idx === total - 1}
            title={t('adminItemLayout.moveDown')}
          >
            ↓
          </button>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={sec.visible !== false}
              onChange={(e) => onUpdate(sec.id, { visible: e.target.checked })}
            />
            {t('adminItemLayout.visible')}
          </label>
          <button
            className={styles.removeBtn}
            onClick={() => onRemove(sec.id)}
            title={t('adminItemLayout.removeSection')}
          >
            ✕
          </button>
        </div>
      </div>

      <div className={styles.rowBottom}>
        <label>
          {t('adminItemLayout.position')}
          <select
            value={sec.position}
            onChange={(e) => onUpdate(sec.id, { position: e.target.value })}
          >
            <option value="full">{t('adminItemLayout.positionFull')}</option>
            <option value="left">{t('adminItemLayout.positionLeft')}</option>
            <option value="right">{t('adminItemLayout.positionRight')}</option>
          </select>
        </label>
        <label>
          {t('adminItemLayout.border')}
          <select
            value={sec.border}
            onChange={(e) => onUpdate(sec.id, { border: e.target.value })}
          >
            {getBorders().map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.titleInput}>
          {t('adminItemLayout.customTitle')}
          <input
            type="text"
            value={sec.title || ''}
            onChange={(e) => onUpdate(sec.id, { title: e.target.value })}
            placeholder={label}
          />
        </label>
      </div>
    </div>
  );
}

// --- MAIN PAGE ---
export default function AdminItemLayout() {
  const { t } = useTranslation();
  const { categoryId, itemId } = useParams();
  const [item, setItem] = useState(null);
  const [layout, setLayout] = useState({ sections: [] });
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('design');
  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info', onConfirmAction: null,
  });

  // Require a small drag distance so clicks on select/input don't start a drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    async function fetchData() {
      try {
        const itemSnap = await getDoc(doc(db, 'items', itemId));
        if (!itemSnap.exists()) return;
        const data = { id: itemSnap.id, ...itemSnap.data() };
        setItem(data);
        const eff = getEffectiveLayout(data);
        setLayout({ sections: eff.sections.map((s) => ({ ...s })) });

        const catSnap = await getDoc(doc(db, 'categories', categoryId));
        if (catSnap.exists()) setCategoryName(catSnap.data().names?.en || '');
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [itemId, categoryId]);

  const showAlert = (title, message) =>
    setModal({ isOpen: true, title, message, type: 'info', onConfirmAction: null });
  const showConfirm = (title, message, action) =>
    setModal({ isOpen: true, title, message, type: 'confirm', onConfirmAction: action });
  const handleModalConfirm = () => {
    if (modal.onConfirmAction) modal.onConfirmAction();
    setModal((p) => ({ ...p, isOpen: false }));
  };

  const updateSection = (id, patch) => {
    setLayout((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const moveSection = (id, dir) => {
    setLayout((prev) => {
      const sorted = [...prev.sections].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (target < 0 || target >= sorted.length) return prev;
      [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
      return { ...prev, sections: sorted.map((s, i) => ({ ...s, order: i + 1 })) };
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLayout((prev) => {
      const sorted = [...prev.sections].sort((a, b) => a.order - b.order);
      const oldIndex = sorted.findIndex((s) => s.id === active.id);
      const newIndex = sorted.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(sorted, oldIndex, newIndex);
      return { ...prev, sections: next.map((s, i) => ({ ...s, order: i + 1 })) };
    });
  };

  const addSection = (type) => {
    if (layout.sections.some((s) => s.type === type)) return;
    const maxOrder = layout.sections.reduce((m, s) => Math.max(m, s.order || 0), 0);
    setLayout((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: makeSectionId(),
          type,
          position: 'full',
          order: maxOrder + 1,
          border: 'subtle',
          visible: true,
          title: '',
        },
      ],
    }));
  };

  const removeSection = (id) => {
    setLayout((prev) => {
      const remaining = prev.sections.filter((s) => s.id !== id);
      // Re-normalise order so there are no gaps
      const normalized = [...remaining]
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, sections: normalized };
    });
  };

  const normalize = () => ({
    sections: [...layout.sections]
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({ ...s, order: i + 1 })),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'items', itemId), { layout: normalize() });
      showAlert(t('adminItemLayout.savedTitle'), t('adminItemLayout.savedMessage'));
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('adminItemLayout.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToAll = () => {
    showConfirm(
      t('adminItemLayout.applyConfirmTitle'),
      t('adminItemLayout.applyConfirmMessage', { categoryName }),
      async () => {
        setSaving(true);
        try {
          const q = query(collection(db, 'items'), where('categoryId', '==', categoryId));
          const snap = await getDocs(q);
          const normalized = normalize();
          const batch = writeBatch(db);
          snap.forEach((d) => {
            // Include the current item — this becomes "save current + apply to all"
            batch.update(doc(db, 'items', d.id), { layout: normalized });
          });
          await batch.commit();
          showAlert(
            t('adminItemLayout.successTitle'),
            t('adminItemLayout.appliedMessage', { count: snap.size })
          );
        } catch (err) {
          console.error(err);
          showAlert(t('common.error'), t('adminItemLayout.failedApply'));
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const handleReset = () => {
    showConfirm(
      t('adminItemLayout.resetConfirmTitle'),
      t('adminItemLayout.resetConfirmMessage'),
      () => setLayout({ sections: DEFAULT_LAYOUT.sections.map((s) => ({ ...s })) })
    );
  };

  if (loading) return <Loading text={t('adminItemLayout.loading')} />;
  if (!item) return <p>{t('adminItemLayout.itemNotFound')}</p>;

  const sortedSections = [...layout.sections].sort((a, b) => a.order - b.order);
  const usedTypes = new Set(layout.sections.map((s) => s.type));
  const availableTypes = Object.keys(SECTION_TYPES).filter((tp) => !usedTypes.has(tp));

  return (
    <div>
      <Link to={`/admin/items/${categoryId}`} className={styles.backLink}>
        {t('adminItemLayout.backToItems')}
      </Link>

      {/* Header with Design/Preview toggle */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>
            {t('adminItemLayout.designPrefix')} {item.names?.ja}
            <span className={styles.headerSub}> ({item.names?.en})</span>
          </h1>
          <p>{t('adminItemLayout.subtitle')}</p>
        </div>

        <div className={styles.viewToggle}>
          <button
            className={viewMode === 'design' ? styles.toggleActive : styles.toggleInactive}
            onClick={() => setViewMode('design')}
          >
            {t('adminItemLayout.design')}
          </button>
          <button
            className={viewMode === 'preview' ? styles.toggleActive : styles.toggleInactive}
            onClick={() => setViewMode('preview')}
          >
            {t('adminItemLayout.preview')}
          </button>
        </div>
      </div>

      {/* ---------- DESIGN VIEW ---------- */}
      {viewMode === 'design' && (
        <div className={styles.controlsCard}>
          <div className={styles.controlsHeader}>
            <h3>{t('adminItemLayout.pageSections')}</h3>
            <div className={styles.topActions}>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? t('adminItemLayout.saving') : t('adminItemLayout.saveLayout')}
              </button>
              <button className={styles.applyBtn} onClick={handleApplyToAll} disabled={saving}>
                {t('adminItemLayout.applyToAll')}
              </button>
              <button className={styles.resetBtn} onClick={handleReset} disabled={saving}>
                {t('adminItemLayout.resetToDefault')}
              </button>
            </div>
          </div>

          <p className={styles.helperText}>
            {t('adminItemLayout.helperText')}
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedSections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className={styles.sectionList}>
                {sortedSections.map((sec, idx) => (
                  <SortableSectionRow
                    key={sec.id}
                    sec={sec}
                    idx={idx}
                    total={sortedSections.length}
                    item={item}
                    onMoveUp={(id) => moveSection(id, -1)}
                    onMoveDown={(id) => moveSection(id, 1)}
                    onUpdate={updateSection}
                    onRemove={removeSection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {availableTypes.length > 0 && (
            <div className={styles.addSectionBar}>
              <span>{t('adminItemLayout.addSection')}</span>
              {availableTypes.map((type) => (
                <button
                  key={type}
                  className={styles.addChip}
                  onClick={() => addSection(type)}
                >
                  + {getSectionTypeLabel(type)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- PREVIEW VIEW ---------- */}
      {viewMode === 'preview' && (
        <div className={styles.previewWrapper}>
          <div className={styles.previewHeader}>
            <h3>{t('adminItemLayout.livePreview')}</h3>
            <span className={styles.previewSubtitle}>
              {t('adminItemLayout.previewSubtitle')}
            </span>
          </div>
          <div className={styles.previewFrame}>
            <ItemRenderer item={item} layout={layout} />
          </div>
        </div>
      )}

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={handleModalConfirm}
        onCancel={() => setModal((p) => ({ ...p, isOpen: false }))}
      />
    </div>
  );
}