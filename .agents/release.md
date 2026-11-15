# Releasing

Only cut a release when a person asks for one. Don't push tags or merge into
`master` on your own.

How a release goes out:

- **Pushing a version tag** makes `.github/workflows/release.yml` build the
  plugin and create a GitHub release with `main.js`, `manifest.json` and
  `styles.css`. Users can't see it yet.
- **Merging `develop` into `master`** updates `manifest.json` on `master`.
  Obsidian then offers the new version to users and shows the new `README.md`.

## Steps

1. **Bump the version on a branch off `develop`** and open a PR to `develop`:

   ```bash
   git checkout -b release/X.Y.Z origin/develop
   npm version X.Y.Z --no-git-tag-version
   git commit -am "Release X.Y.Z"
   ```

   `npm version` updates `package.json` and `package-lock.json`, and its
   `version` script updates `manifest.json` and `versions.json`. If the release
   needs a newer Obsidian, raise `minAppVersion` in `manifest.json` *before*
   running it.

2. **Once the PR is merged, tag `develop`.** The tag must equal the version
   exactly, with no `v` prefix:

   ```bash
   git fetch origin develop
   git tag X.Y.Z origin/develop
   git push origin X.Y.Z
   ```

   The workflow fails if the tag doesn't match `manifest.json` or the tagged
   commit isn't on `develop`. A tag with a `-` suffix is a dev build instead;
   see [dev-build.md](dev-build.md).

3. **Check the GitHub release.** It should exist and have all three files
   attached.

4. **Merge `develop` into `master`.** Use a fast-forward or a merge commit.
   Never squash or rebase: that breaks the shared history and the next release
   would conflict.

   ```bash
   git push origin origin/develop:master
   ```

   If `master` is protected, open a PR from `develop` to `master` and merge it
   with **Create a merge commit**.

## If something lands on `master` directly

Merge `master` back into `develop` straight away so the branches don't drift.
If the change on `master` removed README text that is still true on
`develop`, restore that text on `develop` after the merge.
