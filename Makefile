.PHONY: install run

install:
	@echo "No npm dependencies needed! The project uses CDN imports."
	@echo "Ready to run."

run:
	@echo "Starting local server at http://localhost:8000"
	python3 -m http.server 8000
