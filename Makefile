.PHONY: install run run-https certs

CERT_DIR := .certs
CERT := $(CERT_DIR)/cert.pem
KEY := $(CERT_DIR)/key.pem
LAN_IP := $(shell ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1)

install:
	@echo "No npm dependencies needed! The project uses CDN imports."
	@echo "Ready to run."

run:
	@echo "Starting local server at http://localhost:8000"
	python3 -m http.server 8000

# Serves the repo over HTTPS on the LAN so phones can use the camera (secure origin required).
run-https:
	@if [ ! -f $(CERT) ] || [ ! -f $(KEY) ]; then \
		echo "Missing $(CERT) or $(KEY). Run 'make certs' for instructions."; exit 1; \
	fi
	@echo "Starting HTTPS server at https://$(LAN_IP):8443 (and https://localhost:8443)"
	python3 -c "import http.server, ssl; \
		s = http.server.ThreadingHTTPServer(('0.0.0.0', 8443), http.server.SimpleHTTPRequestHandler); \
		c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain('$(CERT)', '$(KEY)'); \
		s.socket = c.wrap_socket(s.socket, server_side=True); s.serve_forever()"

certs:
	@echo "Create a locally trusted certificate with mkcert (https://github.com/FiloSottile/mkcert):"
	@echo "  1. Install mkcert (macOS: brew install mkcert) and run: mkcert -install"
	@echo "  2. mkdir -p $(CERT_DIR) && mkcert -cert-file $(CERT) -key-file $(KEY) $(LAN_IP) localhost"
	@echo "  3. Trust the mkcert root CA on the phone. Find it with: mkcert -CAROOT (file rootCA.pem)"
	@echo "     iOS: AirDrop/email rootCA.pem, install the profile in Settings > General > VPN & Device Management,"
	@echo "          then enable it in Settings > General > About > Certificate Trust Settings."
	@echo "     Android: copy rootCA.pem to the phone, install it via Settings > Security > Encryption & credentials >"
	@echo "          Install a certificate > CA certificate."
	@echo "  4. make run-https and open https://$(LAN_IP):8443 on the phone (same Wi-Fi)."
