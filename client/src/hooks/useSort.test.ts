import { renderHook, act } from '@testing-library/react'
import { useSort } from './useSort'

interface Item {
  name: string
  age: number | null
  numStr?: string
}

const items: Item[] = [
  { name: 'בני', age: 30 },
  { name: 'אבי', age: 25 },
  { name: 'גלי', age: 35 },
]

describe('useSort', () => {
  it('sorts strings using Hebrew locale', () => {
    const { result } = renderHook(() => useSort(items, 'name'))
    const names = result.current.sortedItems.map(i => i.name)
    expect(names).toEqual(['אבי', 'בני', 'גלי'])
  })

  it('sorts numbers numerically, not lexicographically', () => {
    const data = [{ val: 100 }, { val: 2 }, { val: 30 }]
    const { result } = renderHook(() => useSort(data, 'val'))
    expect(result.current.sortedItems.map(i => i.val)).toEqual([2, 30, 100])
  })

  it('detects numeric strings and sorts them as numbers', () => {
    const data = [{ v: '100' }, { v: '2' }, { v: '30' }]
    const { result } = renderHook(() => useSort(data, 'v'))
    expect(result.current.sortedItems.map(i => i.v)).toEqual(['2', '30', '100'])
  })

  it('respects defaultDir parameter', () => {
    const { result } = renderHook(() => useSort(items, 'name', 'desc'))
    expect(result.current.sortDir).toBe('desc')
    const names = result.current.sortedItems.map(i => i.name)
    expect(names).toEqual(['גלי', 'בני', 'אבי'])
  })

  it('requestSort toggles direction on same key', () => {
    const { result } = renderHook(() => useSort(items, 'name'))
    expect(result.current.sortDir).toBe('asc')
    act(() => result.current.requestSort('name'))
    expect(result.current.sortDir).toBe('desc')
  })

  it('requestSort resets to asc on new key', () => {
    const { result } = renderHook(() => useSort(items, 'name', 'desc'))
    act(() => result.current.requestSort('age'))
    expect(result.current.sortKey).toBe('age')
    expect(result.current.sortDir).toBe('asc')
  })

  it('pushes null values to end regardless of direction', () => {
    const data: Item[] = [
      { name: 'א', age: null },
      { name: 'ב', age: 10 },
      { name: 'ג', age: 5 },
    ]
    const { result } = renderHook(() => useSort(data, 'age'))
    const ages = result.current.sortedItems.map(i => i.age)
    expect(ages).toEqual([5, 10, null])
  })

  it('uses custom getters when provided', () => {
    const getters = { computed: (item: Item) => item.age }
    const { result } = renderHook(() => useSort(items, 'computed', 'asc', getters))
    expect(result.current.sortedItems.map(i => i.age)).toEqual([25, 30, 35])
  })

  it('handles empty array', () => {
    const { result } = renderHook(() => useSort([] as Item[], 'name'))
    expect(result.current.sortedItems).toEqual([])
  })

  it('returns a new array (does not mutate input)', () => {
    const original = [...items]
    const { result } = renderHook(() => useSort(items, 'name'))
    expect(result.current.sortedItems).not.toBe(items)
    expect(items).toEqual(original)
  })
})
