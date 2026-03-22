# akinozgen portfolio

Minimal Astro portfolio built around public GitHub projects.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The site fetches public GitHub profile and repository data for `akinozgen` at build time.
If GitHub is unavailable during build, it falls back to the bundled snapshot in `src/data/github-snapshot.ts`.

## Optional token

`GITHUB_TOKEN` is optional. The project list is now curated locally and stored in `src/data/projects.json`.

## Content maintenance

Edit `src/data/projects.json` to control the showcased repositories and their metadata:

- `repokey`
- `name`
- `subtitle`
- `summary`
- `imagePath`

## Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
