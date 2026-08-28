/** Small helpers so every function answers in the same shape. */
export function json(res: any, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

export function methodOnly(req: any, res: any, method: string): boolean {
  if (req.method !== method) {
    res.setHeader("Allow", method);
    json(res, 405, { error: "method_not_allowed" });
    return false;
  }
  return true;
}

/** Reads the untouched request body — webhook signatures cover raw bytes. */
export function rawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => { data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
