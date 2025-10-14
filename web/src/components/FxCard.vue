<template>
  <article class="card" role="region" :aria-label="`${base} to ${symbol} rate`">
    <header class="card-header">
      <h2>{{ base }} → {{ symbol }}</h2>
      <p v-if="latest" class="rate">{{ latest.rate.toFixed(4) }}</p>
      <p v-else class="placeholder">Loading…</p>
      <p v-if="latest" class="timestamp">As of {{ new Date(latest.asOf).toLocaleString() }}</p>
    </header>
    <section class="chart-section" aria-live="polite">
      <Line v-if="hasHistory" :data="chartData" :options="chartOptions" />
      <p v-else class="placeholder">Awaiting history…</p>
    </section>
    <footer class="card-footer">
      <span v-if="errorMessage" class="error">{{ errorMessage }}</span>
      <span v-else>Updated every minute. Cached for five minutes.</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import { gql } from '@apollo/client/core';
import { Line } from 'vue-chartjs';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler
} from 'chart.js';
import { useRatesStore } from '../stores/rates';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const props = defineProps<{
  base: string;
  symbol: string;
}>();

const GET_LATEST = gql`
  query GetLatest($base: String!, $symbols: [String!]!) {
    getLatest(base: $base, symbols: $symbols) {
      base
      asOf
      rates {
        key
        value
      }
    }
  }
`;

const GET_HISTORY = gql`
  query GetHistory($base: String!, $symbol: String!, $days: Int!) {
    getHistory(base: $base, symbol: $symbol, days: $days) {
      date
      value
    }
  }
`;

const store = useRatesStore();
const cacheKey = computed(() => `${props.base}:${props.symbol}`);

const latestCache = store.getLatest(cacheKey.value);
const historyCache = store.getHistory(cacheKey.value);

const latest = ref(latestCache);
const history = ref(historyCache ?? []);
const errorMessage = ref<string | null>(null);

const latestQuery = useQuery(GET_LATEST, () => ({
  base: props.base,
  symbols: [props.symbol]
}), {
  pollInterval: 60000,
  fetchPolicy: 'network-only'
});

const historyQuery = useQuery(GET_HISTORY, () => ({
  base: props.base,
  symbol: props.symbol,
  days: 30
}), {
  fetchPolicy: 'network-only'
});

watch(
  () => latestQuery.result.value,
  (value) => {
    if (!value) return;
    const rateEntry = value.getLatest.rates.find((rate: { key: string; value: number }) => rate.key === props.symbol);
    if (rateEntry) {
      const record = { rate: rateEntry.value, asOf: value.getLatest.asOf };
      store.setLatest(cacheKey.value, record);
      latest.value = record;
      errorMessage.value = null;
    }
  }
);

watch(
  () => latestQuery.error.value,
  (err) => {
    if (err) {
      errorMessage.value = 'Unable to load latest rate';
    }
  }
);

watch(
  () => historyQuery.result.value,
  (value) => {
    if (!value) return;
    store.setHistory(cacheKey.value, value.getHistory);
    history.value = value.getHistory;
    errorMessage.value = null;
  }
);

watch(
  () => historyQuery.error.value,
  (err) => {
    if (err) {
      errorMessage.value = 'Unable to load history';
    }
  }
);

const chartData = computed(() => ({
  labels: history.value.map((point) => point.date),
  datasets: [
    {
      label: `${props.base} → ${props.symbol}`,
      data: history.value.map((point) => point.value),
      tension: 0.3,
      fill: false,
      borderColor: '#3182ce',
      pointRadius: 0
    }
  ]
}));

const hasHistory = computed(() => history.value.length > 0);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    }
  },
  scales: {
    x: {
      display: true
    },
    y: {
      display: true
    }
  }
};
</script>

<style scoped>
.card {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.rate {
  font-size: 2.5rem;
  font-weight: 700;
}

.timestamp {
  color: #4a5568;
  font-size: 0.875rem;
}

.chart-section {
  min-height: 160px;
}

.placeholder {
  color: #a0aec0;
}

.card-footer {
  font-size: 0.875rem;
  color: #4a5568;
}

.error {
  color: #c53030;
  font-weight: 600;
}
</style>
