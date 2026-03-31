# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + TypeScript application code. `main.tsx` boots the primary overlay, while `controller-main.tsx`, `left-main.tsx`, `right-main.tsx`, `known-main.tsx`, and `visit-main.tsx` mount the auxiliary Overwolf windows. Keep shared state and deduction logic in files such as `overlayStore.ts`, `types.ts`, `timeline.ts`, and `knownRoles.ts`. Root-level `*.html`, `manifest.json`, and `background.*` files define the Overwolf entry points. Static role art lives in `roles/`, product notes in `docs/`, and build output in `dist/`.

## Build, Test, and Development Commands
Use `npm install` to restore dependencies. `npm run dev` starts the Vite dev server for local UI work. `npm run build` runs `tsc -b` and then produces the production bundle in `dist/`. `npm run preview` serves the built output for a final browser check. There is no dedicated packaging script in `package.json`; if you create an `.opk`, keep `manifest.json` and the generated assets in sync.

## Coding Style & Naming Conventions
Follow the existing style: TypeScript, React function components, double quotes, and 2-space indentation. Use `PascalCase` for components and exported window apps, `camelCase` for variables and functions, and descriptive noun-based filenames like `overlayStore.ts` or `TimelineNavigator.tsx`. Prefer small, typed helpers over ad hoc object shapes; shared contracts belong in `src/types.ts`. Keep CSS changes in `src/styles.css` or `src/overlay-windows.css`, alongside the window they affect.

## Testing Guidelines
No automated test framework is configured yet. Until one is added, treat `npm run build` as the minimum gate and manually verify the main controller, side panels, visit map, and roles-in-play flow before merging. When adding tests, place them under `src/` with `*.test.ts` or `*.test.tsx` names and prioritize deduction logic and store updates over purely visual code.

## Commit & Pull Request Guidelines
Current history uses short, imperative commit subjects such as `Initial project upload` and `Upload current project version`. Keep that pattern, but make subjects more specific, for example `Add timeline filtering for imported events`. PRs should include a concise summary, impacted windows or files, manual verification steps, and screenshots for UI changes. Link the related issue when one exists.

## Configuration & Asset Notes
Do not commit secrets or machine-specific paths. Review `manifest.json` carefully when changing window names, permissions, or hotkeys. Large binary assets such as role images and packaged `.opk` files should only be updated when the corresponding feature or release actually changes.
