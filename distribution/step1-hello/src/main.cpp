// パート1: PlatformIO の使い方
// 役割: 「Hello」をシリアルモニタと画面の両方に1秒ごとに出すだけ

#include <M5Unified.h>

// ===== ここを書き換えよう =====
// 出す文字（好きな言葉に変えてもう一度書き込んでみよう）
const char* MESSAGE = "Hello";
// ============================

// 何回出したか（loop() が繰り返されていることを確かめるため）
int count = 0;

// ===== 起動時に1回だけ実行される =====
void setup() {
  // M5Stack の初期化（画面・ボタンなどを使えるようにする）
  auto cfg = M5.config();
  M5.begin(cfg);

  // シリアル通信の開始（platformio.ini の monitor_speed と合わせる）
  Serial.begin(115200);

  // 日本語が出せるフォントにする（文字は画面の中央にそろえる・前の文字は黒で塗りつぶす）
  M5.Display.setFont(&fonts::lgfxJapanGothic_40);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextPadding(M5.Display.width());
}

// ===== 起動後、ずっと繰り返し実行される =====
void loop() {
  count += 1;

  // シリアルモニタに出す
  Serial.println(MESSAGE);

  // 画面にも出す（上に文字、下に回数）
  int cx = M5.Display.width() / 2;
  M5.Display.drawString(MESSAGE, cx, 100);
  M5.Display.drawString(String(count) + " 回目", cx, 170);

  // 1秒（1000ミリ秒）待つ
  delay(1000);
}
