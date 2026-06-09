/**
 * admin-bookings-api.ts
 * Client-side API calls cho AdminBookingsPage.
 * Thay thế toàn bộ MOCK_BOOKINGS / MOCK_BARBERS bằng các hàm này.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Lỗi không xác định')
    throw new Error(msg)
  }
  return data as T
}

// Types (khớp response của AdminBookingsService) 

export interface BookingRow {
  id: number
  code: string | null
  customer: string
  phone: string
  initials: string
  service: string
  barber: string
  barberId: number | null
  date: string       // "YYYY-MM-DD"
  time: string       // "HH:MM"
  endTime: string
  price: number
  status: string
  visits: number
  note: string
}

export interface BookingDetail extends BookingRow {
  email: string | null
  paymentStatus: string
  paymentMethod: string
  confirmedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  editedAt: string | null
  editReason: string | null
  isNoShow: boolean
  logs: { id: number; actionText: string; color: string; createdAt: string }[]
}

export interface ListResponse {
  data: BookingRow[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface StatsResponse {
  counts: {
    all: number; today: number; pending: number; confirmed: number
    inprogress: number; done: number; cancelled: number; expired: number
  }
  todayRevenue: number
  monthRevenue: number
  completionRate: number
  pendingAlert: number
}

export interface BarberDutyItem {
  id: number
  name: string
  initials: string
  bookingsToday: number
  doneToday: number
  status: string
  online: boolean
}

// Query params type 

export interface ListQuery {
  search?: string
  status?: string
  barberId?: number
  serviceId?: number
  date?: string
  tab?: string
  page?: number
  limit?: number
}

// API functions 

/**
 * GET /admin/bookings
 * Dùng cho: bảng chính, filter bar, phân trang, tab counts
 */
export function fetchBookings(q: ListQuery): Promise<ListResponse> {
  const params = new URLSearchParams()
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)) })
  return api<ListResponse>(`/admin/bookings?${params}`)
}

/**
 * GET /admin/bookings/stats
 * Dùng cho: sidebar stat cards (hôm nay, chờ xác nhận, doanh thu, tỷ lệ)
 * + tab counts (all, today, pending, confirmed, ...)
 */
export function fetchStats(): Promise<StatsResponse> {
  return api<StatsResponse>('/admin/bookings/stats')
}

/**
 * GET /admin/bookings/barbers-duty
 * Dùng cho: sidebar "Barber đang trực" list
 */
export function fetchBarbersDuty(): Promise<BarberDutyItem[]> {
  return api<BarberDutyItem[]>('/admin/bookings/barbers-duty')
}

/**
 * GET /admin/bookings/calendar?year=2026&month=5
 * Dùng cho: mini calendar — highlight ngày có lịch bằng chấm vàng
 */
export function fetchCalendarDots(year: number, month: number): Promise<{ dates: string[] }> {
  return api<{ dates: string[] }>(`/admin/bookings/calendar?year=${year}&month=${month}`)
}

/**
 * GET /admin/bookings/:id
 * Dùng cho: detail panel bên phải khi click vào row
 */
export function fetchBookingDetail(id: number): Promise<BookingDetail> {
  return api<BookingDetail>(`/admin/bookings/${id}`)
}

/**
 * PATCH /admin/bookings/:id/status
 * Dùng cho:
 *  - Quick action buttons ✓ / ✗ trên table row
 *  - Status buttons ở footer của detail panel
 */
export function updateBookingStatus(
  id: number,
  status: string,
  reason?: string,
): Promise<{ message: string; status: string }> {
  return api(`/admin/bookings/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  })
}

/**
 * PATCH /admin/bookings/:id/reschedule
 * Dùng cho: TIME_SLOTS grid trong detail panel
 */
export function rescheduleBooking(
  id: number,
  bookingDate: string,
  newStartTime: string,
  reason?: string,
): Promise<{ message: string; newStartTime: string; newEndTime: string }> {
  return api(`/admin/bookings/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ bookingDate, newStartTime, reason }),
  })
}

/**
 * PATCH /admin/bookings/:id/note
 * Dùng cho: textarea ghi chú trong detail panel (onBlur hoặc nút Lưu)
 */
export function updateBookingNote(
  id: number,
  note: string,
): Promise<{ message: string }> {
  return api(`/admin/bookings/${id}/note`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  })
}

/**
 * PATCH /admin/bookings/bulk-status
 * Dùng cho: bulk action bar khi chọn nhiều rows bằng checkbox
 */
export function bulkUpdateStatus(
  ids: number[],
  status: 'confirmed' | 'cancelled',
): Promise<{ message: string; updated: number; skipped: number }> {
  return api('/admin/bookings/bulk-status', {
    method: 'PATCH',
    body: JSON.stringify({ ids, status }),
  })
}

/**
 * DELETE /admin/bookings/:id
 * Dùng cho: nút xóa (nếu có trong view)
 */
export function deleteBooking(id: number): Promise<void> {
  return api(`/admin/bookings/${id}`, { method: 'DELETE' })
}