#!/usr/bin/env bash
# Deploy CoffeePOS lên server — chạy TRÊN server (workflow .github/workflows/deploy.yml gửi qua SSH):
#   ssh root@host "bash -s -- <repo_url> <commit_sha> [ghcr_user]" < scripts/deploy.sh
# Yêu cầu: $APP_DIR/.env đã có (workflow ghi trước từ GitHub Secrets), kèm BACKEND_IMAGE / FRONTEND_IMAGE
# (image build sẵn trên GitHub Actions) và $APP_DIR/.ghcr-token để pull từ GHCR.
# Thiếu BACKEND_IMAGE thì build tại server như cũ (chạy tay).
# Idempotent: lần đầu cài Docker + git, tạo swap nếu RAM < 2GB, clone repo; các lần sau chỉ cập nhật code + pull image.
# Repo trên server chỉ dùng cho docker-compose.yml và database/init — không build code.
set -euo pipefail

REPO_URL="${1:?Thiếu repo URL}"
SHA="${2:?Thiếu commit SHA}"
GHCR_USER="${3:-}"
APP_DIR="${APP_DIR:-/opt/coffeepos}"
COMPOSE=(docker compose)

# ::group:: gom log thành từng mục gập được trên giao diện GitHub Actions
log() { echo "::group::==> $*"; }
end() { echo "::endgroup::"; }

log "Kiểm tra công cụ"
if ! command -v git >/dev/null; then
  (apt-get update -qq && apt-get install -y -qq git) || (dnf install -y git) || (yum install -y git)
fi
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version
end

# Máy 1GB RAM chạy 3 container (và khi phải build tại chỗ) dễ bị OOM → thêm 2GB swap (chỉ khi chưa có swap).
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && [ "$(awk 'NR>1' /proc/swaps | wc -l)" -eq 0 ]; then
  log "Tạo swap 2GB"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  end
fi

log "Lấy code commit $SHA"
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ ! -d .git ]; then
  git init -q
  git remote add origin "$REPO_URL"
fi
git remote set-url origin "$REPO_URL"
git fetch -q --depth 1 origin "$SHA"
git checkout -qf FETCH_HEAD   # .env không bị git quản lý nên được giữ nguyên
git log -1 --oneline
end

[ -f .env ] || { echo "Thiếu $APP_DIR/.env" >&2; exit 1; }
set -a; . ./.env; set +a

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "${FRONTEND_PORT:-3100}/tcp" >/dev/null
fi

mkdir -p reports
if [ -n "${BACKEND_IMAGE:-}" ] && [ -n "${FRONTEND_IMAGE:-}" ]; then
  log "Pull image build sẵn trên GitHub Actions"
  if [ -f .ghcr-token ]; then
    docker login ghcr.io -u "${GHCR_USER:-github-actions}" --password-stdin < .ghcr-token
    rm -f .ghcr-token
  fi
  pull_ok=0
  "${COMPOSE[@]}" pull backend frontend || pull_ok=$?
  docker logout ghcr.io >/dev/null 2>&1 || true
  [ "$pull_ok" -eq 0 ] || { echo "Pull image thất bại" >&2; exit 1; }
  end
  log "Chạy container"
  "${COMPOSE[@]}" up -d --no-build --wait --remove-orphans
else
  log "Build + chạy container (không có image build sẵn)"
  "${COMPOSE[@]}" up -d --build --wait --remove-orphans
fi
"${COMPOSE[@]}" ps
end

log "Kiểm tra sau deploy"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:${FRONTEND_PORT:-3100}/api/health"; then
    echo; echo "OK — web chạy ở cổng ${FRONTEND_PORT:-3100}"
    break
  fi
  [ "$i" -eq 30 ] && { echo "Health check thất bại" >&2; "${COMPOSE[@]}" logs --tail 100 >&2; exit 1; }
  sleep 2
done
end

docker image prune -af >/dev/null   # xoá image cũ (kể cả bản <sha> trước) — chỉ giữ image đang chạy
