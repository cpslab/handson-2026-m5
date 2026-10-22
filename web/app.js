// 風船ゲームの表示画面（メイン）
// 役割: Node-RED から届いた state をそのまま描き、ボタン操作を Node-RED に送る
// メッセージ形式は README の「Node-RED ↔ ブラウザのメッセージ形式」を参照

(function () {
  "use strict";

  // ===== 接続先の決定 =====
  //   ?mock                          → ダミーデータで動かす（Node-RED なしで開発できる）
  //   ?ws=ws://<host>:1880/ws/balloon → 接続先の WebSocket を指定する
  //   指定なし                        → このページを配信しているホストの /ws/balloon に接続する
  //   ※ ファイルを直接開いた（file://）ときは接続先がないのでダミーデータで動かす
  const params = new URLSearchParams(location.search);
  const useMock = params.has("mock") || (location.protocol === "file:" && !params.has("ws"));
  const wsUrl = params.get("ws") || defaultWsUrl();

  function defaultWsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + "/ws/balloon";
  }

  // ===== 画面の部品 =====
  const el = {
    phase: document.getElementById("phase"),
    timer: document.getElementById("timer"),
    conn: document.getElementById("conn"),
    players: document.getElementById("players"),
    empty: document.getElementById("empty"),
    startBtn: document.getElementById("start-btn"),
    resetBtn: document.getElementById("reset-btn"),
  };

  const PHASE_LABEL = {
    waiting: "待機中",
    countdown: "カウントダウン",
    playing: "計測中",
    finished: "終了",
  };

  const CONN_LABEL = {
    connecting: "接続中…",
    open: "接続済み",
    closed: "切断（再接続中）",
    mock: "ダミーデータ",
  };

  // ===== WebSocket 接続（切れたら自動で再接続する） =====
  function connectWebSocket(url, handlers) {
    let ws = null;
    let retryDelay = 1000;

    function open() {
      handlers.onStatus("connecting");
      ws = new WebSocket(url);

      ws.onopen = function () {
        retryDelay = 1000;
        handlers.onStatus("open");
      };

      ws.onmessage = function (ev) {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          console.warn("JSON ではないメッセージを無視しました:", ev.data);
          return;
        }
        handlers.onMessage(msg);
      };

      // 切れたら少し待って再接続する（待ち時間は 1秒 → 2秒 → 4秒 → 最大5秒）
      ws.onclose = function () {
        handlers.onStatus("closed");
        setTimeout(open, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 5000);
      };
    }

    open();

    return {
      send: function (msg) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      },
    };
  }

  // ===== 受け取ったメッセージの処理 =====
  function handleMessage(msg) {
    if (msg.type === "state") {
      render(msg);
    }
  }

  function setConnStatus(status) {
    el.conn.dataset.status = status;
    el.conn.textContent = CONN_LABEL[status] || status;
  }

  // ===== 描画: state をそのまま画面に反映する =====
  function render(state) {
    el.phase.textContent = PHASE_LABEL[state.phase] || state.phase;
    el.timer.textContent = timerText(state);

    // スタートは待機中だけ押せる（Node-RED 側も待機中以外は無視する）
    el.startBtn.disabled = state.phase !== "waiting";

    const players = state.players || [];
    el.empty.hidden = players.length > 0;
    el.players.replaceChildren.apply(el.players, players.map(playerRow));
  }

  function timerText(state) {
    if (state.phase === "countdown" && state.countdown != null) {
      return String(state.countdown);
    }
    if (state.phase === "playing" && state.remaining != null) {
      return "残り " + state.remaining.toFixed(1) + " 秒";
    }
    return "";
  }

  // 参加者1人分の行をつくる（ID は子機から届く文字列なので textContent で入れる）
  function playerRow(player, index) {
    const tr = document.createElement("tr");
    tr.classList.toggle("offline", !player.online);

    const level = Math.max(0, Math.min(1, player.level || 0));

    const idCell = document.createElement("td");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = player.color || "#888";
    idCell.append(swatch, String(player.id));

    const levelCell = document.createElement("td");
    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = (level * 100).toFixed(1) + "%";
    fill.style.background = player.color || "#888";
    bar.append(fill);
    levelCell.append(bar, (level * 100).toFixed(0) + "%");

    tr.append(
      cell(String(index + 1)),
      idCell,
      levelCell,
      cell(typeof player.p === "number" ? player.p.toFixed(1) : "-"),
      cell(player.burst ? "💥" : ""),
      cell(player.rank != null ? player.rank + "位" : ""),
      cell(player.online ? "○" : "×")
    );
    return tr;
  }

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  // ===== 起動 =====
  const handlers = { onMessage: handleMessage, onStatus: setConnStatus };
  const connection = useMock
    ? window.createMockConnection(handlers)
    : connectWebSocket(wsUrl, handlers);

  el.startBtn.addEventListener("click", function () {
    connection.send({ type: "start" });
  });

  el.resetBtn.addEventListener("click", function () {
    connection.send({ type: "reset" });
  });
})();
