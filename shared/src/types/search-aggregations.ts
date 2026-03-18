import type { ExtractorSourceId } from "../extractors";

export interface SearchAggregationRunRequest {
  term: string;
  sources: ExtractorSourceId[];
  limit?: number;
}

export interface SearchAggregationResultItem {
  source: ExtractorSourceId;
  title: string;
  employer: string;
  location: string | null;
  salary: string | null;
  jobUrl: string;
}

export interface SearchAggregationRunError {
  source: ExtractorSourceId;
  message: string;
}

export interface SearchAggregationRunResponse {
  term: string;
  sources: ExtractorSourceId[];
  results: SearchAggregationResultItem[];
  errors: SearchAggregationRunError[];
  tookMs: number;
}
