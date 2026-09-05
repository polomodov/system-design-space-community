import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const TIMEOUT_SECONDS = Number.parseInt(process.env.LINK_CHECK_TIMEOUT ?? '20', 10);
export const probe = async (url) => {
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    String(TIMEOUT_SECONDS),
    "--retry",
    "1",
    "--user-agent",
    "Mozilla/5.0 (compatible; system-design-space link check)",
    "--output",
    "/dev/null",
    "--write-out",
    "%{http_code}",
    url,
  ];

  try {
    const { stdout } = await execFileAsync("curl", ["--head", ...args], { timeout: (TIMEOUT_SECONDS + 5) * 1000 });
    const status = Number.parseInt(stdout.trim(), 10);
    if (status >= 200 && status < 400) {
      return { url, status };
    }
    // Часть хостов не отвечает на HEAD: повторяем обычным GET, прежде чем
    // объявлять ссылку мёртвой.
    const retry = await execFileAsync("curl", args, { timeout: (TIMEOUT_SECONDS + 5) * 1000 });
    return { url, status: Number.parseInt(retry.stdout.trim(), 10) };
  } catch (error) {
    return { url, status: 0, error: String(error.message ?? error).slice(0, 120) };
  }
};
