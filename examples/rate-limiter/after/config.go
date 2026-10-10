package main

import (
	"fmt"
	"os"
	"strconv"
)

type config struct {
	Addr      string
	RateLimit float64 // requests per second, per client
	Burst     float64 // requests a quiet client may send at once
}

// loadConfig reads the environment and fails on bad values instead of
// silently falling back, so a typo cannot switch rate limiting off.
func loadConfig() (config, error) {
	c := config{Addr: ":8080", RateLimit: 5, Burst: 10}
	if v := os.Getenv("ADDR"); v != "" {
		c.Addr = v
	}
	for name, dst := range map[string]*float64{"RATE_LIMIT": &c.RateLimit, "RATE_BURST": &c.Burst} {
		v := os.Getenv(name)
		if v == "" {
			continue
		}
		f, err := strconv.ParseFloat(v, 64)
		if err != nil || f <= 0 {
			return c, fmt.Errorf("%s must be a positive number, got %q", name, v)
		}
		*dst = f
	}
	if c.Burst < 1 {
		return c, fmt.Errorf("RATE_BURST must be at least 1, got %g", c.Burst)
	}
	return c, nil
}
