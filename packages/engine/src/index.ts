/**
 * Describes identifying metadata for the engine module.
 */
export interface EngineManifest {
  readonly id: string;
  readonly version: string;
}

/**
 * Returns a manifest that identifies the placeholder engine implementation.
 */
export const createEngineManifest = (): EngineManifest => {
  return {
    id: 'engine-placeholder',
    version: '0.0.1',
  };
};
