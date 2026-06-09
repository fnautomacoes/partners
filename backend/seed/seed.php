<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/env.php';

use Core\Database;
use Helpers\Crypto;

echo "=== PacoTicket Parceiros - Seed ===\n\n";

$pdo = Database::getInstance();

// 1. SuperAdmin padrão
echo "1. Criando SuperAdmin...\n";
$adminEmail = 'admin@pacoticket.com';
$adminPassword = 'PacoAdmin@2024';

$stmt = $pdo->prepare('SELECT id FROM "User" WHERE email = :email');
$stmt->execute([':email' => $adminEmail]);

if (!$stmt->fetch()) {
    $hash = Crypto::hashPassword($adminPassword);
    $stmt = $pdo->prepare('
        INSERT INTO "User" (email, "passwordHash", role)
        VALUES (:email, :hash, :role)
    ');
    $stmt->execute([
        ':email' => $adminEmail,
        ':hash' => $hash,
        ':role' => 'SUPERADMIN',
    ]);
    echo "   ✓ SuperAdmin criado: {$adminEmail} / {$adminPassword}\n";
    echo "   ⚠ IMPORTANTE: Troque a senha após o primeiro login!\n";
} else {
    echo "   - SuperAdmin já existe, pulando.\n";
}

// 2. Commission Tiers padrão
echo "\n2. Criando Commission Tiers...\n";
$tiers = [
    ['name' => 'Indicador', 'minClients' => 1, 'maxClients' => 2, 'percentage' => 15.00, 'order' => 1],
    ['name' => 'Parceiro', 'minClients' => 3, 'maxClients' => 9, 'percentage' => 25.00, 'order' => 2],
    ['name' => 'Master', 'minClients' => 10, 'maxClients' => null, 'percentage' => 35.00, 'order' => 3],
];

foreach ($tiers as $tier) {
    $stmt = $pdo->prepare('
        INSERT INTO "CommissionTier" (name, "minClients", "maxClients", percentage, "order", "isActive")
        VALUES (:name, :minClients, :maxClients, :percentage, :order, true)
        ON CONFLICT DO NOTHING
    ');
    $stmt->execute([
        ':name' => $tier['name'],
        ':minClients' => $tier['minClients'],
        ':maxClients' => $tier['maxClients'],
        ':percentage' => $tier['percentage'],
        ':order' => $tier['order'],
    ]);
}
echo "   ✓ 3 tiers criados (Indicador 15%, Parceiro 25%, Master 35%)\n";

// 3. Resource Prices padrão
echo "\n3. Criando Resource Prices...\n";
$resources = [
    ['key' => 'user', 'label' => 'Usuário Extra', 'price' => 29.90, 'sortOrder' => 1],
    ['key' => 'queue', 'label' => 'Fila Extra', 'price' => 19.90, 'sortOrder' => 2],
    ['key' => 'whatsappUnofficial', 'label' => 'WhatsApp Não-Oficial', 'price' => 49.90, 'sortOrder' => 3],
    ['key' => 'whatsappOfficial', 'label' => 'WhatsApp Oficial', 'price' => 99.90, 'sortOrder' => 4],
    ['key' => 'instagram', 'label' => 'Instagram', 'price' => 39.90, 'sortOrder' => 5],
];

foreach ($resources as $res) {
    $stmt = $pdo->prepare('
        INSERT INTO "ResourcePrice" (key, label, price, "sortOrder", "isVisible")
        VALUES (:key, :label, :price, :sortOrder, true)
        ON CONFLICT (key) DO NOTHING
    ');
    $stmt->execute([
        ':key' => $res['key'],
        ':label' => $res['label'],
        ':price' => $res['price'],
        ':sortOrder' => $res['sortOrder'],
    ]);
}
echo "   ✓ 5 recursos criados\n";

// 4. Module Prices padrão
echo "\n4. Criando Module Prices...\n";
$modules = [
    ['moduleKey' => 'useWhatsapp', 'label' => 'WhatsApp', 'price' => 0],
    ['moduleKey' => 'useFacebook', 'label' => 'Facebook', 'price' => 0],
    ['moduleKey' => 'useInstagram', 'label' => 'Instagram', 'price' => 0],
    ['moduleKey' => 'useCampaigns', 'label' => 'Campanhas', 'price' => 49.90],
    ['moduleKey' => 'useSchedules', 'label' => 'Agendamentos', 'price' => 29.90],
    ['moduleKey' => 'useInternalChat', 'label' => 'Chat Interno', 'price' => 0],
    ['moduleKey' => 'useExternalApi', 'label' => 'API Externa', 'price' => 99.90],
    ['moduleKey' => 'useKanban', 'label' => 'Kanban', 'price' => 39.90],
    ['moduleKey' => 'useAI', 'label' => 'Inteligência Artificial', 'price' => 149.90],
    ['moduleKey' => 'useCRM', 'label' => 'CRM', 'price' => 79.90],
    ['moduleKey' => 'useFLOW', 'label' => 'Fluxos', 'price' => 59.90],
];

foreach ($modules as $mod) {
    $stmt = $pdo->prepare('
        INSERT INTO "ModulePrice" ("moduleKey", label, price, "isVisible")
        VALUES (:moduleKey, :label, :price, true)
        ON CONFLICT ("moduleKey") DO NOTHING
    ');
    $stmt->execute([
        ':moduleKey' => $mod['moduleKey'],
        ':label' => $mod['label'],
        ':price' => $mod['price'],
    ]);
}
echo "   ✓ " . count($modules) . " módulos criados\n";

// 5. System Config padrão
echo "\n5. Criando System Config...\n";
$configs = [
    ['key' => 'smtp_host', 'value' => ''],
    ['key' => 'smtp_port', 'value' => '587'],
    ['key' => 'smtp_mode', 'value' => 'starttls'],
    ['key' => 'smtp_user', 'value' => ''],
    ['key' => 'smtp_pass', 'value' => ''],
    ['key' => 'smtp_from', 'value' => ''],
    ['key' => 'company_name', 'value' => 'PacoTicket'],
    ['key' => 'company_logo', 'value' => ''],
];

foreach ($configs as $cfg) {
    $stmt = $pdo->prepare('
        INSERT INTO "SystemConfig" (key, value)
        VALUES (:key, :value)
        ON CONFLICT (key) DO NOTHING
    ');
    $stmt->execute([':key' => $cfg['key'], ':value' => $cfg['value']]);
}
echo "   ✓ " . count($configs) . " configurações criadas\n";

echo "\n=== Seed concluído! ===\n";
echo "\nCredenciais do SuperAdmin:\n";
echo "  Email: {$adminEmail}\n";
echo "  Senha: {$adminPassword}\n";
echo "\n⚠ Troque a senha imediatamente após o primeiro login!\n";
