import { renderHook, act } from '@testing-library/react'
import { useSelection } from './useSelection'

const items = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('useSelection', () => {
  it('starts with count 0 and nothing selected', () => {
    const { result } = renderHook(() => useSelection(items))
    expect(result.current.count).toBe(0)
    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.selectedArray).toEqual([])
  })

  it('toggle adds an item', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => result.current.toggle(1))
    expect(result.current.count).toBe(1)
    expect(result.current.isSelected(1)).toBe(true)
  })

  it('toggle removes a selected item', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => result.current.toggle(1))
    act(() => result.current.toggle(1))
    expect(result.current.count).toBe(0)
    expect(result.current.isSelected(1)).toBe(false)
  })

  it('supports multiple toggles', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => {
      result.current.toggle(1)
      result.current.toggle(2)
    })
    expect(result.current.count).toBe(2)
    expect(result.current.isSelected(1)).toBe(true)
    expect(result.current.isSelected(2)).toBe(true)
  })

  it('toggleAll selects all items', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(3)
    expect(result.current.isAllSelected).toBe(true)
  })

  it('toggleAll deselects when all are selected', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => result.current.toggleAll())
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(0)
    expect(result.current.isAllSelected).toBe(false)
  })

  it('toggleAll selects all when partially selected', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => result.current.toggle(1))
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(3)
    expect(result.current.isAllSelected).toBe(true)
  })

  it('clear removes all selections', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => result.current.toggleAll())
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('isAllSelected is false for empty items', () => {
    const { result } = renderHook(() => useSelection([]))
    expect(result.current.isAllSelected).toBe(false)
  })

  it('prunes stale IDs when items change', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useSelection(items),
      { initialProps: { items } }
    )
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(3)

    rerender({ items: [{ id: 1 }, { id: 2 }] })
    expect(result.current.count).toBe(2)
    expect(result.current.isSelected(3)).toBe(false)
  })

  it('selectedArray contains the toggled IDs', () => {
    const { result } = renderHook(() => useSelection(items))
    act(() => {
      result.current.toggle(2)
      result.current.toggle(3)
    })
    expect(result.current.selectedArray.sort()).toEqual([2, 3])
  })
})
