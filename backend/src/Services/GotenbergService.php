<?php

declare(strict_types=1);

namespace Services;

class GotenbergService
{
    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = getenv('GOTENBERG_URL') ?: 'http://gotenberg:3000';
    }

    public function generatePdf(string $html, array $margins = []): ?string
    {
        $url = rtrim($this->baseUrl, '/') . '/forms/chromium/convert/html';

        $marginTop = isset($margins['top']) ? ($margins['top'] / 10) . 'cm' : '1cm';
        $marginBottom = isset($margins['bottom']) ? ($margins['bottom'] / 10) . 'cm' : '1cm';
        $marginLeft = isset($margins['left']) ? ($margins['left'] / 10) . 'cm' : '1cm';
        $marginRight = isset($margins['right']) ? ($margins['right'] / 10) . 'cm' : '1cm';

        $tmpFile = tempnam(sys_get_temp_dir(), 'gotenberg_html_');
        file_put_contents($tmpFile, $html);

        $postFields = [
            'files' => new \CURLFile($tmpFile, 'text/html', 'index.html'),
            'marginTop' => $marginTop,
            'marginBottom' => $marginBottom,
            'marginLeft' => $marginLeft,
            'marginRight' => $marginRight,
            'paperWidth' => '21cm',
            'paperHeight' => '29.7cm',
            'preferCssPageSize' => 'true',
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postFields,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        unlink($tmpFile);

        if ($error || $httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        return $response;
    }
}
