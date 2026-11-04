import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library normally registers its own cleanup via a GLOBAL afterEach, which only
// exists when Vitest runs with `globals: true`. This project keeps globals off and imports
// `describe`/`it`/`expect` explicitly, so auto-cleanup never registers and each render
// accumulates in the document — making queries like getByLabelText fail with
// "found multiple elements" from the second test onwards. Registering it explicitly.
afterEach(() => {
  cleanup();
});
