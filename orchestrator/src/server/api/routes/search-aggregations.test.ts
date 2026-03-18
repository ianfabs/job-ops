import type { Server } from "node:http";
import type { ExtractorManifest } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

vi.mock("@server/extractors/registry", () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce({
      success: true,
      jobs: [
        {
          source: "linkedin",
          title: "Software Engineer",
          employer: "Example Corp",
          jobUrl: "https://example.com/job-1",
          location: "London",
          salary: "£80k",
        },
      ],
    })
    .mockResolvedValue({
      success: true,
      jobs: [],
    });

  const manifest = {
    id: "jobspy",
    displayName: "JobSpy",
    providesSources: ["linkedin", "indeed"],
    run,
  } satisfies ExtractorManifest;

  return {
    getExtractorRegistry: vi.fn().mockResolvedValue({
      manifests: new Map([["jobspy", manifest]]),
      manifestBySource: new Map([
        ["linkedin", manifest],
        ["indeed", manifest],
      ]),
      availableSources: ["linkedin", "indeed"],
    }),
  };
});

describe.sequential("Search aggregation API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("validates request payload", async () => {
    const res = await fetch(`${baseUrl}/api/search-aggregations/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: "" }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("runs selected extractors and returns flat results", async () => {
    const res = await fetch(`${baseUrl}/api/search-aggregations/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: "software engineer",
        sources: ["linkedin", "indeed"],
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.term).toBe("software engineer");
    expect(body.data.sources).toEqual(["linkedin", "indeed"]);
    expect(body.data.results).toHaveLength(1);
    expect(body.data.results[0].title).toBe("Software Engineer");
    expect(body.data.results[0].source).toBe("linkedin");
    expect(typeof body.data.tookMs).toBe("number");
    expect(typeof body.meta.requestId).toBe("string");
  });
});
