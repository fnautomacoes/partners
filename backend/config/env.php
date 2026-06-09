<?php

declare(strict_types=1);

function env(string $key, mixed $default = null): mixed
{
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }

    $lower = strtolower($value);
    if ($lower === 'true') return true;
    if ($lower === 'false') return false;
    if ($lower === 'null') return null;
    if (is_numeric($value)) {
        return str_contains($value, '.') ? (float) $value : (int) $value;
    }

    return $value;
}
