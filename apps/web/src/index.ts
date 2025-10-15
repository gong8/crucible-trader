/**
 * Emits a deterministic log indicating the web scaffold is available.
 */
export const startWebApp = (): void => {
  console.info(
    JSON.stringify({
      ts: '1970-01-01T00:00:00.000Z',
      level: 'info',
      module: 'apps/web',
      msg: 'Phase 0 scaffold ready',
    })
  );
};

startWebApp();
