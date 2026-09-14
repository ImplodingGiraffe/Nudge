import type { MouseEvent } from 'react'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

const CLAIMED =
  'button,a,input,select,textarea,label,summary,[role="button"],[role="checkbox"],[role="radio"],[contenteditable="true"]'

export function cardClick(onOpen: () => void) {
  return (e: MouseEvent) => {
    if (e.defaultPrevented) return
    if ((e.target as HTMLElement | null)?.closest?.(CLAIMED)) return
    if (!document.getSelection()?.isCollapsed) return
    e.stopPropagation()
    onOpen()
  }
}
