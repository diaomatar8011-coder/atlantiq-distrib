<?php
/**
 * Receives the "Demander un devis" form, stores it (for the /admin/ panel)
 * and emails a copy to the business inbox.
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'method_not_allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

function clean($value) {
    return trim(strip_tags((string) ($value ?? '')));
}

// Honeypot: a real visitor never fills or even sees this field.
if (clean($data['website'] ?? '') !== '') {
    echo json_encode(['success' => true]);
    exit;
}

$required = ['prenom', 'nom', 'structure', 'telephone', 'email', 'ville', 'code_postal'];
foreach ($required as $field) {
    if (clean($data[$field] ?? '') === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'missing_field', 'field' => $field]);
        exit;
    }
}

$email = clean($data['email']);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'invalid_email']);
    exit;
}

$entry = [
    'id'               => uniqid('devis_', true),
    'date'             => date('c'),
    'etablissement'    => clean($data['etablissement'] ?? ''),
    'distributeur'     => clean($data['distributeur'] ?? ''),
    'personnes'        => clean($data['personnes'] ?? ''),
    'nb_distributeurs' => clean($data['nb_distributeurs'] ?? ''),
    'frequence'        => clean($data['frequence'] ?? ''),
    'message'          => clean($data['message'] ?? ''),
    'prenom'           => clean($data['prenom']),
    'nom'              => clean($data['nom']),
    'structure'        => clean($data['structure']),
    'fonction'         => clean($data['fonction'] ?? ''),
    'telephone'        => clean($data['telephone']),
    'email'            => $email,
    'ville'            => clean($data['ville']),
    'code_postal'      => clean($data['code_postal']),
];

// --- Persist to a JSON file so /admin/ can list past requests ---------------
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}
$dataFile = $dataDir . '/devis.json';

$fp = fopen($dataFile, 'c+');
if ($fp && flock($fp, LOCK_EX)) {
    $existing = stream_get_contents($fp);
    $entries = json_decode($existing, true);
    if (!is_array($entries)) {
        $entries = [];
    }
    $entries[] = $entry;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($entries, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    flock($fp, LOCK_UN);
    fclose($fp);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'storage_failed']);
    exit;
}

// --- Email notification -----------------------------------------------------
$to      = 'contact@atlantiq-distrib.fr';
$subject = '=?UTF-8?B?' . base64_encode('Nouvelle demande de devis - ' . $entry['structure']) . '?=';

$labels = [
    'entreprise' => 'Entreprise / Bureau', 'sante' => 'Hôpital / Clinique',
    'campus' => 'Université / École', 'hotel' => 'Hôtel',
    'usine' => 'Usine / Site industriel', 'commerce' => 'Commerce', 'autre' => 'Autre',
    'chaud' => 'Boissons chaudes', 'frais' => 'Boissons fraîches',
    'snacks' => 'Snacks & confiseries', 'combine' => 'Combiné boissons + snacks',
    'indecis' => 'Ne sait pas encore',
    '24-7' => '24h/24', 'heures' => 'Heures d\'ouverture', 'adefinir' => 'À définir',
];
$label = function ($key) use ($labels, $entry) {
    return $labels[$entry[$key]] ?? $entry[$key];
};

$body = "Nouvelle demande de devis reçue via atlantiq-distrib.fr\n";
$body .= "----------------------------------------------------\n\n";
$body .= "Type d'établissement : " . $label('etablissement') . "\n";
$body .= "Distributeur souhaité : " . $label('distributeur') . "\n";
$body .= "Personnes sur site : " . $entry['personnes'] . "\n";
$body .= "Distributeurs souhaités : " . $entry['nb_distributeurs'] . "\n";
$body .= "Fréquence : " . $label('frequence') . "\n";
$body .= "Message : " . ($entry['message'] !== '' ? $entry['message'] : '(aucun)') . "\n\n";
$body .= "Contact\n";
$body .= "-------\n";
$body .= $entry['prenom'] . ' ' . $entry['nom'] . "\n";
$body .= $entry['structure'] . ($entry['fonction'] !== '' ? ' — ' . $entry['fonction'] : '') . "\n";
$body .= 'Téléphone : ' . $entry['telephone'] . "\n";
$body .= 'Email : ' . $entry['email'] . "\n";
$body .= $entry['ville'] . ' ' . $entry['code_postal'] . "\n";

$headers  = "From: Atlantiq'Distrib <contact@atlantiq-distrib.fr>\r\n";
$headers .= 'Reply-To: ' . $entry['email'] . "\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: 8bit\r\n";

$mailSent = @mail($to, $subject, $body, $headers);

echo json_encode(['success' => true, 'mailSent' => $mailSent]);
