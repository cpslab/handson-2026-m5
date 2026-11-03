// 子機（M5Stack CoreS3）のプログラム
// 役割: 圧力を測って送るだけ（ゲームの判定は親機側で行う）

#include <M5Unified.h>
#include <WiFi.h>
#include <PubSubClient.h>

// Wi-Fi・MQTT の接続情報（secrets.example.h をコピーして secrets.h をつくる）
#include "secrets.h"

// ===== ここを書き換えよう =====
// 自分の名前（ローマ字・英数字だけ。ほかの人とかぶらないように）
const char* MY_NAME = "ikai";
// 風船の色（#RRGGBB の形。例: "#ff6699" ピンク、"#33aaff" 水色）
const char* MY_COLOR = "#ff6699";
// ============================

// 圧力センサーをつなぐピン（PORT.B の白線）
int sensorPin;

// 吹いていないときの圧力（ゼロ点）
float zeroKPa = 0;

// バーがいっぱいになる圧力（kPa）
const float MAX_KPA = 10;

// MQTT で通信するための道具
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// 送り先のトピック（handson/balloon/自分の名前）
String topic;

// MQTT につなぎ直しを試した時刻（何度も続けて試さないため）
unsigned long lastTryMs = 0;

// 画面に出している接続状態（変わったときだけ描き直す）
String shownStatus = "";

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

// ===== MQTT につながっていなければ、つなぎ直す =====
void connectMqtt() {
  // Wi-Fi が切れているとき・2秒以内に試したばかりのときは何もしない
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastTryMs < 2000) return;
  lastTryMs = millis();

  // 切れた理由をシリアルに出す（-4: 応答がなく時間切れ / -3: 接続が切れた / -2: つなげなかった / -1: まだつないでいない）
  Serial.printf("MQTT につなぎ直します（理由 %d）\n", mqtt.state());

  // 接続の名前は本体ごとにちがう値（MAC アドレス）にする
  // （名前がほかの人とかぶっても、おたがいの接続が切れないように）
  String clientId = "m5-" + WiFi.macAddress();
  mqtt.connect(clientId.c_str());
}

// ===== 画面の下に接続状態を出す =====
void showStatus() {
  String wifi = WiFi.status() == WL_CONNECTED ? "○" : "×";
  String server = mqtt.connected() ? "○" : "×";
  String status = String(MY_NAME) + "  Wi-Fi " + wifi + "  MQTT " + server;

  // 変わっていなければ描き直さない（ちらつき防止）
  if (status == shownStatus) return;
  shownStatus = status;

  // 小さい文字で描いてから、数値用の大きい文字に戻す
  M5.Display.setFont(&fonts::lgfxJapanGothic_20);
  M5.Display.drawString(status, M5.Display.width() / 2, 225);
  M5.Display.setFont(&fonts::lgfxJapanGothic_40);
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

  // Wi-Fi につなぐ（つながるまで待つ）
  M5.Display.drawString("Wi-Fi 接続中...", cx, 90);
  M5.Display.drawString(WIFI_SSID, cx, 140);
  // Wi-Fi の省電力を切る（省電力だと通信がときどき止まり、MQTT の接続が切れやすい）
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
  }

  // MQTT の送り先を決める
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  topic = "handson/balloon/" + String(MY_NAME);

  // ゼロ点を測る（この間は吹かない）
  M5.Display.clear();
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

  // MQTT の接続を保つ（切れていたらつなぎ直す）
  connectMqtt();
  mqtt.loop();

  // ゼロ点からの圧力差を求める
  float p = readKPa() - zeroKPa;

  // 圧力を送る（例: {"id":"ikai","p":3.20,"color":"#ff6699"}）
  String json = "{\"id\":\"" + String(MY_NAME) + "\",\"p\":" + String(p, 2) +
                ",\"color\":\"" + String(MY_COLOR) + "\"}";
  mqtt.publish(topic.c_str(), json.c_str());

  // 数値を画面の中央に表示する
  M5.Display.drawString(String(p, 1) + " kPa", M5.Display.width() / 2, 100);

  // 圧力をバーで表示する（MAX_KPA でいっぱい）
  int barX = 20;
  int barMax = M5.Display.width() - barX * 2;
  int barW = constrain(p / MAX_KPA, 0.0f, 1.0f) * barMax;
  M5.Display.fillRect(barX, 160, barW, 50, TFT_GREEN);
  M5.Display.fillRect(barX + barW, 160, barMax - barW, 50, TFT_DARKGREY);

  // 接続状態を画面の下に出す
  showStatus();

  // シリアルモニタにも出す（吹いたときの数字の変わり方を見られる）
  Serial.println(p);

  delay(50);
}
