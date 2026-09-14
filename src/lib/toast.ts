import { createContext, useContext } from 'react'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
  secondaryAction?: { label: string; run: () => void }
  tone?: 'default' | 'good' | 'warn'
  duration?: number
}

export interface ToastApi {
  toast: (message: string, opts?: Omit<Toast, 'id' | 'message'>) => void
}

export const ToastCtx = createContext<ToastApi>({ toast: () => {} })
export const useToast = () => useContext(ToastCtx)

export function showToast(
  message: string,
  opts?: Omit<Toast, 'id' | 'message'>,
) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('nudge:toast', { detail: { message, opts } }),
    )
  }
}
