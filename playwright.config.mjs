import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./audits',testMatch:['geometry.spec.mjs','analytics-isolation.spec.mjs'],use:{serviceWorkers:'block'},reporter:'list'});
