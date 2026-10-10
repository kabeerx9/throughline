// Package ratelimit implements a per-client token bucket.
package ratelimit

import (
	"sync"
	"time"
)

// Limiter gives each key a bucket that holds up to Burst tokens and refills
// at Rate tokens per second. A request spends one token.
type Limiter struct {
	rate  float64
	burst float64
	now   func() time.Time // replaced in tests

	mu      sync.Mutex
	buckets map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

func New(rate, burst float64) *Limiter {
	return &Limiter{rate: rate, burst: burst, now: time.Now, buckets: map[string]*bucket{}}
}

// Allow reports whether key may make a request now. When it may not, it also
// returns how long until the next token arrives.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	// Refill lazily: no timer per client, just the time since the last call.
	b.tokens = min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
	b.last = now

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
	return false, wait
}
