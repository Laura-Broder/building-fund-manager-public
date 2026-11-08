interface BulkAction {
  label: string
  onClick: () => void
  className?: string
  show?: boolean
}

interface BulkActionBarProps {
  count: number
  actions: BulkAction[]
  onClear: () => void
}

export default function BulkActionBar({ count, actions, onClear }: BulkActionBarProps) {
  if (count === 0) return null

  const visibleActions = actions.filter(a => a.show !== false)

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white z-50 px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-4">
        <span className="font-medium">{count} פריטים נבחרו</span>
        <button
          onClick={onClear}
          className="text-gray-300 hover:text-white text-sm underline"
        >
          ביטול בחירה
        </button>
      </div>
      <div className="flex gap-2">
        {visibleActions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={action.className || 'bg-white text-gray-800 px-4 py-1.5 rounded hover:bg-gray-100'}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
