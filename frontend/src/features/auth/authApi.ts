import { api } from "../api/api";
import type { AuthUser, Role } from "../../types";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  meta?: unknown;
};

export type LoginRequest = {
  identifier: string;
  password: string;
  role: Role;
};

export type LoginResponse = {
  token: string;
  refresh_token: string;
  user: AuthUser;
};

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body
      }),
      transformResponse: (response: ApiEnvelope<LoginResponse>) => response.data
    }),
    refresh: builder.mutation<{ token: string }, { refresh_token: string }>({
      query: (body) => ({
        url: "/auth/refresh",
        method: "POST",
        body
      }),
      transformResponse: (response: ApiEnvelope<{ token: string }>) => response.data
    }),
    logout: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST"
      }),
      transformResponse: (response: ApiEnvelope<{ success: boolean }>) => response.data
    })
  })
});

export const { useLoginMutation, useRefreshMutation, useLogoutMutation } = authApi;
