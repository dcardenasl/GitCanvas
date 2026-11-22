import { createHash } from "node:crypto";
import http from "node:http";

const owner = "e2e-owner";
const repository = "e2e-repo";
const releaseId = 91001;
const assetId = 91002;
const assetBytes = Buffer.from("synthetic release asset\n", "utf8");
const digest = `sha256:${createHash("sha256").update(assetBytes).digest("hex")}`;
const requests = [];

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  requests.push({
    method: request.method,
    path: url.pathname + url.search,
    authorization: request.headers.authorization ?? null,
  });

  if (url.pathname === "/_e2e/requests") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(requests));
    return;
  }

  const prefix = `/repos/${owner}/${repository}`;
  if (url.pathname === `${prefix}/releases` && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify([
        {
          id: releaseId,
          tag_name: "v1.0.0",
          name: "Synthetic E2E release",
          body: "Release notes from the local test server.",
          html_url: `https://github.com/${owner}/${repository}/releases/tag/v1.0.0`,
          draft: false,
          prerelease: false,
          published_at: "2026-11-22T12:00:00Z",
        },
      ]),
    );
    return;
  }
  if (url.pathname === `${prefix}/releases/${releaseId}`) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: releaseId, draft: false }));
    return;
  }
  if (url.pathname === `${prefix}/releases/${releaseId}/assets`) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify([
        {
          id: assetId,
          name: "synthetic.txt",
          size: assetBytes.byteLength,
          digest,
          url: `http://${server.address().address}:${server.address().port}${prefix}/releases/assets/${assetId}`,
        },
      ]),
    );
    return;
  }
  if (url.pathname === `${prefix}/releases/assets/${assetId}`) {
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(assetBytes.byteLength),
    });
    response.end(assetBytes);
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ message: "synthetic E2E route not found" }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") {
    process.stderr.write("failed to bind E2E release server\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`http://127.0.0.1:${String(address.port)}\n`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
