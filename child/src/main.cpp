// 子機（M5Stack CoreS3）のプログラム
// 役割: 圧力を測って送るだけ（ゲームの判定は親機側で行う）

#include <M5Unified.h>

// 圧力センサーをつなぐピン（PORT.B の白線）
int sensorPin;

// 吹いていないときの圧力（ゼロ点）
float zeroKPa = 0;

// ===== 圧力センサーの値を読む（単位: kPa） =====
float readKPa() {
  // ノイズを減らすため、10回読んで平均する
  float sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogReadMilliVolts(sensorPin);
  }
  float volt = sum / 10 / 1000;  // mV → V

  // 電圧を圧力に変換する（センサーの換算式）
  return 100 * volt - 110;
}

// ===== 起動時に1回だけ実行される =====
void setup() {
  // M5Stack の初期化（画面・ボタンなどを使えるようにする）
  auto cfg = M5.config();
  M5.begin(cfg);

  // シリアル通信の開始（platformio.ini の monitor_speed と合わせる）
  Serial.begin(115200);

  // PORT.B のピン番号を調べる
  sensorPin = M5.getPin(m5::pin_name_t::port_b_in);

  // ゼロ点を測る（この間は吹かない）
  M5.Display.setTextSize(2);
  M5.Display.println("Don't blow...");
  float sum = 0;
  for (int i = 0; i < 20; i++) {
    sum += readKPa();
    delay(50);
  }
  zeroKPa = sum / 20;

  M5.Display.clear();
}

// ===== 起動後、ずっと繰り返し実行される =====
void loop() {
  // ボタン・タッチの状態を更新する
  M5.update();

  // ゼロ点からの圧力差を求める
  float p = readKPa() - zeroKPa;

  // 画面とシリアルに表示する
  M5.Display.setCursor(0, 0);
  M5.Display.setTextSize(4);
  M5.Display.printf("%6.1f kPa", p);
  Serial.println(p);

  delay(50);
}
