import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from "react-native";
import { Svg, Path, Circle } from "react-native-svg";

type Block = {
  id: string;
  start: number;
  end: number;
  color: string;
  label: string;
};

type ProcessedBlock = {
  block: Block;
  innerRadius: number;
  outerRadius: number;
  ringIndex: number;
};

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function createDonutSlicePath(
    cx: number, cy: number, 
    innerRadius: number, outerRadius: number, 
    startAngle: number, endAngle: number
): string {
    if (endAngle - startAngle >= 360) {
      endAngle = 359.99;
    }
    if (startAngle === endAngle) return '';

    const outerArcStart = polarToCartesian(cx, cy, outerRadius, endAngle);
    const outerArcEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
    const innerArcStart = polarToCartesian(cx, cy, innerRadius, endAngle);
    const innerArcEnd = polarToCartesian(cx, cy, innerRadius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    const d = [
        'M', outerArcStart.x, outerArcStart.y,
        'A', outerRadius, outerRadius, 0, largeArcFlag, 0, outerArcEnd.x, outerArcEnd.y,
        'L', innerArcEnd.x, innerArcEnd.y,
        'A', innerRadius, innerRadius, 0, largeArcFlag, 1, innerArcStart.x, innerArcStart.y,
        'Z',
    ].join(' ');

    return d;
}

const DonutSlice = ({ block, innerRadius, outerRadius }: { block: Block; innerRadius: number; outerRadius: number; }) => {
  const DAY_MINUTES = 1440;
  const startAngle = (block.start / DAY_MINUTES) * 360;
  const endAngle = (block.end / DAY_MINUTES) * 360;

  const pathData = createDonutSlicePath(
    50, 50,
    innerRadius, outerRadius,
    startAngle, endAngle
  );

  return <Path d={pathData} fill={block.color} />;
};

export default function SVGPlaygroundScreen() {
  const mockBlocks: Block[] = [
    { id: '1', start: 480, end: 1080, color: "#60a5fa", label: "업무" },
    { id: '2', start: 600, end: 720, color: "#f472b6", label: "회의" },
    { id: '3', start: 1140, end: 1260, color: "#34d399", label: "운동" },
    { id: '4', start: 660, end: 840, color: "#a78bfa", label: "디자인 작업" },
    { id: '5', start: 780, end: 900, color: "#f59e0b", label: "코드 리뷰" },
  ];

  const processedBlocks = useMemo((): ProcessedBlock[] => {
    const rings = [
      { innerRadius: 37, outerRadius: 48 }, 
      { innerRadius: 24, outerRadius: 35 }, 
      { innerRadius: 11, outerRadius: 22 }, 
    ];
    
    const sortedByTime = [...mockBlocks].sort((a, b) => a.start - b.start);
    const layouts: ProcessedBlock[] = [];
    const processed = new Set<string>();

    for (const block of sortedByTime) {
      if (processed.has(block.id)) continue;

      const group: Block[] = [];
      const findOverlapsRecursive = (b: Block) => {
        group.push(b);
        processed.add(b.id);
        for (const other of sortedByTime) {
          if (processed.has(other.id)) continue;
          if (b.end > other.start && b.start < other.end) {
            findOverlapsRecursive(other);
          }
        }
      };
      findOverlapsRecursive(block);
      
      const groupSorted = group.sort((a, b) => a.start - b.start);
      const ringEnds = rings.map(() => -1); 

      for (const b of groupSorted) {
        let placed = false;
        for (let i = 0; i < rings.length; i++) {
          if (b.start >= ringEnds[i]) {
            layouts.push({ block: b, ...rings[i], ringIndex: i });
            ringEnds[i] = b.end;
            placed = true;
            break;
          }
        }
        if (!placed) {
          const innermostRingIndex = rings.length - 1;
          layouts.push({ block: b, ...rings[innermostRingIndex], ringIndex: innermostRingIndex });
        }
      }
    }

    return layouts;
  }, [mockBlocks]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>🎨 다층 레이어 도넛 차트 🎨</Text>

        <View style={styles.canvas}>
          <Svg height="250" width="250" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="49" stroke="#f3f4f6" strokeWidth={2} fill="none" />
            {processedBlocks.map(({ block, innerRadius, outerRadius }) => (
              <DonutSlice
                key={block.id}
                block={block}
                innerRadius={innerRadius}
                outerRadius={outerRadius}
              />
            ))}
          </Svg>
        </View>
        
        <View style={styles.legend}>
            {processedBlocks.sort((a,b) => a.block.start - b.block.start).map(({ block, ringIndex }) => (
                <View key={block.id} style={styles.legendItem}>
                    <View style={[styles.legendColor, {backgroundColor: block.color}]} />
                    <Text style={styles.legendText}>
                        {block.label} - Ring {ringIndex + 1}
                    </Text>
                </View>
            ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'white',
  },
  container: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  canvas: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
  },
  legend: {
    marginTop: 20,
    alignSelf: 'stretch',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
  }
});