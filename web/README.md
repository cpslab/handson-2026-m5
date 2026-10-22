# web

プロジェクターに映すブラウザ表示（HTML/CSS/JS）を置きます。
ビルド不要の素の HTML / CSS / JavaScript で書いています。

- Node-RED から WebSocket で届く `state` をそのまま描画します。
- スタート・リセットの操作を Node-RED に送ります。
- メッセージ形式はリポジトリ直下の README「Node-RED ↔ ブラウザのメッセージ形式」を参照してください。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨組み |
| `style.css` | 見た目（プロジェクター向けに暗い背景・大きめの文字） |
| `app.js` | WebSocket の接続（自動再接続）、`state` の描画、ボタン操作の送信 |
| `mock.js` | ダミーデータ。Node-RED の代わりに `state` を流し、`start` / `reset` にも反応する |

## 動かし方

### Node-RED なしで動かす（ダミーデータ）

次のどちらかで開きます。右上に「ダミーデータ」と表示されれば OK です。

- `index.html` をブラウザで直接開く（ダブルクリック）
- ローカルサーバーで開く:
  ```
  cd web
  python -m http.server 8000
  ```
  → http://localhost:8000/?mock を開く

ダミーデータの不感帯・しきい値・制限時間などは `mock.js` の先頭で変えられます。

### Node-RED につなぐ

| 開き方 | 接続先 |
|---|---|
| Node-RED から配信された画面を開く | 同じホストの `/ws/balloon` |
| URL に `?ws=ws://<ホスト>:1880/ws/balloon` を付ける | 指定した WebSocket |

右上の表示が「接続済み」になれば OK です。切れた場合は自動で再接続します。

## Node-RED からの配信について

`index.html` は `style.css` などを **相対パス** で読み込んでいます。
そのため Node-RED では、HTML を `/balloon/` で、他のファイルを `/balloon/<ファイル名>` で配信してください（末尾の `/` が必要です）。
