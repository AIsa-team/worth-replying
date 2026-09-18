/**
 * POST `body` to a streaming endpoint and hand each newline-delimited JSON
 * event to `onEvent` as it arrives. Rejects with the server's own message when
 * the request is refused before the stream starts.
 */
export async function postNdjson<Event>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: Event) => void,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const problem = await res.json().catch(() => null);
    throw new Error(problem?.error ?? `The request failed (${res.status}).`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line) onEvent(JSON.parse(line) as Event);
    }
  }
}
