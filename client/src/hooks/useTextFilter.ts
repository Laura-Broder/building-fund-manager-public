import { useState, useMemo } from 'react'

export function useTextFilter<T>(items: T[], fields: (keyof T | string)[]) {
  const [searchText, setSearchText] = useState('')

  const filteredItems = useMemo(() => {
    const term = searchText.trim().toLowerCase()
    if (!term) return items
    return items.filter(item => {
      for (const field of fields) {
        const val = (item as any)[field]
        if (val != null && String(val).toLowerCase().includes(term)) {
          return true
        }
      }
      return false
    })
  }, [items, searchText, fields])

  return { searchText, setSearchText, filteredItems }
}
