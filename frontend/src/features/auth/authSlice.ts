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
    clearAuth(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      authStorage.clear();
    }
  }
});

export const { setAuth, clearAuth } = authSlice.actions;
export const authReducer = authSlice.reducer;

