import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { writable } from "svelte/store";

import {
  clearStoredToken,
  completeOnboarding,
  getCurrentUser,
  getStoredToken,
  login as loginRequest,
  register as registerRequest,
  storeToken,
} from "$lib/api";
import type { User } from "$lib/types";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    token: null,
    loading: false,
    initialized: false,
    error: null,
  });

  return {
    subscribe,
    async init() {
      if (!browser) {
        return;
      }

      const token = getStoredToken();
      if (!token) {
        update((state) => ({ ...state, initialized: true }));
        return;
      }

      update((state) => ({ ...state, token, loading: true, error: null }));
      try {
        const user = await getCurrentUser();
        set({ user, token, loading: false, initialized: true, error: null });
      } catch (error) {
        clearStoredToken();
        set({
          user: null,
          token: null,
          loading: false,
          initialized: true,
          error: error instanceof Error ? error.message : "Session expired",
        });
      }
    },
    async login(email: string, password: string) {
      update((state) => ({ ...state, loading: true, error: null }));
      try {
        const response = await loginRequest(email, password);
        storeToken(response.token);
        set({
          user: response.user,
          token: response.token,
          loading: false,
          initialized: true,
          error: null,
        });
        await goto("/");
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          initialized: true,
          error: error instanceof Error ? error.message : "Login failed",
        }));
      }
    },
    async register(email: string, password: string) {
      update((state) => ({ ...state, loading: true, error: null }));
      try {
        const response = await registerRequest(email, password);
        storeToken(response.token);
        set({
          user: response.user,
          token: response.token,
          loading: false,
          initialized: true,
          error: null,
        });
        await goto("/");
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          initialized: true,
          error: error instanceof Error ? error.message : "Registration failed",
        }));
      }
    },
    async dismissOnboarding() {
      try {
        await completeOnboarding();
      } catch {
        // Best-effort — worst case the banner reappears next session.
      }
      update((state) =>
        state.user ? { ...state, user: { ...state.user, onboarding_completed: true } } : state
      );
    },
    async logout() {
      clearStoredToken();
      set({
        user: null,
        token: null,
        loading: false,
        initialized: true,
        error: null,
      });
      await goto("/login");
    },
  };
}

export const auth = createAuthStore();
