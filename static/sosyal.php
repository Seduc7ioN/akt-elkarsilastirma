<?php
// /sosyal.php — yoneticiye ozel ic panel.
// Reels pipeline'in urettigi icerikleri listeler: gorsel, video, caption.
// Instagram'a manuel kopyala/yapistir icin tasarlandi.
//
// Parola korumasi:
//   /sosyal-data/.auth dosyasina SHA-256 hex parola hash'i koyulur (tek satir).
//   Olusturmak icin: `echo -n "PAROLA" | sha256sum`  (Linux/macOS)
//   veya PowerShell:  [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("PAROLA"))).Replace("-","").ToLower()
//   Sonra bu hex'i /sosyal-data/.auth olarak FTP'ye yukleyin.
//
// Veri kaynagi: /sosyal-data/index.json  (GitHub Actions reels job yazar)

declare(strict_types=1);
session_name('sosyal_admin');
session_start();

const DATA_DIR  = __DIR__ . '/sosyal-data';
const AUTH_FILE = DATA_DIR . '/.auth';
const INDEX_JSON = DATA_DIR . '/index.json';

function auth_hash(): ?string {
    if (!is_file(AUTH_FILE)) return null;
    $h = trim((string) @file_get_contents(AUTH_FILE));
    return $h !== '' ? strtolower($h) : null;
}

function logged_in(): bool {
    return !empty($_SESSION['sosyal_ok']) && $_SESSION['sosyal_ok'] === true;
}

// Logout
if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

// Login post
$login_error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    $stored = auth_hash();
    if ($stored === null) {
        $login_error = 'Sunucuda /sosyal-data/.auth bulunamadi. Kurulum eksik.';
    } else {
        $try = strtolower(hash('sha256', (string) $_POST['password']));
        if (hash_equals($stored, $try)) {
            session_regenerate_id(true);
            $_SESSION['sosyal_ok'] = true;
            header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
            exit;
        }
        $login_error = 'Parola hatali.';
        usleep(400000); // brute-force'a karsi minik yavaslatma
    }
}

if (!logged_in()) {
    http_response_code(401);
    ?><!doctype html>
    <html lang="tr"><head>
      <meta charset="utf-8">
      <meta name="robots" content="noindex,nofollow">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Sosyal — Giris</title>
      <style>
        body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#0b0b13;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}
        form{background:#14141e;padding:28px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.4);width:320px}
        h1{font-size:20px;margin:0 0 18px}
        input[type=password]{width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#0b0b13;color:#fff;font-size:16px;box-sizing:border-box}
        button{margin-top:12px;width:100%;padding:12px;border-radius:8px;border:0;background:#e11d48;color:#fff;font-weight:700;font-size:16px;cursor:pointer}
        .err{color:#f87171;font-size:13px;margin-top:10px}
        .note{color:#9ca3af;font-size:12px;margin-top:14px;text-align:center}
      </style>
    </head><body>
      <form method="post" autocomplete="off">
        <h1>Yonetici Girisi</h1>
        <input type="password" name="password" placeholder="Parola" autofocus required>
        <button type="submit">Giris</button>
        <?php if ($login_error): ?><div class="err"><?= htmlspecialchars($login_error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
        <div class="note">Sadece site sahibi icindir.</div>
      </form>
    </body></html><?php
    exit;
}

// Index JSON oku
$items = [];
if (is_file(INDEX_JSON)) {
    $raw = @file_get_contents(INDEX_JSON);
    $obj = $raw ? json_decode($raw, true) : null;
    if (is_array($obj) && isset($obj['items']) && is_array($obj['items'])) {
        $items = $obj['items'];
    }
}

// Filtre
$filter = isset($_GET['t']) ? preg_replace('/[^a-z\-]/', '', (string) $_GET['t']) : '';
if ($filter) {
    $items = array_values(array_filter($items, fn($i) => ($i['template'] ?? '') === $filter));
}

$templates = [
    'haftanin-firsatlari' => 'Haftanin Firsatlari',
    'fiyat-savasi'        => 'Fiyat Savasi',
    'fiyat-dustu'         => 'Fiyat Dustu',
    'uc-market'           => '3 Market',
];

function fmt_date($iso) {
    if (!$iso) return '';
    $t = strtotime($iso);
    if (!$t) return $iso;
    return date('d.m.Y H:i', $t + 3 * 3600); // TR saat
}
?><!doctype html>
<html lang="tr"><head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex,nofollow">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sosyal Panel</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#0b0b13;color:#fff;margin:0}
    header{display:flex;align-items:center;gap:16px;padding:16px 22px;background:#14141e;border-bottom:1px solid #24242f;position:sticky;top:0;z-index:5}
    header h1{font-size:18px;margin:0;flex:1}
    header a{color:#9ca3af;text-decoration:none;font-size:14px}
    header a:hover{color:#fff}
    .tabs{display:flex;gap:8px;padding:14px 22px;flex-wrap:wrap;background:#0f0f18;border-bottom:1px solid #24242f}
    .tabs a{padding:8px 14px;border-radius:999px;background:#1a1a26;color:#d1d5db;text-decoration:none;font-size:14px}
    .tabs a.active{background:#e11d48;color:#fff}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;padding:22px}
    .card{background:#14141e;border:1px solid #24242f;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
    .card .head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:12px;color:#9ca3af}
    .card .badge{display:inline-block;background:#1e293b;color:#60a5fa;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
    .card .cover{background:#000;display:flex;align-items:center;justify-content:center;aspect-ratio:9/16;overflow:hidden}
    .card .cover img, .card .cover video{width:100%;height:100%;object-fit:cover;display:block}
    .card .body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
    .card textarea{width:100%;min-height:160px;background:#0b0b13;color:#e5e7eb;border:1px solid #24242f;border-radius:8px;padding:10px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.5;resize:vertical}
    .card .btns{display:flex;gap:8px;flex-wrap:wrap}
    .card .btns a, .card .btns button{flex:1;min-width:120px;text-align:center;padding:10px;border-radius:8px;border:0;cursor:pointer;font-weight:700;font-size:13px;text-decoration:none}
    .btn-copy{background:#10b981;color:#fff}
    .btn-img{background:#3b82f6;color:#fff}
    .btn-vid{background:#f59e0b;color:#0a0a0a}
    .empty{padding:60px 20px;text-align:center;color:#9ca3af}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:999px;font-weight:700;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:10}
    .toast.show{opacity:1}
  </style>
</head><body>
  <header>
    <h1>Sosyal Panel — Instagram Icerikleri</h1>
    <a href="?logout=1">Cikis</a>
  </header>
  <nav class="tabs">
    <a href="?" class="<?= $filter === '' ? 'active' : '' ?>">Tumu</a>
    <?php foreach ($templates as $k => $label): ?>
      <a href="?t=<?= urlencode($k) ?>" class="<?= $filter === $k ? 'active' : '' ?>"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></a>
    <?php endforeach; ?>
  </nav>

  <?php if (empty($items)): ?>
    <div class="empty">Henuz icerik yok. Reels workflow'u calistiginda burada gorunecek.</div>
  <?php else: ?>
    <div class="grid">
    <?php foreach ($items as $it):
      $tmpl    = $it['template'] ?? '';
      $stamp   = $it['stamp'] ?? '';
      $created = $it['created_at'] ?? '';
      $img     = $it['image'] ?? '';
      $vid     = $it['video'] ?? '';
      $caption = $it['caption'] ?? '';
      $label   = $templates[$tmpl] ?? $tmpl;
    ?>
      <article class="card" data-stamp="<?= htmlspecialchars($stamp, ENT_QUOTES, 'UTF-8') ?>">
        <div class="head">
          <span class="badge"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></span>
          <span><?= htmlspecialchars(fmt_date($created), ENT_QUOTES, 'UTF-8') ?></span>
        </div>
        <div class="cover">
          <?php if ($vid): ?>
            <video src="<?= htmlspecialchars($vid, ENT_QUOTES, 'UTF-8') ?>" poster="<?= htmlspecialchars($img, ENT_QUOTES, 'UTF-8') ?>" controls preload="none"></video>
          <?php elseif ($img): ?>
            <img src="<?= htmlspecialchars($img, ENT_QUOTES, 'UTF-8') ?>" alt="<?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?>">
          <?php endif; ?>
        </div>
        <div class="body">
          <textarea readonly><?= htmlspecialchars($caption, ENT_QUOTES, 'UTF-8') ?></textarea>
          <div class="btns">
            <button type="button" class="btn-copy" data-copy>Caption Kopyala</button>
            <?php if ($img): ?><a class="btn-img" href="<?= htmlspecialchars($img, ENT_QUOTES, 'UTF-8') ?>" download>Gorsel</a><?php endif; ?>
            <?php if ($vid): ?><a class="btn-vid" href="<?= htmlspecialchars($vid, ENT_QUOTES, 'UTF-8') ?>" download>Video</a><?php endif; ?>
          </div>
        </div>
      </article>
    <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <div class="toast" id="toast">Kopyalandi ✓</div>

  <script>
    const toast = document.getElementById('toast');
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ta = btn.closest('.card').querySelector('textarea');
        try {
          await navigator.clipboard.writeText(ta.value);
          showToast('Caption kopyalandi ✓');
        } catch (e) {
          ta.select();
          document.execCommand('copy');
          showToast('Kopyalandi');
        }
      });
    });
  </script>
</body></html>
