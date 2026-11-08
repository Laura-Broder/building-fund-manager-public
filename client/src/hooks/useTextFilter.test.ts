import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useTextFilter } from './useTextFilter'

const items = [
  { id: 1, name: 'יוסי כהן', city: 'תל אביב', notes: '' },
  { id: 2, name: 'רחל לוי', city: 'ירושלים', notes: 'הערה' },
  { id: 3, name: 'אברהם ישראלי', city: 'חיפה', notes: 'חשוב' },
]

describe('useTextFilter', () => {
  it('returns all items when search is empty', () => {
    const { result } = renderHook(() => useTextFilter(items, ['name', 'city', 'notes']))
    expect(result.current.filteredItems).toHaveLength(3)
    expect(result.current.searchText).toBe('')
  })

  it('filters by name field', () => {
    const { result } = renderHook(() => useTextFilter(items, ['name', 'city', 'notes']))
    act(() => result.current.setSearchText('כהן'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe(1)
  })

  it('filters by city field', () => {
    const { result } = renderHook(() => useTextFilter(items, ['name', 'city', 'notes']))
    act(() => result.current.setSearchText('ירושלים'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe(2)
  })

  it('is case insensitive', () => {
    const engItems = [
      { id: 1, name: 'Alice', desc: 'test' },
      { id: 2, name: 'Bob', desc: 'OTHER' },
    ]
    const { result } = renderHook(() => useTextFilter(engItems, ['name', 'desc']))
    act(() => result.current.setSearchText('other'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe(2)
  })

  it('returns empty when no match found', () => {
    const { result } = renderHook(() => useTextFilter(items, ['name', 'city', 'notes']))
    act(() => result.current.setSearchText('לא קיים'))
    expect(result.current.filteredItems).toHaveLength(0)
  })

  it('ignores whitespace-only search', () => {
    const { result } = renderHook(() => useTextFilter(items, ['name', 'city', 'notes']))
    act(() => result.current.setSearchText('   '))
    expect(result.current.filteredItems).toHaveLength(3)
  })

  it('handles null/undefined values in fields', () => {
    const itemsWithNull = [
      { id: 1, name: 'test', val: null },
      { id: 2, name: null, val: 'abc' },
    ]
    const { result } = renderHook(() => useTextFilter(itemsWithNull, ['name', 'val']))
    act(() => result.current.setSearchText('test'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe(1)
  })

  it('matches across multiple fields', () => {
    const { result } = renderHook(() => useTextFilter(items, ['name', 'city', 'notes']))
    act(() => result.current.setSearchText('חשוב'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe(3)
  })

  it('updates when items change', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useTextFilter(items, ['name']),
      { initialProps: { items } }
    )
    act(() => result.current.setSearchText('כהן'))
    expect(result.current.filteredItems).toHaveLength(1)

    const newItems = [...items, { id: 4, name: 'דני כהן', city: '', notes: '' }]
    rerender({ items: newItems })
    expect(result.current.filteredItems).toHaveLength(2)
  })
})
