import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthUser } from "../../types";
import { authStorage } from "../../utils/storage";

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
};

const initialState: AuthState = {
  token: authStorage.getToken(),
  refreshToken: authStorage.getRefreshToken(),
  user: authStorage.getUser()
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuth(
      state,
      action: PayloadAction<{ token: string; refreshToken: string; user: AuthUser }>
    ) {
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.user = action.payload.user;
      authStorage.setToken(state.token);
      authStorage.setRefreshToken(state.refreshToken);
      authStorage.setUser(state.user);
    },
    /**
     * Swaps the access token alone, keeping the refresh token and user.
     *
     * Used by the 401 interceptor after a successful refresh: `POST /auth/refresh` returns a
     * new access token and nothing else, so overwriting the whole slice with `setAuth` would
     * need a user object it was never given.
     */
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
      authStorage.setToken(state.token);
    },

    clearAuth(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      authStorage.clear();
    }
  }
});

export const { setAuth, setToken, clearAuth } = authSlice.actions;
export const authReducer = authSlice.reducer;

