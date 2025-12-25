import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

export interface HttpRequestOptions {
  readonly headers?: Record<string, string | number | undefined>;
  readonly timeoutMs?: number;
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly body: string;
  readonly headers: Record<string, string | string[] | undefined>;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

/**
 * Minimal HTTP client wrapper so sources can be tested without real network calls.
 */
export const createHttpClient = (): HttpClient => {
  return {
    get: (url, options = {}) => {
      const target = new URL(url);
      const requestFactory = target.protocol === "http:" ? httpRequest : httpsRequest;

      return new Promise<HttpResponse>((resolve, reject) => {
        const req = requestFactory(
          {
            method: "GET",
            hostname: target.hostname,
            path: `${target.pathname}${target.search}`,
            port: target.port || undefined,
            headers: options.headers,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            res.on("end", () => {
              resolve({
                statusCode: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf-8"),
                headers: res.headers,
              });
            });
          },
        );

        req.on("error", (error) => reject(error));

        if (options.timeoutMs) {
          req.setTimeout(options.timeoutMs, () => {
            req.destroy(new Error("request timed out"));
          });
        }

        req.end();
      });
    },
  };
};
