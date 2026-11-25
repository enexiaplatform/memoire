// Invoke once per scheduled tick with a short-lived, workspace-bound Memoire user token.
const endpoint = new URL(
  "/api/commercial?resource=atlas-reference",
  process.env.MEMOIRE_RECEIVER_ORIGIN,
);
if (
  endpoint.protocol !== "https:" &&
  !(endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1")
)
  throw Error("Invalid receiver origin");
const token = process.env.MEMOIRE_POLL_TOKEN;
const workspace = process.env.MEMOIRE_POLL_WORKSPACE;
if (!token || !workspace) throw Error("Missing polling identity");
for (let page = 0; page < 10; page++) {
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: {
      authorization: "Bearer " + token,
      "x-memoire-data-workspace": workspace,
      "content-type": "application/json",
    },
    body: JSON.stringify({ command: "sync" }),
  });
  if (response.status === 429) {
    console.info("Receiver backoff active");
    break;
  }
  if (!response.ok) throw Error("Receiver returned HTTP " + response.status);
  const result = await response.json();
  console.info(
    JSON.stringify({ processed: result.processed, checkpoint: result.after }),
  );
  if (!result.more) break;
}
