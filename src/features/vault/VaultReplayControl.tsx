import { useEffect, useRef } from 'react';
import { History, Pause, Play, RotateCcw } from 'lucide-react';
import { REPLAY_FRAME_MS, REPLAY_MIN_MOMENTS, replayLabel, type ReplayTimeline } from '../../utils/vaultReplay';
import { formatSafeBusinessDate } from '../../utils/safeDate';

/**
 * Replay: the map, played back in the order you learned it.
 *
 * Every other view in the Vault answers "what do I know". This answers "how did
 * I come to know it", which is a question a CRM cannot ask because a CRM stores
 * the present tense - a field's value, not the moment it arrived. The Vault
 * keeps a dated memory entry behind every node, so the order is recoverable
 * without anybody having to record it on purpose.
 *
 * The control is deliberately not a video player. There is no timecode and no
 * frame count; the scrubber is a position in a list of the days something was
 * first written down, because those are the only moments that exist.
 */
export function VaultReplayControl({
  timeline,
  at,
  playing,
  onChange,
  onPlayingChange,
  onExit,
}: {
  timeline: ReplayTimeline;
  at: string;
  playing: boolean;
  onChange: (next: string) => void;
  onPlayingChange: (next: boolean) => void;
  onExit: () => void;
}) {
  const index = Math.max(timeline.steps.indexOf(at), 0);
  const atEnd = index >= timeline.steps.length - 1;

  // Held in a ref so the interval never closes over a stale index: the tick
  // reads the current position rather than the one it was created with.
  // Written in an effect, not during render - a ref assigned while rendering is
  // a side effect, and React is entitled to render twice before committing.
  const positionRef = useRef(index);
  useEffect(() => {
    positionRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      const next = positionRef.current + 1;
      if (next >= timeline.steps.length) {
        onPlayingChange(false);
        return;
      }
      onChange(timeline.steps[next]);
    }, REPLAY_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [playing, timeline.steps, onChange, onPlayingChange]);

  if (timeline.steps.length < REPLAY_MIN_MOMENTS) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <button
        type="button"
        onClick={() => {
          if (atEnd && !playing) onChange(timeline.steps[0]);
          onPlayingChange(!playing);
        }}
        className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy/90"
        aria-label={playing ? 'Pause the replay' : 'Play how this business memory was built'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
      </button>

      <label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-gray-500">
        <span className="sr-only">Position in the replay</span>
        <input
          type="range"
          min={0}
          max={timeline.steps.length - 1}
          value={index}
          onChange={(event) => {
            onPlayingChange(false);
            onChange(timeline.steps[Number(event.target.value)]);
          }}
          className="h-1.5 w-full cursor-pointer accent-brand-blue"
        />
      </label>

      <p className="text-xs font-semibold text-navy">
        {formatSafeBusinessDate(at)}
        <span className="ml-2 font-normal text-gray-500">{replayLabel(timeline, at)}</span>
      </p>

      {/* Records with no readable date behind them cannot be placed in the
          story. They are shown throughout rather than guessed into a position,
          and the count says so out loud instead of quietly leaving them out. */}
      {timeline.undated.length > 0 && (
        <p className="text-xs text-gray-500">
          {timeline.undated.length} shown throughout - nothing dated behind them
        </p>
      )}

      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Back to today
      </button>
    </div>
  );
}

export function VaultReplayButton({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-navy"
    >
      <History className="h-3.5 w-3.5" /> Replay how you learned this
    </button>
  );
}
