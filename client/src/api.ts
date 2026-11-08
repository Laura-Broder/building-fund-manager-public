const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'שגיאה' }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

// Apartments
export const getApartments = () => request<any[]>('/apartments');
export const createApartment = (data: any) =>
  request<any>('/apartments', { method: 'POST', body: JSON.stringify(data) });
export const updateApartment = (id: number, data: any) =>
  request<any>(`/apartments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteApartment = (id: number) =>
  request<any>(`/apartments/${id}`, { method: 'DELETE' });
export const bulkDeleteApartments = (ids: number[]) =>
  request<any>('/apartments/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
export const getOwnershipHistory = (id: number) =>
  request<any[]>(`/apartments/${id}/ownership-history`);
export const getApartmentHistory = (id: number) =>
  request<any>(`/apartments/${id}/history`);
export const changeOwner = (id: number, data: { new_owner_name: string; from_month: number; from_year: number }) =>
  request<any>(`/apartments/${id}/change-owner`, { method: 'POST', body: JSON.stringify(data) });
export const updateOwnershipHistory = (apartmentId: number, historyId: number, data: { owner_name: string; from_month: number; from_year: number; to_month?: number | null; to_year?: number | null }) =>
  request<any>(`/apartments/${apartmentId}/ownership-history/${historyId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteOwnershipHistory = (apartmentId: number, historyId: number) =>
  request<any>(`/apartments/${apartmentId}/ownership-history/${historyId}`, { method: 'DELETE' });

// Payments
export const getPayments = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<any[]>(`/payments${qs}`);
};
export const createPayment = (data: any) =>
  request<any>('/payments', { method: 'POST', body: JSON.stringify(data) });
export const updatePayment = (id: number, data: any) =>
  request<any>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePayment = (id: number) =>
  request<any>(`/payments/${id}`, { method: 'DELETE' });
export const approvePayment = (id: number) =>
  request<any>(`/payments/${id}/approve`, { method: 'PATCH' });
export const bulkDeletePayments = (ids: number[]) =>
  request<any>('/payments/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
export const bulkApprovePayments = (ids: number[]) =>
  request<any>('/payments/bulk-approve', { method: 'POST', body: JSON.stringify({ ids }) });

// Expenses
export const getExpenses = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<any[]>(`/expenses${qs}`);
};
export const createExpense = (data: any) =>
  request<any>('/expenses', { method: 'POST', body: JSON.stringify(data) });
export const updateExpenseCategory = (id: number, data: { category: string }) =>
  request<any>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const updateExpense = (id: number, data: any) =>
  request<any>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteExpense = (id: number) =>
  request<any>(`/expenses/${id}`, { method: 'DELETE' });
export const approveExpense = (id: number) =>
  request<any>(`/expenses/${id}/approve`, { method: 'PATCH' });
export const bulkDeleteExpenses = (ids: number[]) =>
  request<any>('/expenses/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
export const bulkApproveExpenses = (ids: number[]) =>
  request<any>('/expenses/bulk-approve', { method: 'POST', body: JSON.stringify({ ids }) });

// Dashboard
export const getDashboard = (year: number, month?: number) =>
  request<any>(`/dashboard?year=${year}${month ? `&month=${month}` : ''}`);

// Analytics
export const getAnalytics = (params: { from_year: number; to_year: number; from_month?: number; to_month?: number }) => {
  const qs = new URLSearchParams();
  qs.set('from_year', String(params.from_year));
  qs.set('to_year', String(params.to_year));
  if (params.from_month) qs.set('from_month', String(params.from_month));
  if (params.to_month) qs.set('to_month', String(params.to_month));
  return request<any>(`/analytics?${qs.toString()}`);
};

// Settings
export const getSettings = () => request<Record<string, string>>('/settings');
export const updateSettings = (data: Record<string, string>) =>
  request<Record<string, string>>('/settings', { method: 'PUT', body: JSON.stringify(data) });

// Fee History
export const getFeeHistory = () => request<any[]>('/settings/fee-history');
export const createFeeHistory = (data: { amount: number; effective_from_month: number; effective_from_year: number }) =>
  request<any[]>('/settings/fee-history', { method: 'POST', body: JSON.stringify(data) });
export const deleteFeeHistory = (id: number) =>
  request<any[]>(`/settings/fee-history/${id}`, { method: 'DELETE' });

// Category Keywords
export const getCategoryKeywords = () => request<any[]>('/settings/category-keywords');
export const createCategoryKeyword = (data: { keyword: string; category: string }) =>
  request<any>('/settings/category-keywords', { method: 'POST', body: JSON.stringify(data) });
export const deleteCategoryKeyword = (id: number) =>
  request<any>(`/settings/category-keywords/${id}`, { method: 'DELETE' });

// Recurring Expenses
export const getRecurringExpenses = () => request<any[]>('/settings/recurring-expenses');
export const createRecurringExpense = (data: { description: string; category: string; expected_amount: number; vendor?: string; frequency?: string }) =>
  request<any>('/settings/recurring-expenses', { method: 'POST', body: JSON.stringify(data) });
export const deleteRecurringExpense = (id: number) =>
  request<any>(`/settings/recurring-expenses/${id}`, { method: 'DELETE' });

// Reset
export const resetData = (entities: string[]) =>
  request<{ success: boolean }>('/settings/reset', { method: 'POST', body: JSON.stringify({ entities }) });

// Upload
export const previewCsv = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/upload/preview`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('שגיאה בהעלאת הקובץ');
  return res.json() as Promise<{ fileId: string; headers: string[]; sampleRows: Record<string, string>[] }>;
};
export const parseCsvWithMapping = (fileId: string, mapping: Record<string, string>) =>
  request<any>('/upload/parse', { method: 'POST', body: JSON.stringify({ fileId, mapping }) });
export const confirmUpload = (rows: any[], fileId?: string) =>
  request<any>('/upload/confirm', { method: 'POST', body: JSON.stringify({ rows, fileId }) });

// Files
export const getFiles = () => request<any[]>('/files');
export const deleteFile = (id: number) =>
  request<any>(`/files/${id}`, { method: 'DELETE' });
export const getFileDownloadUrl = (id: number) => `/api/files/${id}/download`;
export const bulkDeleteFiles = (ids: number[]) =>
  request<any>('/files/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Aliases
export const getAliases = () => request<any[]>('/aliases');
export const deleteAlias = (id: number) =>
  request<any>(`/aliases/${id}`, { method: 'DELETE' });
export const bulkDeleteAliases = (ids: number[]) =>
  request<any>('/aliases/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Expense category aliases
export const getExpenseAliases = () => request<any[]>('/aliases/expense-categories');
export const deleteExpenseAlias = (id: number) =>
  request<any>(`/aliases/expense-categories/${id}`, { method: 'DELETE' });
export const bulkDeleteExpenseAliases = (ids: number[]) =>
  request<any>('/aliases/expense-categories/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Special Payments
export const getSpecialFunds = () => request<any[]>('/special-payments/funds');
export const createSpecialFund = (data: { name: string; description?: string }) =>
  request<any>('/special-payments/funds', { method: 'POST', body: JSON.stringify(data) });
export const updateSpecialFund = (id: number, data: { name: string; description?: string }) =>
  request<any>(`/special-payments/funds/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSpecialFund = (id: number) =>
  request<any>(`/special-payments/funds/${id}`, { method: 'DELETE' });
export const getSpecialPayments = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<any[]>(`/special-payments${qs}`);
};
export const createSpecialPayment = (data: any) =>
  request<any>('/special-payments', { method: 'POST', body: JSON.stringify(data) });
export const updateSpecialPayment = (id: number, data: any) =>
  request<any>(`/special-payments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSpecialPayment = (id: number) =>
  request<any>(`/special-payments/${id}`, { method: 'DELETE' });
export const bulkDeleteSpecialPayments = (ids: number[]) =>
  request<any>('/special-payments/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Expense categories
export const getCategories = () => request<any[]>('/expenses/categories');
export const createCategory = (name: string) =>
  request<any>('/expenses/categories', { method: 'POST', body: JSON.stringify({ name }) });
export const deleteCategory = (id: number) =>
  request<any>(`/expenses/categories/${id}`, { method: 'DELETE' });
