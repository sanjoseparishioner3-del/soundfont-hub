import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Currency } from '@/types/db'

function defaultCurrency(): Currency {
  try { return /-PH$|^fil/i.test(navigator.language) ? 'PHP' : 'USD' } catch { return 'USD' }
}

/** Display currency preference (per-viewer convenience only – server prices are authoritative). */
export const useCurrency = create<{ currency: Currency; setCurrency: (c: Currency) => void }>()(
  persist((set) => ({ currency: defaultCurrency(), setCurrency: (currency) => set({ currency }) }), { name: 'sfh-currency' }),
)
