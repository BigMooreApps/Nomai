# Servidor HTTP simple en PowerShell para el Dashboard de Nomai
$port = 8086
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "Servidor de Nomai Dashboard corriendo en http://localhost:$port/"
    Write-Host "Presiona Ctrl+C para detener el servidor."
    
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $urlPath = $request.Url.LocalPath
            if ($urlPath -eq "/") {
                $urlPath = "/index.html"
            }
            
            # Obtener ruta absoluta del archivo
            $currentDir = $PSScriptRoot
            if (-not $currentDir) { $currentDir = Get-Location }
            $cleanedPath = $urlPath.TrimStart('/')
            $filePath = [System.IO.Path]::Combine($currentDir, $cleanedPath)
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
                
                # Asignar Content-Type correcto
                $contentType = "application/octet-stream"
                if ($extension -eq ".html") { $contentType = "text/html; charset=utf-8" }
                elseif ($extension -eq ".css") { $contentType = "text/css; charset=utf-8" }
                elseif ($extension -eq ".js") { $contentType = "application/javascript; charset=utf-8" }
                elseif ($extension -eq ".png") { $contentType = "image/png" }
                elseif ($extension -eq ".jpg" -or $extension -eq ".jpeg") { $contentType = "image/jpeg" }
                elseif ($extension -eq ".svg") { $contentType = "image/svg+xml" }
                elseif ($extension -eq ".json") { $contentType = "application/json; charset=utf-8" }
                
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                # Retornar 404
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - Archivo no encontrado")
                $response.ContentType = "text/plain; charset=utf-8"
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
        } catch {
            Write-Host "Error al procesar solicitud: $_"
            if ($response -ne $null) {
                try { $response.Close() } catch {}
            }
        }
    }
} catch {
    Write-Error $_
} finally {
    if ($listener -ne $null) {
        $listener.Stop()
    }
}
