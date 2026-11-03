# PlatformIO × M5Stack CoreS3 ハンズオン（子機のコード）

息を吹き込むと、大画面の風船が膨らむゲームの **子機（M5Stack CoreS3）** のコードです。
このフォルダをそのまま VS Code で開くと、PlatformIO のプロジェクトとして使えます。

## パートごとのコード

パートごとに **ブランチ** を分けています。パートが始まったら、講師の合図で切り替えてください。

| ブランチ | 中身 | パート |
|---|---|---|
| `step1-hello` | シリアルモニタに「Hello」を出す | 1. PlatformIO の使い方 |
| `step2-sensor` | 圧力を読んで、画面に数値とバーで出す | 2. センサーを読む |
| `step3-mqtt` | Wi-Fi・MQTT で圧力を送る（完成版） | 3. 通信 |

```bash
git clone https://github.com/cpslab/handson-2026-m5-child.git   # 最初に1回だけ
git switch step2-sensor                                         # パート2の最初
git switch step3-mqtt                                           # パート3の最初
```

- 遅れてしまったときも、同じコマンドでそのパートのコードにできます。
- 切り替えると、自分で書き換えたところ（`Hello` の文字・`MAX_KPA` など）は元に戻ります。それで大丈夫です。
- 書き換えたままだと切り替えられないことがあります。そのときは `git restore .` で書き換えを取り消してから、もう一度 `git switch` してください。

## 書き換えてよいところ

`src/main.cpp` の `===== ここを書き換えよう =====` で囲まれたところだけです。

## パート3: Wi-Fi・MQTT の設定

1. `include/secrets.example.h` をコピーして、同じフォルダに `secrets.h` という名前で置く
2. `secrets.h` に、講師が示す SSID・パスワード・`MQTT_HOST`（PC の IP アドレス）を書く
3. `src/main.cpp` の `MY_NAME`（自分の名前）と `MY_COLOR`（風船の色）を書き換えて書き込む

- `secrets.h` には Wi-Fi のパスワードを書くので、`.gitignore` で git の管理から外しています（パスワードはコミットしない）。
