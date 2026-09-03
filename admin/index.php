<?php
session_start();
require __DIR__ . '/config.php';

if (isset($_GET['logout'])) {
    session_unset();
    session_destroy();
    header('Location: index.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    $hash = hash('sha256', $_POST['password']);
    if (hash_equals(DEVIS_ADMIN_PASSWORD_HASH, $hash)) {
        session_regenerate_id(true);
        $_SESSION['devis_admin'] = true;
    } else {
        $error = 'Mot de passe incorrect.';
    }
}

$labels = [
    'entreprise' => 'Entreprise / Bureau', 'sante' => 'Hôpital / Clinique',
    'campus' => 'Université / École', 'hotel' => 'Hôtel',
    'usine' => 'Usine / Site industriel', 'commerce' => 'Commerce', 'autre' => 'Autre',
    'chaud' => 'Boissons chaudes', 'frais' => 'Boissons fraîches',
    'snacks' => 'Snacks & confiseries', 'combine' => 'Combiné boissons + snacks',
    'indecis' => 'Ne sait pas encore',
    '24-7' => '24h/24', 'heures' => "Heures d'ouverture", 'adefinir' => 'À définir',
];
// distributeur can hold several comma-separated values (multi-select cards).
function label($labels, $key, $entry) {
    $v = $entry[$key] ?? '';
    if ($v === '') return $v;
    $parts = array_map(function ($p) use ($labels) { return $labels[$p] ?? $p; }, explode(',', $v));
    return implode(', ', $parts);
}

$loggedIn = !empty($_SESSION['devis_admin']);
?>
<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Demandes de devis — Atlantiq'Distrib</title>
<style>
  :root {
    --navy-950: #060f20; --navy-900: #0a1830; --coral: #fd5c35; --coral-dim: #d44c2b;
    --paper: #faf8f4; --paper-dim: #f1ede5; --ink: #0a1830; --ink-soft: #4a5568; --muted: #8891a3;
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Manrope, sans-serif; background: var(--paper-dim); color: var(--ink); margin: 0; }
  .bar { background: var(--navy-950); color: #f4f1ea; padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
  .bar a { color: #f4f1ea; text-decoration: none; font-size: 0.85rem; opacity: 0.8; }
  .bar a:hover { opacity: 1; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }
  .login-box { max-width: 360px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 8px; box-shadow: 0 20px 50px -20px rgba(10,24,48,0.25); }
  .login-box h1 { font-size: 1.2rem; margin: 0 0 1.2rem; }
  .login-box input { width: 100%; padding: 0.7rem; border: 1px solid rgba(10,24,48,0.2); border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
  .login-box button { width: 100%; padding: 0.8rem; background: var(--coral); color: #fff; border: none; border-radius: 100px; font-weight: 600; cursor: pointer; }
  .error { color: var(--coral-dim); font-size: 0.85rem; margin-bottom: 1rem; }
  .card { background: #fff; border-radius: 8px; padding: 1.2rem 1.4rem; margin-bottom: 1rem; box-shadow: 0 10px 30px -18px rgba(10,24,48,0.2); }
  .card-top { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.8rem; }
  .card-top h3 { margin: 0; font-size: 1.05rem; }
  .card-top time { font-size: 0.78rem; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.6rem 1.2rem; font-size: 0.88rem; }
  .grid dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 0.15rem; }
  .grid dd { margin: 0; color: var(--ink-soft); }
  .grid a { color: var(--coral-dim); }
  .empty { text-align: center; color: var(--muted); padding: 3rem 1rem; }
  .msg-row { margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid var(--paper-dim); font-size: 0.88rem; color: var(--ink-soft); }
  .count { font-size: 0.85rem; color: var(--muted); margin-bottom: 1rem; }
</style>
</head>
<body>
<?php if (!$loggedIn): ?>
  <div class="login-box">
    <h1>Demandes de devis</h1>
    <?php if ($error): ?><p class="error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <form method="post">
      <input type="password" name="password" placeholder="Mot de passe" required autofocus>
      <button type="submit">Se connecter</button>
    </form>
  </div>
<?php else:
  $dataFile = __DIR__ . '/../api/data/devis.json';
  $entries = [];
  if (file_exists($dataFile)) {
      $entries = json_decode(file_get_contents($dataFile), true) ?: [];
  }
  $entries = array_reverse($entries);
?>
  <div class="bar">
    <strong>Atlantiq'Distrib — Demandes de devis</strong>
    <a href="?logout=1">Se déconnecter</a>
  </div>
  <div class="wrap">
    <p class="count"><?= count($entries) ?> demande<?= count($entries) > 1 ? 's' : '' ?> reçue<?= count($entries) > 1 ? 's' : '' ?></p>
    <?php if (empty($entries)): ?>
      <p class="empty">Aucune demande de devis pour le moment.</p>
    <?php else: foreach ($entries as $e): ?>
      <div class="card">
        <div class="card-top">
          <h3><?= htmlspecialchars(($e['prenom'] ?? '') . ' ' . ($e['nom'] ?? '')) ?> — <?= htmlspecialchars($e['structure'] ?? '') ?></h3>
          <time><?= htmlspecialchars(date('d/m/Y à H:i', strtotime($e['date'] ?? 'now'))) ?></time>
        </div>
        <dl class="grid">
          <div><dt>Téléphone</dt><dd><a href="tel:<?= htmlspecialchars($e['telephone'] ?? '') ?>"><?= htmlspecialchars($e['telephone'] ?? '') ?></a></dd></div>
          <div><dt>Email</dt><dd><a href="mailto:<?= htmlspecialchars($e['email'] ?? '') ?>"><?= htmlspecialchars($e['email'] ?? '') ?></a></dd></div>
          <div><dt>Ville</dt><dd><?= htmlspecialchars(($e['ville'] ?? '') . ' ' . ($e['code_postal'] ?? '')) ?></dd></div>
          <div><dt>Fonction</dt><dd><?= htmlspecialchars($e['fonction'] ?: '—') ?></dd></div>
          <div><dt>Établissement</dt><dd><?= htmlspecialchars(label($labels, 'etablissement', $e)) ?></dd></div>
          <div><dt>Distributeur souhaité</dt><dd><?= htmlspecialchars(label($labels, 'distributeur', $e)) ?></dd></div>
          <div><dt>Personnes sur site</dt><dd><?= htmlspecialchars($e['personnes'] ?: '—') ?></dd></div>
          <div><dt>Distributeurs souhaités</dt><dd><?= htmlspecialchars($e['nb_distributeurs'] ?: '—') ?></dd></div>
          <div><dt>Fréquence</dt><dd><?= htmlspecialchars(label($labels, 'frequence', $e)) ?></dd></div>
        </dl>
        <?php if (!empty($e['message'])): ?>
          <p class="msg-row"><strong>Message :</strong> <?= nl2br(htmlspecialchars($e['message'])) ?></p>
        <?php endif; ?>
      </div>
    <?php endforeach; endif; ?>
  </div>
<?php endif; ?>
</body>
</html>
