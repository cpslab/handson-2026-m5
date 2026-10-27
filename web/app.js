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
    countdown: document.getElementById("countdown"),
    countdownText: document.getElementById("countdown-text"),
    connLost: document.getElementById("conn-lost"),
    ranking: document.getElementById("ranking"),
    rankingList: document.getElementById("ranking-list"),
    rankingNone: document.getElementById("ranking-none"),
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

  // 一度切れたら、再びつながるまで「接続が切れました」を出し続ける
  // （再接続中は connecting → closed をくり返すので、closed のときだけ出すとちらつく）
  let disconnected = false;

  function setConnStatus(status) {
    el.conn.dataset.status = status;
    el.conn.textContent = CONN_LABEL[status] || status;

    if (status === "closed") disconnected = true;
    if (status === "open" || status === "mock") disconnected = false;
    el.connLost.hidden = !disconnected;
    document.body.classList.toggle("disconnected", disconnected);

    // 切れている間は押しても Node-RED に届かないので、ボタンを押せなくする
    // （スタートは、つながったあとに届く state で段階に合わせて押せるようになる）
    el.resetBtn.disabled = disconnected;
    if (disconnected) el.startBtn.disabled = true;
  }

  // ===== 描画: state をそのまま画面に反映する =====
  function render(state) {
    el.phase.textContent = PHASE_LABEL[state.phase] || state.phase;
    // 段階ごとの見た目の切り替えは CSS 側で行う（例: 圧力メーターは待機中だけ出す）
    document.body.dataset.phase = state.phase;
    el.timer.textContent = timerText(state);
    // 残り時間が少なくなったら赤くして目立たせる
    el.timer.classList.toggle("hurry",
      state.phase === "playing" && state.remaining != null && state.remaining <= HURRY_SECONDS);

    // スタートは待機中だけ押せる（Node-RED 側も待機中以外は無視する）
    el.startBtn.disabled = state.phase !== "waiting" || disconnected;

    const players = state.players || [];
    el.empty.hidden = players.length > 0;
    el.grid.hidden = players.length === 0;
    renderGrid(players);
    renderWaitingInfo(state.phase, players);
    renderCountdown(state);
    renderRanking(state.phase, players);
  }

  // ===== 待機中の案内: 接続人数 =====
  function renderWaitingInfo(phase, players) {
    el.waitingInfo.hidden = phase !== "waiting" || players.length === 0;

    const online = players.filter(function (p) { return p.online; }).length;
    const offline = players.length - online;
    el.playerCount.textContent =
      "接続中 " + online + " 人" + (offline > 0 ? "（通信切れ " + offline + " 人）" : "");
  }

  // 残り何秒から残り時間を赤くするか
  const HURRY_SECONDS = 10;

  // カウントダウンの数字は画面中央に大きく出すので、上部には残り時間だけ出す
  function timerText(state) {
    if (state.phase === "playing" && state.remaining != null) {
      return "残り " + state.remaining.toFixed(1) + " 秒";
    }
    return "";
  }

  // ===== カウントダウン: 3・2・1 → スタート！ =====
  // state は1秒に20回届くので、数字が変わったときだけアニメーションをやり直す。
  // 「スタート！」は countdown → playing に変わった瞬間をブラウザで見つけて少しだけ出す
  // （計測中にページを開き直したときは出ない）。
  const GO_SHOW_MS = 800;
  let lastPhase = null;
  let lastCountdownText = null;
  let goTimer = null;

  function renderCountdown(state) {
    if (state.phase === "countdown" && state.countdown != null) {
      clearTimeout(goTimer);
      goTimer = null;
      showCountdownText(String(state.countdown), false);
    } else if (lastPhase === "countdown" && state.phase === "playing") {
      showCountdownText("スタート！", true);
      goTimer = setTimeout(hideCountdown, GO_SHOW_MS);
    } else if (goTimer === null) {
      hideCountdown();
    }
    lastPhase = state.phase;
  }

  function showCountdownText(text, isGo) {
    el.countdown.hidden = false;
    if (text === lastCountdownText) return;
    lastCountdownText = text;

    el.countdownText.textContent = text;
    el.countdownText.classList.toggle("go", isGo);
    // アニメーションを最初から再生し直す（クラスを外す → 再計算させる → 付け直す）
    el.countdownText.classList.remove("pop");
    void el.countdownText.offsetWidth;
    el.countdownText.classList.add("pop");
  }

  function hideCountdown() {
    el.countdown.hidden = true;
    lastCountdownText = null;
    goTimer = null;
  }

  // ===== 順位表 =====
  // 終了したら、順位が付いた人を 1位から順に並べて出す。
  // 最後の人が割れた瞬間に終了になるので、破裂演出が見えるよう少し待ってから出す
  // （終了中にページを開いたときは待たずに出す）。
  const RANKING_DELAY_MS = 1000;
  let rankingLastPhase = null;
  let rankingTimer = null;
  let rankingKey = null; // 今表示している順位表の中身（変わったときだけ作り直す）

  function renderRanking(phase, players) {
    if (phase !== "finished") {
      clearTimeout(rankingTimer);
      rankingTimer = null;
      el.ranking.hidden = true;
      rankingKey = null;
    } else if (rankingLastPhase !== null && rankingLastPhase !== "finished") {
      // 今まさに終了した → 少し待ってから出す
      rankingTimer = setTimeout(function () {
        rankingTimer = null;
        el.ranking.hidden = false;
      }, RANKING_DELAY_MS);
    } else if (rankingTimer === null) {
      el.ranking.hidden = false;
    }
    rankingLastPhase = phase;

    if (phase === "finished") {
      updateRankingList(players);
    }
  }

  function updateRankingList(players) {
    const ranked = players
      .filter(function (p) { return p.rank != null; })
      .sort(function (a, b) { return a.rank - b.rank; });

    // state は1秒に20回届くので、中身が変わったときだけ作り直す（行が出てくるアニメーションをやり直さないため）
    const key = JSON.stringify(ranked.map(function (p) { return [p.rank, p.id, p.color]; }));
    if (key === rankingKey) return;
    rankingKey = key;

    el.rankingNone.hidden = ranked.length > 0;
    el.rankingList.replaceChildren.apply(el.rankingList, ranked.map(rankingRow));
  }

  // 順位表の1行（ID は子機から届く文字列なので textContent で入れる）
  function rankingRow(player, index) {
    const li = document.createElement("li");
    li.className = "ranking-row";
    li.dataset.rank = String(player.rank);
    li.style.setProperty("--balloon-color", player.color || "#888");
    // 1位から順に少しずつ遅らせて出す
    li.style.animationDelay = (index * 0.15).toFixed(2) + "s";

    const rank = document.createElement("span");
    rank.className = "ranking-rank";
    rank.textContent = player.rank + "位";

    const dot = document.createElement("span");
    dot.className = "ranking-dot";

    const name = document.createElement("span");
    name.className = "ranking-name";
    name.textContent = String(player.id);

    li.append(rank, dot, name);
    return li;
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

  // 破裂演出の長さ [ミリ秒]（style.css のアニメーションの長さと合わせる）
  const BURST_ANIM_MS = 700;
  // 飛び散る破片の数
  const SHARD_COUNT = 10;

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
  let tileCount = 0; // つくったマスの数（陰影の id をマスごとに変えるため）

  function createTile() {
    tileCount += 1;
    const root = document.createElement("div");
    root.className = "tile";

    const rank = document.createElement("div");
    rank.className = "tile-rank";

    const balloonArea = document.createElement("div");
    balloonArea.className = "tile-balloon";
    balloonArea.innerHTML =
      '<svg viewBox="0 0 100 160" aria-hidden="true">' +
      // 風船の立体感を出す陰影（左上が明るく、ふちが暗い）。id はマスごとに変える
      '  <defs>' +
      '    <radialGradient id="shade-' + tileCount + '" cx="35%" cy="30%" r="75%">' +
      '      <stop offset="0" stop-color="#fff" stop-opacity="0.35" />' +
      '      <stop offset="0.5" stop-color="#fff" stop-opacity="0" />' +
      '      <stop offset="1" stop-color="#000" stop-opacity="0.35" />' +
      '    </radialGradient>' +
      '  </defs>' +
      '  <g class="balloon">' +
      // 風船を結び目のところでゆらゆら揺らす（マスごとに揺れ方をずらす）
      '   <g class="balloon-sway" style="animation-delay:-' + (Math.random() * 4).toFixed(2) + 's">' +
      '    <path class="balloon-string" d="M50 118 q -6 14 0 26 t 0 16" />' +
      '    <ellipse class="balloon-body" cx="50" cy="60" rx="42" ry="52" />' +
      '    <path class="balloon-knot" d="M44 118 L56 118 L50 110 Z" />' +
      '    <ellipse class="balloon-shade" cx="50" cy="60" rx="42" ry="52" fill="url(#shade-' + tileCount + ')" />' +
      '    <ellipse class="balloon-shine" cx="34" cy="38" rx="8" ry="14" />' +
      // 割れたあとに結び目に残る切れ端（割れるまでは非表示）
      '    <path class="balloon-remnant" d="M43 112 L40 102 L46 106 L49 98 L53 105 L59 100 L57 112 Z" />' +
      '   </g>' +
      '  </g>' +
      '  <g class="shards">' + shardsSvg() + '</g>' +
      '</svg>';

    // 通信切れの札（通信が途切れている間だけ表示）
    const offlineBadge = document.createElement("div");
    offlineBadge.className = "tile-offline-badge";
    offlineBadge.textContent = "通信切れ";
    balloonArea.append(offlineBadge);

    // 「パン！」の文字
    const popText = document.createElement("div");
    popText.className = "tile-pop-text";
    popText.textContent = "パン！";
    balloonArea.append(popText);

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
      wasBurst: null, // 前回の burst（null = まだ一度も描いていない）
      burstTimer: null,
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
    updateBurst(tile, !!player.burst);
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

  // ===== 破裂演出 =====
  // burst が false → true に変わった瞬間だけ演出を再生する。
  // ページを開いた時点ですでに割れている風船は、演出なしで割れた姿にする。
  function updateBurst(tile, burst) {
    if (burst && tile.wasBurst === false) {
      playBurst(tile);
    }
    if (!burst) {
      // リセットされたら演出の途中でも元に戻す
      clearTimeout(tile.burstTimer);
      tile.root.classList.remove("bursting");
    }
    tile.root.classList.toggle("burst", burst);
    tile.wasBurst = burst;
  }

  function playBurst(tile) {
    // アニメーションを最初から再生し直す（クラスを外す → 再計算させる → 付け直す）
    tile.root.classList.remove("bursting");
    void tile.root.offsetWidth;
    tile.root.classList.add("bursting");

    clearTimeout(tile.burstTimer);
    tile.burstTimer = setTimeout(function () {
      tile.root.classList.remove("bursting");
    }, BURST_ANIM_MS);

    playPopSound();
  }

  // 破片の SVG をつくる。風船のふちから外向きに飛ぶよう、行き先（--dx, --dy）と回転（--rot）を持たせる
  function shardsSvg() {
    let svg = "";
    for (let i = 0; i < SHARD_COUNT; i++) {
      const angle = (i / SHARD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const x = 50 + Math.cos(angle) * 30;
      const y = 60 + Math.sin(angle) * 38;
      const dist = 30 + Math.random() * 25;
      const style =
        "--dx:" + (Math.cos(angle) * dist).toFixed(1) + "px;" +
        "--dy:" + (Math.sin(angle) * dist).toFixed(1) + "px;" +
        "--rot:" + Math.round((Math.random() - 0.5) * 360) + "deg";
      svg +=
        '<path class="shard" style="' + style + '" d="M' + x.toFixed(1) + " " + y.toFixed(1) +
        ' l10 -5 l-3 11 z" />';
    }
    return svg;
  }

  // ===== 破裂音 =====
  // 音声ファイルは使わず、ブラウザでノイズを鳴らして「パン」という音をつくる。
  // ブラウザは、画面を一度クリックするまで音を鳴らさないので、スタートボタンを押したときに準備する。
  let audioCtx = null;

  function prepareSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    audioCtx.resume();
  }

  function playPopSound() {
    if (!audioCtx || audioCtx.state !== "running") return;

    // 0.15秒分のノイズを、すぐに小さくなるように鳴らす
    const length = Math.floor(audioCtx.sampleRate * 0.15);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.8;
    source.connect(gain).connect(audioCtx.destination);
    source.start();
  }

  // ===== 起動 =====
  const handlers = { onMessage: handleMessage, onStatus: setConnStatus };
  const connection = useMock
    ? window.createMockConnection(handlers)
    : connectWebSocket(wsUrl, handlers);

  el.startBtn.addEventListener("click", function () {
    prepareSound();
    connection.send({ type: "start" });
  });

  el.resetBtn.addEventListener("click", function () {
    connection.send({ type: "reset" });
  });
})();
