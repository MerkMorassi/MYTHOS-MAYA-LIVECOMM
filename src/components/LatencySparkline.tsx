import React from 'react';

interface LatencySparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

export const LatencySparkline: React.FC<LatencySparklineProps> = ({
  data,
  width = 200,
  height = 40,
}) => {
  if (data.length < 2) return <div style={{ width, height }} />;

  const maxVal = Math.max(...data, 100); // Scale up to at least 100ms
  const minVal = 0;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - minVal) / (maxVal - minVal)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke="#06b6d4"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
};
