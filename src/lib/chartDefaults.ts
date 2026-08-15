import { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, type ChartOptions } from 'chart.js';
import { cssVar } from '@/lib/theme';

export const PIE_COLORS = ['#059669', '#7C3AED', '#D97706', '#2563EB', '#DC2626'];

export type ChartTheme = {
  accent: string;
  border: string;
  muted: string;
  text: string;
  surface: string;
  grid: string;
};

export function readChartTheme(): ChartTheme {
  return {
    accent: cssVar('--primary', '#059669'),
    border: cssVar('--border', '#E5E7EB'),
    muted: cssVar('--text-muted', '#9CA3AF'),
    text: cssVar('--text-primary', '#111827'),
    surface: cssVar('--surface', '#FFFFFF'),
    grid: cssVar('--chart-grid', '#F3F4F6'),
  };
}

export const rechartsTooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 12,
};

const dashedGrid = (theme: ChartTheme) => ({
  color: theme.grid,
  lineWidth: 0.5,
  borderDash: [4, 4] as number[],
  drawBorder: false,
});

export function applyChartJsDefaults(theme = readChartTheme()) {
  ChartJS.defaults.color = theme.muted;
  ChartJS.defaults.borderColor = theme.grid;
  ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.plugins.legend.labels.color = theme.muted;
  ChartJS.defaults.plugins.tooltip.backgroundColor = theme.surface;
  ChartJS.defaults.plugins.tooltip.titleColor = theme.text;
  ChartJS.defaults.plugins.tooltip.bodyColor = theme.text;
  ChartJS.defaults.plugins.tooltip.borderColor = theme.border;
  ChartJS.defaults.plugins.tooltip.borderWidth = 1;
  ChartJS.defaults.plugins.tooltip.cornerRadius = 10;
  ChartJS.defaults.plugins.tooltip.padding = 10;
  ChartJS.defaults.plugins.tooltip.displayColors = false;
}

export function chartJsBarOptions(theme = readChartTheme()): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: theme.surface,
        titleColor: theme.text,
        bodyColor: theme.text,
        borderColor: theme.border,
        borderWidth: 1,
        cornerRadius: 10,
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: theme.muted, font: { size: 11 } },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: dashedGrid(theme),
        ticks: { color: theme.muted, font: { size: 11 } },
        border: { display: false },
      },
    },
  };
}

export function chartJsLineOptions(theme = readChartTheme()): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.surface,
        titleColor: theme.text,
        bodyColor: theme.text,
        borderColor: theme.border,
        borderWidth: 1,
        cornerRadius: 10,
        padding: 10,
      },
    },
    elements: {
      line: { tension: 0.35, borderWidth: 2, borderColor: theme.accent },
      point: { radius: 0, hoverRadius: 5, backgroundColor: theme.accent },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: theme.muted, font: { size: 11 } },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: dashedGrid(theme),
        ticks: { color: theme.muted, font: { size: 11 } },
        border: { display: false },
      },
    },
  };
}

export function useChartTheme(): ChartTheme {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    applyChartJsDefaults();
    const onChange = () => {
      applyChartJsDefaults();
      setVersion((v) => v + 1);
    };
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    window.addEventListener('vobiss-theme-change', onChange);
    return () => {
      observer.disconnect();
      window.removeEventListener('vobiss-theme-change', onChange);
    };
  }, []);

  return useMemo(() => readChartTheme(), [version]);
}
