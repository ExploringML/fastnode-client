# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

# Development Flow

- Use Vite dev server to serve your React app (localhost:5173).
- Let the React app directly connect to your FastHTML Python backend for WebSocket events (localhost:5001/ws).
- You run two servers, side by side.

## Start Vite Frontend

Start the ReactFlow powered Vite frontend. In the react-flow-test folder:

```bash
npm run dev
```

This starts the Vite dev server at http://localhost:5173.