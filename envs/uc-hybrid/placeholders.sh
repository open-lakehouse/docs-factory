# Stand-ins for the hosted resources' connection, so `just env-render uc-hybrid`
# renders without an account. They show up in plan.json, LAYOUT.md, and the
# diagram; a reader replaces them by following README.md, whose scripts save the
# real ones in secrets.env before they re-render.
PGHOST=ep-your-project.us-east-2.aws.neon.tech
PGUSER=uc
PGPASSWORD=replace-me
AWS_ENDPOINT_URL=https://your-account.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=replace-me
AWS_SECRET_ACCESS_KEY=replace-me
