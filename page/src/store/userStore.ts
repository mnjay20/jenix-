import { create } from "zustand";
import { socketStore } from "./socketstore";

const BACKEND_URL = "http://localhost:3000";

export interface UserProfile {
    userId: string;
    Sessions: string[];
}

export interface UserState {
    user: UserProfile | null;
    isLoggedIn: boolean;
    syncError: string | null;
    login: (username: string) => Promise<void>;
    logout: () => void;
}

export const userStore = create<UserState>((set) => ({
    user: null,
    isLoggedIn: false,
    syncError: null,

    login: async (username: string) => {
        try {
            set({ syncError: null });
            const response = await fetch(`${BACKEND_URL}/api/users/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: username }),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to sync user with server.");
            }

            set({
                user: { userId: username, Sessions: [] },
                isLoggedIn: true,
                syncError: null,
            });

            // Automatically sync & fetch all user sessions from MongoDB upon login
            socketStore.getState().fetchUserSessions(username);
        } catch (error: any) {
            const errorMsg = error.message || "Network error syncing user profile.";
            set({ syncError: errorMsg });
            throw new Error(errorMsg);
        }
    },

    logout: () => {
        set({
            user: null,
            isLoggedIn: false,
            syncError: null,
        });
    },
}));

export const useUserStore = userStore;
