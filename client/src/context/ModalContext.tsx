import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import Modal from '../components/Modal'

interface ModalContextValue {
  showAlert: (message: string) => Promise<void>
  showConfirm: (message: string) => Promise<boolean>
}

const ModalContext = createContext<ModalContextValue | null>(null)

interface ModalState {
  message: string
  type: 'alert' | 'confirm'
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const show = useCallback((message: string, type: 'alert' | 'confirm'): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
      setModal({ message, type })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    resolveRef.current = null
    setModal(null)
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    resolveRef.current = null
    setModal(null)
  }, [])

  const showAlert = useCallback((message: string): Promise<void> => {
    return show(message, 'alert').then(() => {})
  }, [show])

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return show(message, 'confirm')
  }, [show])

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modal && (
        <Modal
          message={modal.message}
          type={modal.type}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ModalContext.Provider>
  )
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext)
  if (!ctx) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return ctx
}
