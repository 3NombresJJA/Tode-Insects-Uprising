// Convierte las rutas en URLs compatibles con Vite y Electron.
export function getAssetUrl(src) {
  return `${import.meta.env.BASE_URL}${src.replace(/^\/+/, '')}`;
}
