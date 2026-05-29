# Deploying to Fly.io

## One-time setup

```sh
fly auth login
fly apps create scorched-earth
fly secrets set SENTRY_DSN=https://...@sentry.io/...
```

## Deploy

```sh
fly deploy        # builds Docker image and deploys
fly logs          # tail live logs
fly status        # check machine health
```

## Health check

GET https://scorched-earth.fly.dev/health → "ok"
