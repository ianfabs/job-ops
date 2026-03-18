import { AppError, badRequest, serviceUnavailable } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getExtractorRegistry } from "@server/extractors/registry";
import * as settingsRepo from "@server/repositories/settings";
import {
  type ExtractorSourceId,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
} from "@shared/extractors";
import { normalizeCountryKey } from "@shared/location-support.js";
import type {
  SearchAggregationResultItem,
  SearchAggregationRunResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const searchAggregationsRouter = Router();

const searchAggregationRunSchema = z.object({
  term: z.string().trim().min(1).max(160),
  sources: z
    .array(
      z.enum(
        PIPELINE_EXTRACTOR_SOURCE_IDS as [
          (typeof PIPELINE_EXTRACTOR_SOURCE_IDS)[number],
          ...(typeof PIPELINE_EXTRACTOR_SOURCE_IDS)[number][],
        ],
      ),
    )
    .min(1),
  limit: z.number().int().min(1).max(500).optional(),
});

function toPipelineSourceId(
  source: ExtractorSourceId,
): ExtractorSourceId | null {
  return PIPELINE_EXTRACTOR_SOURCE_IDS.includes(source) ? source : null;
}

/**
 * POST /api/search-aggregations/run - Run selected extractor searches for a single term
 */
searchAggregationsRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const input = searchAggregationRunSchema.parse(req.body);
    const registry = await getExtractorRegistry();

    const unavailableSources = input.sources.filter(
      (source) => !registry.manifestBySource.has(source),
    );
    if (unavailableSources.length > 0) {
      return fail(
        res,
        badRequest("Requested extractors are not available at runtime", {
          unavailableSources,
        }),
      );
    }

    const settings = await settingsRepo.getAllSettings();
    const selectedCountry = normalizeCountryKey(
      settings.jobspyCountryIndeed ??
        settings.searchCities ??
        settings.jobspyLocation ??
        "united kingdom",
    );
    const filteredSettings = Object.fromEntries(
      Object.entries(settings).filter(
        ([, value]) =>
          typeof value === "string" || typeof value === "undefined",
      ),
    ) as Record<string, string | undefined>;
    const limit = input.limit ?? 120;
    const start = Date.now();

    const groupedByManifest = new Map<string, ExtractorSourceId[]>();
    for (const source of input.sources) {
      const manifest = registry.manifestBySource.get(source);
      if (!manifest) continue;
      const existing = groupedByManifest.get(manifest.id) ?? [];
      existing.push(source);
      groupedByManifest.set(manifest.id, existing);
    }

    const results: SearchAggregationResultItem[] = [];
    const errors: SearchAggregationRunResponse["errors"] = [];
    const dedupe = new Set<string>();

    await Promise.all(
      Array.from(groupedByManifest.entries()).map(
        async ([manifestId, groupedSources]) => {
          const manifest = registry.manifests.get(manifestId);
          if (!manifest) return;

          const primarySource = groupedSources[0];
          const pipelineSource = toPipelineSourceId(primarySource);
          if (!pipelineSource) {
            groupedSources.forEach((source) => {
              errors.push({
                source,
                message: "Source is not pipeline-compatible for this endpoint",
              });
            });
            return;
          }

          try {
            const runResult = await manifest.run({
              source: pipelineSource,
              selectedSources: groupedSources,
              settings: filteredSettings,
              searchTerms: [input.term],
              selectedCountry,
            });

            if (!runResult.success) {
              groupedSources.forEach((source) => {
                errors.push({
                  source,
                  message: runResult.error ?? "Extractor failed",
                });
              });
              return;
            }

            for (const job of runResult.jobs) {
              const dedupeKey = `${job.source}:${job.jobUrl}`;
              if (dedupe.has(dedupeKey)) continue;
              dedupe.add(dedupeKey);

              results.push({
                source: job.source,
                title: job.title,
                employer: job.employer,
                location: job.location ?? null,
                salary: job.salary ?? null,
                jobUrl: job.jobUrl,
              });
            }
          } catch (error) {
            groupedSources.forEach((source) => {
              errors.push({
                source,
                message:
                  error instanceof Error ? error.message : "Extractor failed",
              });
            });
          }
        },
      ),
    );

    const payload: SearchAggregationRunResponse = {
      term: input.term,
      sources: input.sources,
      results: results.slice(0, limit),
      errors,
      tookMs: Date.now() - start,
    };

    logger.info("Search aggregation run completed", {
      route: "/api/search-aggregations/run",
      selectedSources: input.sources,
      selectedCountry,
      resultCount: payload.results.length,
      errorCount: payload.errors.length,
      tookMs: payload.tookMs,
    });

    ok(res, payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("registry")
    ) {
      return fail(
        res,
        serviceUnavailable("Extractor registry unavailable for search run"),
      );
    }

    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});
