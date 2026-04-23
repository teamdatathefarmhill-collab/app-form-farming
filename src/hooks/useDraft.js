// useDraft.js
// Hook untuk auto-save dan restore draft form ke localStorage
// Taruh di: src/hooks/useDraft.js
//
// Cara pakai:
//   const { draft, saveDraft, clearDraft } = useDraft("vigor");
//   saveDraft({ step, selectedGH, varianData, operator, ... });  // panggil tiap state berubah
//   clearDraft();  // panggil setelah submit berhasil
//   // draft berisi nilai yang tersimpan, atau null kalau tidak ada

import { useEffect, useRef } from "react";

const DRAFT_PREFIX = "farmhill_draft_";
const DRAFT_TTL    = 1000 * 60 * 60 * 12; // 12 jam — draft kedaluwarsa otomatis

export function useDraft(formKey) {
  const key = DRAFT_PREFIX + formKey;

  // Baca draft dari localStorage (null kalau tidak ada / expired)
  function getDraft() {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Cek TTL — draft > 12 jam dianggap tidak relevan
      if (Date.now() - (parsed._savedAt || 0) > DRAFT_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      const { _savedAt, ...data } = parsed;
      return data;
    } catch {
      return null;
    }
  }

  // Simpan draft ke localStorage
  function saveDraft(data) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...data, _savedAt: Date.now() }));
    } catch {
      // Storage penuh atau error lain — abaikan
    }
  }

  // Hapus draft setelah submit berhasil
  function clearDraft() {
    try {
      localStorage.removeItem(key);
    } catch { /* abaikan */ }
  }

  return { getDraft, saveDraft, clearDraft };
}

// Helper: debounce saveDraft agar tidak terlalu sering nulis ke storage
// Pakai ini kalau state berubah sangat cepat (misal typing)
export function useDraftAutoSave(formKey, data, deps) {
  const { saveDraft } = useDraft(formKey);
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(data);
    }, 500); // debounce 500ms

    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
