package main

import (
	"log"
	"net/http"

	"example.com/notes/ratelimit"
)

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}
	store := NewStore()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /notes", store.List)
	mux.HandleFunc("POST /notes", store.Create)

	limiter := ratelimit.New(cfg.RateLimit, cfg.Burst)
	log.Printf("listening on %s (%g req/s per client, burst %g)", cfg.Addr, cfg.RateLimit, cfg.Burst)
	log.Fatal(http.ListenAndServe(cfg.Addr, rateLimit(limiter, mux)))
}
