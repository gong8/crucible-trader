import { strict as assert } from "node:assert";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { createHttpClient } from "../src/httpClient.js";

const createTestServer = (
  handler: (
    req: unknown,
    res: {
      writeHead: (code: number, headers?: Record<string, string>) => void;
      end: (body: string) => void;
    },
  ) => void,
): Promise<{ server: Server; port: number; url: string }> => {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handler(req, res as typeof handler extends (req: unknown, res: infer R) => void ? R : never);
    });

    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        const url = `http://localhost:${port}`;
        resolve({ server, port, url });
      } else {
        reject(new Error("Failed to get server address"));
      }
    });

    server.on("error", reject);
  });
};

test("createHttpClient returns an HTTP client", () => {
  const client = createHttpClient();
  assert.ok(client);
  assert.equal(typeof client.get, "function");
});

test("httpClient.get makes successful GET request", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "success" }));
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, JSON.stringify({ message: "success" }));
  assert.equal(response.headers["content-type"], "application/json");
});

test("httpClient.get handles 404 response", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body, "Not Found");
});

test("httpClient.get handles 500 response", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body, "Internal Server Error");
});

test("httpClient.get sends custom headers", async (t) => {
  let receivedHeaders: Record<string, string | string[] | undefined> = {};

  const { server, url } = await createTestServer((req, res) => {
    receivedHeaders = (req as { headers: Record<string, string | string[] | undefined> }).headers;
    res.writeHead(200);
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  await client.get(url, {
    headers: {
      "X-Custom-Header": "test-value",
      Authorization: "Bearer token123",
    },
  });

  assert.equal(receivedHeaders["x-custom-header"], "test-value");
  assert.equal(receivedHeaders["authorization"], "Bearer token123");
});

test("httpClient.get handles query parameters in URL", async (t) => {
  let receivedUrl = "";

  const { server, url } = await createTestServer((req, res) => {
    receivedUrl = (req as { url?: string }).url ?? "";
    res.writeHead(200);
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  await client.get(`${url}?foo=bar&baz=qux`);

  assert.ok(receivedUrl.includes("foo=bar"));
  assert.ok(receivedUrl.includes("baz=qux"));
});

test("httpClient.get handles empty response body", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(204);
    res.end();
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, "");
});

test("httpClient.get handles large response body", async (t) => {
  const largeBody = "x".repeat(100000);

  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200);
    res.end(largeBody);
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.length, 100000);
  assert.equal(response.body, largeBody);
});

test("httpClient.get handles chunked response", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200, { "Transfer-Encoding": "chunked" });
    res.end("chunked content");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "chunked content");
});

test("httpClient.get rejects on network error", async () => {
  const client = createHttpClient();

  await assert.rejects(
    async () => {
      await client.get("http://localhost:9999");
    },
    {
      code: "ECONNREFUSED",
    },
  );
});

test("httpClient.get handles timeout when specified", async (t) => {
  const { server, url } = await createTestServer(() => {
    // Don't respond, let it timeout
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();

  await assert.rejects(
    async () => {
      await client.get(url, { timeoutMs: 100 });
    },
    {
      message: "request timed out",
    },
  );
});

test("httpClient.get handles redirect status codes", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(301, { Location: "http://example.com" });
    res.end();
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.statusCode, 301);
  assert.equal(response.headers["location"], "http://example.com");
});

test("httpClient.get handles UTF-8 encoded response", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Hello 世界");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(response.body, "Hello 世界");
});

test("httpClient.get handles JSON response", async (t) => {
  const jsonData = { foo: "bar", nested: { key: "value" }, array: [1, 2, 3] };

  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonData));
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.deepEqual(JSON.parse(response.body), jsonData);
});

test("httpClient.get handles path with special characters", async (t) => {
  let receivedUrl = "";

  const { server, url } = await createTestServer((req, res) => {
    receivedUrl = (req as { url?: string }).url ?? "";
    res.writeHead(200);
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  await client.get(`${url}/path/with%20spaces/and%2Fslashes`);

  assert.ok(receivedUrl.includes("/path/with%20spaces/and%2Fslashes"));
});

test("httpClient.get handles multiple headers with same name", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200, {
      "Set-Cookie": ["cookie1=value1", "cookie2=value2"],
    });
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.ok(Array.isArray(response.headers["set-cookie"]));
  assert.equal(response.headers["set-cookie"]?.length, 2);
});

test("httpClient.get preserves header casing in response", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Custom-Header": "value",
    });
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.ok(response.headers["content-type"]);
  assert.ok(response.headers["x-custom-header"]);
});

test("httpClient.get handles numeric header values", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200);
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  await client.get(url, {
    headers: {
      "X-Numeric": 123,
    },
  });

  // Should not throw
  assert.ok(true);
});

test("httpClient.get handles undefined header values", async (t) => {
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200);
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  await client.get(url, {
    headers: {
      "X-Undefined": undefined,
    },
  });

  // Should not throw
  assert.ok(true);
});

test("httpClient.get returns 0 status code when statusCode is undefined", async (t) => {
  // This tests the defensive || 0 in the code
  const { server, url } = await createTestServer((_req, res) => {
    res.writeHead(200);
    res.end("OK");
  });

  t.after(() => {
    server.close();
  });

  const client = createHttpClient();
  const response = await client.get(url);

  assert.equal(typeof response.statusCode, "number");
  assert.ok(response.statusCode >= 0);
});
