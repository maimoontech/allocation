import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { api } from "./features/api/api";
import { authReducer } from "./features/auth/authSlice";
import { memberProfileReducer } from "./features/member/memberProfileSlice";

/**
 * A fresh store per test, rather than the app's singleton from `store.ts`.
 *
 * The singleton would carry RTK Query cache and auth state between tests, so one test
 * signing in would change what the next one sees. Building a new store each time keeps them
 * independent. The reducer map mirrors `store.ts`; if that file gains a slice, add it here
 * too.
 */
export function makeTestStore() {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
      memberProfile: memberProfileReducer
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware)
  });
}

export type TestStore = ReturnType<typeof makeTestStore>;

/**
 * Renders a component inside the providers it needs: Redux for state and RTK Query, and a
 * router for `useNavigate` and `Link`.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; store?: TestStore } = {}
) {
  const store = options.store ?? makeTestStore();
  const route = options.route ?? "/";

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper }) };
}
