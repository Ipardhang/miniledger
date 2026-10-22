
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_URL } from './config';

const TOKEN_KEY = 'miniledger_token';

export type Loan = {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
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

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

/**
 * Read the saved authentication token.
 * Web uses localStorage; native platforms use SecureStore.
 */
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    token = localStorage.getItem(TOKEN_KEY);
  } else {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
  }

  return token;
}

/**
 * Save or remove the authentication token.
 */
async function setToken(t: string | null): Promise<void> {
  token = t;

  if (Platform.OS === 'web') {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    return;
  }

  if (t) {
    await SecureStore.setItemAsync(TOKEN_KEY, t);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

/**
 * Send a request to the backend API.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Let fetch set the multipart boundary for FormData requests.
  if (
    init.body &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;

  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      `Can't reach the server at ${API_URL}. Is the backend running?`,
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && token) {
      await setToken(null);
      onUnauthorized?.();
    }

    throw new ApiError(
      res.status,
      data.error ?? 'Something went wrong',
    );
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
    const response = await request<{ token: string }>(
      '/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      },
    );

    await setToken(response.token);
  },

  logout: () => setToken(null),

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

  // Image source for the authenticated receipt endpoint.
  receiptSource: (id: string) => ({
    uri: `${API_URL}/loans/${id}/receipt`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }),
};


