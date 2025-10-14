<template>
  <main class="app-shell">
    <header class="app-header">
      <h1>FX Proxy Dashboard</h1>
      <p class="subtitle">Cost-capped foreign exchange rates with hard guardrails.</p>
    </header>
    <section class="cards">
      <FxCard base="USD" symbol="GHS" />
      <FxCard base="USD" symbol="EUR" />
    </section>
  </main>
</template>

<script setup lang="ts">
import FxCard from './components/FxCard.vue';
</script>

<style scoped>
.app-shell {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 2rem;
  background: #f7fafc;
  min-height: 100vh;
  color: #1a202c;
}

.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.subtitle {
  margin-top: 0.5rem;
  color: #4a5568;
}

.cards {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
</style>
