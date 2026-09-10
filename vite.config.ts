import { coverageConfigDefaults, defineConfig } from "vite-plus";

/**
 * Config du workspace (chantier 48). Un seul point d'entrée `vp` remplace `pnpm -r`,
 * Biome et les six `tsc --noEmit` : `vp test` pour les suites, `vp check` pour le
 * formatage, le lint et les types.
 *
 * Les chemins ignorés valent pour les deux outils et reprennent ceux de `biome.json` :
 * artefacts (`dist`, rapports Playwright), migrations Drizzle générées, planches du
 * design system, et la fixture d'univers — un JSON de référence dont le formatage n'a
 * pas à bouger.
 */
const ignorePatterns = [
  "**/.pnpm-store/**",
  "**/dist/**",
  "**/apps/server/drizzle/meta/**",
  "**/apps/server/drizzle/**/*.sql",
  "**/apps/web/test-results/**",
  "**/apps/web/playwright-report/**",
  "**/packages/ui/design/**",
  "**/pnpm-lock.yaml",
  "**/packages/shared/src/universe.fixture.json",
  "**/coverage/**",
];

export default defineConfig({
  /**
   * Le dépôt n'avait aucun orchestrateur : `pnpm -r` lançait tout, dans l'ordre du
   * workspace, sans graphe ni cache. Un script de `package.json` n'est PAS caché par
   * défaut — déclarer une tâche dans la config est ce qui lui donne cache et
   * `dependsOn` (voir `apps/web` et `apps/admin`).
   */
  run: {
    cache: {
      tasks: true,
      // Les scripts qui restent (`dev:*`, `api:generate`, `loadtest`, `db:*`) démarrent
      // un processus ou parlent à un service vivant : les cacher rendrait le résultat
      // de la fois d'avant.
      scripts: false,
    },
  },

  test: {
    /**
     * Les six paquets porteurs de tests tournaient dans six processus vitest lancés par
     * `pnpm -r test` : aucun rapport commun, et `packages/i18n-config` — sans script
     * `test` — était sauté SANS que rien ne le signale. Les déclarer en projets rend
     * l'absence visible.
     *
     * Chaque paquet garde sa propre config dans son `vite.config.ts` : environnement,
     * `setupFiles`, `env` et délais restent là où ils décrivent quelque chose.
     */
    projects: ["packages/*", "apps/*"],
    // `packages/i18n-config` n'a aucun test : il est désormais listé, et vert, plutôt
    // qu'invisible.
    passWithNoTests: true,
    // vitest 5 activait `clearMocks` par défaut ; la 4.1 embarquée par Vite+ ne le fait
    // pas. Le poser explicitement garde le comportement des dix fichiers qui utilisent
    // `vi.fn`/`vi.spyOn` — sans cette ligne, la descente de majeure changerait ce que
    // mesurent les suites, en silence.
    clearMocks: true,

    /**
     * Le dépôt n'avait AUCUN fournisseur de couverture — la mesure n'existait tout
     * simplement pas. `@vitest/coverage-v8` est épinglé EXACTEMENT sur le vitest
     * qu'embarque Vite+ (4.1.11) : un décalage fait échouer `vp test --coverage` au
     * démarrage, et `scripts/check-toolchain.sh` vérifie cet accord.
     *
     * Aucun seuil n'est posé. Une porte se décide sur des chiffres, et il n'y en a
     * pas encore — `pnpm coverage` sert à les produire, pas à faire échouer la CI.
     */
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        "**/*.config.ts",
        "**/*.bench.ts",
        "apps/web/e2e/**",
        "apps/server/loadtest/**",
        "apps/admin/scripts/**",
        "packages/ui/design/**",
        // Client orval, régénéré depuis le spec OpenAPI du serveur : 8 000 lignes que
        // personne n'écrit, et dont la couverture ne dit rien de ce dépôt.
        "apps/admin/src/api/generated/**",
        // Échafaudage de test. Le compter reviendrait à mesurer la couverture du
        // thermomètre.
        "**/test-setup.ts",
        "**/test-global-setup.ts",
        "**/test-harness.ts",
        "**/test-helpers.ts",
      ],
    },
  },

  /**
   * Garde-fou pré-commit. Le dépôt n'avait AUCUN hook git : la qualité n'était tenue
   * qu'en CI, et une branche partait rouge sans qu'on le sache avant le push.
   *
   * Le hook n'est volontairement PAS installé par défaut (`vp hooks`) : il s'exécute sur
   * l'HÔTE, et cette machine n'a ni Node ni pnpm natifs — tout passe par Docker. Un hook
   * qui appelle `vp` y bloquerait chaque commit. La déclaration reste ici, prête pour un
   * poste qui a `vp` en natif, et `vp check --fix` reste disponible en conteneur.
   */
  staged: {
    "*.{ts,tsx,js,jsx,mjs,json,css}": "vp check --fix",
  },

  /**
   * Reprise à l'identique des réglages de `biome.json`, en noms compatibles Prettier.
   * Deux défauts d'oxfmt sont neutralisés parce qu'ils feraient bouger des fichiers que
   * Biome ne touchait pas : le tri des `package.json`, et le tri des imports — que
   * `assist.organizeImports` laissait délibérément désactivé.
   */
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    singleQuote: false,
    trailingComma: "all",
    sortPackageJson: false,
    // oxfmt sait formater markdown et YAML, ce que Biome ne faisait pas. Les y soumettre
    // reformaterait `docs/design.md` (3400 lignes) et `docker-compose.yml` (170 lignes
    // commentées) dans un chantier qui n'a rien à voir. À reprendre séparément.
    ignorePatterns: [...ignorePatterns, "**/*.md", "**/*.yml", "**/*.yaml"],
  },

  /**
   * Traduction de `biome.json`. `react` et `jsx-a11y` sont désactivés par défaut chez
   * oxlint : les déclarer est ce qui garde la parité avec `a11y.preset: "recommended"`.
   * `import` n'est pas repris — Biome n'avait aucune règle d'import.
   *
   * La catégorie `correctness` d'oxlint est plus large que celle de Biome : elle ouvre
   * des familles que ce dépôt n'a jamais fait passer. Elles sont listées et désactivées
   * plus bas, avec leur volume, plutôt que suppressées site par site — le chantier 43.4
   * a déjà tranché que l'axe de découpe utile est la règle, pas la zone.
   */
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y"],
    categories: { correctness: "error" },
    rules: {
      "no-debugger": "error",
      "no-unused-vars": "error",

      /**
       * À parité avec `useExhaustiveDependencies`, laissée désactivée. Le chantier 43.4
       * l'avait allumée : 31 diagnostics chez Biome, 13 chez oxlint sur `apps/web` et
       * `packages/ui`. L'allumer reste un chantier à part entière.
       */
      "react-hooks/exhaustive-deps": "off",

      /**
       * Règles du compilateur React (26 diagnostics). Elles décrivent la pureté du rendu
       * et la mutation d'état — un sujet réel, mais qui touche les couches three.js dont
       * les budgets FPS e2e sont le garde-fou. Les ouvrir dans une montée d'outillage
       * mélangerait deux risques.
       */
      "react/immutability": "off",
      "react/refs": "off",
      "react/purity": "off",
      "react/set-state-in-effect": "off",

      /**
       * Règles type-aware (34 diagnostics). C'est la capacité que Biome n'avait pas, et
       * elle est bien active — ces règles ont trouvé quelque chose. Les traiter demande
       * de toucher des types et des conversions dans le serveur, l'admin et le harnais
       * de charge : un chantier de code, pas d'outillage.
       */
      "typescript/no-misused-spread": "off",
      "typescript/no-useless-default-assignment": "off",
      "typescript/no-redundant-type-constituents": "off",
      "typescript/no-base-to-string": "off",
      "typescript/restrict-template-expressions": "off",
      "typescript/require-array-sort-compare": "off",
      "unicorn/no-useless-spread": "off",
    },
    ignorePatterns,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
