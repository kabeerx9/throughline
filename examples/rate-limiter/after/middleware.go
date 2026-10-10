package main

import (
	"math"
	"net"
	"net/http"
	"strconv"

	"example.com/notes/ratelimit"
)

// rateLimit rejects requests over the caller's budget with 429 and a
// Retry-After header, before they reach any handler.
func rateLimit(l *ratelimit.Limiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, wait := l.Allow(clientKey(r))
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientKey identifies the caller by IP address. Behind a reverse proxy every
// request shares the proxy's address; see the README.
func clientKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
