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
    grid: document.getElementById("grid"),
    waitingInfo: document.getElementById("waiting-info"),
    playerCount: document.getElementById("player-count"),
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
    // 段階ごとの見た目の切り替えは CSS 側で行う（例: 圧力メーターは待機中だけ出す）
    document.body.dataset.phase = state.phase;
    el.timer.textContent = timerText(state);

    // スタートは待機中だけ押せる（Node-RED 側も待機中以外は無視する）
    el.startBtn.disabled = state.phase !== "waiting";

    const players = state.players || [];
    el.empty.hidden = players.length > 0;
    el.grid.hidden = players.length === 0;
    renderGrid(players);
    renderWaitingInfo(state.phase, players);
  }

  // ===== 待機中の案内: 接続人数 =====
  function renderWaitingInfo(phase, players) {
    el.waitingInfo.hidden = phase !== "waiting" || players.length === 0;

    const online = players.filter(function (p) { return p.online; }).length;
    const offline = players.length - online;
    el.playerCount.textContent =
      "接続中 " + online + " 人" + (offline > 0 ? "（通信切れ " + offline + " 人）" : "");
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

  // ===== 風船のマス =====
  // state は1秒に20回届くので、マスは毎回つくり直さず、つくったものを使い回して中身だけ書き換える。
  // players の配列の順番 = マスの位置（Node-RED が接続順で固定する）。
  const MAX_TILES = 10;
  const tiles = [];

  // 風船の大きさ: level 0 → MIN_SCALE 倍、level 1 → 1 倍
  const MIN_SCALE = 0.3;

  // 圧力メーターが満タンになる圧力 [kPa]。吹けているかを見るための表示用で、ゲームの判定には使わない
  const METER_MAX_KPA = 10;

  function renderGrid(players) {
    const shown = players.slice(0, MAX_TILES);
    if (players.length > MAX_TILES) {
      console.warn("参加者が " + MAX_TILES + " 人を超えたため、" + (MAX_TILES + 1) + " 人目以降は表示しません");
    }

    // 足りないマスを足し、余ったマスを消す
    while (tiles.length < shown.length) {
      const tile = createTile();
      tiles.push(tile);
      el.grid.append(tile.root);
    }
    while (tiles.length > shown.length) {
      tiles.pop().root.remove();
    }

    shown.forEach(function (player, i) {
      updateTile(tiles[i], player);
    });
  }

  // マス1つ分の部品をつくる
  //   ┌──────────┐
  //   │  順位    │
  //   │  風船    │
  //   │  名前    │
  //   │  メーター │  ← 待機中だけ表示
  //   │  圧力    │
  //   └──────────┘
  function createTile() {
    const root = document.createElement("div");
    root.className = "tile";

    const rank = document.createElement("div");
    rank.className = "tile-rank";

    const balloonArea = document.createElement("div");
    balloonArea.className = "tile-balloon";
    balloonArea.innerHTML =
      '<svg viewBox="0 0 100 160" aria-hidden="true">' +
      '  <g class="balloon">' +
      '    <path class="balloon-string" d="M50 118 q -6 14 0 26 t 0 16" />' +
      '    <ellipse class="balloon-body" cx="50" cy="60" rx="42" ry="52" />' +
      '    <path class="balloon-knot" d="M44 118 L56 118 L50 110 Z" />' +
      '    <ellipse class="balloon-shine" cx="34" cy="38" rx="8" ry="14" />' +
      '  </g>' +
      '</svg>';

    const name = document.createElement("div");
    name.className = "tile-name";

    const meter = document.createElement("div");
    meter.className = "tile-meter";
    const meterFill = document.createElement("div");
    meterFill.className = "tile-meter-fill";
    meter.append(meterFill);

    const pressure = document.createElement("div");
    pressure.className = "tile-pressure";

    root.append(rank, balloonArea, name, meter, pressure);

    return {
      root: root,
      rank: rank,
      balloon: balloonArea.querySelector(".balloon"),
      name: name,
      meterFill: meterFill,
      pressure: pressure,
    };
  }

  // マス1つ分を player の内容で書き換える（ID は子機から届く文字列なので textContent で入れる）
  function updateTile(tile, player) {
    const level = Math.max(0, Math.min(1, player.level || 0));
    const scale = MIN_SCALE + (1 - MIN_SCALE) * level;

    tile.root.classList.toggle("offline", !player.online);
    tile.root.classList.toggle("burst", !!player.burst);
    tile.root.style.setProperty("--balloon-color", player.color || "#888");

    // 風船は糸の下端（中央下）を支点に拡大・縮小する
    tile.balloon.style.transform = "scale(" + scale.toFixed(3) + ")";

    // 圧力メーター（マイナス＝吸ったときは 0 として扱う）
    const p = typeof player.p === "number" && player.online ? player.p : 0;
    const meterRatio = Math.max(0, Math.min(1, p / METER_MAX_KPA));
    tile.meterFill.style.width = (meterRatio * 100).toFixed(1) + "%";

    tile.name.textContent = String(player.id);
    tile.rank.textContent = player.rank != null ? player.rank + "位" : "";
    tile.pressure.textContent = player.online
      ? (typeof player.p === "number" ? player.p.toFixed(1) : "-") + " kPa"
      : "通信が途切れています";
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
