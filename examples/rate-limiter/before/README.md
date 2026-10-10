# notes

A tiny in-memory notes API.

```sh
go run .
curl -X POST localhost:8080/notes -d '{"text":"hello"}'
curl localhost:8080/notes
```

## Configuration

| Variable | Default | Meaning        |
| -------- | ------- | -------------- |
| `ADDR`   | `:8080` | Listen address |
