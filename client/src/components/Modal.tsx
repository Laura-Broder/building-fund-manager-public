import { useEffect, useRef } from 'react'

interface ModalProps {
  message: string
  type: 'alert' | 'confirm'
  onConfirm: () => void
  onCancel: () => void
}

export default function Modal({ message, type, onConfirm, onCancel }: ModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-gray-800 whitespace-pre-line mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          {type === 'confirm' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              ביטול
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}
