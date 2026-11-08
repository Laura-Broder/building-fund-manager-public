import { useState, useMemo } from 'react'

type SortDir = 'asc' | 'desc'

export function useSort<T>(
  items: T[],
  defaultKey: string,
  defaultDir: SortDir = 'asc',
  getters?: Record<string, (item: T) => any>
) {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const requestSort = (key: string) => {
    if (key === sortKey) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedItems = useMemo(() => {
    const getValue = getters?.[sortKey] || ((item: any) => item[sortKey])
    return [...items].sort((a, b) => {
      const aVal = getValue(a)
      const bVal = getValue(b)
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      let cmp: number
      const aNum = typeof aVal === 'number' ? aVal : (typeof aVal === 'string' && aVal !== '' && !isNaN(Number(aVal)) ? Number(aVal) : null)
      const bNum = typeof bVal === 'number' ? bVal : (typeof bVal === 'string' && bVal !== '' && !isNaN(Number(bVal)) ? Number(bVal) : null)
      if (aNum !== null && bNum !== null) {
        cmp = aNum - bNum
      } else {
        cmp = String(aVal).localeCompare(String(bVal), 'he')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir, getters])

  return { sortedItems, sortKey, sortDir, requestSort }
}
