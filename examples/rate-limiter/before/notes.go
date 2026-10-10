package main

import (
	"encoding/json"
	"net/http"
	"sync"
)

type Note struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

// Store keeps notes in memory. Handlers run on many goroutines, so every
// access goes through the mutex.
type Store struct {
	mu    sync.Mutex
	notes []Note
}

func NewStore() *Store { return &Store{} }

func (s *Store) List(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.notes)
}

func (s *Store) Create(w http.ResponseWriter, r *http.Request) {
	var n Note
	if err := json.NewDecoder(r.Body).Decode(&n); err != nil || n.Text == "" {
		http.Error(w, "body must be {\"text\": \"…\"}", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	n.ID = len(s.notes) + 1
	s.notes = append(s.notes, n)
	s.mu.Unlock()
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(n)
}
