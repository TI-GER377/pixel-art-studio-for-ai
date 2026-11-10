// ============================================================
//  Pixel Art Studio — Electron Main Process
//  프레임 없는(frame:false) 다크모드 픽셀 아트 앱
// ============================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// macOS 다크모드 네이티브 감지 유지 (색상 팔레트 등이 다크 모드로 출력됨)
app.commandLine.appendSwitch('force-dark-mode');

// 캐시/세션 충돌로 인한 실행 에러 방지 (외장 SSD 환경에서 유용)
app.commandLine.appendSwitch('disable-http-cache');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 900,
    minHeight: 700,

    // 양쪽 OS 모두 기본 타이틀바/테두리 제거 → 커스텀 타이틀바 사용
    frame: false,
    resizable: true,
    show: false,              // 준비 완료 후 자연스럽게 표시
    backgroundColor: '#1E1E1E', // 로딩 중 화이트 플래시 방지
    title: 'Pixel Art Studio',

    webPreferences: {
      // index.html 내부에서 프로세스 간 통신(닫기 버튼)을 위해 사용
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // 저장된 창 크기 등 무결성 문제 예방
  win.once('ready-to-show', () => {
    win.show();
  });
}

// ── 렌더러(HTML) → 메인 프로세스 : 창 제어 ─────────────────
// 커스텀 타이틀바의 닫기 버튼이 이 채널을 호출함
ipcMain.on('window-close', () => {
  if (win) {
    win.destroy();
  }
});

ipcMain.on('window-minimize', () => {
  if (win) {
    win.minimize();
  }
});

// ── 앱 라이프사이클 ─────────────────────────────────────────
// 개발 실행 시 Dock에도 그린 아이콘이 보이도록
function applyDockIcon() {
  if (process.platform === 'darwin') {
    try {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
      if (!img.isEmpty()) app.dock.setIcon(img);
    } catch (e) { /* 아이콘이 없어도 앱은 정상 동작 */ }
  }
}

app.whenReady().then(() => {
  createWindow();
  applyDockIcon();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 닫기 버튼(파괴)이든 우측 상단 닫기든, 모든 창이 사라지면 종료
app.on('window-all-closed', () => {
  app.quit();
});
