import { execFileSync } from "node:child_process";
import { getLocalE2eSupabaseConfig } from "../e2e/support/local-auth";

let verifiedTarget: string | null = null;

export function localLibrarySql(statement: string): string {
  getLocalE2eSupabaseConfig();
  const container = process.env.TEST_LOCAL_SUPABASE_DB_CONTAINER;
  const port = process.env.TEST_LOCAL_SUPABASE_DB_PORT;
  if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container) || !port || !/^[0-9]+$/.test(port)) throw new Error("Provide the explicit local Supabase database container and port for privileged test fixtures.");
  const target = `${container}:${port}`;
  if (verifiedTarget !== target) {
    const ports = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container], { encoding: "utf8" }));
    if (!Array.isArray(ports["5432/tcp"]) || !ports["5432/tcp"].some((binding: { HostPort: string }) => binding.HostPort === port)) throw new Error("The local fixture database container does not match the confirmed local database port.");
    verifiedTarget = target;
  }
  return execFileSync("docker", ["exec", container, "psql", "--username", "postgres", "--dbname", "postgres", "--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
