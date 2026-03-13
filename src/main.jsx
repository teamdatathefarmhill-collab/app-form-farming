import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { flushQueue } from './lib/offlineQueue'

const GAS_URL = import.meta.env.VITE_GAS_SANITASI_URL

window.addEventListener('online', async () => {
  const { flushed, failed } = await flushQueue(GAS_URL)
  if (flushed > 0) {
    console.log(`[offline queue] ${flushed} item berhasil dikirim`)
  }
  if (failed > 0) {
    console.warn(`[offline queue] ${failed} item gagal, akan dicoba lagi`)
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
