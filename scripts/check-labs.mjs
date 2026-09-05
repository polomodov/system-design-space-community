import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const LAB_CONTRACTS = JSON.parse(readFileSync(new URL("../contracts/labs.json", import.meta.url), "utf8"));

const ROOT_DIR = process.cwd();
const REQUIRED_SCRIPTS = [
  "_common.sh",
  "start.sh",
  "inject-failure.sh",
  "check.sh",
  "apply-solution.sh",
  "reset.sh",
];



const safeRead = (filePath, errors, label) => {
  if (!existsSync(filePath)) {
    errors.push(`${label}: missing file`);
    return "";
  }
  const contents = readFileSync(filePath, "utf8");
  if (contents.trim().length === 0) {
    errors.push(`${label}: file must not be empty`);
  }
  return contents;
};

export const isPinnedImageReference = (reference) => {
  if (typeof reference !== "string" || reference.includes("${")) return false;
  if (/@sha256:[0-9a-f]{64}$/i.test(reference)) return true;
  const tag = reference.match(/:([^/@]+)$/)?.[1];
  return Boolean(tag && /^(?:v)?\d+(?:\.\d+){1,3}(?:[-.][a-z0-9]+)*$/i.test(tag));
};

const validateDocs = (contract, labDir, errors) => {
  const variants = [
    {
      file: "README.md",
      headings: ["## Прогноз", "## Запуск", "## Инъекция отказа", "## Решение", "## Безопасный reset"],
    },
    {
      file: "README.en.md",
      headings: ["## Prediction", "## Start", "## Fault injection", "## Solution", "## Safe reset"],
    },
  ];
  const commands = ["start.sh", "check.sh healthy", "inject-failure.sh", "check.sh failure", "apply-solution.sh", "check.sh solution", "reset.sh"];

  for (const variant of variants) {
    const label = `${contract.id}/${variant.file}`;
    const contents = safeRead(path.join(labDir, variant.file), errors, label);
    for (const heading of variant.headings) {
      if (!contents.includes(heading)) errors.push(`${label}: missing section ${JSON.stringify(heading)}`);
    }
    for (const command of commands) {
      if (!contents.includes(command)) errors.push(`${label}: missing command containing ${JSON.stringify(command)}`);
    }
    for (const image of contract.images) {
      if (!contents.includes(image)) errors.push(`${label}: must document pinned image ${image}`);
    }
  }
};

const validateCompose = (contract, labDir, errors) => {
  const label = `${contract.id}/compose.yaml`;
  const contents = safeRead(path.join(labDir, "compose.yaml"), errors, label);
  if (!contents) return;

  if (!new RegExp(`^name:\\s*${contract.project.replaceAll("-", "\\-")}\\s*$`, "m").test(contents)) {
    errors.push(`${label}: top-level name must be ${contract.project}`);
  }
  for (const service of contract.services) {
    if (!new RegExp(`^  ${service.replaceAll("-", "\\-")}:\\s*$`, "m").test(contents)) {
      errors.push(`${label}: missing lab-scoped service ${service}`);
    }
  }

  const imageReferences = [...contents.matchAll(/^\s+image:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
  if (imageReferences.length === 0) errors.push(`${label}: at least one image is required`);
  for (const image of imageReferences) {
    if (!isPinnedImageReference(image)) errors.push(`${label}: image is not version/digest pinned: ${image}`);
  }
  for (const expected of contract.images) {
    if (!imageReferences.includes(expected)) errors.push(`${label}: missing expected pinned image ${expected}`);
  }

  const forbidden = [
    [/\bprivileged:\s*true\b/i, "privileged containers"],
    [/\bnetwork_mode:\s*["']?host\b/i, "host networking"],
    [/\/var\/run\/docker\.sock/i, "Docker socket mounts"],
    [/\bexternal:\s*true\b/i, "external Compose resources"],
    [/\bcontainer_name:/i, "global container names"],
    [/\bports:\s*(?:\n|\[)/i, "published host ports"],
    [/:latest(?:\s|$)/i, "floating latest tags"],
    [/\$\{[^}]+\}/, "environment-dependent interpolation"],
  ];
  for (const [pattern, description] of forbidden) {
    if (pattern.test(contents)) errors.push(`${label}: forbidden ${description}`);
  }

  if (!contents.includes(`${contract.project}-network`)) {
    errors.push(`${label}: must name its lab-scoped network`);
  }
  if (!/^\s+healthcheck:\s*$/m.test(contents)) {
    errors.push(`${label}: must define deterministic service health checks`);
  }
  if (/^\s+volumes:\s*$/m.test(contents) && !contents.includes(`${contract.project}-data`)) {
    errors.push(`${label}: named volumes must use the lab project prefix`);
  }
};

const validateScripts = (contract, labDir, errors) => {
  const scriptsDir = path.join(labDir, "scripts");
  const scripts = [];
  for (const scriptName of REQUIRED_SCRIPTS) {
    const filePath = path.join(scriptsDir, scriptName);
    const label = `${contract.id}/scripts/${scriptName}`;
    const contents = safeRead(filePath, errors, label);
    scripts.push(contents);
    if (!contents) continue;
    if (!contents.startsWith("#!/bin/sh\n")) errors.push(`${label}: must use a portable /bin/sh shebang`);
    if (!/^set -eu$/m.test(contents)) errors.push(`${label}: must enable set -eu`);
    if (scriptName !== "_common.sh" && !contents.includes("/_common.sh")) {
      errors.push(`${label}: must resolve and source its workspace-local _common.sh`);
    }
    if (existsSync(filePath) && (lstatSync(filePath).mode & 0o111) === 0) {
      errors.push(`${label}: script must be executable`);
    }
    const syntax = spawnSync("sh", ["-n", filePath], { encoding: "utf8" });
    if (syntax.status !== 0) errors.push(`${label}: shell syntax error: ${(syntax.stderr || syntax.stdout).trim()}`);
  }

  const auxiliaryScripts = existsSync(scriptsDir)
    ? readdirSync(scriptsDir)
        .filter((fileName) => !REQUIRED_SCRIPTS.includes(fileName))
        .map((fileName) => readFileSync(path.join(scriptsDir, fileName), "utf8"))
    : [];
  const allScripts = [...scripts, ...auxiliaryScripts].join("\n");
  const common = scripts[0] ?? "";
  const reset = scripts.at(-1) ?? "";
  if (!common.includes(`COMPOSE_PROJECT=${contract.project}`)) {
    errors.push(`${contract.id}/scripts/_common.sh: explicit Compose project mismatch`);
  }
  if (!common.includes("--project-name \"$COMPOSE_PROJECT\"") || !common.includes("--file \"$COMPOSE_FILE\"")) {
    errors.push(`${contract.id}/scripts/_common.sh: every Compose call must resolve explicit project and file`);
  }
  if (!reset.includes("compose down --volumes --remove-orphans")) {
    errors.push(`${contract.id}/scripts/reset.sh: reset must use scoped compose down with volumes and orphans`);
  }
  for (const [pattern, description] of [
    [/docker\s+system\s+prune/i, "docker system prune"],
    [/docker\s+(?:container|network|volume)?\s*prune/i, "global Docker prune"],
    [/\brm\s+-[A-Za-z]*r[A-Za-z]*f\b|\brm\s+-[A-Za-z]*f[A-Za-z]*r\b/, "recursive forced removal"],
    [/docker\s+(?:rm|rmi)\b/i, "direct Docker deletion"],
  ]) {
    if (pattern.test(allScripts)) errors.push(`${contract.id}/scripts: forbidden ${description}`);
  }

  const checkIds = contract.checkIds;
  for (const checkId of checkIds) {
    if (!allScripts.includes(checkId)) {
      errors.push(`${contract.id}/scripts: missing catalog check ID ${checkId}`);
    }
  }
};

export const validateLocalLabWorkspaces = (rootDir = ROOT_DIR) => {
  const errors = [];

  for (const contract of LAB_CONTRACTS) {
    const labDir = path.resolve(rootDir, "labs", contract.id);
    const expectedDir = path.join(path.resolve(rootDir, "labs"), contract.id);
    if (labDir !== expectedDir) {
      errors.push(`${contract.id}: workspace escaped the labs directory`);
      continue;
    }
    if (!existsSync(labDir)) {
      errors.push(`${contract.id}: missing workspace directory`);
      continue;
    }
    validateCompose(contract, labDir, errors);
    validateDocs(contract, labDir, errors);
    validateScripts(contract, labDir, errors);
    for (const fileName of contract.starterFiles) {
      safeRead(path.join(labDir, "starter", fileName), errors, `${contract.id}/starter/${fileName}`);
    }
    for (const fileName of contract.solutionFiles) {
      safeRead(path.join(labDir, "solution", fileName), errors, `${contract.id}/solution/${fileName}`);
    }
  }

  return errors.sort((left, right) => left.localeCompare(right));
};

const commandWorks = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30_000 });
  return result.status === 0;
};

export const detectDockerRuntime = () => {
  const daemon = commandWorks("docker", ["info"]);
  if (!daemon) return { available: false, reason: "Docker daemon is unavailable" };
  if (commandWorks("docker", ["compose", "version"])) {
    return { available: true, compose: "docker compose" };
  }
  if (commandWorks("docker-compose", ["version"])) {
    return { available: true, compose: "docker-compose" };
  }
  return { available: false, reason: "Docker Compose is unavailable" };
};

const runScript = (labDir, scriptName, args = []) => {
  const scriptPath = path.resolve(labDir, "scripts", scriptName);
  const scriptsRoot = path.resolve(labDir, "scripts") + path.sep;
  if (!scriptPath.startsWith(scriptsRoot)) throw new Error(`Unsafe script path: ${scriptPath}`);
  console.log(`\n[local-labs] ${path.basename(labDir)}: ${scriptName} ${args.join(" ")}`.trimEnd());
  const result = spawnSync(scriptPath, args, {
    cwd: labDir,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 8 * 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(labDir)}/${scriptName} exited ${result.status}`);
};

export const runLocalLabSmoke = (rootDir = ROOT_DIR) => {
  for (const contract of LAB_CONTRACTS) {
    const labDir = path.resolve(rootDir, "labs", contract.id);
    runScript(labDir, "reset.sh");
    try {
      runScript(labDir, "start.sh");
      runScript(labDir, "check.sh", ["healthy"]);
      runScript(labDir, "inject-failure.sh");
      runScript(labDir, "check.sh", ["failure"]);
      runScript(labDir, "apply-solution.sh");
      runScript(labDir, "check.sh", ["solution"]);
    } finally {
      runScript(labDir, "reset.sh");
    }
  }
};

const parseArgs = (args) => {
  const known = new Set(["--validate-only", "--require-runtime"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  return {
    validateOnly: args.includes("--validate-only"),
    requireRuntime: args.includes("--require-runtime"),
  };
};

export const run = (args = process.argv.slice(2)) => {
  const options = parseArgs(args);
  const errors = validateLocalLabWorkspaces();
  if (errors.length > 0) {
    console.error("Local lab validation failed:");
    errors.forEach((error) => console.error(`  - ${error}`));
    return 1;
  }
  console.log(`Local lab manifests passed (${LAB_CONTRACTS.length} isolated workspaces).`);

  if (options.validateOnly) {
    console.log("Runtime smoke: not-run (--validate-only).");
    return 0;
  }

  const runtime = detectDockerRuntime();
  if (!runtime.available) {
    console.log(`Runtime smoke: not-run (${runtime.reason}).`);
    return options.requireRuntime ? 1 : 0;
  }

  console.log(`Runtime smoke: using ${runtime.compose}; labs run serially.`);
  runLocalLabSmoke();
  console.log(`Local lab runtime smoke passed (${LAB_CONTRACTS.length} workspaces).`);
  return 0;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
