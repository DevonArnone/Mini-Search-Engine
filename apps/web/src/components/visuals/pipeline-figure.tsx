"use client";

import { Pause, Play } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import React, { useRef, useState } from "react";

const CLOTHS = ["mdn", "react", "nextjs", "typescript", "postgresql"] as const;
const STATIONS = [150, 390, 630, 870];
const SHEETS = Array.from({ length: 10 }, (_, index) => ({ cloth: CLOTHS[index % CLOTHS.length], delay: index * 0.9, lane: index % 5 }));
const LOOP_SECONDS = 9;

// Pages leave the five volumes, pass each station in order, and land as rows
// in the postings ledger. Decorative: the stations are described in the list
// that follows this figure.
export function PipelineFigure({ live }: { live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const moving = live && inView && !reducedMotion && !paused;

  return (
    <div className="relative" ref={ref}>
      <svg aria-hidden className="block h-auto w-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1100 170">
        {/* The volumes. */}
        {CLOTHS.map((cloth, index) => (
          <rect fill={`rgb(var(--cloth-${cloth}))`} height={[120, 96, 110, 102, 116][index]} key={cloth} width={[26, 12, 16, 12, 20][index]} x={[4, 34, 50, 70, 86][index]} y={150 - [120, 96, 110, 102, 116][index]} />
        ))}
        <rect fill="rgb(var(--ink))" height="5" width="118" x="0" y="150" />

        {/* The track and its stations. */}
        <line stroke="rgb(var(--rule-strong))" strokeDasharray="2 7" strokeWidth="1.5" x1="130" x2="930" y1="92" y2="92" />
        {STATIONS.map((x) => (
          <g key={x}>
            <line stroke="rgb(var(--ink))" strokeWidth="1.5" x1={x} x2={x} y1="40" y2="150" />
            <circle cx={x} cy="92" fill="rgb(var(--paper))" r="7" stroke="rgb(var(--ink))" strokeWidth="1.5" />
          </g>
        ))}

        {/* The postings ledger. */}
        <rect fill="rgb(var(--paper-raised))" height="126" stroke="rgb(var(--ink))" strokeWidth="1.5" width="150" x="944" y="26" />
        {Array.from({ length: 7 }, (_, row) => (
          <g key={row}>
            <rect fill="rgb(var(--ink))" height="3" width={[34, 22, 40, 28, 18, 36, 26][row]} x="956" y={42 + row * 15} />
            <rect fill="rgb(var(--rule-strong))" height="3" width={[70, 84, 56, 76, 90, 60, 80][row]} x={[998, 986, 1004, 992, 982, 1000, 990][row]} y={42 + row * 15} />
          </g>
        ))}

        {/* Pages in transit. At rest (reduced motion, paused, or no live index)
            they sit spread along the track. */}
        {SHEETS.map((sheet, index) => {
          const y = 66 + sheet.lane * 11;
          const restX = 150 + index * 78;
          return (
            <motion.rect
              animate={moving ? { x: [118, 944], opacity: [0, 1, 1, 0] } : { x: restX, opacity: live ? 1 : 0.35 }}
              fill={`rgb(var(--cloth-${sheet.cloth}))`}
              height="9"
              initial={false}
              key={index}
              rx="1"
              transition={moving ? { duration: LOOP_SECONDS, delay: sheet.delay, repeat: Infinity, ease: "linear", times: [0, 0.06, 0.94, 1] } : { duration: 0 }}
              width="14"
              y={y}
            />
          );
        })}
      </svg>
      {live && !reducedMotion ? (
        <button aria-label={paused ? "Play the animation" : "Pause the animation"} aria-pressed={paused} className="icon-button absolute -top-2 right-0 h-9 w-9" onClick={() => setPaused((current) => !current)} type="button">
          {paused ? <Play aria-hidden className="h-4 w-4" /> : <Pause aria-hidden className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );
}
