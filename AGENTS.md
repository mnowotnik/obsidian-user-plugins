# AGENTS.md

User Plugins is an Obsidian plugin that loads the user's own JS/TS modules and
snippets from the vault. The source is in `src/`, examples are in `examples/`,
and `npm run build` type-checks and bundles to `main.js`.

## Branches

- **`develop`** is the working branch. **Always open pull requests against
  `develop`**, never against `master`.
- **`master`** holds only released code. Obsidian reads `README.md` and
  `manifest.json` from `master`, so anything merged there is shown to users
  right away. Only merge into `master` as part of a release.

Write README changes on `develop` together with the code they describe. They
reach users when the release is merged into `master`.

## Instructions

Read the matching file before you do any of these tasks:

- Releasing a new version: [.agents/release.md](.agents/release.md)
- Making a dev build (pre-release for developers, installed with BRAT):
  [.agents/dev-build.md](.agents/dev-build.md)
