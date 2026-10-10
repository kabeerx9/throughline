# notes

A tiny in-memory notes API.

```sh
go run .
curl -X POST localhost:8080/notes -d '{"text":"hello"}'
curl localhost:8080/notes
```

## Configuration

| Variable     | Default | Meaning                                    |
| ------------ | ------- | ------------------------------------------ |
| `ADDR`       | `:8080` | Listen address                             |
| `RATE_LIMIT` | `5`     | Requests per second, per client IP         |
| `RATE_BURST` | `10`    | Requests a quiet client may send at once   |

## Rate limiting

Each client IP gets a token bucket. Over the limit, the API answers
`429 Too Many Requests` with a `Retry-After` header in whole seconds.

Limits are per process and kept in memory: two replicas allow twice the rate,
and a restart forgets every bucket. Behind a reverse proxy all clients share
the proxy's IP, so put the limiter at the proxy or trust a forwarded header
there first.
