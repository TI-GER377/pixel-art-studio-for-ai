# AGENTS.md — AI 에이전트 지침

이 폴더는 **픽셀 스튜디오**(Electron 픽셀 아트 앱) 프로젝트입니다.
여기서 "그림/PNG/스프라이트 같은 작업"을 해야 한다면 아래 CLI를 사용하세요.

## ⚡ 빠른 규칙 (TL;DR)

1. 픽셀 아트 PNG가 필요하면 **지시서 JSON 작성 → `node cli.js draw` 실행**
2. 창을 띄우지 마세요 — CLI는 헤드리스(백그라운드 안전)
3. 외부 라이브러리 설치가 필요 없습니다 (순수 Node.js)
4. 결과 PNG가 잘 나왔는지는 파일 크기만 확인해도 됩니다 (성공 시 `✅` 출력)

## 📌 CLI 사용법

```bash
# 프로젝트 폴더 기준
node "$PWD/cli.js" draw 지시서.json -o 결과.png
```

Windows에서는 동일합니다: `node cli.js draw spec.json -o out.png`
(맥에서 `pixel-draw`로 전역 설치돼 있으면 그 명령도 사용 가능)

## 지시서(JSON) 형식

```json
{
  "grid": 16,
  "pixelScale": 32,
  "output": "out.png",
  "ops": [
    { "op": "fill",   "color": "#2A2A2A" },
    { "op": "rect",   "x": 2, "y": 2, "w": 4, "h": 4, "color": "#FF5C5C" },
    { "op": "rect",   "x": 2, "y": 2, "w": 4, "h": 4, "color": "#FFFFFF", "outline": true },
    { "op": "erase",  "x": 3, "y": 3, "w": 2, "h": 2 },
    { "op": "set",    "x": 10, "y": 5, "color": "#48D1C4" },
    { "op": "line",   "x1": 0, "y1": 15, "x2": 15, "y2": 0, "color": "#7C6CFF" },
    { "op": "circle", "cx": 8, "cy": 8, "r": 4, "color": "#F7B32B" },
    { "op": "circle", "cx": 8, "cy": 8, "r": 6, "color": "#FFFFFF", "outline": true },
    { "op": "mirror", "mode": "horizontal" }
  ]
}
```

| op | 설명 |
|---|---|
| `fill` | 전체 채우기 |
| `clear` | 전체 투명하게 |
| `set` (`pixel`도 허용) | 한 칸 찍기 |
| `rect` | 사각 채우기 ( `outline: true` → 테두리만) |
| `erase` | 사각 영역을 투명하게 (`x,y,w,h`) |
| `line` | 선 (`x1,y1,x2,y2`) |
| `circle` | 채운 원 (`outline: true` → 테두리만) |
| `mirror` | 좌/우 또는 상/하 대칭 복제 (`mode: "vertical"` → 상하) |

색 형식: `#RRGGBB` / `#RRGGBBAA`
`grid`: 4~128 (기본 16) / `pixelScale`: 기본 32 (1픽셀 32px → 16칸이면 512px)

## 오류 대응

- 실패하면 **표준 에러 메시지**가 몇 번째 `ops[i]` 문제인지 알려줍니다
- JSON 문법 오류도 줄 위치까지 안내합니다
- 종료코드: 성공 `0`, 실패 `1`

## 임의 설치/실행 규칙

- 앱 자체(=GUI)를 실행할 필요가 있을 때 맥에서는: `pixel`
- 앱을 코드로 다시 빌드할 필요가 있을 때:
  - `npm run build:mac` → `~/pixelart-dist/mac/*.dmg`
  - `npm run build:win` → `~/pixelart-dist/win/*.exe`
  - `npm run deploy:mac` → 빌드 후 `/Applications`에 설치까지
