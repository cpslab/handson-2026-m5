// パート1: PlatformIO の使い方
// 役割: シリアルモニタに「Hello」を1秒ごとに出すだけ

#include <M5Unified.h>

// ===== 起動時に1回だけ実行される =====
void setup() {
  // M5Stack の初期化（画面・ボタンなどを使えるようにする）
  auto cfg = M5.config();
  M5.begin(cfg);

  // シリアル通信の開始（platformio.ini の monitor_speed と合わせる）
  Serial.begin(115200);
}

// ===== 起動後、ずっと繰り返し実行される =====
void loop() {
  // ===== ここを書き換えよう =====
  // シリアルモニタに出す文字（好きな言葉に変えてもう一度書き込んでみよう）
  Serial.println("Hello");
  // ============================

  // 1秒（1000ミリ秒）待つ
  delay(1000);
}
