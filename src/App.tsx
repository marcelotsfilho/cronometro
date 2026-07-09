import { Maximize2, Pause, Play, Plus, RotateCcw, Save, SkipForward, Trash2, Volume2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Phase = "ready" | "prepare" | "round" | "rest" | "finished";

type Preset = {
  id: string;
  name: string;
  roundSeconds: number;
  restSeconds: number;
  rounds: number;
  prepareSeconds: number;
  warningSeconds: number;
};

const STORAGE_KEY = "roundpro-presets-v1";

const defaultPresets: Preset[] = [
  { id: "boxe-amador", name: "Boxe Amador", roundSeconds: 180, restSeconds: 60, rounds: 3, prepareSeconds: 10, warningSeconds: 10 },
  { id: "muay-thai", name: "Muay Thai", roundSeconds: 180, restSeconds: 60, rounds: 5, prepareSeconds: 10, warningSeconds: 10 },
  { id: "mma", name: "MMA", roundSeconds: 300, restSeconds: 60, rounds: 3, prepareSeconds: 10, warningSeconds: 10 },
  { id: "sparring-leve", name: "Sparring Leve", roundSeconds: 120, restSeconds: 60, rounds: 5, prepareSeconds: 8, warningSeconds: 10 },
  { id: "hiit", name: "HIIT", roundSeconds: 30, restSeconds: 15, rounds: 10, prepareSeconds: 5, warningSeconds: 5 },
  { id: "jiu-jitsu-drill", name: "Jiu-jitsu Drill", roundSeconds: 300, restSeconds: 60, rounds: 6, prepareSeconds: 10, warningSeconds: 10 },
];

const phaseLabels: Record<Phase, string> = {
  ready: "Preparar",
  prepare: "Contagem",
  round: "Round",
  rest: "Descanso",
  finished: "Finalizado",
};

const phaseTheme: Record<Phase, string> = {
  ready: "from-slate-950 via-slate-900 to-zinc-900",
  prepare: "from-amber-950 via-stone-900 to-slate-950",
  round: "from-emerald-950 via-slate-900 to-zinc-950",
  rest: "from-sky-950 via-slate-900 to-zinc-950",
  finished: "from-zinc-950 via-stone-900 to-slate-950",
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function secondsFromMinutes(minutes: number) {
  return Math.max(1, Math.round(minutes * 60));
}

function playTone(kind: "start" | "warning" | "end" | "tick", volume: number) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || volume <= 0) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const accentOscillator = context.createOscillator();
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const duration = kind === "end" ? 1.1 : kind === "start" ? 0.55 : 0.18;
  const peakVolume = Math.min(0.95, volume * 1.7);

  oscillator.type = "square";
  accentOscillator.type = kind === "end" ? "sawtooth" : "triangle";
  oscillator.frequency.value = kind === "end" ? 360 : kind === "warning" ? 980 : kind === "tick" ? 760 : 620;
  accentOscillator.frequency.value = kind === "end" ? 180 : kind === "warning" ? 1320 : kind === "tick" ? 1040 : 930;
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(peakVolume, 0.02), context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  accentOscillator.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);
  oscillator.start();
  accentOscillator.start();
  oscillator.stop(context.currentTime + duration);
  accentOscillator.stop(context.currentTime + duration);
}

function loadPresets() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultPresets;
    const parsed = JSON.parse(saved) as Preset[];
    return parsed.length ? parsed : defaultPresets;
  } catch {
    return defaultPresets;
  }
}

function App() {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [activePreset, setActivePreset] = useState<Preset>(presets[0]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [currentRound, setCurrentRound] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(activePreset.prepareSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [form, setForm] = useState<Preset>(activePreset);
  const lastBeepRef = useRef<string>("");

  const totalWorkoutSeconds = useMemo(
    () => activePreset.roundSeconds * activePreset.rounds + activePreset.restSeconds * Math.max(0, activePreset.rounds - 1),
    [activePreset],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value > 1) return value - 1;
        advancePhase();
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, phase, currentRound, activePreset]);

  useEffect(() => {
    if (!isRunning || secondsLeft <= 0) return;

    const shouldBeep =
      phase === "prepare" ||
      (phase === "round" && secondsLeft <= activePreset.warningSeconds) ||
      (phase === "rest" && secondsLeft <= activePreset.warningSeconds);
    const beepKey = `${phase}-${currentRound}-${secondsLeft}`;

    if (shouldBeep && lastBeepRef.current !== beepKey) {
      lastBeepRef.current = beepKey;
      playTone(phase === "round" ? "warning" : "tick", volume);
    }
  }, [secondsLeft, isRunning, phase, activePreset.warningSeconds, currentRound, volume]);

  function selectPreset(preset: Preset) {
    setActivePreset(preset);
    setForm(preset);
    setPhase("ready");
    setCurrentRound(1);
    setSecondsLeft(preset.prepareSeconds);
    setIsRunning(false);
    lastBeepRef.current = "";
  }

  function startTimer() {
    if (phase === "ready") {
      const nextPhase = activePreset.prepareSeconds > 0 ? "prepare" : "round";
      const nextSeconds = activePreset.prepareSeconds > 0 ? activePreset.prepareSeconds : activePreset.roundSeconds;
      setPhase(nextPhase);
      setSecondsLeft(nextSeconds);
      lastBeepRef.current = `${nextPhase}-${currentRound}-${nextSeconds}`;
    }
    setIsRunning(true);
    playTone("start", volume);
  }

  function pauseTimer() {
    setIsRunning(false);
  }

  function resetTimer() {
    setIsRunning(false);
    setPhase("ready");
    setCurrentRound(1);
    setSecondsLeft(activePreset.prepareSeconds);
    lastBeepRef.current = "";
  }

  function advancePhase() {
    if (phase === "ready" || phase === "prepare") {
      setPhase("round");
      setSecondsLeft(activePreset.roundSeconds);
      lastBeepRef.current = `round-${currentRound}-${activePreset.roundSeconds}`;
      playTone("start", volume);
      return;
    }

    if (phase === "round") {
      playTone("end", volume);
      if (currentRound >= activePreset.rounds) {
        setPhase("finished");
        setSecondsLeft(0);
        setIsRunning(false);
        return;
      }
      setPhase("rest");
      setSecondsLeft(activePreset.restSeconds);
      lastBeepRef.current = `rest-${currentRound}-${activePreset.restSeconds}`;
      return;
    }

    if (phase === "rest") {
      const nextRound = currentRound + 1;
      setCurrentRound(nextRound);
      setPhase("round");
      setSecondsLeft(activePreset.roundSeconds);
      lastBeepRef.current = `round-${nextRound}-${activePreset.roundSeconds}`;
      playTone("start", volume);
    }
  }

  function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized: Preset = {
      ...form,
      id: form.id || crypto.randomUUID(),
      name: form.name.trim() || "Treino personalizado",
      roundSeconds: Math.max(1, form.roundSeconds),
      restSeconds: Math.max(0, form.restSeconds),
      rounds: Math.max(1, form.rounds),
      prepareSeconds: Math.max(0, form.prepareSeconds),
      warningSeconds: Math.max(0, form.warningSeconds),
    };
    setPresets((items) => {
      const exists = items.some((item) => item.id === normalized.id);
      return exists ? items.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...items];
    });
    selectPreset(normalized);
  }

  function createBlankPreset() {
    const preset: Preset = {
      id: crypto.randomUUID(),
      name: "Novo treino",
      roundSeconds: 180,
      restSeconds: 60,
      rounds: 3,
      prepareSeconds: 10,
      warningSeconds: 10,
    };
    setForm(preset);
  }

  function removePreset(id: string) {
    setPresets((items) => {
      const next = items.filter((item) => item.id !== id);
      if (activePreset.id === id && next[0]) selectPreset(next[0]);
      return next.length ? next : defaultPresets;
    });
  }

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  const progressBase = phase === "round" ? activePreset.roundSeconds : phase === "rest" ? activePreset.restSeconds : activePreset.prepareSeconds;
  const elapsedPercent = progressBase ? Math.round(((progressBase - secondsLeft) / progressBase) * 100) : 100;

  return (
    <main className={`min-h-screen bg-gradient-to-br ${phaseTheme[phase]} px-4 py-4 text-white sm:px-6 lg:px-8`}>
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1fr_380px]">
        <section className="flex min-h-[560px] flex-col justify-between rounded-lg border border-white/10 bg-black/20 p-5 shadow-glow backdrop-blur sm:p-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">RoundPro Timer</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{activePreset.name}</h1>
            </div>
            <button
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
              type="button"
              onClick={enterFullscreen}
              title="Tela cheia"
            >
              <Maximize2 size={21} />
            </button>
          </header>

          <div className="grid place-items-center py-8 text-center">
            <div className="mb-4 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-5 py-2 text-lg font-bold uppercase">
              {phaseLabels[phase]}
            </div>
            <div className="timer-digits text-[clamp(5rem,19vw,14rem)] font-black leading-none">{formatTime(secondsLeft)}</div>
            <div className="mt-5 text-2xl font-bold sm:text-4xl">
              Round {Math.min(currentRound, activePreset.rounds)}/{activePreset.rounds}
            </div>
            <div className="mt-6 h-3 w-full max-w-3xl overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-300 transition-all duration-300" style={{ width: `${elapsedPercent}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button className="inline-flex h-16 items-center justify-center gap-2 rounded-md bg-emerald-400 px-5 font-bold text-slate-950 transition hover:bg-emerald-300" type="button" onClick={startTimer}>
              <Play size={22} />
              Iniciar
            </button>
            <button className="inline-flex h-16 items-center justify-center gap-2 rounded-md bg-white/12 px-5 font-bold text-white ring-1 ring-white/15 transition hover:bg-white/20" type="button" onClick={pauseTimer}>
              <Pause size={22} />
              Pausar
            </button>
            <button className="inline-flex h-16 items-center justify-center gap-2 rounded-md bg-white/12 px-5 font-bold text-white ring-1 ring-white/15 transition hover:bg-white/20" type="button" onClick={resetTimer}>
              <RotateCcw size={22} />
              Resetar
            </button>
            <button className="inline-flex h-16 items-center justify-center gap-2 rounded-md bg-amber-300 px-5 font-bold text-slate-950 transition hover:bg-amber-200" type="button" onClick={advancePhase}>
              <SkipForward size={22} />
              Próximo
            </button>
          </div>
        </section>

        <aside className="grid gap-4">
          <section className="rounded-lg border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Presets</h2>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/10 transition hover:bg-white/20" type="button" onClick={createBlankPreset} title="Novo preset">
                <Plus size={20} />
              </button>
            </div>
            <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
              {presets.map((preset) => (
                <div key={preset.id} className={`rounded-md border p-3 ${activePreset.id === preset.id ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-black/15"}`}>
                  <button className="w-full text-left" type="button" onClick={() => selectPreset(preset)}>
                    <div className="font-bold">{preset.name}</div>
                    <div className="mt-1 text-sm text-slate-300">
                      {formatTime(preset.roundSeconds)} round · {formatTime(preset.restSeconds)} descanso · {preset.rounds} rounds
                    </div>
                  </button>
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20" type="button" onClick={() => setForm(preset)}>
                      Editar
                    </button>
                    <button className="inline-flex items-center rounded-md bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/25" type="button" onClick={() => removePreset(preset.id)} title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold">Configuração</h2>
            <form className="grid gap-3" onSubmit={savePreset}>
              <label className="grid gap-1 text-sm font-semibold">
                Nome do treino
                <input className="h-11 rounded-md border border-white/10 bg-black/20 px-3 text-white" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Round (min)" value={form.roundSeconds / 60} step={0.5} onChange={(value) => setForm({ ...form, roundSeconds: secondsFromMinutes(value) })} />
                <NumberField label="Descanso (min)" value={form.restSeconds / 60} step={0.25} onChange={(value) => setForm({ ...form, restSeconds: Math.max(0, secondsFromMinutes(value)) })} />
                <NumberField label="Rounds" value={form.rounds} step={1} onChange={(value) => setForm({ ...form, rounds: Math.max(1, Math.round(value)) })} />
                <NumberField label="Preparação (s)" value={form.prepareSeconds} step={1} onChange={(value) => setForm({ ...form, prepareSeconds: Math.max(0, Math.round(value)) })} />
              </div>

              <NumberField label="Aviso faltando (s)" value={form.warningSeconds} step={1} onChange={(value) => setForm({ ...form, warningSeconds: Math.max(0, Math.round(value)) })} />

              <label className="grid gap-2 text-sm font-semibold">
                <span className="inline-flex items-center gap-2">
                  <Volume2 size={17} />
                  Volume
                </span>
                <input className="accent-amber-300" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
              </label>

              <button className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-amber-300 px-5 font-bold text-slate-950 transition hover:bg-amber-200" type="submit">
                <Save size={20} />
                Salvar preset
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Treino" value={formatTime(totalWorkoutSeconds)} />
              <Metric label="Round" value={formatTime(activePreset.roundSeconds)} />
              <Metric label="Descanso" value={formatTime(activePreset.restSeconds)} />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input className="h-11 rounded-md border border-white/10 bg-black/20 px-3 text-white" type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="text-xs font-bold uppercase text-slate-300">{label}</div>
      <div className="timer-digits mt-1 text-lg font-black">{value}</div>
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export default App;
