// src/utils/defaultLayout.js
import i18n from '../i18n';

// ⚠️ Static English labels kept for backward compat — logic (`hasData`,
// `type` keys) is the important part of this map. Display code should
// call `getSectionTypeLabel(type)` for a translated label.
export const SECTION_TYPES = {
  names: {
    label: 'Names',
    hasData: (item) => !!(item.names?.ja || item.names?.en),
  },
  translations: {
    label: 'Translations',
    hasData: (item) => !!(item.names?.fr || item.names?.ar),
  },
  classification: {
    label: 'Classification (Belt / Subgroup)',
    hasData: () => true,
  },
  combat: {
    label: 'Attack & Defense',
    hasData: (item) => !!(item.attack || item.defense),
  },
  video: {
    label: 'Video',
    hasData: (item) => !!item.videoId,
  },
  images: {
    label: 'Images',
    hasData: (item) => !!(item.images?.length || item.imageUrl),
  },
  description: {
    label: 'Description / Notes',
    hasData: (item) =>
      !!(item.description?.en || item.description?.fr || item.description?.ar),
  },
};

// ─── Translated section label (for display) ───
export function getSectionTypeLabel(type) {
  return i18n.t(`sectionTypes.${type}`);
}

export const POSITIONS = ['full', 'left', 'right'];

// ⚠️ Static English labels kept for backward compat — `value` is the
// logic identifier. Display code should use `getBorders()` instead.
export const BORDERS = [
  { value: 'none', label: 'None (clean)' },
  { value: 'gold', label: 'Gold top accent' },
  { value: 'red', label: 'Bengara top accent' },
  { value: 'subtle', label: 'Subtle full border' },
  { value: 'double', label: 'Double gold (traditional)' },
];

// ─── Translated borders list (for display) ───
export function getBorders() {
  return BORDERS.map(({ value }) => ({
    value,
    label: i18n.t(`borders.${value}`),
  }));
}

export function makeSectionId() {
  return `sec_${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_LAYOUT = {
  sections: [
    { id: 'd1', type: 'names',          position: 'full',  order: 1, border: 'none',   visible: true, title: '' },
    { id: 'd2', type: 'classification', position: 'left',  order: 2, border: 'gold',   visible: true, title: '' },
    { id: 'd3', type: 'video',          position: 'right', order: 3, border: 'gold',   visible: true, title: '' },
    { id: 'd4', type: 'combat',         position: 'left',  order: 4, border: 'subtle', visible: true, title: '' },
    { id: 'd5', type: 'translations',   position: 'right', order: 5, border: 'subtle', visible: true, title: '' },
    { id: 'd6', type: 'images',         position: 'full',  order: 6, border: 'gold',   visible: true, title: '' },
    { id: 'd7', type: 'description',    position: 'full',  order: 7, border: 'double', visible: true, title: '' },
  ],
};

export function getEffectiveLayout(item) {
  if (item?.layout?.sections?.length) return item.layout;
  return DEFAULT_LAYOUT;
}