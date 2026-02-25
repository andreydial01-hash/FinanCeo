# FinanceOS 💜

Dashboard de finanzas personales. Control de ingresos, gastos, deudas y portafolios.

## Instalación y despliegue en Vercel

### Opción A — Vercel CLI (recomendado)
```bash
npm install
npm run dev        # probar local en http://localhost:5173
npx vercel         # desplegar
```

### Opción B — GitHub + Vercel (sin terminal)
1. Sube esta carpeta a un repositorio en github.com
2. Entra a vercel.com → "Add New Project"
3. Importa el repositorio
4. Vercel detecta Vite automáticamente → clic en Deploy

## Stack
- React 18 + Vite
- Recharts
- localStorage (datos guardados en el navegador)
