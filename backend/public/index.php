<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/env.php';

use Core\Router;
use Core\Middleware;
use Controllers\AuthController;
use Controllers\PartnerController;
use Controllers\PlanController;
use Controllers\ModulePriceController;
use Controllers\ResourcePriceController;

$router = new Router();

$router->registerMiddleware('auth', [Middleware::class, 'auth']);
$router->registerMiddleware('superadmin', [Middleware::class, 'superadmin']);
$router->registerMiddleware('partner', [Middleware::class, 'partner']);

// Auth routes
$router->post('/api/auth/login',           [AuthController::class, 'login']);
$router->post('/api/auth/refresh',         [AuthController::class, 'refresh']);
$router->get('/api/auth/me',               [AuthController::class, 'me'],             ['auth']);
$router->post('/api/auth/logout',          [AuthController::class, 'logout'],          ['auth']);
$router->post('/api/auth/change-password', [AuthController::class, 'changePassword'], ['auth']);
$router->post('/api/auth/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/api/auth/reset-password',  [AuthController::class, 'resetPassword']);

// Partner routes (SuperAdmin)
$router->get('/api/partners',              [PartnerController::class, 'index'],    ['superadmin']);
$router->post('/api/partners',             [PartnerController::class, 'store'],    ['superadmin']);
$router->get('/api/partners/me/dashboard', [PartnerController::class, 'dashboard'], ['auth']);
$router->get('/api/partners/:id',          [PartnerController::class, 'show'],     ['superadmin']);
$router->put('/api/partners/:id',          [PartnerController::class, 'update'],   ['superadmin']);
$router->delete('/api/partners/:id',       [PartnerController::class, 'destroy'],  ['superadmin']);

// Plan routes (SuperAdmin CRUD)
$router->get('/api/plans',                 [PlanController::class, 'index'],         ['auth']);
$router->put('/api/plans/reorder',         [PlanController::class, 'reorder'],       ['superadmin']);
$router->get('/api/plans/:id',             [PlanController::class, 'show'],          ['auth']);
$router->post('/api/plans',                [PlanController::class, 'store'],         ['superadmin']);
$router->put('/api/plans/:id',             [PlanController::class, 'update'],        ['superadmin']);
$router->delete('/api/plans/:id',          [PlanController::class, 'destroy'],       ['superadmin']);

// Plan routes (Partner own plans)
$router->post('/api/plans/partner',        [PlanController::class, 'storePartner'],   ['auth']);
$router->put('/api/plans/partner/:id',     [PlanController::class, 'updatePartner'],  ['auth']);
$router->delete('/api/plans/partner/:id',  [PlanController::class, 'destroyPartner'], ['auth']);

// Module pricing routes
$router->get('/api/plans/modules/prices',           [ModulePriceController::class, 'index'],   ['auth']);
$router->put('/api/plans/modules/prices',           [ModulePriceController::class, 'upsert'],  ['superadmin']);
$router->delete('/api/plans/modules/prices/:moduleKey', [ModulePriceController::class, 'destroy'], ['superadmin']);

// Resource pricing routes
$router->get('/api/resource-prices',       [ResourcePriceController::class, 'index'],  ['auth']);
$router->put('/api/resource-prices',       [ResourcePriceController::class, 'update'], ['superadmin']);

// Health check
$router->get('/api/health', [new class {
    public function check(\Core\Request $request, \Core\Response $response): void {
        $response->success(['status' => 'ok', 'timestamp' => date('c')]);
    }
}, 'check']);

$router->dispatch();
