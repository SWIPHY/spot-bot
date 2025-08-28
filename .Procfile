worker: bash -lc 'set -e
echo "== Runtime =="
echo "Node: $(node -v)"
echo "NPM : $(npm -v)"
echo "PATH: $PATH"

echo
echo "== FFmpeg check =="
echo -n "ffmpeg path: "; command -v ffmpeg || true
ffmpeg -hide_banner -version | head -n 5 || true
ls -l /usr/bin/ffmpeg 2>/dev/null || true
ls -l /usr/local/bin/ffmpeg 2>/dev/null || true

echo
echo "== Start bot =="
node src/index.js
'