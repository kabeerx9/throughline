package ratelimit

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func fixedClock(l *Limiter, t *time.Time) { l.now = func() time.Time { return *t } }

func TestBurstThenRefill(t *testing.T) {
	clock := time.Unix(0, 0)
	l := New(2, 3) // 2 tokens per second, burst of 3
	fixedClock(l, &clock)

	for i := 1; i <= 3; i++ {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request %d: want allowed within the burst", i)
		}
	}
	ok, wait := l.Allow("a")
	if ok || wait != 500*time.Millisecond {
		t.Fatalf("4th request: got (%v, %v), want (false, 500ms)", ok, wait)
	}
	clock = clock.Add(500 * time.Millisecond)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("after 500ms: want one refilled token")
	}
}

func TestKeysHaveTheirOwnBuckets(t *testing.T) {
	l := New(1, 1)
	l.Allow("a")
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("b must not share a's bucket")
	}
}

// Run with -race: many goroutines must never spend more than the burst.
func TestConcurrentCallersNeverOverspend(t *testing.T) {
	clock := time.Unix(0, 0)
	l := New(0.001, 50)
	fixedClock(l, &clock)

	var allowed atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := l.Allow("shared"); ok {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()
	if got := allowed.Load(); got != 50 {
		t.Fatalf("allowed %d requests, want exactly the burst of 50", got)
	}
}
