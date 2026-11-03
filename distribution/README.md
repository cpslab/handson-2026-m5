# distribution

3年生に配る **配布用リポジトリ** [cpslab/handson-2026-m5-child](https://github.com/cpslab/handson-2026-m5-child)（public）の元になるファイルを置きます。
配布用リポジトリは直接編集せず、ここと `child/` を直して `export.ps1` で書き出します（二重に編集しないため）。

当日の進め方（clone・switch）は [slides/README.md の「コードの配り方」](../slides/README.md#コードの配り方git-で配る) を参照してください。

## 中身

```
distribution/
├── export.ps1                ← 配布用リポジトリに書き出すスクリプト
├── common/                   ← 全ブランチに入れるもの
│   ├── README.md             ← 3年生向けの説明（配布用リポジトリのトップに出る）
│   ├── .gitignore            ← .pio/ と secrets.h を除外
│   └── .vscode/extensions.json ← PlatformIO の拡張機能をおすすめする
├── step1-hello/src/main.cpp  ← パート1: シリアルモニタと画面に Hello
└── step2-sensor/src/main.cpp ← パート2: 圧力を読んで画面に出す
```

配布用リポジトリのブランチごとの中身は次のとおりです。どのブランチも、直下がそのまま PlatformIO のプロジェクトになります。

| ブランチ | `src/` | ほかに入るもの |
|---|---|---|
| `step1-hello` | `distribution/step1-hello/src/` | `common/` の中身・`child/platformio.ini` |
| `step2-sensor` | `distribution/step2-sensor/src/` | 同上 |
| `step3-mqtt` | `child/src/`（完成版） | 同上・`child/include/secrets.example.h` |

- `platformio.ini` は全ブランチで `child/` と同じものを使います（パート1の書き込みでライブラリも先に入るので、あとのパートで待たずに済む）。
- step1・step2 のコードは、`child/src/main.cpp` から必要な部分だけを抜き出したものです。**`child/` の書き方を変えたら、step2 も合わせて直してください。**

## 書き出し方（講師用）

リポジトリ直下で実行します。書き出すのは **`origin/develop`（マージ済み）の中身** なので、PR をマージしてから実行してください。手元のコミットしていない変更（自分の `MY_NAME` など）は出ません。

```powershell
.\distribution\export.ps1          # 書き出してコミットまで（push しない。中身を確かめたいとき）
.\distribution\export.ps1 -Push    # 書き出して push まで
```

- 一時フォルダに配布用リポジトリを clone し、3つのブランチの中身を入れ替えてコミットします。変わっていないブランチはコミットしません。
- コミットメッセージには、書き出した元のコミット（`update: handson-2026-m5 の 1a2b3c4 から書き出す`）が入ります。
- 実行できないとき（「スクリプトの実行が無効」と出る）は `powershell -ExecutionPolicy Bypass -File .\distribution\export.ps1` で実行してください。

## 配布用リポジトリを最初に作るとき（1回だけ）

```powershell
gh repo create cpslab/handson-2026-m5-child --public --description "PlatformIO × M5Stack CoreS3 ハンズオン（子機のコード）"
.\distribution\export.ps1 -Push
gh repo edit cpslab/handson-2026-m5-child --default-branch step1-hello
```

- 既定のブランチを `step1-hello` にするのは、clone した直後をパート1の状態にするためです。
- 3年生は clone するだけで push しないので、招待や書き込み権限は要りません（public なので誰でも clone できます）。
