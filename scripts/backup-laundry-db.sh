#!/usr/bin/env bash
# Backup terenkripsi database produk Laundry (mnilab_laundry) ke Telegram
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE=""
for candidate in "${HOME}/.backup.laundry.env" "${SCRIPT_DIR}/.backup.env"; do
  if [[ -f ${candidate} ]]; then CONFIG_FILE=${candidate}; break; fi
done
[[ -n ${CONFIG_FILE} ]] || { echo "Config backup tidak ditemukan." >&2; exit 1; }

while IFS= read -r line || [[ -n ${line} ]]; do
  line=${line%$'\r'}
  [[ ${line} =~ ^[[:space:]]*(#|$) ]] && continue
  if [[ ${line} =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key=${BASH_REMATCH[1]}
    val=${BASH_REMATCH[2]}
    val=${val#\"}; val=${val%\"}; val=${val#\'}; val=${val%\'}
    printf -v "${key}" '%s' "${val}"
  fi
done <"${CONFIG_FILE}"

: "${TELEGRAM_BOT_TOKEN:?Wajib diisi}"
: "${TELEGRAM_CHAT_ID:?Wajib diisi}"
: "${BACKUP_PASSPHRASE:?Wajib diisi}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-mnilab_laundry_user}"
DB_NAME="${DB_NAME:-mnilab_laundry}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups/laundry}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"
DATE="$(date +%Y-%m-%d_%H%M%S)"
WORK_DIR="$(mktemp -d "${BACKUP_DIR}/.work-${DATE}.XXXXXX")"
OUT_FILE="${BACKUP_DIR}/mnilab_laundry_${DATE}.dump.gpg"
trap 'rm -rf -- "${WORK_DIR}"' EXIT

export PGPASSWORD="${DB_PASSWORD:-}"
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -Fc -Z 6 -f "${WORK_DIR}/${DB_NAME}.dump"
pg_restore --list "${WORK_DIR}/${DB_NAME}.dump" >/dev/null

gpg --batch --yes --no-tty --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "${OUT_FILE}" \
  "${WORK_DIR}/${DB_NAME}.dump" 3< <(printf '%s' "${BACKUP_PASSPHRASE}")

curl -fsS -F "chat_id=${TELEGRAM_CHAT_ID}" \
  -F "document=@\"${OUT_FILE}\"" \
  -F "caption=✅ Backup ${DB_NAME} berhasil (${DATE})" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" >/dev/null

find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'mnilab_laundry_*.dump.gpg' -mtime "+${RETENTION_DAYS}" -delete
