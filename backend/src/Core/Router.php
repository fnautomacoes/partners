<?php

declare(strict_types=1);

namespace Core;

class Router
{
    private array $routes = [];
    private array $middlewareHandlers = [];

    public function registerMiddleware(string $name, callable $handler): void
    {
        $this->middlewareHandlers[$name] = $handler;
    }

    public function get(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    public function put(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('PUT', $path, $handler, $middleware);
    }

    public function delete(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('DELETE', $path, $handler, $middleware);
    }

    private function addRoute(string $method, string $path, array $handler, array $middleware): void
    {
        $pattern = preg_replace('/\/:([^\/]+)/', '/(?P<$1>[^/]+)', $path);
        $pattern = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'pattern' => $pattern,
            'handler' => $handler,
            'middleware' => $middleware,
        ];
    }

    public function dispatch(): void
    {
        $request = new Request();
        $response = new Response();

        foreach ($this->routes as $route) {
            if ($route['method'] !== $request->method) {
                continue;
            }

            if (!preg_match($route['pattern'], $request->path, $matches)) {
                continue;
            }

            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $request->params[$key] = $value;
                }
            }

            foreach ($route['middleware'] as $name) {
                if (!isset($this->middlewareHandlers[$name])) {
                    $response->error('MIDDLEWARE_NOT_FOUND', "Middleware '{$name}' not registered", 500);
                    return;
                }

                $result = ($this->middlewareHandlers[$name])($request, $response);
                if ($result === false) {
                    return;
                }
            }

            [$class, $method] = $route['handler'];
            $controller = new $class();
            $controller->$method($request, $response);
            return;
        }

        $response->error('NOT_FOUND', 'Route not found', 404);
    }
}
