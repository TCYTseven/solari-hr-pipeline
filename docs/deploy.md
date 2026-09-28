# Deploying the dashboard to Vercel

The dashboard (Next.js) deploys to Vercel as is. The screening pipeline does
not: it runs Docker or long Solari sessions and writes recordings to disk, so
it stays on a machine you control (your Mac, or any Linux box) and writes to
the same database the dashboard reads.

```
 your machine                           Vercel
 ┌──────────────────────┐   Postgres   ┌─────────────────────┐
 │ npm run scan:watch   │ ───────────▶ │ Next.js dashboard   │
 │  (pipeline)          │   (hosted)   │  reads + LISTENs    │
 │ .screener/media ─────┼─ sync ──▶ bucket ◀── /media/* rewrite
 └──────────────────────┘              └─────────────────────┘
```

## 1. Hosted Postgres

Any Postgres 13+ works (Neon, Supabase, RDS, Vercel's Postgres from the
Marketplace). You need two connection strings:

- **`DATABASE_URL`**: the pooled one is fine for queries.
- **`LIVE_DATABASE_URL`**: a direct (unpooled) one. Realtime uses `LISTEN`,
  which transaction poolers such as PgBouncer or Neon's `-pooler` host don't
  support. If your provider has no pooler, leave it unset.

Apply the schema once from your machine:

```bash
DATABASE_URL="postgres://..." npm run db:migrate
```

## 2. Media storage

The pipeline writes demo videos, thumbnails and captions to
`.screener/media/<owner>/<run>/`. A hosted dashboard can't read your disk, so
sync that folder to a public bucket after scans. With S3:

```bash
aws s3 sync .screener/media s3://my-screener-media --size-only
```

With Cloudflare R2, point `rclone sync .screener/media r2:my-screener-media`
at a bucket with public access on. Then set
`MEDIA_PUBLIC_URL=https://<bucket public url>` on Vercel. It is read at
build time: `/media/*` is rewritten to the bucket, so the URLs stored in the
database keep working unchanged.

To keep it in step with the 30-minute scans, run the sync in a loop next to
the pipeline (for example `while true; do aws s3 sync ...; sleep 300; done`)
or from cron.

## 3. Vercel project

1. Import the GitHub repo in Vercel. The framework (Next.js) and the build
   command (`next build`) are detected automatically.
2. Set these environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | hosted Postgres (pooled is fine) |
| `LIVE_DATABASE_URL` | direct connection, if `DATABASE_URL` is pooled |
| `MEDIA_PUBLIC_URL` | the bucket's public URL |
| `NEXT_PUBLIC_REPO_URL` | footer GitHub link (optional) |
| `NEXT_PUBLIC_X_URL` | footer X link (optional) |

Don't set `ANTHROPIC_API_KEY` or `SOLARI_API_KEY` on Vercel; the dashboard
never uses them.

3. Deploy.

`/api/live` streams for up to 270 seconds per connection
(`maxDuration = 300`), then the browser reconnects on its own. That fits
within Vercel's function limits.

## 4. Point the pipeline at the hosted database

On the machine that runs the pipeline, set the same `DATABASE_URL` in `.env`
and start the loop:

```bash
npm run scan:watch
```

Cards on the deployed site update live while it runs.

## Without Vercel

Everything also runs on one machine: `npm run build && npm start` serves the
dashboard on :3000 against the local Postgres, with media served straight
from `.screener/media`.
