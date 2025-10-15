/**
 * Represents a simple manifest for report generation.
 */
export interface ReportManifest {
  readonly title: string;
}

/**
 * Generates the default report manifest used during Phase 0.
 */
export const createReportManifest = (): ReportManifest => {
  return {
    title: 'Crucible Trader Report Placeholder',
  };
};
