import { useState, useMemo, useCallback, useEffect } from 'react'

export function useSelection(items: { id: number }[]) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Auto-prune stale IDs when items change (e.g. after filter)
  const itemIds = useMemo(() => new Set(items.map(i => i.id)), [items])
  useEffect(() => {
    setSelectedIds(prev => {
      const pruned = new Set([...prev].filter(id => itemIds.has(id)))
      return pruned.size === prev.size ? prev : pruned
    })
  }, [itemIds])

  const toggle = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === items.length && items.length > 0) return new Set()
      return new Set(items.map(i => i.id))
    })
  }, [items])

  const clear = useCallback(() => setSelectedIds(new Set()), [])

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds])

  const isAllSelected = items.length > 0 && selectedIds.size === items.length

  return {
    toggle,
    toggleAll,
    clear,
    isSelected,
    isAllSelected,
    count: selectedIds.size,
    selectedArray: [...selectedIds],
  }
}
