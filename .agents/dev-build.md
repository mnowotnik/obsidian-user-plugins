# Dev builds

A dev build is a pre-release of `develop` for the maintainer and other
developers to try before a real release. Regular Obsidian users never get it:
Obsidian only downloads the release whose tag matches the `version` in
`master`'s `manifest.json`. Dev builds are installed with the BRAT plugin.

Only make a dev build when a person asks for one.

## How it works

- **Tag `develop` with `X.Y.Z-rc.N`**, where `X.Y.Z` is the next planned
  version (for example `1.5.0-rc.1`, then `1.5.0-rc.2`). There's no `v`
  prefix, and anything after the `-` counts as a dev build suffix.
- **`.github/workflows/release.yml` builds it.** It checks that the tagged
  commit is on `develop`. It writes the tag into the *released*
  `manifest.json`, because BRAT reads the version from there, and it marks
  the GitHub release as a pre-release so it never shows as "Latest".
- **Nothing is committed.** Don't bump `manifest.json`, `package.json` or
  `versions.json` for a dev build, and don't touch `master`.

## Steps

1. **Make sure the changes to test are merged into `develop`.**
2. **Tag and push:**

   ```bash
   git fetch origin develop
   git tag X.Y.Z-rc.N origin/develop
   git push origin X.Y.Z-rc.N
   ```

3. **Check that the workflow passed** and that the pre-release has `main.js`,
   `manifest.json` and `styles.css`.
4. **To install it**, in BRAT add the beta plugin
   `mnowotnik/obsidian-user-plugins` and pick the `X.Y.Z-rc.N` version.

When the dev build is good, cut the real release with
[release.md](release.md). Old dev build releases and tags can be deleted at
any time; nothing depends on them.
