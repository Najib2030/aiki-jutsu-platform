// src/components/ImageUploader.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_SIZE = 32 * 1024 * 1024; // 32MB

export default function ImageUploader({ onUploadSuccess }) {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);

  const uploadOne = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('key', import.meta.env.VITE_IMGBB_API_KEY);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error?.message || t('imageUploader.uploadFailed'));
    }
    return result.data.url;
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // ---- Validate every file first ----
    const validFiles = [];
    const problems = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        problems.push(t('imageUploader.notAnImage', { name: file.name }));
      } else if (file.size > MAX_SIZE) {
        problems.push(t('imageUploader.tooLarge', { name: file.name }));
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      setError(problems.join(' '));
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    setError(null);
    setProgress({ done: 0, total: validFiles.length });

    // ---- Upload sequentially (safer for API rate limits) ----
    for (let i = 0; i < validFiles.length; i++) {
      try {
        const url = await uploadOne(validFiles[i]);
        onUploadSuccess(url); // parent appends one image per call
      } catch (err) {
        problems.push(
          t('imageUploader.fileFailed', {
            name: validFiles[i].name,
            reason: err.message || t('imageUploader.uploadFailed'),
          })
        );
      } finally {
        setProgress({ done: i + 1, total: validFiles.length });
      }
    }

    if (problems.length) setError(problems.join(' '));

    setIsUploading(false);
    e.target.value = ''; // reset input so the same file(s) can be re-selected
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        multiple                         // ← allows selecting many files
        onChange={handleFileChange}
        disabled={isUploading}
      />

      {isUploading && (
        <p>
          {t('imageUploader.uploading', {
            current: Math.min(progress.done + 1, progress.total),
            total: progress.total,
          })}
        </p>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}