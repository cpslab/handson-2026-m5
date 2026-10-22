// 子機（M5Stack CoreS3）のプログラム
// 役割: 圧力を測って送るだけ（ゲームの判定は親機側で行う）

#include <M5Unified.h>

// ===== 起動時に1回だけ実行される =====
void setup() {
  // M5Stack の初期化（画面・ボタンなどを使えるようにする）
  auto cfg = M5.config();
  M5.begin(cfg);

  // シリアル通信の開始（platformio.ini の monitor_speed と合わせる）
  Serial.begin(115200);

  // 画面に文字を表示する
  M5.Display.setTextSize(2);
  M5.Display.println("Hello");
}

// ===== 起動後、ずっと繰り返し実行される =====
void loop() {
  // ボタン・タッチの状態を更新する
  M5.update();

  delay(100);
}
