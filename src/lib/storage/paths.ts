import path from "node:path";

function resolveFromCwd(value: string) {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

export function getFortexaStoreDir() {
  const configured = process.env.FORTEXA_STORE_DIR?.trim();
  if (configured) {
    return resolveFromCwd(configured);
  }

  if (process.env.VERCEL === "1") {
    return path.join("/tmp", "fortexa");
  }

  return path.join(process.cwd(), ".fortexa");
}

export function getFortexaStorePath(fileName: string) {
  return path.join(getFortexaStoreDir(), fileName);
}