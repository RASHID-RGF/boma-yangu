import { create } from 'zustand';
import type { DashboardStats } from '@/types';

interface DashboardStore {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  setStats: (stats: DashboardStats) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  stats: null,
  loading: false,
  error: null,

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/dashboard');
      const data = await response.json();
      if (data.success) {
        set({ stats: data.data, loading: false });
      } else {
        set({ error: data.error, loading: false });
      }
    } catch {
      set({ error: 'Failed to fetch dashboard stats', loading: false });
    }
  },

  setStats: (stats) => set({ stats }),
}));
