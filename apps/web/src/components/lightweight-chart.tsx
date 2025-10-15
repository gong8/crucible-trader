"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  createSeriesMarkers,
  type ISeriesApi,
  type IChartApi,
  type LineData,
  type Time,
  type SeriesMarker,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";

interface ChartProps {
  readonly equity: Array<{ time: number; value: number }>;
  readonly markers: Array<{ time: number; side: "buy" | "sell"; price: number }>;
}

const markerColor = {
  buy: "#22c55e",
  sell: "#ef4444",
} as const;

const LightweightChart = ({ equity, markers }: ChartProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#e2e8f0",
      },
      grid: {
        vertLines: { color: "#1f2533" },
        horzLines: { color: "#1f2533" },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: "#1f2533",
      },
      timeScale: {
        borderColor: "#1f2533",
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers<Time>(series, []);

    const handleResize = (): void => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        chart.applyOptions({ width: clientWidth, height: clientHeight });
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      markersRef.current?.setMarkers([]);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !equity.length) {
      return;
    }
    const lineData: LineData[] = equity.map((point) => ({
      time: point.time as Time,
      value: point.value,
    }));
    seriesRef.current.setData(lineData);
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
    const markerPayload: SeriesMarker<Time>[] = markers.map((marker) => ({
      time: marker.time as Time,
      position: marker.side === "buy" ? "belowBar" : "aboveBar",
      color: markerColor[marker.side],
      shape: marker.side === "buy" ? "arrowUp" : "arrowDown",
      text: marker.side,
      price: marker.price,
    }));
    markersRef.current?.setMarkers(markerPayload);
  }, [equity, markers]);

  return <div ref={containerRef} style={{ width: "100%", height: "420px" }} />;
};

export default LightweightChart;
