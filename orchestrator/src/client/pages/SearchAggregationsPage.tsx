import {
  EXTRACTOR_SOURCE_METADATA,
  type ExtractorSourceId,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
} from "@shared/extractors";
import type { SearchAggregationResultItem } from "@shared/types.js";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "../api";
import { PageHeader, PageMain, SectionCard } from "../components";

export const SearchAggregationsPage: React.FC = () => {
  const [term, setTerm] = useState("");
  const [sources, setSources] = useState<ExtractorSourceId[]>(["linkedin"]);
  const [results, setResults] = useState<SearchAggregationResultItem[]>([]);
  const [errors, setErrors] = useState<
    Array<{ source: string; message: string }>
  >([]);
  const [lastRanTerm, setLastRanTerm] = useState<string | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);

  const sourceOptions = useMemo(
    () =>
      [...PIPELINE_EXTRACTOR_SOURCE_IDS].sort(
        (left, right) =>
          EXTRACTOR_SOURCE_METADATA[left].order -
          EXTRACTOR_SOURCE_METADATA[right].order,
      ),
    [],
  );

  const searchMutation = useMutation({
    mutationFn: api.runSearchAggregation,
    onSuccess: (data) => {
      setResults(data.results);
      setErrors(data.errors);
      setLastRanTerm(data.term);
      setTookMs(data.tookMs);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Search aggregation failed";
      toast.error(message);
    },
  });

  const toggleSource = (source: ExtractorSourceId, checked: boolean) => {
    setSources((prev) => {
      if (checked) return [...new Set([...prev, source])];
      return prev.filter((value) => value !== source);
    });
  };

  const runSearch = async () => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      toast.error("Enter a search term first.");
      return;
    }
    if (sources.length === 0) {
      toast.error("Select at least one extractor.");
      return;
    }

    await searchMutation.mutateAsync({
      term: trimmedTerm,
      sources,
      limit: 120,
    });
  };

  return (
    <>
      <PageHeader
        icon={Search}
        title="Search Aggregations"
        subtitle="Quick scrape POC by term + selected extractors"
      />

      <PageMain className="space-y-4">
        <SectionCard className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search-aggregation-term">Search term</Label>
            <div className="flex gap-2">
              <Input
                id="search-aggregation-term"
                placeholder="e.g. software engineer"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => void runSearch()}
                disabled={searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running
                  </>
                ) : (
                  "Run Search"
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Extractors to search for</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sourceOptions.map((source) => {
                const checked = sources.includes(source);
                const id = `search-aggregation-source-${source}`;
                return (
                  <div
                    key={source}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleSource(source, value === true)
                      }
                    />
                    <Label htmlFor={id} className="cursor-pointer">
                      {EXTRACTOR_SOURCE_METADATA[source].label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Results</span>
            {lastRanTerm ? (
              <Badge variant="outline">{lastRanTerm}</Badge>
            ) : null}
            {tookMs !== null ? (
              <Badge variant="outline">{`${tookMs}ms`}</Badge>
            ) : null}
            <Badge variant="outline">{`${results.length} items`}</Badge>
          </div>

          {errors.length > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              {errors.map((error, index) => (
                <p key={`${error.source}-${index}`}>
                  {error.source}: {error.message}
                </p>
              ))}
            </div>
          ) : null}

          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Run a search to see scraped jobs here.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((result) => (
                <li
                  key={`${result.source}-${result.jobUrl}`}
                  className="rounded-md border border-border/60 bg-background/30 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={result.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {result.title}
                    </a>
                    <Badge variant="outline">
                      {EXTRACTOR_SOURCE_METADATA[result.source].label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {result.employer}
                    {result.location ? ` • ${result.location}` : ""}
                    {result.salary ? ` • ${result.salary}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </PageMain>
    </>
  );
};
