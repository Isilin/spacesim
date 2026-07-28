import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Utilisé uniquement par `drizzle-kit generate` (diff de schéma, pas de connexion
    // requise) — une URL Postgres de forme valide suffit (chantier 20.3).
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/spacesim",
  },
});
