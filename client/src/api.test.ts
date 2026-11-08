import {
  getApartments,
  createApartment,
  deleteApartment,
  getPayments,
  previewCsv,
  getFileDownloadUrl,
} from './api'

function mockFetch(body: any, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api request wrapper', () => {
  it('GET request calls fetch with correct URL and headers', async () => {
    const mock = mockFetch([{ id: 1, number: '1' }])
    vi.stubGlobal('fetch', mock)

    const result = await getApartments()
    expect(mock).toHaveBeenCalledWith('/api/apartments', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(result).toEqual([{ id: 1, number: '1' }])
  })

  it('POST request sends JSON body', async () => {
    const mock = mockFetch({ id: 1, number: '1', owner_name: 'test' })
    vi.stubGlobal('fetch', mock)

    await createApartment({ number: '1', owner_name: 'test' })
    const callArgs = mock.mock.calls[0]
    expect(callArgs[0]).toBe('/api/apartments')
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toEqual({ number: '1', owner_name: 'test' })
  })

  it('DELETE request uses correct method', async () => {
    const mock = mockFetch({ success: true })
    vi.stubGlobal('fetch', mock)

    await deleteApartment(5)
    const callArgs = mock.mock.calls[0]
    expect(callArgs[0]).toBe('/api/apartments/5')
    expect(callArgs[1].method).toBe('DELETE')
  })

  it('constructs query params correctly', async () => {
    const mock = mockFetch([])
    vi.stubGlobal('fetch', mock)

    await getPayments({ month: '1', year: '2024' })
    const url = mock.mock.calls[0][0] as string
    expect(url).toContain('/api/payments?')
    expect(url).toContain('month=1')
    expect(url).toContain('year=2024')
  })

  it('throws with Hebrew error message from server', async () => {
    const mock = mockFetch({ error: 'רשומה כפולה' }, false, 409)
    vi.stubGlobal('fetch', mock)

    await expect(createApartment({ number: '1', owner_name: 'test' }))
      .rejects.toThrow('רשומה כפולה')
  })

  it('throws fallback error when response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    }))

    await expect(getApartments()).rejects.toThrow('שגיאה')
  })
})

describe('previewCsv', () => {
  it('sends FormData without Content-Type header', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fileId: 'abc', headers: [], sampleRows: [] }),
    })
    vi.stubGlobal('fetch', mock)

    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    await previewCsv(file)

    const callArgs = mock.mock.calls[0]
    expect(callArgs[0]).toBe('/api/upload/preview')
    expect(callArgs[1].body).toBeInstanceOf(FormData)
    expect(callArgs[1].headers).toBeUndefined()
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const file = new File(['test'], 'test.csv')
    await expect(previewCsv(file)).rejects.toThrow('שגיאה בהעלאת הקובץ')
  })
})

describe('getFileDownloadUrl', () => {
  it('returns URL path synchronously without fetch', () => {
    const url = getFileDownloadUrl(42)
    expect(url).toBe('/api/files/42/download')
  })
})
