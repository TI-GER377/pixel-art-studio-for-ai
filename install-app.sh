#!/bin/bash
# ============================================================
#  install-app.sh — 픽셀 스튜디오 설치 스크립트
#
#  빌드된 .app을 응용프로그램(/Applications)에 설치하고,
#  터미널 명령어 'pixel'을 연동한다.
#
#  사용법:   bash install-app.sh
#  전체 흐름: npm run build:mac && npm run install:app
# ============================================================
set -e

APP_NAME="Pixel Art Studio"
SRC="$HOME/pixelart-dist/mac/mac-arm64/$APP_NAME.app"
DEST="/Applications/$APP_NAME.app"
BIN_DIR="/opt/homebrew/bin"

if [ ! -d "$SRC" ]; then
  echo "❌ 빌드된 앱이 없습니다. 먼저 빌드하세요:"
  echo "   npm run build:mac"
  exit 1
fi

echo "1/3  $SRC → $DEST 설치 중..."
[ -d "$DEST" ] && rm -rf "$DEST"
ditto "$SRC" "$DEST"

echo "2/3  터미널 명령어 'pixel' / 'pixel-draw' 연결 중..."
mkdir -p "$BIN_DIR"

# pixel : 앱 열기 (인자를 그대로 넘겨 나중에 파일 열기 지원 가능)
if [ -w "$BIN_DIR" ]; then
  cat > "$BIN_DIR/pixel" <<'EOF'
#!/bin/bash
# Pixel Art Studio 실행 명령
open -a "Pixel Art Studio" "$@"
if [ $? -eq 0 ]; then
  echo "🎨 Pixel Art Studio 실행됨"
fi
EOF
  chmod +x "$BIN_DIR/pixel"
  echo "     명령어 설치 완료: /opt/homebrew/bin/pixel"

  # pixel-draw : 헤드리스 CLI 렌더러 (AI/자동화용 — 창 없이 JSON → PNG)
  CLI_SRC="$(cd "$(dirname "$0")" && pwd)/cli.js"
  NODE_BIN="$(command -v node)"
  if [ -f "$CLI_SRC" ] && [ -n "$NODE_BIN" ]; then
    cat > "$BIN_DIR/pixel-draw" <<EOF
#!/bin/bash
NODE_BIN="$NODE_BIN"
CLI_SRC="$CLI_SRC"
exec "\$NODE_BIN" "\$CLI_SRC" "\$@"
EOF
    chmod +x "$BIN_DIR/pixel-draw"
    echo "     명령어 설치 완료: /opt/homebrew/bin/pixel-draw"
  else
    echo "     ⚠️ cli.js 또는 node 경로를 못 찾아 pixel-draw는 건너뜀"
  fi
else
  # 권한이 없으면 사용자 로컬 bin으로
  mkdir -p "$HOME/.local/bin"
  cp -f "$DEST/Contents/MacOS/$APP_NAME" "$HOME/.local/bin/pixel-backup" 2>/dev/null || true
  cat > "$HOME/.local/bin/pixel" <<'EOF'
#!/bin/bash
open -a "Pixel Art Studio" "$@"
EOF
  chmod +x "$HOME/.local/bin/pixel"
  echo "     명령어 설치 완료: ~/.local/bin/pixel (PATH에 ~/.local/bin이 없으면 ~/.zshrc에 추가)"
fi

echo "3/3  확인 중..."
if [ -d "$DEST/Contents/Frameworks" ]; then
  echo "✅ 설치 완료!"
  echo "   - Launchpad / 응용프로그램 폴더에서 'Pixel Art Studio' 실행"
  echo "   - 터미널:  pixel"
else
  echo "⚠️ 설치는 됐지만 검증에 실패했습니다. 다시 빌드해 보세요."
  exit 1
fi
