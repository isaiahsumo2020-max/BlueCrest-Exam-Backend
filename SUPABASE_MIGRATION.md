# Supabase database migration

The backend now uses Supabase PostgreSQL. The SQL schema migration is in `Backend/supabase/migrations/20260929000000_initial_schema.sql`. The backend also applies the same idempotent schema during startup. The existing SQLite database is left untouched and can be retained as a rollback copy.

1. Create a Supabase project and copy its PostgreSQL connection string. Use the Session pooler connection if your deployment host cannot reach Supabase over IPv6.
2. In `Backend/.env`, set `DATABASE_URL` to that connection string. Remove placeholder brackets and URL-encode reserved characters in the password (for example, `@` becomes `%40`). Keep `PGSSL=require` to require encrypted TLS; use `PGSSL=verify-full` when your connection's certificate chain can be validated. Set `SQLITE_FILE` only if your existing database is not at `Backend/data/examination.db`.
3. From the `Backend` directory, run `npm install` and `npm run db:init`. This creates the PostgreSQL schema.
4. Run `npm run db:migrate:sqlite`. It copies existing rows transactionally and leaves the SQLite source file unchanged. Review the per-table row counts and confirm the data in Supabase before switching production traffic.
5. Set `DATABASE_URL` and `JWT_SECRET` in the backend deployment environment, deploy the updated backend, and check `/api/health` reports `database: "postgres"`.

Do not run `npm run db:seed` against a migrated production database; it is only for adding the sample records to an empty/new project. Keep the SQLite file until the Supabase deployment has been verified.

## Image uploads

The admin image picker uploads PNG, JPEG, or WebP images up to 5 MB through the backend to a public Supabase Storage bucket. Copy `Backend/.env.example` to `Backend/.env` for local development and configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET=erp-media`. The backend creates the bucket on first upload if it does not exist.

`SUPABASE_SERVICE_ROLE_KEY` is a server secret: keep it only in the backend's local `.env` and deployment environment. Never add it to frontend `VITE_*` variables or commit it. Configure the same backend variables in the hosted Node service.

## Deployment layout

Keeping the frontend and backend in this one repository is a good monorepo approach. Deploy the Vue frontend as a static site on Netlify or Vercel using the repository root, `npm run build`, and `dist` as the output directory. Set `VITE_API_BASE_URL` to the deployed backend's `/api` URL and configure SPA rewrites to `/index.html`.

Deploy the existing Express API separately as a Node service (for example, Render, Railway, or Fly.io), using `Backend` as its root directory and `npm start` as its start command. Set `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `CORS_ORIGIN` there. Supabase hosts the database and image storage; it does not host this Express process. Netlify/Vercel can host the API only after converting its routes to their serverless function format.
