import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { corsOptions, terminalErrorHandler } from "../middleware/httpBoundary";
import { env } from "../config/env";
import { pool } from "../db/pool";

/**
 * THE HTTP BOUNDARY: who may call the API, and what a failure looks like.
 *
 * This file exists because of a real report. A user saw "Internal server error" at the login
 * screen, twice, and it could not be reproduced with curl — because curl sends no `Origin`
 * header, so the CORS check never fired. A browser served from an origin that was not
 * allow-listed hit `callback(new Error("CORS_NOT_ALLOWED"))`, which `cors` hands to Express,
 * which routed it to the terminal handler, which answered 500.
 *
 * Two bugs in one: the status was wrong (nothing had failed on the server), and the message
 * gave nobody a way to fix it. And the two handlers responsible were the only middleware in
 * the application with no tests, because they lived inline in `server.ts`, which cannot be
 * imported — it binds a port at module scope.
 *
 * The specific trap worth remembering: a browser sends `Origin` on a **POST** even when it is
 * same-origin, but not on a same-origin GET. So pages loaded fine and only *signing in* broke,
 * which is exactly how it was reported and exactly what made it look like an auth bug.
 */

/** The real middleware, around a route that does nothing and one that throws. */
function boundaryApp() {
  const app = express();
  app.use(cors(corsOptions));
  app.use(express.json());
  app.post("/echo", (_req, res) => res.json({ success: true, data: null, message: "OK" }));
  app.get("/boom", () => {
    const err: any = new Error("Duplicate entry 'AB-' for key 'x'");
    err.code = "ER_NO_SUCH_TABLE";
    err.sql = "SELECT blood_group, height_cm FROM member_profiles";
    throw err;
  });
  app.get("/dup", () => {
    const err: any = new Error("nope");
    err.code = "ER_DUP_ENTRY";
    throw err;
  });
  app.use(terminalErrorHandler);
  return app;
}

afterAll(async () => {
  await pool.end();
});

describe("which origins may call the API", () => {
  it("allows a request with no Origin at all", async () => {
    // curl, a health check, anything server-to-server. Not a browser, so no CORS to apply.
    const res = await request(boundaryApp()).post("/echo").send({});
    expect(res.status).toBe(200);
  });

  it.each(env.cors.allowedOrigins)("allows the configured origin %s", async (origin) => {
    const res = await request(boundaryApp()).post("/echo").set("Origin", origin).send({});
    expect(res.status).toBe(200);
  });

  // The bug, stated directly: both spellings of localhost must work, because a browser treats
  // them as different origins and Vite serves both.
  it.each(["http://localhost:5173", "http://127.0.0.1:5173"])(
    "allows %s, since a browser treats these as different origins",
    async (origin) => {
      const res = await request(boundaryApp()).post("/echo").set("Origin", origin).send({});
      expect(res.status).toBe(200);
    }
  );

  it("refuses an unknown origin with 403, not 500", async () => {
    const res = await request(boundaryApp())
      .post("/echo")
      .set("Origin", "https://not-ours.example")
      .send({});

    // 403 is the point. A 500 here said the server had broken, which it had not.
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("https://not-ours.example");
    expect(res.body.message).toContain("CORS_ALLOWED_ORIGINS");
    expect(res.body.data.origin).toBe("https://not-ours.example");
  });

  it("does not treat a refused origin as a server fault", async () => {
    // No error reference, and nothing written to stderr: there is no fault to trace.
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);

    try {
      const res = await request(boundaryApp())
        .post("/echo")
        .set("Origin", "https://not-ours.example")
        .send({});

      expect(res.body.data.ref).toBeUndefined();
      expect(res.body.message).not.toMatch(/Internal server error/);
      expect(writes.join("")).not.toContain("[error");
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses an origin that differs only by port", async () => {
    const res = await request(boundaryApp())
      .post("/echo")
      .set("Origin", "http://localhost:3000")
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("what a real failure looks like", () => {
  it("answers 500 with a reference and logs one narrow line", async () => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);

    let res: any;
    try {
      res = await request(boundaryApp()).get("/boom");
    } finally {
      spy.mockRestore();
    }

    expect(res.status).toBe(500);
    const ref = res.body.data.ref;
    expect(ref).toMatch(/^[0-9a-f]{8}$/);
    expect(res.body.message).toContain(ref);

    const logged = writes.join("");
    expect(logged).toContain(`[error ${ref}]`);
    expect(logged).toContain("GET /boom");
    expect(logged).toContain("ER_NO_SUCH_TABLE");

    // And nothing the query carried. This is the guarantee the whole design turns on.
    for (const leak of ["AB-", "height_cm", "member_profiles", "SELECT", "Duplicate entry"]) {
      expect(logged).not.toContain(leak);
    }
    expect(logged.trim().split("\n")).toHaveLength(1);
  });

  it("gives two failures two different references", async () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((() => true) as typeof process.stderr.write);
    try {
      const a = await request(boundaryApp()).get("/boom");
      const b = await request(boundaryApp()).get("/boom");
      expect(a.body.data.ref).not.toBe(b.body.data.ref);
    } finally {
      spy.mockRestore();
    }
  });

  it("still maps a duplicate key to 409 without a reference", async () => {
    const res = await request(boundaryApp()).get("/dup");
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Duplicate entry");
    expect(res.body.data).toBeNull();
  });
});
