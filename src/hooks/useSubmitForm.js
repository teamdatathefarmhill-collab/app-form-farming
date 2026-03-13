import { useState, useCallback } from 'react';
import { enqueue, flushQueue } from '../lib/offlineQueue';

const GAS_URL = import.meta.env.VITE_GAS_SANITASI_URL;

export function useSubmitForm() {
  const [status, setStatus] = useState('idle'); // idle | submitting | success | queued | error
  const [error, setError] = useState(null);

  const submit = useCallback(async (payload) => {
    setStatus('submitting');
    setError(null);

    if (!navigator.onLine) {
      await enqueue(payload);
      setStatus('queued');
      return { queued: true };
    }

    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('success');
        return { success: true };
      } else {
        throw new Error(json.error || 'GAS returned error');
      }
    } catch (err) {
      // Jika fetch gagal (timeout, no connection), fallback ke queue
      await enqueue(payload);
      setStatus('queued');
      return { queued: true };
    }
  }, []);

  const flush = useCallback(async () => {
    return flushQueue(GAS_URL);
  }, []);

  return { submit, flush, status, error };
}