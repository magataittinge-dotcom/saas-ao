// ALIAS MINCE. Le toast du système est dans components/ui/toast.tsx (`annoncer`, `ZoneToasts`) : ne plus importer ce fichier.
import { annoncer, ZoneToasts } from '@/components/ui/toast'
import type { TonMessage } from '@/components/ui/message'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'
const VERS: Record<ToastVariant, TonMessage> = { success: 'succes', error: 'erreur', info: 'info', warning: 'attention' }

export function toast(message: string, variant: ToastVariant = 'info') {
  annoncer(message, VERS[variant])
}
export const ToastContainer = ZoneToasts
