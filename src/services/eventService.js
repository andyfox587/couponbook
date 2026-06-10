// src/services/eventService.js
import { getAccessToken } from '@/services/authService'

const API_BASE = '/api/v1'

async function authHeaders() {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Live events ──────────────────────────────────────────────────

export async function listEvents(params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}/events${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`Failed to load events: ${res.status}`)
  return res.json()
}

export async function getEvent(id, memberToken = null) {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : ''
  const res = await fetch(`${API_BASE}/events/${id}${qs}`)
  if (!res.ok) throw new Error(`Failed to load event: ${res.status}`)
  return res.json()
}

export async function getEventBySlug(slug, memberToken = null) {
  const qs = memberToken ? `?member_token=${encodeURIComponent(memberToken)}` : ''
  const res = await fetch(`${API_BASE}/events/slug/${slug}${qs}`)
  if (!res.ok) throw new Error(`Failed to load event: ${res.status}`)
  return res.json()
}

export async function getMyEvents() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/mine`, { headers })
  if (!res.ok) throw new Error(`Failed to load your events: ${res.status}`)
  return res.json()
}

export async function getMyRsvps() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/my-rsvps`, { headers })
  if (!res.ok) throw new Error(`Failed to load your RSVPs: ${res.status}`)
  return res.json()
}

export async function getMyEventCredits() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/my-credits`, { headers })
  if (!res.ok) throw new Error(`Failed to load your event credits: ${res.status}`)
  return res.json()
}

export async function getMyRsvpForEvent(eventId) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/${eventId}/my-rsvp`, { headers })
  if (!res.ok) throw new Error(`Failed to load your RSVP: ${res.status}`)
  return res.json()
}

export async function updateEvent(id, data) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/events/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to update event: ${res.status}`)
  return res.json()
}

export async function deleteEvent(id) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`Failed to delete event: ${res.status}`)
  return res.json()
}

// ── RSVP ────────────────────────────────────────────────────────

export async function createRsvp(eventId, data) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `RSVP failed: ${res.status}`)
  }
  return res.json()
}

export async function cancelRsvp(eventId, rsvpId, token = null) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp/${rsvpId}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify(token ? { token } : {}),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to cancel RSVP: ${res.status}`)
  }
  return res.json()
}

export async function previewGuestCancellation(eventId, token) {
  const qs = new URLSearchParams({ token }).toString()
  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp/cancel-by-token?${qs}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to load cancellation: ${res.status}`)
  }
  return res.json()
}

export async function cancelGuestRsvpByToken(eventId, token, compensation = 'cash') {
  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp/cancel-by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, compensation }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to cancel RSVP: ${res.status}`)
  }
  return res.json()
}

export async function cancelEvent(eventId, reason = '') {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/events/${eventId}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to cancel event: ${res.status}`)
  }
  return res.json()
}

export async function getAttendees(eventId) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/${eventId}/attendees`, { headers })
  if (!res.ok) throw new Error(`Failed to load attendees: ${res.status}`)
  return res.json()
}

export async function promoteRsvp(eventId, rsvpId) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp/${rsvpId}/promote`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to promote RSVP: ${res.status}`)
  }
  return res.json()
}

export async function updateRsvpStatus(eventId, rsvpId, status) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp/${rsvpId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to update RSVP status: ${res.status}`)
  }
  return res.json()
}

export async function getEventStats(eventId) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/${eventId}/stats`, { headers })
  if (!res.ok) throw new Error(`Failed to load event stats: ${res.status}`)
  return res.json()
}

// ── Merchant / admin analytics ───────────────────────────────────

export async function getMerchantEventInsights() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/events/merchant-insights`, { headers })
  if (!res.ok) throw new Error(`Failed to load event insights: ${res.status}`)
  return res.json()
}

export async function getAdminEvents(params = {}) {
  const headers = await authHeaders()
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}/admin/events${qs ? `?${qs}` : ''}`, { headers })
  if (!res.ok) throw new Error(`Failed to load admin events: ${res.status}`)
  return res.json()
}

// ── Event submissions ────────────────────────────────────────────

export async function listEventSubmissions(params = {}) {
  const headers = await authHeaders()
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}/event-submissions${qs ? '?' + qs : ''}`, { headers })
  if (!res.ok) throw new Error(`Failed to load event submissions: ${res.status}`)
  return res.json()
}

export async function listEventSubmissionsByMerchant(state) {
  const headers = await authHeaders()
  const qs = state ? `?state=${state}` : ''
  const res = await fetch(`${API_BASE}/event-submissions/by-merchant${qs}`, { headers })
  if (!res.ok) throw new Error(`Failed to load your event submissions: ${res.status}`)
  return res.json()
}

export async function getEventSubmission(id) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/event-submissions/${id}`, { headers })
  if (!res.ok) throw new Error(`Failed to load event submission: ${res.status}`)
  return res.json()
}

export async function createEventSubmission(groupId, merchantId, submissionData) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/event-submissions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ group_id: groupId, merchant_id: merchantId, submission_data: submissionData }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Submission failed: ${res.status}`)
  }
  return res.json()
}

export async function updateEventSubmission(id, submissionData) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_BASE}/event-submissions/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ submission_data: submissionData }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Update failed: ${res.status}`)
  }
  return res.json()
}

export async function uploadEventCoverImage(merchantId, file) {
  const headers = await authHeaders()
  const formData = new FormData()
  formData.append('merchant_id', merchantId)
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/event-submissions/upload-cover`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Cover image upload failed: ${res.status}`)
  }
  const data = await res.json()
  return data.cover_image_url
}

export async function uploadEventBannerImage(merchantId, file) {
  const headers = await authHeaders()
  const formData = new FormData()
  formData.append('merchant_id', merchantId)
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/event-submissions/upload-banner`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Banner image upload failed: ${res.status}`)
  }
  const data = await res.json()
  return data.banner_image_url
}

export async function reviewEventSubmission(id, state, rejectionMessage) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const body = { state }
  if (state === 'rejected' && rejectionMessage) {
    body.rejection_message = rejectionMessage
  }
  const res = await fetch(`${API_BASE}/event-submissions/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Review failed: ${res.status}`)
  }
  return res.json()
}
