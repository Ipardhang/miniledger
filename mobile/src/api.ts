import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_URL } from './config';

const TOKEN_KEY = 'miniledger_access_token';
const REFRESH_KEY = 'miniledger_refresh_token';

export type Loan = {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string;
  repaidAt: string | null;
  isRepaid: boolean;
  isOverdue: boolean;
  hasReceipt: boolean;
  createdAt: string;
};

export type Summary = {
  totalLent: number;
  totalRepaid: number;
  overdueAmount: number;
  overdueCount: number;
  outstanding: number;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function readStored(key: string): Promise<string | null> {
  return Platform.OS === 'web'
    ? localStorage.getItem(key)
    : SecureStore.getItemAsync(key);
}

async function writeStored(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    return;
  }

  if (value) await SecureStore.setItemAsync(key, value);
  else await SecureStore.deleteItemAsync(key);
}

export async function loadToken(): Promise<string | null> {
  accessToken = await readStored(TOKEN_KEY);
  refreshToken = await readStored(REFRESH_KEY);
  return accessToken;
}

async function setTokens(access: string | null, refresh: string | null): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await writeStored(TOKEN_KEY, access);
  await writeStored(REFRESH_KEY, refresh);
}

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const res = await fetch(API_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.accessToken || !data.refreshToken) return false;
      await setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  if (
    init.body &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}.`);
  }

  if (res.status === 401 && allowRefresh && refreshToken && path !== '/auth/refresh') {
    if (await refreshSession()) {
      return request<T>(path, init, false);
    }
    await setTokens(null, null);
    onUnauthorized?.();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'Something went wrong');
  }

  return data as T;
}

export const api = {
  requestOtp: (phone: string) =>
    request<{ message: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: async (phone: string, otp: string) => {
    const response = await request<{ accessToken: string; refreshToken: string }>(
      '/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      },
      false,
    );
    await setTokens(response.accessToken, response.refreshToken);
  },

  logout: async () => {
    if (refreshToken) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }, false).catch(() => undefined);
    }
    await setTokens(null, null);
  },

  getLoans: () => request<Loan[]>('/loans'),
  getSummary: () => request<Summary>('/loans/summary'),

  addLoan: (form: FormData) =>
    request<Loan>('/loans', {
      method: 'POST',
      body: form,
    }),

  markRepaid: (id: string) =>
    request<Loan>(`/loans/${id}/repay`, {
      method: 'PATCH',
    }),

  receiptSource: (id: string) => ({
    uri: `${API_URL}/loans/${id}/receipt`,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  }),
};
