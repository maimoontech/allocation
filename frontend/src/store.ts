import { configureStore } from "@reduxjs/toolkit";
import { api } from "./features/api/api";
import { authReducer } from "./features/auth/authSlice";
import { memberProfileReducer } from "./features/member/memberProfileSlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    memberProfile: memberProfileReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

