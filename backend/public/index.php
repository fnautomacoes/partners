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
use Controllers\ClientController;
use Controllers\CommissionController;
use Controllers\InvoiceController;
use Controllers\FunnelController;
use Controllers\PdfController;
use Controllers\SystemConfigController;
use Controllers\ActivityLogController;
use Controllers\CommissionTierController;

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
$router->get('/api/admin/dashboard',       [PartnerController::class, 'adminDashboard'], ['superadmin']);
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

// Client routes
$router->get('/api/clients',                        [ClientController::class, 'index'],       ['auth']);
$router->post('/api/clients',                       [ClientController::class, 'store'],       ['auth']);
$router->get('/api/clients/:id',                    [ClientController::class, 'show'],        ['auth']);
$router->put('/api/clients/:id',                    [ClientController::class, 'update'],      ['auth']);
$router->delete('/api/clients/:id',                 [ClientController::class, 'destroy'],     ['superadmin']);
$router->get('/api/clients/:id/addons',             [ClientController::class, 'indexAddons'], ['auth']);
$router->post('/api/clients/:id/addons',            [ClientController::class, 'storeAddon'],  ['auth']);
$router->put('/api/clients/:id/addons/:addonId',    [ClientController::class, 'updateAddon'], ['auth']);
$router->delete('/api/clients/:id/addons/:addonId', [ClientController::class, 'destroyAddon'], ['auth']);

// Commission routes
$router->get('/api/commissions/summary',   [CommissionController::class, 'summary'],   ['auth']);
$router->get('/api/commissions',           [CommissionController::class, 'index'],     ['auth']);
$router->post('/api/commissions/calculate', [CommissionController::class, 'calculate'], ['superadmin']);
$router->put('/api/commissions/:id/pay',   [CommissionController::class, 'pay'],       ['superadmin']);

// Invoice routes
$router->get('/api/invoices',      [InvoiceController::class, 'index'], ['auth']);
$router->post('/api/invoices/sync', [InvoiceController::class, 'sync'],  ['superadmin']);

// Funnel routes - Stages
$router->get('/api/funnel/stages',       [FunnelController::class, 'indexStages'],   ['auth']);
$router->post('/api/funnel/stages',      [FunnelController::class, 'storeStage'],    ['auth']);
$router->put('/api/funnel/stages/:id',   [FunnelController::class, 'updateStage'],   ['auth']);
$router->delete('/api/funnel/stages/:id', [FunnelController::class, 'destroyStage'], ['auth']);

// Funnel routes - Leads
$router->get('/api/funnel/leads',                    [FunnelController::class, 'indexLeads'],     ['auth']);
$router->post('/api/funnel/leads',                   [FunnelController::class, 'storeLead'],      ['auth']);
$router->get('/api/funnel/leads/:id',                [FunnelController::class, 'showLead'],       ['auth']);
$router->put('/api/funnel/leads/:id',                [FunnelController::class, 'updateLead'],     ['auth']);
$router->delete('/api/funnel/leads/:id',             [FunnelController::class, 'destroyLead'],    ['auth']);
$router->get('/api/funnel/leads/:id/activities',     [FunnelController::class, 'indexActivities'], ['auth']);
$router->post('/api/funnel/leads/:id/activities',    [FunnelController::class, 'storeActivity'],  ['auth']);
$router->post('/api/funnel/leads/:id/promote',       [FunnelController::class, 'promote'],        ['auth']);

// PDF routes
$router->post('/api/pdf/plan',                [PdfController::class, 'generate'],  ['auth']);
$router->get('/api/pdf/proposals',            [PdfController::class, 'index'],     ['auth']);
$router->get('/api/pdf/proposals/all',        [PdfController::class, 'indexAll'],  ['superadmin']);
$router->get('/api/pdf/proposals/:id/download', [PdfController::class, 'download'], ['auth']);
$router->delete('/api/pdf/proposals/:id',     [PdfController::class, 'destroy'],   ['auth']);

// System Config routes
$router->get('/api/system-config',           [SystemConfigController::class, 'index']);
$router->get('/api/system-config/admin',     [SystemConfigController::class, 'admin'],    ['superadmin']);
$router->put('/api/system-config',           [SystemConfigController::class, 'update'],   ['superadmin']);
$router->post('/api/system-config/smtp-test', [SystemConfigController::class, 'testSmtp'], ['superadmin']);

// Activity Log routes
$router->get('/api/activity-log', [ActivityLogController::class, 'index'], ['auth']);

// Commission Tiers routes
$router->get('/api/commission-tiers',       [CommissionTierController::class, 'index'],   ['superadmin']);
$router->post('/api/commission-tiers',      [CommissionTierController::class, 'store'],   ['superadmin']);
$router->put('/api/commission-tiers/:id',   [CommissionTierController::class, 'update'],  ['superadmin']);
$router->delete('/api/commission-tiers/:id', [CommissionTierController::class, 'destroy'], ['superadmin']);

// Health check
$router->get('/api/health', [new class {
    public function check(\Core\Request $request, \Core\Response $response): void {
        $response->success(['status' => 'ok', 'timestamp' => date('c')]);
    }
}, 'check']);

$router->dispatch();
