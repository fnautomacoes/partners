<?php

declare(strict_types=1);

namespace Services;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use Core\Database;

class MailService
{
    private array $config;

    public function __construct()
    {
        $this->config = $this->loadConfig();
    }

    private function loadConfig(): array
    {
        $defaults = [
            'host' => env('SMTP_HOST', ''),
            'port' => (int) env('SMTP_PORT', 587),
            'mode' => env('SMTP_MODE', 'starttls'),
            'user' => env('SMTP_USER', ''),
            'pass' => env('SMTP_PASS', ''),
            'from' => env('SMTP_FROM', ''),
            'fromName' => env('SMTP_FROM_NAME', 'PacoTicket Parceiros'),
        ];

        try {
            $pdo = Database::getInstance();
            $stmt = $pdo->prepare('SELECT key, value FROM "SystemConfig" WHERE key LIKE :prefix');
            $stmt->execute([':prefix' => 'smtp_%']);
            $rows = $stmt->fetchAll();

            foreach ($rows as $row) {
                $key = str_replace('smtp_', '', $row['key']);
                if (isset($defaults[$key])) {
                    $defaults[$key] = $row['value'];
                }
            }
        } catch (\Exception $e) {
            // Fallback to env if DB unavailable
        }

        return $defaults;
    }

    public function send(string $to, string $subject, string $htmlBody): bool
    {
        $mail = new PHPMailer(true);

        $mail->isSMTP();
        $mail->Host = $this->config['host'];
        $mail->Port = (int) $this->config['port'];
        $mail->Username = $this->config['user'];
        $mail->Password = $this->config['pass'];
        $mail->SMTPAuth = true;

        switch ($this->config['mode']) {
            case 'ssl':
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
                break;
            case 'none':
                $mail->SMTPAutoTLS = false;
                $mail->SMTPSecure = '';
                break;
            case 'starttls':
            default:
                $mail->SMTPSecure = '';
                $mail->SMTPAutoTLS = true;
                break;
        }

        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ],
        ];

        $mail->setFrom($this->config['from'], $this->config['fromName']);
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';
        $mail->Subject = $subject;
        $mail->Body = $htmlBody;
        $mail->AltBody = strip_tags($htmlBody);

        return $mail->send();
    }
}
