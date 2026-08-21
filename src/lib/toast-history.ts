import { useSyncExternalStore } from "react";

export type ToastHistoryItem = {
  id: string;
  title?: unknown;
  description?: unknown;
  createdAt: string;
};

const TOAST_HISTORY_LIMIT = 50;
const listeners = new Set<() => void>();
let history: ToastHistoryItem[] = [];

const emit = () => listeners.forEach((listener) => listener());

export const addToastHistoryItem = (item: Omit<ToastHistoryItem, "createdAt"> & { createdAt?: string }) => {
  history = [{ ...item, createdAt: item.createdAt ?? new Date().toISOString() }, ...history].slice(0, TOAST_HISTORY_LIMIT);
  emit();
};

export const getToastHistory = () => history;

export const clearToastHistory = () => {
  history = [];
  emit();
};

export const subscribeToastHistory = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useToastHistory = () =>
  useSyncExternalStore(subscribeToastHistory, getToastHistory, getToastHistory);
