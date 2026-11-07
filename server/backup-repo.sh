#!/usr/bin/env bash
# نسخة احتياطية كاملة من مستودع الأرشيف (يحتاج git). شغّلها أسبوعياً أو من cron.
set -e
REPO="https://github.com/markingdchc/marking.dchc.git"
D=$(date +%F); OUT="$(cd "$(dirname "$0")" && pwd)/backups"; mkdir -p "$OUT"
git clone --mirror "$REPO" "$OUT/marking.dchc-$D.git"
tar -czf "$OUT/marking.dchc-$D.tar.gz" -C "$OUT" "marking.dchc-$D.git" && rm -rf "$OUT/marking.dchc-$D.git"
echo "✅ $OUT/marking.dchc-$D.tar.gz"
