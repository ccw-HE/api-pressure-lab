// 挂载入口：仅负责把 App 渲染到 #root，不承载任何 UI 逻辑（计划书 §14.1）。
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(<App />);
