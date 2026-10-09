import path from "node:path";

/** Root folder holding projects and the index database. */
export function homeDir(): string {
  return path.resolve(process.env.UXSTUDIO_HOME || path.join(process.cwd(), "workspace"));
}

export function projectsDir(): string {
  return path.join(homeDir(), "projects");
}

export function projectDir(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Invalid project slug: ${slug}`);
  return path.join(projectsDir(), slug);
}

export function repoRoot(): string {
  return process.cwd();
}
