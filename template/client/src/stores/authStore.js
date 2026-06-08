import { create } from 'zustand';
import * as authService from '../services/authService';

const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  loading: true,

  setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),

  clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),

  initAuth: async () => {
    try {
      const refreshData = await authService.refresh();
      const profileData = await authService.getProfile();
      set({
        user: profileData.user,
        accessToken: refreshData.accessToken,
        isAuthenticated: true,
      });
    } catch {
      get().clearAuth();
    } finally {
      set({ loading: false });
    }
  },
}));

export default useAuthStore;
