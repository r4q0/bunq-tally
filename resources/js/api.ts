const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export interface ApiContact {
    id: number;
    name: string;
    color: string | null;
    initials: string;
    phone_number: string | null;
    country_code: string | null;
    iban: string | null;
    whatsapp_profile_pic: string | null;
}

export interface ApiReceiptItem {
    id: number;
    name: string;
    price: number;
    quantity: number;
    assigned_contact_ids: number[];
}

export interface ApiSplit {
    id: number;
    contact_id: number;
    amount: number;
    status: string;
    paid: boolean;
    bunq_tab_id?: number | null;
    payment_url?: string | null;
}

export interface ApiReceipt {
    id: number;
    merchant: string | null;
    currency: string | null;
    date: string | null;
    total: number;
    image_url: string | null;
    items: ApiReceiptItem[];
    splits?: ApiSplit[];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (!(init.body instanceof FormData) && init.body !== undefined) {
        headers.set('Content-Type', 'application/json');
    }

    const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
    if (csrf) {
        headers.set('X-CSRF-TOKEN', csrf);
    }

    const response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'same-origin' });
    if (!response.ok) {
        let body: unknown = null;
        try {
            body = await response.json();
        } catch {
            // ignore
        }
        const message =
            (body && typeof body === 'object' && 'message' in body && typeof (body as Record<string, unknown>).message === 'string'
                ? (body as Record<string, string>).message
                : null) ?? `Request failed: ${response.status}`;
        throw new ApiError(message, response.status, body);
    }

    if (response.status === 204) {
        return undefined as T;
    }
    return (await response.json()) as T;
}

export class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly body: unknown) {
        super(message);
    }
}

export const api = {
    listContacts: () => request<{ data: ApiContact[] }>('/api/contacts'),
    createContact: (payload: { name: string; phone_number: string; color?: string | null; country_code?: string | null; iban?: string | null }) =>
        request<{ data: ApiContact }>('/api/contacts', { method: 'POST', body: JSON.stringify(payload) }),
    updateContact: (id: number, payload: Partial<{ name: string; phone_number: string; color: string | null; country_code: string | null; iban: string | null; whatsapp_profile_pic: string | null }>) =>
        request<{ data: ApiContact }>(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteContact: (id: number) => request<{ ok: true }>(`/api/contacts/${id}`, { method: 'DELETE' }),

    listReceipts: () => request<{ data: ApiReceipt[] }>('/api/receipts'),
    getReceipt: (id: number) => request<{ data: ApiReceipt }>(`/api/receipts/${id}`),
    saveAllocations: (id: number, allocations: { receipt_item_id: number; contact_ids: number[] }[]) =>
        request<{ data: ApiReceipt }>(`/api/receipts/${id}/allocations`, {
            method: 'POST',
            body: JSON.stringify({ allocations }),
        }),
    splitReceipt: (id: number) =>
        request<{
            ok: true;
            receipt_id: number;
            bunq_available: boolean;
            splits: (ApiSplit & { contact: ApiContact | null })[];
        }>(`/api/receipts/${id}/split`, { method: 'POST', body: JSON.stringify({}) }),

    syncPaymentRequest: (id: number) =>
        request<{ paid: boolean; paid_at: string | null }>(`/api/payment-requests/${id}/sync`, {
            method: 'POST',
            body: JSON.stringify({}),
        }),

    scanReceipt: (file: File) => {
        const fd = new FormData();
        fd.append('image', file);
        return request<{
            ok: boolean;
            receipt: {
                id: number;
                store: string | null;
                total_price: string;
                currency: string | null;
                items?: { id: number; item_name: string; price: number | string; quantity: number }[];
            };
            image_url: string;
            parsed: { merchant: string; currency: string; date: string | null; items: { name: string; price: number }[]; total: number };
        }>('/api/claude/scan', { method: 'POST', body: fd });
    },

    getWhatsappProfilePic: (phone_number: string) =>
        request<{ url: string | null }>(`/api/whatsapp/profile-pic?${new URLSearchParams({ phone_number })}`),

    sendWhatsapp: (payload: { phone_number: string; message: string }) =>
        request<{ ok: true } | Record<string, unknown>>('/api/whatsapp/send-text', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
};
