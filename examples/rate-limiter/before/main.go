package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	store := NewStore()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /notes", store.List)
	mux.HandleFunc("POST /notes", store.Create)

	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
