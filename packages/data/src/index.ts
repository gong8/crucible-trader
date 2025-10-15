/**
 * Identifies supported data source descriptors for Phase 0 scaffolding.
 */
export interface DataSourceDescriptor {
  readonly id: string;
  readonly kind: 'stub';
}

/**
 * Provides a descriptor for the CSV data source placeholder.
 */
export const createCsvDataSourceDescriptor = (): DataSourceDescriptor => {
  return {
    id: 'csv-source-placeholder',
    kind: 'stub',
  };
};
