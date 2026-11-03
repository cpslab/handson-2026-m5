// ダミーデータ（Node-RED の代わり）
// 役割: README の「メッセージ形式」どおりの state を 1秒に20回つくって流し、
//       start / reset / remove の操作にも Node-RED と同じように反応する。
//       Node-RED や実機がなくても表示画面を開発できるようにするためのもの。

(function () {
  "use strict";

  // ===== 設定（Node-RED 側のパラメータに相当する） =====
  const SEND_INTERVAL_MS = 50; // 送信間隔（1秒に20回）
  const DEADZONE = 0.5;        // 不感帯 [kPa]
  const THRESHOLD = 30;        // しきい値 [kPa·秒]
  const TIME_LIMIT = 60;       // 制限時間 [秒]
  const MAX_RANK = 5;          // 何位まで決まったら終了するか
  const COUNTDOWN_FROM = 3;    // カウントダウンの開始値

  // ダミーの参加者（10人未満の場合の確認も兼ねて7人にしている）
  const DUMMY_PLAYERS = [
    { id: "ikai",      color: "#ff6699" },
    { id: "tanaka",    color: "#33aaff" },
    { id: "suzuki",    color: "#ffcc33" },
    { id: "sato",      color: "#66dd88" },
    { id: "takahashi", color: "#cc77ff" },
    { id: "ito",       color: "#ff8844" },
    { id: "watanabe",  color: "#44dddd" },
  ];

  window.createMockConnection = function (handlers) {
    // 参加者ごとの内部状態（吹く強さはランダムにばらつかせる）
    const players = DUMMY_PLAYERS.map(function (p) {
      return {
        id: p.id,
        color: p.color,
        strength: 2 + Math.random() * 6, // 吹いたときの圧力 [kPa]
        blowing: false,
        p: 0,
        amount: 0, // 足し込んだ膨らみ [kPa·秒]
        burst: false,
        rank: null,
        online: true,
      };
    });

    let phase = "waiting";
    let phaseStartedAt = performance.now();
    let lastTick = performance.now();
    let nextRank = 1;

    // ===== 操作の受け付け =====
    function onCommand(msg) {
      if (msg.type === "start" && phase === "waiting") {
        setPhase("countdown");
      } else if (msg.type === "reset") {
        players.forEach(function (pl) {
          pl.amount = 0;
          pl.burst = false;
          pl.rank = null;
        });
        nextRank = 1;
        setPhase("waiting");
      } else if (msg.type === "remove" && (phase === "waiting" || phase === "finished")) {
        // 通信切れの参加者だけ消す（ダミーなので、消した人はページを開き直すまで戻らない）
        const i = players.findIndex(function (pl) { return pl.id === msg.id && !pl.online; });
        if (i !== -1) players.splice(i, 1);
      }
    }

    function setPhase(next) {
      phase = next;
      phaseStartedAt = performance.now();
    }

    // ===== 1回分の更新（Node-RED が子機のデータを受け取ったときの処理に相当） =====
    function tick() {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;
      const elapsed = (now - phaseStartedAt) / 1000;

      players.forEach(function (pl, i) {
        // 最後の1人は 30秒ごとに3秒間だけ通信が途切れる（切断表示の確認用）
        pl.online = !(i === players.length - 1 && (now / 1000) % 30 > 27);
        if (!pl.online) return;

        // ときどき吹く・休むを切り替える
        if (Math.random() < 0.03) pl.blowing = !pl.blowing;
        const noise = (Math.random() - 0.5) * 0.6;
        pl.p = (pl.blowing ? pl.strength : 0) + noise;

        // 計測中だけ足し込む: 膨らみ += max(圧力 - 不感帯, 0) × 経過時間
        if (phase === "playing" && !pl.burst) {
          pl.amount += Math.max(pl.p - DEADZONE, 0) * dt;
          if (pl.amount >= THRESHOLD) {
            pl.burst = true;
            if (nextRank <= MAX_RANK) pl.rank = nextRank++;
          }
        }
      });

      // 段階の切り替え
      if (phase === "countdown" && elapsed >= COUNTDOWN_FROM) {
        setPhase("playing");
      } else if (phase === "playing" && (nextRank > MAX_RANK || elapsed >= TIME_LIMIT)) {
        setPhase("finished");
      }

      handlers.onMessage(buildState(now));
    }

    // ===== 送信する state をつくる（README のメッセージ形式どおり） =====
    function buildState(now) {
      const elapsed = (now - phaseStartedAt) / 1000;
      const state = {
        type: "state",
        phase: phase,
        countdown: phase === "countdown" ? Math.max(1, COUNTDOWN_FROM - Math.floor(elapsed)) : null,
        remaining: phase === "playing" ? Math.max(0, TIME_LIMIT - elapsed) : null,
        players: players.map(function (pl) {
          return {
            id: pl.id,
            color: pl.color,
            level: Math.min(1, pl.amount / THRESHOLD),
            p: Math.round(pl.p * 10) / 10,
            burst: pl.burst,
            rank: pl.rank,
            online: pl.online,
          };
        }),
      };
      // 本物と同じく JSON 文字列を経由させる（JSON にできない値が混ざっていないかの確認も兼ねる）
      return JSON.parse(JSON.stringify(state));
    }

    handlers.onStatus("mock");
    setInterval(tick, SEND_INTERVAL_MS);

    return {
      send: function (msg) {
        // 通信の遅れを少しだけまねる
        setTimeout(function () {
          onCommand(JSON.parse(JSON.stringify(msg)));
        }, 30);
      },
    };
  };
})();
