# 픽셀 스튜디오 CLI — AI 에이전트용 픽셀 아트 렌더러

창을 띄우지 않고 **JSON 지시서 한 장으로 픽셀 아트 PNG를 만드는** 헤드리스 도구입니다.
AI/스크립트가 자동으로 그림을 만들어 내려놓을 때 쓰세요.

## 실행 방법 (맥 / 윈도우 공용)

```bash
# 방법 A — 명령어로 (맥: 설치했을 때)
pixel-draw draw sprite.json -o sprite.png

# 방법 B — 프로젝트 폴더에서 (맥/윈도우 공용)
node cli.js draw sprite.json -o sprite.png

# 방법 C — npm 스크립트 (맥/윈도우 공용)
npm run cli -- draw sprite.json -o sprite.png
```

- 순수 Node.js라 맥/윈도우/리눅스 어디서든 같은 동작
- 외부 라이브러리 설치 불필요 (Node 내장 기능만 사용)
- 창도 Node GUI도 안 뜸 — 백그라운드 스크립트에서 안전하게 호출 가능

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

| 필드 | 값 |
|---|---|
| `grid` | 4~128 (기본 16) |
| `pixelScale` | 1픽셀당 확대 배율, 기본 32 → 16×16이 512×512px로 저장 |
| `output` | 기본 출력 경로 (`-o` 있으면 무시됨) |

## 지원 op

| op | 설명 |
|---|---|
| `fill` | 전체 채우기 |
| `clear` | 전체 지우기(투명) |
| `set` (별칭 `pixel`) | 한 칸 찍기 |
| `rect` | 사각 채우기 ( `outline: true` → 테두리만 ) |
| `erase` | 사각 영역 투명하게 ( `x,y,w,h` ) |
| `line` | 선 ( `x1,y1,x2,y2`, 대각선 포함) |
| `circle` | 원 ( `cx,cy,r`, `outline: true` → 테두리만 ) |
| `mirror` | 이미 그린 것 좌/우 반전 복제 ( `mode: "vertical"` → 상/하 ) |

색: `#RRGGBB` 또는 알파 있는 `#RRGGBBAA`

## 오류가 나면

- 걱정 말고 **표준 에러 메시지를 그대로 읽으면** 어느 op 몇 번째에서 뭘 고쳐야 하는지 적혀 있음
- JSON 문법 오류도 줄 단위로 잡아줌
- 종료 코드: 성공 `0`, 실패 `1`

## 앱과의 관계

- `pixel` — GUI 앱을 여는 명령어 (사람용)
- `pixel-draw` — 이 CLI (AI/자동화용)
- 둘은 별개로 동작하며 상태를 공유하지 않습니다
