// Runs during the Vercel build. Seeds demo data only when ALLOW_DEMO_SEED=true (demo servers).
// The seed skips itself when the demo users already exist, so redeploys are safe.
import { execFileSync } from "node:child_process";

if (process.env.ALLOW_DEMO_SEED === "true") {
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
} else {
  console.log("ALLOW_DEMO_SEED is not true; skipping demo seed.");
}
