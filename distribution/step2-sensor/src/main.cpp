// パート2: センサーを読む
// 役割: 圧力ユニットの値を読んで、画面に数値とバーで出す

#include <M5Unified.h>

// 圧力センサーをつなぐピン（PORT.B の白線）
int sensorPin;

// 吹いていないときの圧力（ゼロ点）
float zeroKPa = 0;

// ===== ここを書き換えよう =====
// バーがいっぱいになる圧力（kPa）
const float MAX_KPA = 10;
// ============================

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

  // 日本語が出せるフォントにする（文字は画面の中央にそろえる）
  M5.Display.setFont(&fonts::lgfxJapanGothic_24);
  M5.Display.setTextDatum(middle_center);
  int cx = M5.Display.width() / 2;

  // ゼロ点を測る（この間は吹かない）
  M5.Display.drawString("準備中...", cx, 90);
  M5.Display.drawString("まだ吹かないでね", cx, 140);
  float sum = 0;
  for (int i = 0; i < 20; i++) {
    sum += readKPa();
    delay(50);
  }
  zeroKPa = sum / 20;

  // 計測画面の見出しを出す
  M5.Display.clear();
  M5.Display.drawString("圧力", cx, 30);

  // 数値用の大きいフォントにする（前の文字は黒で塗りつぶす）
  M5.Display.setFont(&fonts::lgfxJapanGothic_40);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextPadding(M5.Display.width());
}

// ===== 起動後、ずっと繰り返し実行される =====
void loop() {
  // ボタン・タッチの状態を更新する
  M5.update();

  // ゼロ点からの圧力差を求める
  float p = readKPa() - zeroKPa;

  // 数値を画面の中央に表示する
  M5.Display.drawString(String(p, 1) + " kPa", M5.Display.width() / 2, 100);

  // 圧力をバーで表示する（MAX_KPA でいっぱい）
  int barX = 20;
  int barMax = M5.Display.width() - barX * 2;
  int barW = constrain(p / MAX_KPA, 0.0f, 1.0f) * barMax;
  M5.Display.fillRect(barX, 160, barW, 50, TFT_GREEN);
  M5.Display.fillRect(barX + barW, 160, barMax - barW, 50, TFT_DARKGREY);

  // シリアルにも出す（シリアルプロッタでグラフにできる）
  Serial.println(p);

  delay(50);
}
