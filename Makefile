.PHONY: install vendor run run-https certs

CERT_DIR := .certs
CERT := $(CERT_DIR)/cert.pem
KEY := $(CERT_DIR)/key.pem
LAN_IP := $(shell ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1)

# Pinned third-party versions (ADR 0004). vendor/ and models/ are committed to git so a fresh clone runs without
# fetching anything; `make vendor` re-downloads them (e.g. after bumping a version here).
TFJS_VERSION := 4.22.0
POSE_DETECTION_VERSION := 2.1.3
CDN := https://cdn.jsdelivr.net/npm
# MoveNet MultiPose Lightning v1: the default model URL of pose-detection $(POSE_DETECTION_VERSION).
MODEL_URL := https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1
MODEL_DIR := models/movenet-multipose-lightning
MODEL_FILES := model.json group1-shard1of3.bin group1-shard2of3.bin group1-shard3of3.bin

install:
	@echo "No npm dependencies needed! TF.js and the MoveNet model are self-hosted in vendor/ and models/."
	@echo "Ready to run. (Run 'make vendor' to re-download them.)"

vendor:
	mkdir -p vendor $(MODEL_DIR)
	curl -fsSL -o vendor/tf-core.min.js $(CDN)/@tensorflow/tfjs-core@$(TFJS_VERSION)/dist/tf-core.min.js
	curl -fsSL -o vendor/tf-converter.min.js $(CDN)/@tensorflow/tfjs-converter@$(TFJS_VERSION)/dist/tf-converter.min.js
	curl -fsSL -o vendor/tf-backend-webgl.min.js $(CDN)/@tensorflow/tfjs-backend-webgl@$(TFJS_VERSION)/dist/tf-backend-webgl.min.js
	curl -fsSL -o vendor/tf-backend-webgpu.min.js $(CDN)/@tensorflow/tfjs-backend-webgpu@$(TFJS_VERSION)/dist/tf-backend-webgpu.min.js
	curl -fsSL -o vendor/pose-detection.min.js $(CDN)/@tensorflow-models/pose-detection@$(POSE_DETECTION_VERSION)/dist/pose-detection.min.js
	for f in $(MODEL_FILES); do curl -fsSL -o $(MODEL_DIR)/$$f "$(MODEL_URL)/$$f?tfjs-format=file" || exit 1; done

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
